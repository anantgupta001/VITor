import test from "node:test";
import assert from "node:assert/strict";
import {
  NUM_SHARDS,
  SHARD_SCHEME_VERSION,
  REVIEW_STATUS,
  getShardId,
  getShardDocId,
  parseShardDocId,
  calculateOverallRating,
  extractRatings,
  calculateAggregateDelta,
  combineShards,
  buildShardIncrementPayload,
} from "../lib/server/aggregates.js";

// ============================================================================
// Shard Scheme & Deterministic Assignment Tests
// ============================================================================

test("Aggregates - NUM_SHARDS is 5 and SHARD_SCHEME_VERSION is 1", () => {
  assert.equal(NUM_SHARDS, 5);
  assert.equal(SHARD_SCHEME_VERSION, 1);
});

test("Aggregates - getShardId is deterministic and within range 0-4", () => {
  const ids = ["user-123", "student_456", "auth_abc_789", "reviewer_001"];
  for (const id of ids) {
    const shard1 = getShardId(id);
    const shard2 = getShardId(id);
    assert.equal(shard1, shard2, `Shard ID for ${id} must be deterministic`);
    const shardNum = Number(shard1);
    assert.ok(shardNum >= 0 && shardNum < 5, `Shard ID must be between 0 and 4`);
  }
});

test("Aggregates - getShardId rejects invalid or non-string inputs", () => {
  assert.throws(() => getShardId(null), /Invalid review ID/);
  assert.throws(() => getShardId(""), /Invalid review ID/);
  assert.throws(() => getShardId(123), /Invalid review ID/);
});

// ============================================================================
// Rating Calculation & Normalization Tests
// ============================================================================

test("Aggregates - calculateOverallRating arithmetic mean calculation", () => {
  assert.equal(
    calculateOverallRating({ attendance: 4, correction: 4, teaching: 4, approachability: 4 }),
    4.0
  );
  assert.equal(
    calculateOverallRating({ attendance: 5, correction: 4, teaching: 5, approachability: 3 }),
    4.25
  );
  assert.equal(calculateOverallRating(null), 0);
});

test("Aggregates - extractRatings handles nested and top-level formats", () => {
  const nested = {
    ratings: { attendance: 5, correction: 4, teaching: 3, approachability: 4, overall: 4.0 },
  };
  const flat = { attendance: 5, correction: 4, teaching: 3, approachability: 4 };

  const extractedNested = extractRatings(nested);
  const extractedFlat = extractRatings(flat);

  assert.equal(extractedNested.attendance, 5);
  assert.equal(extractedNested.correction, 4);
  assert.equal(extractedNested.overall, 4.0);

  assert.equal(extractedFlat.attendance, 5);
  assert.equal(extractedFlat.overall, 4.0);
});

// ============================================================================
// Transition Delta Calculations
// ============================================================================

test("Aggregates - delta: new ACTIVE review submission", () => {
  const newReview = {
    status: REVIEW_STATUS.ACTIVE,
    ratings: { attendance: 4, correction: 4, teaching: 5, approachability: 5 },
  };

  const delta = calculateAggregateDelta({ oldReview: null, newReview });
  assert.equal(delta.count, 1);
  assert.equal(delta.attendance, 4);
  assert.equal(delta.correction, 4);
  assert.equal(delta.teaching, 5);
  assert.equal(delta.approachability, 5);
  assert.equal(delta.overall, 4.5);
});

test("Aggregates - delta: editing an existing ACTIVE review", () => {
  const oldReview = {
    status: REVIEW_STATUS.ACTIVE,
    ratings: { attendance: 3, correction: 3, teaching: 3, approachability: 3, overall: 3.0 },
  };
  const newReview = {
    status: REVIEW_STATUS.ACTIVE,
    ratings: { attendance: 5, correction: 4, teaching: 4, approachability: 5, overall: 4.5 },
  };

  const delta = calculateAggregateDelta({ oldReview, newReview });
  assert.equal(delta.count, 0, "Edit between active reviews must not change review count");
  assert.equal(delta.attendance, 2); // 5 - 3
  assert.equal(delta.correction, 1); // 4 - 3
  assert.equal(delta.teaching, 1);   // 4 - 3
  assert.equal(delta.approachability, 2); // 5 - 3
  assert.equal(delta.overall, 1.5); // 4.5 - 3.0
});

test("Aggregates - delta: deleting an ACTIVE review", () => {
  const oldReview = {
    status: REVIEW_STATUS.ACTIVE,
    ratings: { attendance: 4, correction: 4, teaching: 4, approachability: 4, overall: 4.0 },
  };
  const newReview = {
    status: REVIEW_STATUS.DELETED,
  };

  const delta = calculateAggregateDelta({ oldReview, newReview });
  assert.equal(delta.count, -1);
  assert.equal(delta.attendance, -4);
  assert.equal(delta.correction, -4);
  assert.equal(delta.teaching, -4);
  assert.equal(delta.approachability, -4);
  assert.equal(delta.overall, -4.0);
});

test("Aggregates - delta: restoring a DELETED review to ACTIVE", () => {
  const oldReview = {
    status: REVIEW_STATUS.DELETED,
    ratings: { attendance: 4, correction: 4, teaching: 4, approachability: 4, overall: 4.0 },
  };
  const newReview = {
    status: REVIEW_STATUS.ACTIVE,
    ratings: { attendance: 4, correction: 4, teaching: 4, approachability: 4, overall: 4.0 },
  };

  const delta = calculateAggregateDelta({ oldReview, newReview });
  assert.equal(delta.count, 1);
  assert.equal(delta.attendance, 4);
  assert.equal(delta.overall, 4.0);
});

test("Aggregates - delta: inactive to inactive mutation produces zero deltas", () => {
  const oldReview = { status: REVIEW_STATUS.DELETED, ratings: { attendance: 4 } };
  const newReview = { status: REVIEW_STATUS.FLAGGED, ratings: { attendance: 5 } };

  const delta = calculateAggregateDelta({ oldReview, newReview });
  assert.equal(delta.count, 0);
  assert.equal(delta.attendance, 0);
  assert.equal(delta.overall, 0);
});

// ============================================================================
// Multi-Shard Combination & Precision Tests
// ============================================================================

test("Aggregates - combineShards accurately computes faculty aggregates from 5 shards", () => {
  const shards = [
    { shardId: "0", reviewCount: 2, attendanceSum: 8, correctionSum: 8, teachingSum: 10, approachabilitySum: 8, overallSum: 8.5 },
    { shardId: "1", reviewCount: 1, attendanceSum: 5, correctionSum: 4, teachingSum: 4, approachabilitySum: 5, overallSum: 4.5 },
    { shardId: "2", reviewCount: 0, attendanceSum: 0, correctionSum: 0, teachingSum: 0, approachabilitySum: 0, overallSum: 0 },
    { shardId: "3", reviewCount: 1, attendanceSum: 3, correctionSum: 3, teachingSum: 4, approachabilitySum: 3, overallSum: 3.25 },
    { shardId: "4", reviewCount: 0, attendanceSum: 0, correctionSum: 0, teachingSum: 0, approachabilitySum: 0, overallSum: 0 },
  ];

  const result = combineShards(shards);
  assert.equal(result.reviewCount, 4); // 2 + 1 + 0 + 1 + 0 = 4
  // attendance: (8 + 5 + 3) / 4 = 16 / 4 = 4.0
  assert.equal(result.avgAttendance, 4.0);
  // correction: (8 + 4 + 3) / 4 = 15 / 4 = 3.75
  assert.equal(result.avgCorrection, 3.75);
  // teaching: (10 + 4 + 4) / 4 = 18 / 4 = 4.5
  assert.equal(result.avgTeaching, 4.5);
  // approachability: (8 + 5 + 3) / 4 = 16 / 4 = 4.0
  assert.equal(result.avgApproachability, 4.0);
  // overall: (8.5 + 4.5 + 3.25) / 4 = 16.25 / 4 = 4.0625 -> 4.06
  assert.equal(result.avgRating, 4.06);
});

test("Aggregates - combineShards handles empty or 0-count shards gracefully", () => {
  const emptyShards = [
    { reviewCount: 0 },
    { reviewCount: 0 },
    { reviewCount: 0 },
    { reviewCount: 0 },
    { reviewCount: 0 },
  ];
  const result = combineShards(emptyShards);
  assert.deepEqual(result, {
    avgAttendance: 0,
    avgCorrection: 0,
    avgTeaching: 0,
    avgApproachability: 0,
    avgRating: 0,
    reviewCount: 0,
  });

  assert.deepEqual(combineShards([]), {
    avgAttendance: 0,
    avgCorrection: 0,
    avgTeaching: 0,
    avgApproachability: 0,
    avgRating: 0,
    reviewCount: 0,
  });
});

// ============================================================================
// Composite Shard Identity Tests
// ============================================================================

test("Aggregates - getShardDocId builds deterministic composite identity", () => {
  assert.equal(getShardDocId(1, "0"), "v1_s0");
  assert.equal(getShardDocId(1, "3"), "v1_s3");
  assert.equal(getShardDocId(2, "3"), "v2_s3");
  assert.equal(getShardDocId(undefined, "4"), "v1_s4");

  assert.throws(() => getShardDocId(1, null), /Invalid shardId/);
  assert.throws(() => getShardDocId(1, undefined), /Invalid shardId/);
  assert.throws(() => getShardDocId(1, ""), /Invalid shardId/);
});

test("Aggregates - parseShardDocId parses composite and legacy bare IDs", () => {
  assert.deepEqual(parseShardDocId("v1_s3"), { schemeVersion: 1, shardId: "3" });
  assert.deepEqual(parseShardDocId("v2_s3"), { schemeVersion: 2, shardId: "3" });
  assert.deepEqual(parseShardDocId("v10_s4"), { schemeVersion: 10, shardId: "4" });

  // Legacy bare digit compatibility
  assert.deepEqual(parseShardDocId("0"), { schemeVersion: 1, shardId: "0" });
  assert.deepEqual(parseShardDocId("3"), { schemeVersion: 1, shardId: "3" });

  // Malformed IDs
  assert.equal(parseShardDocId("invalid_shard"), null);
  assert.equal(parseShardDocId("v_s"), null);
  assert.equal(parseShardDocId(null), null);
  assert.equal(parseShardDocId(123), null);
});
