/**
 * Faculty Rating Aggregate Sharding System for VITor.
 *
 * Implements:
 * - 5-shard aggregate design (shards "0" through "4").
 * - Deterministic, stable shard assignment via SHA-256 hash modulo 5.
 * - Shard scheme versioning (SHARD_SCHEME_VERSION = 1).
 * - Exact rating formulas and 2-decimal precision contract from existing ReviewsService.
 * - Status transition handling (only ACTIVE reviews contribute to aggregates).
 * - Atomic shard updates and aggregate combination across shards.
 */

import crypto from "crypto";
import { FieldValue } from "../firebase/admin.js";

export const NUM_SHARDS = 5;
export const SHARD_SCHEME_VERSION = 1;

export const REVIEW_STATUS = {
  ACTIVE: "ACTIVE",
  DELETED: "DELETED",
  FLAGGED: "FLAGGED",
  HIDDEN: "HIDDEN",
  QUARANTINED: "QUARANTINED",
};

/**
 * Calculates arithmetic mean of the 4 evaluation criteria.
 */
export function calculateOverallRating(ratings) {
  if (!ratings) return 0;
  const sum =
    (Number(ratings.attendance) || 0) +
    (Number(ratings.correction) || 0) +
    (Number(ratings.teaching) || 0) +
    (Number(ratings.approachability) || 0);
  return sum / 4;
}

/**
 * Deterministically assigns a review to one of the 5 shards using SHA-256 of reviewId.
 */
export function getShardId(reviewId, numShards = NUM_SHARDS) {
  if (!reviewId || typeof reviewId !== "string") {
    throw new Error("Invalid review ID for shard assignment.");
  }
  const hash = crypto.createHash("sha256").update(reviewId).digest("hex");
  const hashInt = parseInt(hash.slice(0, 8), 16);
  return String(hashInt % numShards);
}

/**
 * Normalizes ratings object to extract numeric values for all 4 criteria + overall.
 */
export function extractRatings(reviewOrRatings) {
  if (!reviewOrRatings) return null;
  const ratings = reviewOrRatings.ratings || reviewOrRatings;

  const attendance = Number(ratings.attendance) || 0;
  const correction = Number(ratings.correction) || 0;
  const teaching = Number(ratings.teaching) || 0;
  const approachability = Number(ratings.approachability) || 0;
  const overall = Number(ratings.overall) || calculateOverallRating({ attendance, correction, teaching, approachability });

  return {
    attendance,
    correction,
    teaching,
    approachability,
    overall,
  };
}

/**
 * Calculates aggregate shard delta for any state transition.
 *
 * Rules:
 * - Only ACTIVE reviews contribute to aggregates.
 * - Transition NEW (ACTIVE) -> +1 count, +ratings
 * - Transition ACTIVE -> ACTIVE (edit) -> 0 count, +(newRatings - oldRatings)
 * - Transition ACTIVE -> INACTIVE (delete/flag/hide) -> -1 count, -oldRatings
 * - Transition INACTIVE -> ACTIVE (restore) -> +1 count, +newRatings
 * - Transition INACTIVE -> INACTIVE -> 0 for all
 */
export function calculateAggregateDelta({ oldReview, newReview }) {
  const oldActive = oldReview && (oldReview.status === REVIEW_STATUS.ACTIVE || oldReview.status === undefined);
  const newActive = newReview && newReview.status === REVIEW_STATUS.ACTIVE;

  const oldR = oldActive ? extractRatings(oldReview) : null;
  const newR = newActive ? extractRatings(newReview) : null;

  if (!oldActive && !newActive) {
    return {
      count: 0,
      attendance: 0,
      correction: 0,
      teaching: 0,
      approachability: 0,
      overall: 0,
    };
  }

  if (!oldActive && newActive) {
    return {
      count: 1,
      attendance: newR.attendance,
      correction: newR.correction,
      teaching: newR.teaching,
      approachability: newR.approachability,
      overall: newR.overall,
    };
  }

  if (oldActive && !newActive) {
    return {
      count: -1,
      attendance: -oldR.attendance,
      correction: -oldR.correction,
      teaching: -oldR.teaching,
      approachability: -oldR.approachability,
      overall: -oldR.overall,
    };
  }

  // Both active (edit)
  return {
    count: 0,
    attendance: +(newR.attendance - oldR.attendance).toFixed(4),
    correction: +(newR.correction - oldR.correction).toFixed(4),
    teaching: +(newR.teaching - oldR.teaching).toFixed(4),
    approachability: +(newR.approachability - oldR.approachability).toFixed(4),
    overall: +(newR.overall - oldR.overall).toFixed(4),
  };
}

/**
 * Combines an array of 5 shard documents into faculty-level aggregate statistics.
 * Respects 2-decimal precision.
 */
export function combineShards(shards = []) {
  let totalCount = 0;
  let sumAttendance = 0;
  let sumCorrection = 0;
  let sumTeaching = 0;
  let sumApproachability = 0;
  let sumOverall = 0;

  for (const shard of shards) {
    if (!shard) continue;
    const count = Number(shard.reviewCount) || 0;
    if (count > 0) {
      totalCount += count;
      sumAttendance += Number(shard.attendanceSum) || 0;
      sumCorrection += Number(shard.correctionSum) || 0;
      sumTeaching += Number(shard.teachingSum) || 0;
      sumApproachability += Number(shard.approachabilitySum) || 0;
      sumOverall += Number(shard.overallSum) || 0;
    }
  }

  if (totalCount <= 0) {
    return {
      avgAttendance: 0,
      avgCorrection: 0,
      avgTeaching: 0,
      avgApproachability: 0,
      avgRating: 0,
      reviewCount: 0,
    };
  }

  return {
    avgAttendance: +(sumAttendance / totalCount).toFixed(2),
    avgCorrection: +(sumCorrection / totalCount).toFixed(2),
    avgTeaching: +(sumTeaching / totalCount).toFixed(2),
    avgApproachability: +(sumApproachability / totalCount).toFixed(2),
    avgRating: +(sumOverall / totalCount).toFixed(2),
    reviewCount: totalCount,
  };
}

/**
 * Deterministically constructs composite shard document ID combining schemeVersion and shardId.
 * e.g., schemeVersion 1, shardId "3" -> "v1_s3".
 */
export function getShardDocId(schemeVersion = SHARD_SCHEME_VERSION, shardId) {
  if (shardId === undefined || shardId === null || shardId === "") {
    throw new Error("Invalid shardId for shard document ID.");
  }
  return `v${schemeVersion}_s${shardId}`;
}

/**
 * Parses composite or legacy shard document ID into schemeVersion and shardId.
 */
export function parseShardDocId(docId) {
  if (typeof docId !== "string") return null;
  const match = docId.match(/^v(\d+)_s(\d+)$/);
  if (match) {
    return { schemeVersion: Number(match[1]), shardId: match[2] };
  }
  // Backwards compatibility with bare legacy shardIds "0".."4"
  if (/^\d+$/.test(docId)) {
    return { schemeVersion: 1, shardId: docId };
  }
  return null;
}

/**
 * Builds the FieldValue.increment payload for an atomic shard update.
 */
export function buildShardIncrementPayload(delta, schemeVersion = SHARD_SCHEME_VERSION, shardId = null) {
  const payload = {
    schemeVersion,
    reviewCount: FieldValue.increment(delta.count),
    attendanceSum: FieldValue.increment(delta.attendance),
    correctionSum: FieldValue.increment(delta.correction),
    teachingSum: FieldValue.increment(delta.teaching),
    approachabilitySum: FieldValue.increment(delta.approachability),
    overallSum: FieldValue.increment(delta.overall),
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (shardId !== null && shardId !== undefined) {
    payload.shardId = String(shardId);
  }
  return payload;
}
