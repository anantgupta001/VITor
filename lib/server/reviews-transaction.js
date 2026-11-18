/**
 * Atomic Review Transactions Coordinator for VITor.
 *
 * Coordinates within a single Firestore transaction:
 * 1. Maintenance gate verification (system/reviewMaintenance).
 * 2. Idempotency receipt evaluation (campuses/{slug}/requestReceipts/{key}).
 * 3. Faculty document verification.
 * 4. User rate-limit quota verification (for new submissions).
 * 5. Optimistic concurrency control (expectedVersion).
 * 6. Shard contribution & aggregate updates (shards "0".."4").
 * 7. Review document mutations (ACTIVE / DELETED / FLAGGED / HIDDEN).
 *
 * Guarantee: ALL reads precede ALL writes. Failures leave zero partial state.
 */

import { adminDb, FieldValue } from "../firebase/admin.js";
import { checkMaintenanceGate, enterWriter, exitWriter } from "./maintenance.js";
import {
  computePayloadHash,
  evaluateReceipt,
  buildReceiptPayload,
  validateIdempotencyKey,
} from "./idempotency.js";
import {
  NUM_SHARDS,
  SHARD_SCHEME_VERSION,
  REVIEW_STATUS,
  getShardId,
  getShardDocId,
  parseShardDocId,
  calculateOverallRating,
  calculateAggregateDelta,
  combineShards,
  buildShardIncrementPayload,
} from "./aggregates.js";
import { evaluateAndConsumeSubmissionQuota } from "./rate-limit.js";
import { checkOptimisticConcurrency, isReviewNoOp } from "./concurrency.js";
import { AuthError } from "./campus-auth.js";
import { ValidationError } from "./validation.js";

/**
 * Statuses that only a moderator may set or clear. Authors must never be able to
 * edit, delete, or restore a review in one of these states, because doing so would
 * change its moderation status.
 */
const MODERATED_STATUSES = [
  REVIEW_STATUS.FLAGGED,
  REVIEW_STATUS.HIDDEN,
  REVIEW_STATUS.QUARANTINED,
];

function assertNotModerated(existingReview) {
  if (existingReview && MODERATED_STATUSES.includes(existingReview.status)) {
    throw new AuthError(
      "This review has been restricted by a moderator and cannot be changed.",
      403,
      "REVIEW_MODERATED"
    );
  }
}

export const ReviewsTransactionCoordinator = {
  /**
   * Submit or update a review atomically.
   */
  async submitOrUpdateReview({
    campusSlug,
    facultyId,
    userId,
    ratings,
    comment,
    expectedVersion,
    idempotencyKey,
  }) {
    const sanitizedIdempotencyKey = idempotencyKey ? validateIdempotencyKey(idempotencyKey) : null;
    const overall = calculateOverallRating(ratings);
    const cleanComment = typeof comment === "string" ? comment.trim() : "";

    const canonicalPayload = {
      action: "SUBMIT_OR_UPDATE_REVIEW",
      campusSlug,
      facultyId,
      userId,
      ratings: {
        attendance: ratings.attendance,
        correction: ratings.correction,
        teaching: ratings.teaching,
        approachability: ratings.approachability,
      },
      comment: cleanComment,
      expectedVersion: expectedVersion ?? null,
    };
    const payloadHash = computePayloadHash(canonicalPayload);

    // References
    const gateRef = adminDb.collection("system").doc("reviewMaintenance");
    const facultyRef = adminDb.collection("campuses").doc(campusSlug).collection("faculties").doc(facultyId);
    const reviewRef = facultyRef.collection("reviews").doc(userId);
    const quotaRef = adminDb
      .collection("campuses")
      .doc(campusSlug)
      .collection("users")
      .doc(userId)
      .collection("rateLimits")
      .doc("reviewQuota");
    const receiptRef = sanitizedIdempotencyKey
      ? adminDb.collection("campuses").doc(campusSlug).collection("requestReceipts").doc(sanitizedIdempotencyKey)
      : null;

    const shardRefs = Array.from({ length: NUM_SHARDS }, (_, i) =>
      facultyRef.collection("shards").doc(getShardDocId(SHARD_SCHEME_VERSION, String(i)))
    );

    const nowMs = Date.now();

    // ── FIRESTORE TRANSACTION ─────────────────────────────────────────────
    const writerId = await enterWriter(adminDb);
    try {
      return await adminDb.runTransaction(async (transaction) => {
        // ── READ PHASE (ALL reads must happen first) ─────────────────────────
        const gateSnap = await transaction.get(gateRef);
        const receiptSnap = receiptRef ? await transaction.get(receiptRef) : null;
        const facultySnap = await transaction.get(facultyRef);
        const reviewSnap = await transaction.get(reviewRef);
        const quotaSnap = await transaction.get(quotaRef);

        const existingReview = reviewSnap.exists ? reviewSnap.data() : null;
        const assignedShardId = existingReview?.shardId || getShardId(userId, NUM_SHARDS);
        const assignedSchemeVersion = existingReview?.shardSchemeVersion || SHARD_SCHEME_VERSION;
        const assignedShardDocId = getShardDocId(assignedSchemeVersion, assignedShardId);

        const shardRefsToRead = [...shardRefs];
        if (!shardRefs.some((r) => r.id === assignedShardDocId)) {
          shardRefsToRead.push(facultyRef.collection("shards").doc(assignedShardDocId));
        }
        const shardSnaps = await Promise.all(shardRefsToRead.map((ref) => transaction.get(ref)));

        // 1. Maintenance Gate Check
        checkMaintenanceGate(gateSnap);

      // 2. Idempotency Receipt Check
      if (receiptSnap) {
        const receiptEval = evaluateReceipt(receiptSnap, payloadHash);
        if (receiptEval.isReplay) {
          return {
            isReplay: true,
            statusCode: receiptEval.statusCode,
            ...receiptEval.responseBody,
          };
        }
      }

      // 3. Faculty existence check
      if (!facultySnap.exists) {
        throw new AuthError(`Faculty '${facultyId}' not found.`, 404, "FACULTY_NOT_FOUND");
      }

      // 4. Moderation lock: authors cannot edit/revive moderator-restricted reviews
      assertNotModerated(existingReview);

      // 4b. Current review state & concurrency control
      checkOptimisticConcurrency(existingReview, expectedVersion);

      const isNewReview = !existingReview || existingReview.status === REVIEW_STATUS.DELETED;

      // Check no-op
      if (existingReview && existingReview.status === REVIEW_STATUS.ACTIVE) {
        if (isReviewNoOp(existingReview, { ratings, comment: cleanComment, status: REVIEW_STATUS.ACTIVE })) {
          const noOpResponse = {
            success: true,
            noOp: true,
            review: { id: userId, ...existingReview },
            overall: existingReview.overall || overall,
            version: existingReview.version || 1,
          };
          return noOpResponse;
        }
      }

      // 5. Rate Limiting Check (New submissions strictly consume quota)
      let quotaUpdate = null;
      if (isNewReview) {
        quotaUpdate = evaluateAndConsumeSubmissionQuota(quotaSnap, nowMs);
      }

      // 6. Shard Selection & Aggregate Delta
      const newReviewData = {
        status: REVIEW_STATUS.ACTIVE,
        ratings,
        overall,
      };
      const delta = calculateAggregateDelta({
        oldReview: existingReview,
        newReview: newReviewData,
      });

      // 7. Calculate updated faculty aggregates across shards
      let assignedShardFound = false;
      const shardDataList = shardSnaps.map((snap, i) => {
        const docId = snap.id || getShardDocId(SHARD_SCHEME_VERSION, String(i));
        const parsed = parseShardDocId(docId) || { schemeVersion: SHARD_SCHEME_VERSION, shardId: String(i) };
        const data = snap.exists
          ? { ...snap.data() }
          : {
              shardId: parsed.shardId,
              schemeVersion: parsed.schemeVersion,
              reviewCount: 0,
              attendanceSum: 0,
              correctionSum: 0,
              teachingSum: 0,
              approachabilitySum: 0,
              overallSum: 0,
            };

        // Apply in-memory delta to the assigned shard to compute new faculty stats
        if (docId === assignedShardDocId || (parsed.schemeVersion === assignedSchemeVersion && String(parsed.shardId) === String(assignedShardId))) {
          assignedShardFound = true;
          return {
            ...data,
            shardId: assignedShardId,
            schemeVersion: assignedSchemeVersion,
            reviewCount: (data.reviewCount || 0) + delta.count,
            attendanceSum: (data.attendanceSum || 0) + delta.attendance,
            correctionSum: (data.correctionSum || 0) + delta.correction,
            teachingSum: (data.teachingSum || 0) + delta.teaching,
            approachabilitySum: (data.approachabilitySum || 0) + delta.approachability,
            overallSum: (data.overallSum || 0) + delta.overall,
          };
        }
        return data;
      });

      if (!assignedShardFound) {
        shardDataList.push({
          shardId: assignedShardId,
          schemeVersion: assignedSchemeVersion,
          reviewCount: delta.count,
          attendanceSum: delta.attendance,
          correctionSum: delta.correction,
          teachingSum: delta.teaching,
          approachabilitySum: delta.approachability,
          overallSum: delta.overall,
        });
      }

      const updatedFacultyStats = combineShards(shardDataList);

      // ── WRITE PHASE (ALL writes follow reads) ───────────────────────────
      const nextVersion = existingReview ? (existingReview.version || 1) + 1 : 1;

      const reviewDocPayload = {
        userId,
        user: "Anonymous User",
        ratings: {
          attendance: ratings.attendance,
          correction: ratings.correction,
          teaching: ratings.teaching,
          approachability: ratings.approachability,
          overall,
        },
        // Top-level compatibility fields
        attendance: ratings.attendance,
        correction: ratings.correction,
        teaching: ratings.teaching,
        approachability: ratings.approachability,
        overall,
        text: cleanComment,
        comment: cleanComment,
        version: nextVersion,
        status: REVIEW_STATUS.ACTIVE,
        shardId: assignedShardId,
        shardSchemeVersion: assignedSchemeVersion,
        acceptedAtMs: existingReview?.acceptedAtMs || nowMs,
        updatedAt: FieldValue.serverTimestamp(),
        ...(!existingReview ? { createdAt: FieldValue.serverTimestamp() } : {}),
      };

      // 1. Write Review
      transaction.set(reviewRef, reviewDocPayload, { merge: true });

      // 2. Write Shard Increment with composite identity
      const assignedShardRef = facultyRef.collection("shards").doc(assignedShardDocId);
      transaction.set(assignedShardRef, buildShardIncrementPayload(delta, assignedSchemeVersion, assignedShardId), { merge: true });

      // 3. Write Faculty Stats Update
      transaction.update(facultyRef, updatedFacultyStats);

      // 4. Write Rate Limit Quota (if new review)
      if (quotaUpdate) {
        transaction.set(quotaRef, quotaUpdate.quotaPayload, { merge: true });
      }

      // 5. Write Idempotency Receipt
      const responseBody = {
        success: true,
        overall,
        version: nextVersion,
        updatedStats: updatedFacultyStats,
        review: { id: userId, ...reviewDocPayload },
      };

      if (receiptRef) {
        const receiptPayload = buildReceiptPayload({
          idempotencyKey: sanitizedIdempotencyKey,
          userId,
          action: "SUBMIT_OR_UPDATE_REVIEW",
          payloadHash,
          statusCode: isNewReview ? 201 : 200,
          responseBody,
        });
        transaction.set(receiptRef, receiptPayload);
      }

      return {
        isReplay: false,
        statusCode: isNewReview ? 201 : 200,
        ...responseBody,
      };
    });
  } finally {
    await exitWriter(adminDb, writerId);
  }
},

  /**
   * Delete a review (soft-delete to status DELETED).
   * Subtracts contribution from shards and faculty aggregate.
   */
  async deleteReview({ campusSlug, facultyId, userId, idempotencyKey }) {
    const sanitizedIdempotencyKey = idempotencyKey ? validateIdempotencyKey(idempotencyKey) : null;
    const canonicalPayload = { action: "DELETE_REVIEW", campusSlug, facultyId, userId };
    const payloadHash = computePayloadHash(canonicalPayload);

    const gateRef = adminDb.collection("system").doc("reviewMaintenance");
    const facultyRef = adminDb.collection("campuses").doc(campusSlug).collection("faculties").doc(facultyId);
    const reviewRef = facultyRef.collection("reviews").doc(userId);
    const receiptRef = sanitizedIdempotencyKey
      ? adminDb.collection("campuses").doc(campusSlug).collection("requestReceipts").doc(sanitizedIdempotencyKey)
      : null;
    const shardRefs = Array.from({ length: NUM_SHARDS }, (_, i) =>
      facultyRef.collection("shards").doc(getShardDocId(SHARD_SCHEME_VERSION, String(i)))
    );

    const writerId = await enterWriter(adminDb);
    try {
      return await adminDb.runTransaction(async (transaction) => {
      const gateSnap = await transaction.get(gateRef);
      const receiptSnap = receiptRef ? await transaction.get(receiptRef) : null;
      const facultySnap = await transaction.get(facultyRef);
      const reviewSnap = await transaction.get(reviewRef);

      checkMaintenanceGate(gateSnap);

      if (receiptSnap) {
        const receiptEval = evaluateReceipt(receiptSnap, payloadHash);
        if (receiptEval.isReplay) return receiptEval.responseBody;
      }

      if (!facultySnap.exists) {
        throw new AuthError(`Faculty '${facultyId}' not found.`, 404, "FACULTY_NOT_FOUND");
      }
      if (!reviewSnap.exists) {
        throw new AuthError("Review not found.", 404, "REVIEW_NOT_FOUND");
      }

      const existingReview = reviewSnap.data();
      if (existingReview.status === REVIEW_STATUS.DELETED) {
        return { success: true, alreadyDeleted: true };
      }
      // Deleting would let the author later "restore" past the moderator's decision.
      assertNotModerated(existingReview);

      const assignedShardId = existingReview.shardId || getShardId(userId, NUM_SHARDS);
      const assignedSchemeVersion = existingReview.shardSchemeVersion || SHARD_SCHEME_VERSION;
      const assignedShardDocId = getShardDocId(assignedSchemeVersion, assignedShardId);

      const shardRefsToRead = [...shardRefs];
      if (!shardRefs.some((r) => r.id === assignedShardDocId)) {
        shardRefsToRead.push(facultyRef.collection("shards").doc(assignedShardDocId));
      }
      const shardSnaps = await Promise.all(shardRefsToRead.map((ref) => transaction.get(ref)));

      const delta = calculateAggregateDelta({
        oldReview: existingReview,
        newReview: { status: REVIEW_STATUS.DELETED },
      });

      const shardDataList = shardSnaps.map((snap, i) => {
        const docId = snap.id || getShardDocId(SHARD_SCHEME_VERSION, String(i));
        const parsed = parseShardDocId(docId) || { schemeVersion: SHARD_SCHEME_VERSION, shardId: String(i) };
        const data = snap.exists ? { ...snap.data() } : { reviewCount: 0 };
        if (docId === assignedShardDocId || (parsed.schemeVersion === assignedSchemeVersion && String(parsed.shardId) === String(assignedShardId))) {
          return {
            ...data,
            shardId: assignedShardId,
            schemeVersion: assignedSchemeVersion,
            reviewCount: (data.reviewCount || 0) + delta.count,
            attendanceSum: (data.attendanceSum || 0) + delta.attendance,
            correctionSum: (data.correctionSum || 0) + delta.correction,
            teachingSum: (data.teachingSum || 0) + delta.teaching,
            approachabilitySum: (data.approachabilitySum || 0) + delta.approachability,
            overallSum: (data.overallSum || 0) + delta.overall,
          };
        }
        return data;
      });

      const updatedFacultyStats = combineShards(shardDataList);
      const nextVersion = (existingReview.version || 1) + 1;

      // 1. Soft-delete review
      transaction.update(reviewRef, {
        status: REVIEW_STATUS.DELETED,
        version: nextVersion,
        updatedAt: FieldValue.serverTimestamp(),
      });

      // 2. Decrement Shard with composite identity
      const assignedShardRef = facultyRef.collection("shards").doc(assignedShardDocId);
      transaction.set(assignedShardRef, buildShardIncrementPayload(delta, assignedSchemeVersion, assignedShardId), { merge: true });

      // 3. Update Faculty
      transaction.update(facultyRef, updatedFacultyStats);

      const responseBody = {
        success: true,
        deleted: true,
        version: nextVersion,
        updatedStats: updatedFacultyStats,
      };

      if (receiptRef) {
        transaction.set(
          receiptRef,
          buildReceiptPayload({
            idempotencyKey: sanitizedIdempotencyKey,
            userId,
            action: "DELETE_REVIEW",
            payloadHash,
            statusCode: 200,
            responseBody,
          })
        );
      }

      return responseBody;
    });
  } finally {
    await exitWriter(adminDb, writerId);
  }
},

  /**
   * Restore a deleted review to ACTIVE status.
   */
  async restoreReview({ campusSlug, facultyId, userId, idempotencyKey }) {
    const sanitizedIdempotencyKey = idempotencyKey ? validateIdempotencyKey(idempotencyKey) : null;
    const canonicalPayload = { action: "RESTORE_REVIEW", campusSlug, facultyId, userId };
    const payloadHash = computePayloadHash(canonicalPayload);

    const gateRef = adminDb.collection("system").doc("reviewMaintenance");
    const facultyRef = adminDb.collection("campuses").doc(campusSlug).collection("faculties").doc(facultyId);
    const reviewRef = facultyRef.collection("reviews").doc(userId);
    const receiptRef = sanitizedIdempotencyKey
      ? adminDb.collection("campuses").doc(campusSlug).collection("requestReceipts").doc(sanitizedIdempotencyKey)
      : null;
    const shardRefs = Array.from({ length: NUM_SHARDS }, (_, i) =>
      facultyRef.collection("shards").doc(getShardDocId(SHARD_SCHEME_VERSION, String(i)))
    );

    const writerId = await enterWriter(adminDb);
    try {
      return await adminDb.runTransaction(async (transaction) => {
      const gateSnap = await transaction.get(gateRef);
      const receiptSnap = receiptRef ? await transaction.get(receiptRef) : null;
      const facultySnap = await transaction.get(facultyRef);
      const reviewSnap = await transaction.get(reviewRef);

      checkMaintenanceGate(gateSnap);

      if (receiptSnap) {
        const receiptEval = evaluateReceipt(receiptSnap, payloadHash);
        if (receiptEval.isReplay) return receiptEval.responseBody;
      }

      if (!facultySnap.exists) {
        throw new AuthError(`Faculty '${facultyId}' not found.`, 404, "FACULTY_NOT_FOUND");
      }
      if (!reviewSnap.exists) {
        throw new AuthError("Review not found.", 404, "REVIEW_NOT_FOUND");
      }

      const existingReview = reviewSnap.data();
      // Legacy documents without a `status` field are treated as ACTIVE everywhere else.
      if (
        existingReview.status === REVIEW_STATUS.ACTIVE ||
        existingReview.status === undefined
      ) {
        return { success: true, alreadyActive: true };
      }
      // Authors may only undo their own deletion. Any moderator-set status stays put.
      if (existingReview.status !== REVIEW_STATUS.DELETED) {
        assertNotModerated(existingReview);
        throw new AuthError(
          "Only a deleted review can be restored.",
          409,
          "REVIEW_NOT_DELETED"
        );
      }

      const assignedShardId = existingReview.shardId || getShardId(userId, NUM_SHARDS);
      const assignedSchemeVersion = existingReview.shardSchemeVersion || SHARD_SCHEME_VERSION;
      const assignedShardDocId = getShardDocId(assignedSchemeVersion, assignedShardId);

      const shardRefsToRead = [...shardRefs];
      if (!shardRefs.some((r) => r.id === assignedShardDocId)) {
        shardRefsToRead.push(facultyRef.collection("shards").doc(assignedShardDocId));
      }
      const shardSnaps = await Promise.all(shardRefsToRead.map((ref) => transaction.get(ref)));

      const delta = calculateAggregateDelta({
        oldReview: existingReview,
        newReview: { ...existingReview, status: REVIEW_STATUS.ACTIVE },
      });

      const shardDataList = shardSnaps.map((snap, i) => {
        const docId = snap.id || getShardDocId(SHARD_SCHEME_VERSION, String(i));
        const parsed = parseShardDocId(docId) || { schemeVersion: SHARD_SCHEME_VERSION, shardId: String(i) };
        const data = snap.exists ? { ...snap.data() } : { reviewCount: 0 };
        if (docId === assignedShardDocId || (parsed.schemeVersion === assignedSchemeVersion && String(parsed.shardId) === String(assignedShardId))) {
          return {
            ...data,
            shardId: assignedShardId,
            schemeVersion: assignedSchemeVersion,
            reviewCount: (data.reviewCount || 0) + delta.count,
            attendanceSum: (data.attendanceSum || 0) + delta.attendance,
            correctionSum: (data.correctionSum || 0) + delta.correction,
            teachingSum: (data.teachingSum || 0) + delta.teaching,
            approachabilitySum: (data.approachabilitySum || 0) + delta.approachability,
            overallSum: (data.overallSum || 0) + delta.overall,
          };
        }
        return data;
      });

      const updatedFacultyStats = combineShards(shardDataList);
      const nextVersion = (existingReview.version || 1) + 1;

      transaction.update(reviewRef, {
        status: REVIEW_STATUS.ACTIVE,
        version: nextVersion,
        updatedAt: FieldValue.serverTimestamp(),
      });

      const assignedShardRef = facultyRef.collection("shards").doc(assignedShardDocId);
      transaction.set(assignedShardRef, buildShardIncrementPayload(delta, assignedSchemeVersion, assignedShardId), { merge: true });
      transaction.update(facultyRef, updatedFacultyStats);

      const responseBody = {
        success: true,
        restored: true,
        version: nextVersion,
        updatedStats: updatedFacultyStats,
      };

      if (receiptRef) {
        transaction.set(
          receiptRef,
          buildReceiptPayload({
            idempotencyKey: sanitizedIdempotencyKey,
            userId,
            action: "RESTORE_REVIEW",
            payloadHash,
            statusCode: 200,
            responseBody,
          })
        );
      }

      return responseBody;
    });
  } finally {
    await exitWriter(adminDb, writerId);
  }
},

  /**
   * Moderate a review (FLAG or HIDE or RESTORE).
   * Authorized only for moderators/admins.
   */
  async moderateReview({ campusSlug, facultyId, targetUserId, action, reason, idempotencyKey }) {
    const validActions = [REVIEW_STATUS.FLAGGED, REVIEW_STATUS.HIDDEN, REVIEW_STATUS.ACTIVE];
    if (!validActions.includes(action)) {
      throw new ValidationError(
        `Invalid moderation action. Allowed: ${validActions.join(", ")}`
      );
    }

    const sanitizedIdempotencyKey = idempotencyKey ? validateIdempotencyKey(idempotencyKey) : null;
    const canonicalPayload = { action: `MODERATE_${action}`, campusSlug, facultyId, targetUserId, reason };
    const payloadHash = computePayloadHash(canonicalPayload);

    const gateRef = adminDb.collection("system").doc("reviewMaintenance");
    const facultyRef = adminDb.collection("campuses").doc(campusSlug).collection("faculties").doc(facultyId);
    const reviewRef = facultyRef.collection("reviews").doc(targetUserId);
    const receiptRef = sanitizedIdempotencyKey
      ? adminDb.collection("campuses").doc(campusSlug).collection("requestReceipts").doc(sanitizedIdempotencyKey)
      : null;
    const shardRefs = Array.from({ length: NUM_SHARDS }, (_, i) =>
      facultyRef.collection("shards").doc(getShardDocId(SHARD_SCHEME_VERSION, String(i)))
    );

    const writerId = await enterWriter(adminDb);
    try {
      return await adminDb.runTransaction(async (transaction) => {
      const gateSnap = await transaction.get(gateRef);
      const receiptSnap = receiptRef ? await transaction.get(receiptRef) : null;
      const facultySnap = await transaction.get(facultyRef);
      const reviewSnap = await transaction.get(reviewRef);

      checkMaintenanceGate(gateSnap);

      if (receiptSnap) {
        const receiptEval = evaluateReceipt(receiptSnap, payloadHash);
        if (receiptEval.isReplay) return receiptEval.responseBody;
      }

      if (!facultySnap.exists) {
        throw new AuthError(`Faculty '${facultyId}' not found.`, 404, "FACULTY_NOT_FOUND");
      }
      if (!reviewSnap.exists) {
        throw new AuthError("Review not found.", 404, "REVIEW_NOT_FOUND");
      }

      const existingReview = reviewSnap.data();
      const nextStatus = action;

      // An author's deletion must be respected: moderators cannot restore, flag or
      // hide a review the author has deleted.
      if (existingReview.status === REVIEW_STATUS.DELETED) {
        throw new AuthError(
          "This review was deleted by its author and cannot be moderated.",
          409,
          "REVIEW_DELETED"
        );
      }

      if (existingReview.status === nextStatus) {
        return { success: true, status: nextStatus, noOp: true };
      }

      const assignedShardId = existingReview.shardId || getShardId(targetUserId, NUM_SHARDS);
      const assignedSchemeVersion = existingReview.shardSchemeVersion || SHARD_SCHEME_VERSION;
      const assignedShardDocId = getShardDocId(assignedSchemeVersion, assignedShardId);

      const shardRefsToRead = [...shardRefs];
      if (!shardRefs.some((r) => r.id === assignedShardDocId)) {
        shardRefsToRead.push(facultyRef.collection("shards").doc(assignedShardDocId));
      }
      const shardSnaps = await Promise.all(shardRefsToRead.map((ref) => transaction.get(ref)));

      const delta = calculateAggregateDelta({
        oldReview: existingReview,
        newReview: { ...existingReview, status: nextStatus },
      });

      const shardDataList = shardSnaps.map((snap, i) => {
        const docId = snap.id || getShardDocId(SHARD_SCHEME_VERSION, String(i));
        const parsed = parseShardDocId(docId) || { schemeVersion: SHARD_SCHEME_VERSION, shardId: String(i) };
        const data = snap.exists ? { ...snap.data() } : { reviewCount: 0 };
        if (docId === assignedShardDocId || (parsed.schemeVersion === assignedSchemeVersion && String(parsed.shardId) === String(assignedShardId))) {
          return {
            ...data,
            shardId: assignedShardId,
            schemeVersion: assignedSchemeVersion,
            reviewCount: (data.reviewCount || 0) + delta.count,
            attendanceSum: (data.attendanceSum || 0) + delta.attendance,
            correctionSum: (data.correctionSum || 0) + delta.correction,
            teachingSum: (data.teachingSum || 0) + delta.teaching,
            approachabilitySum: (data.approachabilitySum || 0) + delta.approachability,
            overallSum: (data.overallSum || 0) + delta.overall,
          };
        }
        return data;
      });

      const updatedFacultyStats = combineShards(shardDataList);
      const nextVersion = (existingReview.version || 1) + 1;

      transaction.update(reviewRef, {
        status: nextStatus,
        version: nextVersion,
        moderationReason: reason || null,
        moderatedAt: FieldValue.serverTimestamp(),
      });

      const assignedShardRef = facultyRef.collection("shards").doc(assignedShardDocId);
      transaction.set(assignedShardRef, buildShardIncrementPayload(delta, assignedSchemeVersion, assignedShardId), { merge: true });
      transaction.update(facultyRef, updatedFacultyStats);

      const responseBody = {
        success: true,
        status: nextStatus,
        version: nextVersion,
        updatedStats: updatedFacultyStats,
      };

      if (receiptRef) {
        transaction.set(
          receiptRef,
          buildReceiptPayload({
            idempotencyKey: sanitizedIdempotencyKey,
            userId: targetUserId,
            action: `MODERATE_${action}`,
            payloadHash,
            statusCode: 200,
            responseBody,
          })
        );
      }

      return responseBody;
    });
  } finally {
    await exitWriter(adminDb, writerId);
  }
  },
};
