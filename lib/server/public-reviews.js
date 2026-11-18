/**
 * Public review read model.
 *
 * Reviews are stored under a document whose ID is the author's Firebase UID, and the
 * document also carries moderation/internal fields. Clients are therefore NOT allowed
 * to read the `reviews` collection directly (see firestore.rules). The public site
 * reads reviews through this module instead, which:
 *   - returns only publicly visible reviews (ACTIVE, or legacy documents with no status);
 *   - never returns the author's UID or any internal/moderation field;
 *   - uses an opaque, non-reversible review ID.
 */

import crypto from "crypto";
import { adminDb } from "../firebase/admin.js";
import { REVIEW_STATUS } from "./aggregates.js";

/**
 * A review is public when it is ACTIVE. Legacy documents created before the
 * `status` field existed (status === undefined) are treated as ACTIVE, matching
 * `calculateAggregateDelta` and the previous client behavior.
 */
function isPubliclyVisible(review) {
  return review?.status === undefined || review.status === REVIEW_STATUS.ACTIVE;
}

function opaqueReviewId(campusSlug, facultyId, docId) {
  return crypto
    .createHash("sha256")
    .update(`${campusSlug}/${facultyId}/${docId}`)
    .digest("hex")
    .slice(0, 24);
}

/**
 * Maps a stored review document to the public shape. Whitelist only.
 */
function toPublicReview(campusSlug, facultyId, docId, data) {
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

export async function listPublicReviews(campusSlug, facultyId) {
  const snap = await adminDb
    .collection("campuses")
    .doc(campusSlug)
    .collection("faculties")
    .doc(facultyId)
    .collection("reviews")
    .get();

  return snap.docs
    .filter((d) => isPubliclyVisible(d.data()))
    .map((d) => toPublicReview(campusSlug, facultyId, d.id, d.data()));
}
