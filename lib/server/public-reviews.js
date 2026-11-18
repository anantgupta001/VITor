/**
 * Public review read model.
 *
 * Reviews are stored under a document whose ID is the author's Firebase UID, and the
 * document also carries moderation/internal fields. Clients are therefore NOT allowed
 * to read the `reviews` collection directly (see firestore.rules). The public site
 * reads reviews through this module instead, which:
 *   - returns bounded pages of publicly visible reviews (ACTIVE, or legacy documents with no status);
 *   - never returns the author's UID or any internal/moderation field;
 *   - uses an opaque, non-reversible review ID;
 *   - enforces server-side page size clamping and bounded document scanning;
 *   - uses opaque, encrypted, tamper-evident pagination cursors with cryptographic TTL validation;
 *   - advances pagination past dense non-public records without infinite loops or skipped reviews.
 */

import crypto from "crypto";
import { adminDb } from "../firebase/admin.js";
import { FieldPath } from "firebase-admin/firestore";
import { REVIEW_STATUS } from "./aggregates.js";
import { ValidationError, isSafeDocumentId } from "./validation.js";

export const DEFAULT_PAGE_SIZE = 10;
export const MIN_PAGE_SIZE = 1;
export const MAX_PAGE_SIZE = 50;
export const MAX_SCAN_DOCS_CEILING = 100;

export const CURSOR_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000; // 5 minutes clock skew allowance
export const MAX_CURSOR_LENGTH = 1024; // Maximum allowed base64url cursor length
export const MIN_CURSOR_SECRET_BYTES = 32;

/**
 * Derives the 32-byte AES key from the environment variable CURSOR_SECRET.
 * Fails closed if CURSOR_SECRET is not configured or has fewer than 32 bytes of secret material.
 * No hardcoded strings or project ID fallbacks are permitted.
 */
export function getCursorKey() {
  const secret = process.env.CURSOR_SECRET;
  if (!secret || typeof secret !== "string") {
    throw new Error(
      "CURSOR_SECRET environment variable is missing. It must be configured with at least 32 bytes of secret material."
    );
  }
  if (Buffer.byteLength(secret, "utf8") < MIN_CURSOR_SECRET_BYTES) {
    throw new Error(
      `CURSOR_SECRET must be at least ${MIN_CURSOR_SECRET_BYTES} bytes of secret material.`
    );
  }
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

/**
 * Encodes internal pagination state into an opaque, encrypted, authenticated cursor.
 * Uses AES-256-GCM so clients cannot inspect internal document IDs (author UIDs) or tamper with values.
 */
export function encodeCursor({ campusSlug, facultyId, lastDocId, timestamp = Date.now() }) {
  if (!lastDocId || typeof lastDocId !== "string") {
    throw new Error("lastDocId is required to encode a pagination cursor.");
  }
  const payload = {
    c: campusSlug,
    f: facultyId,
    d: lastDocId,
    t: timestamp,
  };
  const key = getCursorKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  const token = Buffer.concat([iv, tag, encrypted]);
  return token.toString("base64url");
}

/**
 * Decodes and authenticates an opaque pagination cursor.
 * Returns the verified lastDocId string to start after.
 * Rejects invalid, tampered, expired, future-dated, oversized, or mismatched cursors with ValidationError.
 */
export function decodeCursor(cursor, expectedCampusSlug, expectedFacultyId) {
  if (typeof cursor !== "string" || !cursor.trim()) {
    throw new ValidationError("Invalid pagination cursor.");
  }

  // Reject oversized cursors before buffer allocation/crypto
  if (cursor.length > MAX_CURSOR_LENGTH) {
    throw new ValidationError("Pagination cursor exceeds maximum allowed length.");
  }

  let buf;
  try {
    buf = Buffer.from(cursor.trim(), "base64url");
  } catch {
    throw new ValidationError("Malformed pagination cursor.");
  }

  // 12 bytes IV + 16 bytes auth tag + at least 1 byte ciphertext
  if (buf.length < 29) {
    throw new ValidationError("Malformed pagination cursor length.");
  }

  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const encrypted = buf.subarray(28);

  const key = getCursorKey();
  let decryptedStr;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    decryptedStr = Buffer.concat([
      decipher.update(encrypted),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new ValidationError("Invalid or tampered pagination cursor.");
  }

  let payload;
  try {
    payload = JSON.parse(decryptedStr);
  } catch {
    throw new ValidationError("Invalid pagination cursor payload.");
  }

  if (!payload || typeof payload !== "object") {
    throw new ValidationError("Invalid pagination cursor payload.");
  }

  if (payload.c !== expectedCampusSlug || payload.f !== expectedFacultyId) {
    throw new ValidationError("Pagination cursor does not match requested campus and faculty.");
  }

  if (!payload.d || !isSafeDocumentId(payload.d)) {
    throw new ValidationError("Invalid document identifier in pagination cursor.");
  }

  // Timestamp validation
  if (typeof payload.t !== "number" || !Number.isFinite(payload.t)) {
    throw new ValidationError("Pagination cursor timestamp is invalid.");
  }

  const now = Date.now();
  if (now - payload.t > CURSOR_TTL_MS) {
    throw new ValidationError("Pagination cursor has expired.");
  }

  if (payload.t - now > MAX_CLOCK_SKEW_MS) {
    throw new ValidationError("Pagination cursor timestamp is invalid (future dated).");
  }

  return payload.d;
}

/**
 * Validates and clamps client-supplied limit to bounded range [MIN_PAGE_SIZE, MAX_PAGE_SIZE].
 */
export function clampPageSize(limit) {
  if (limit === undefined || limit === null || limit === "") {
    return DEFAULT_PAGE_SIZE;
  }
  const parsed = parseInt(limit, 10);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return DEFAULT_PAGE_SIZE;
  }
  return Math.min(Math.max(parsed, MIN_PAGE_SIZE), MAX_PAGE_SIZE);
}

/**
 * A review is public when it is ACTIVE. Legacy documents created before the
 * `status` field existed (status === undefined) are treated as ACTIVE, matching
 * `calculateAggregateDelta` and the previous client behavior.
 */
export function isPubliclyVisible(review) {
  return review?.status === undefined || review.status === REVIEW_STATUS.ACTIVE;
}

export function opaqueReviewId(campusSlug, facultyId, docId) {
  return crypto
    .createHash("sha256")
    .update(`${campusSlug}/${facultyId}/${docId}`)
    .digest("hex")
    .slice(0, 24);
}

/**
 * Maps a stored review document to the public shape. Whitelist only.
 */
export function toPublicReview(campusSlug, facultyId, docId, data) {
  const r = data?.ratings || {};
  return {
    id: opaqueReviewId(campusSlug, facultyId, docId),
    ratings: {
      attendance: r.attendance ?? data.attendance,
      correction: r.correction ?? data.correction,
      teaching: r.teaching ?? data.teaching,
      approachability: r.approachability ?? data.approachability,
      overall: r.overall ?? data.overall,
    },
    comment: data.comment ?? data.text ?? "",
  };
}

/**
 * Returns a bounded page of public reviews for a faculty member.
 *
 * Requirements enforced:
 * - Server-side page size clamping ([MIN_PAGE_SIZE, MAX_PAGE_SIZE]).
 * - Stable cursor pagination using FieldPath.documentId() which preserves legacy reviews
 *   (which lack timestamp fields).
 * - Bounded document scan budget per request to protect against read abuse / wallet draining
 *   even when non-public reviews are interspersed.
 * - Underfilled page handling: when scan budget is exhausted and more documents may exist,
 *   returns hasMore: true and advances the cursor from currentDocId to avoid re-scanning hidden docs.
 * - Response payload whitelist: opaque id, ratings, comment only.
 *
 * @param {string} campusSlug
 * @param {string} facultyId
 * @param {object} [options]
 * @param {string|null} [options.cursor]
 * @param {number|string} [options.limit]
 * @returns {Promise<{ reviews: Array, nextCursor: string|null, hasMore: boolean }>}
 */
export async function listPublicReviews(
  campusSlug,
  facultyId,
  { cursor = null, limit = DEFAULT_PAGE_SIZE } = {}
) {
  const pageSize = clampPageSize(limit);
  const startAfterDocId = cursor
    ? decodeCursor(cursor, campusSlug, facultyId)
    : null;

  // Maximum number of documents we allow scanning in this request to avoid unbounded reads
  const maxScanBudget = Math.min(
    MAX_SCAN_DOCS_CEILING,
    Math.max(pageSize * 3, 20)
  );

  const reviewsRef = adminDb
    .collection("campuses")
    .doc(campusSlug)
    .collection("faculties")
    .doc(facultyId)
    .collection("reviews");

  const publicReviews = [];
  let currentDocId = startAfterDocId;
  let totalScanned = 0;
  let hasMore = false;
  let lastPublicDocId = null;
  let reachedCollectionEnd = false;

  // Scan in small bounded batches until we either collect pageSize reviews,
  // discover hasMore, or exhaust our scan budget / collection.
  while (publicReviews.length < pageSize && totalScanned < maxScanBudget) {
    const needed = pageSize - publicReviews.length;
    // Query needed + 1 to detect whether a next document exists without extra roundtrips
    const batchLimit = Math.min(needed + 1, maxScanBudget - totalScanned);
    if (batchLimit <= 0) break;

    let query = reviewsRef.orderBy(FieldPath.documentId()).limit(batchLimit);
    if (currentDocId) {
      query = query.startAfter(currentDocId);
    }

    const snap = await query.get();
    if (snap.empty) {
      reachedCollectionEnd = true;
      break;
    }

    totalScanned += snap.docs.length;

    for (const doc of snap.docs) {
      currentDocId = doc.id;
      const data = doc.data();

      if (isPubliclyVisible(data)) {
        if (publicReviews.length < pageSize) {
          publicReviews.push(toPublicReview(campusSlug, facultyId, doc.id, data));
          lastPublicDocId = doc.id;
        } else {
          // We have reached pageSize and found at least one more public review!
          hasMore = true;
          break;
        }
      }
    }

    if (hasMore) break;

    // If Firestore returned fewer documents than requested, we reached the end of collection
    if (snap.docs.length < batchLimit) {
      reachedCollectionEnd = true;
      break;
    }
  }

  // Check if scan budget was exhausted while more documents may exist
  const scanBudgetExhausted = totalScanned >= maxScanBudget && !reachedCollectionEnd;

  // Case 1: Underfilled page with budget exhausted -> more documents may exist
  if (publicReviews.length < pageSize && scanBudgetExhausted) {
    hasMore = true;
  }

  // Case 2: Full page collected, check if more documents exist
  if (publicReviews.length === pageSize && !hasMore) {
    if (scanBudgetExhausted) {
      hasMore = true;
    } else if (!reachedCollectionEnd && totalScanned < maxScanBudget) {
      // Probe 1 doc to confirm if hasMore is true
      let probeQuery = reviewsRef.orderBy(FieldPath.documentId()).limit(1);
      if (currentDocId) {
        probeQuery = probeQuery.startAfter(currentDocId);
      }
      const probeSnap = await probeQuery.get();
      if (!probeSnap.empty) {
        totalScanned += probeSnap.docs.length;
        hasMore = true;
      } else {
        reachedCollectionEnd = true;
      }
    }
  }

  // Construct nextCursor if there are more reviews
  let nextCursor = null;
  if (hasMore) {
    // When a full page has been collected, preserve existing behavior:
    // start after the last public review in the page.
    // When an underfilled page is returned due to scan budget exhaustion,
    // start after the last scanned document ID (currentDocId) so that the
    // next request does not repeatedly scan the same non-public documents.
    const isUnderfilled = publicReviews.length < pageSize;
    const cursorDocId = isUnderfilled ? currentDocId : (lastPublicDocId || currentDocId);
    if (cursorDocId) {
      nextCursor = encodeCursor({
        campusSlug,
        facultyId,
        lastDocId: cursorDocId,
      });
    }
  }

  return {
    reviews: publicReviews,
    nextCursor,
    hasMore: Boolean(hasMore),
  };
}
