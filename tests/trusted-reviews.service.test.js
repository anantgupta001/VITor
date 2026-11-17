import test from "node:test";
import assert from "node:assert/strict";
import { ReviewsTransactionCoordinator } from "../lib/server/reviews-transaction.js";
import { adminDb } from "../lib/firebase/admin.js";
import { REVIEW_STATUS } from "../lib/server/aggregates.js";
import { MaintenanceError } from "../lib/server/maintenance.js";
import { RateLimitExceededError } from "../lib/server/rate-limit.js";
import { IdempotencyConflictError, computePayloadHash } from "../lib/server/idempotency.js";
import { ConcurrencyConflictError } from "../lib/server/concurrency.js";

// ============================================================================
// Unit Tests for ReviewsTransactionCoordinator Logic
// ============================================================================

test("ReviewsTransaction - submitOrUpdateReview runs atomic transaction and computes aggregates", async (t) => {
  let transactionCommitted = false;
  const writes = { sets: [], updates: [] };

  t.mock.method(adminDb, "runTransaction", async (txCallback) => {
    const mockTx = {
      get: async (ref) => {
        const p = ref.path || "";
        // Mock reads
        if (p.includes("reviewMaintenance")) {
          return { exists: true, data: () => ({ status: "OPEN" }) };
        }
        if (p.includes("requestReceipts")) {
          return { exists: false };
        }
        if (p.includes("faculties") && !p.includes("reviews") && !p.includes("shards")) {
          return { exists: true, data: () => ({ name: "Prof Test" }) };
        }
        if (p.includes("reviews")) {
          return { exists: false }; // new review
        }
        if (p.includes("rateLimits")) {
          return { exists: false }; // no quota used yet
        }
        if (p.includes("shards")) {
          return { exists: false };
        }
        return { exists: false };
      },
      set: (ref, data, opts) => writes.sets.push({ ref: ref.path, data, opts }),
      update: (ref, data) => writes.updates.push({ ref: ref.path, data }),
    };

    const res = await txCallback(mockTx);
    transactionCommitted = true;
    return res;
  });

  const result = await ReviewsTransactionCoordinator.submitOrUpdateReview({
    campusSlug: "vit-ap",
    facultyId: "fac-101",
    userId: "student-uid-1",
    ratings: { attendance: 4, correction: 4, teaching: 5, approachability: 5 },
    comment: "Excellent experience with this professor.",
    idempotencyKey: "test-idem-key-1",
  });

  assert.equal(transactionCommitted, true);
  assert.equal(result.overall, 4.5);
  assert.equal(result.version, 1);
  assert.equal(result.isReplay, false);

  // 1 review + 1 shard + 1 quota + 1 receipt set
  assert.equal(writes.sets.length, 4);
  // 1 faculty stats update
  assert.equal(writes.updates.length, 1);

  const facultyUpdate = writes.updates[0].data;
  assert.equal(facultyUpdate.reviewCount, 1);
  assert.equal(facultyUpdate.avgAttendance, 4.0);
  assert.equal(facultyUpdate.avgRating, 4.5);
});

test("ReviewsTransaction - submitOrUpdateReview blocks write when maintenance gate is CLOSING", async (t) => {
  t.mock.method(adminDb, "runTransaction", async (txCallback) => {
    const mockTx = {
      get: async (ref) => {
        const p = ref.path || "";
        if (p.includes("reviewMaintenance")) {
          return { exists: true, data: () => ({ status: "CLOSING" }) };
        }
        return { exists: false };
      },
    };
    return await txCallback(mockTx);
  });

  await assert.rejects(
    () =>
      ReviewsTransactionCoordinator.submitOrUpdateReview({
        campusSlug: "vit-ap",
        facultyId: "fac-101",
        userId: "student-uid-1",
        ratings: { attendance: 4, correction: 4, teaching: 4, approachability: 4 },
        comment: "Great experience.",
      }),
    (err) => {
      assert.ok(err instanceof MaintenanceError);
      assert.equal(err.statusCode, 503);
      return true;
    }
  );
});

test("ReviewsTransaction - submitOrUpdateReview enforces 5 review quota per rolling 24 hours", async (t) => {
  const now = Date.now();
  const fullTimestamps = [now - 1000, now - 2000, now - 3000, now - 4000, now - 5000];

  t.mock.method(adminDb, "runTransaction", async (txCallback) => {
    const mockTx = {
      get: async (ref) => {
        const p = ref.path || "";
        if (p.includes("reviewMaintenance")) {
          return { exists: true, data: () => ({ status: "OPEN" }) };
        }
        if (p.includes("faculties") && !p.includes("reviews")) {
          return { exists: true, data: () => ({ name: "Prof" }) };
        }
        if (p.includes("reviews")) {
          return { exists: false }; // new submission
        }
        if (p.includes("rateLimits")) {
          return { exists: true, data: () => ({ timestamps: fullTimestamps }) };
        }
        return { exists: false };
      },
    };
    return await txCallback(mockTx);
  });

  await assert.rejects(
    () =>
      ReviewsTransactionCoordinator.submitOrUpdateReview({
        campusSlug: "vit-ap",
        facultyId: "fac-101",
        userId: "student-quota-user",
        ratings: { attendance: 4, correction: 4, teaching: 4, approachability: 4 },
        comment: "Great experience with prof.",
      }),
    (err) => {
      assert.ok(err instanceof RateLimitExceededError);
      assert.equal(err.statusCode, 429);
      assert.ok(err.retryAfterSeconds > 0);
      return true;
    }
  );
});

test("ReviewsTransaction - submitOrUpdateReview returns cached response on idempotent replay", async (t) => {
  const cachedResponse = { success: true, overall: 4.5, version: 1 };
  const matchingHash = computePayloadHash({
    action: "SUBMIT_OR_UPDATE_REVIEW",
    campusSlug: "vit-ap",
    facultyId: "fac-101",
    userId: "student-uid-1",
    ratings: { attendance: 4, correction: 4, teaching: 5, approachability: 5 },
    comment: "Same comment as before.",
    expectedVersion: null,
  });

  t.mock.method(adminDb, "runTransaction", async (txCallback) => {
    const mockTx = {
      get: async (ref) => {
        const p = ref.path || "";
        if (p.includes("reviewMaintenance")) {
          return { exists: true, data: () => ({ status: "OPEN" }) };
        }
        if (p.includes("requestReceipts")) {
          return {
            exists: true,
            data: () => ({
              payloadHash: matchingHash,
              statusCode: 201,
              responseBody: cachedResponse,
            }),
          };
        }
        return { exists: false };
      },
      set: () => assert.fail("MUST NOT write on idempotent replay"),
      update: () => assert.fail("MUST NOT update on idempotent replay"),
    };
    return await txCallback(mockTx);
  });

  // Incoming request with matching hash
  const res = await ReviewsTransactionCoordinator.submitOrUpdateReview({
    campusSlug: "vit-ap",
    facultyId: "fac-101",
    userId: "student-uid-1",
    ratings: { attendance: 4, correction: 4, teaching: 5, approachability: 5 },
    comment: "Same comment as before.",
    idempotencyKey: "idem-matched",
  });

  assert.equal(res.isReplay, true);
  assert.equal(res.overall, 4.5);
});

test("ReviewsTransaction - submitOrUpdateReview rejects stale expectedVersion with 409 Conflict", async (t) => {
  t.mock.method(adminDb, "runTransaction", async (txCallback) => {
    const mockTx = {
      get: async (ref) => {
        const p = ref.path || "";
        if (p.includes("reviewMaintenance")) {
          return { exists: true, data: () => ({ status: "OPEN" }) };
        }
        if (p.includes("faculties") && !p.includes("reviews")) {
          return { exists: true, data: () => ({ name: "Prof" }) };
        }
        if (p.includes("reviews")) {
          return {
            exists: true,
            data: () => ({
              version: 3, // existing version is 3
              status: REVIEW_STATUS.ACTIVE,
              ratings: { attendance: 4, correction: 4, teaching: 4, approachability: 4 },
              comment: "Old comment",
            }),
          };
        }
        return { exists: false };
      },
    };
    return await txCallback(mockTx);
  });

  await assert.rejects(
    () =>
      ReviewsTransactionCoordinator.submitOrUpdateReview({
        campusSlug: "vit-ap",
        facultyId: "fac-101",
        userId: "student-uid-1",
        ratings: { attendance: 5, correction: 5, teaching: 5, approachability: 5 },
        comment: "New comment text",
        expectedVersion: 2, // STALE! Expected 2 but database has 3
      }),
    (err) => {
      assert.ok(err instanceof ConcurrencyConflictError);
      assert.equal(err.statusCode, 409);
      assert.equal(err.currentVersion, 3);
      return true;
    }
  );
});

test("ReviewsTransaction - deleteReview sets status to DELETED and decrements aggregates", async (t) => {
  let reviewUpdated = false;
  let shardDecremented = false;

  t.mock.method(adminDb, "runTransaction", async (txCallback) => {
    const mockTx = {
      get: async (ref) => {
        const p = ref.path || "";
        if (p.includes("reviewMaintenance")) return { exists: true, data: () => ({ status: "OPEN" }) };
        if (p.includes("faculties") && !p.includes("reviews") && !p.includes("shards")) {
          return { exists: true, data: () => ({ name: "Prof" }) };
        }
        if (p.includes("reviews")) {
          return {
            exists: true,
            data: () => ({
              version: 1,
              status: REVIEW_STATUS.ACTIVE,
              shardId: "0",
              ratings: { attendance: 4, correction: 4, teaching: 4, approachability: 4, overall: 4.0 },
            }),
          };
        }
        if (p.includes("shards")) {
          return {
            exists: true,
            data: () => ({
              reviewCount: 1,
              attendanceSum: 4,
              correctionSum: 4,
              teachingSum: 4,
              approachabilitySum: 4,
              overallSum: 4,
            }),
          };
        }
        return { exists: false };
      },
      update: (ref, data) => {
        if (data.status === REVIEW_STATUS.DELETED) reviewUpdated = true;
      },
      set: (ref, data) => {
        if (data.reviewCount) shardDecremented = true;
      },
    };
    return await txCallback(mockTx);
  });

  const res = await ReviewsTransactionCoordinator.deleteReview({
    campusSlug: "vit-ap",
    facultyId: "fac-101",
    userId: "student-del",
  });

  assert.equal(res.success, true);
  assert.equal(res.deleted, true);
  assert.equal(reviewUpdated, true);
  assert.equal(shardDecremented, true);
});

test("ReviewsTransaction - restoreReview restores DELETED review and increments aggregates", async (t) => {
  let reviewRestored = false;

  t.mock.method(adminDb, "runTransaction", async (txCallback) => {
    const mockTx = {
      get: async (ref) => {
        const p = ref.path || "";
        if (p.includes("reviewMaintenance")) return { exists: true, data: () => ({ status: "OPEN" }) };
        if (p.includes("faculties") && !p.includes("reviews") && !p.includes("shards")) {
          return { exists: true, data: () => ({ name: "Prof" }) };
        }
        if (p.includes("reviews")) {
          return {
            exists: true,
            data: () => ({
              version: 2,
              status: REVIEW_STATUS.DELETED,
              shardId: "0",
              ratings: { attendance: 4, correction: 4, teaching: 4, approachability: 4, overall: 4.0 },
            }),
          };
        }
        return { exists: false };
      },
      update: (ref, data) => {
        if (data.status === REVIEW_STATUS.ACTIVE) reviewRestored = true;
      },
      set: () => {},
    };
    return await txCallback(mockTx);
  });

  const res = await ReviewsTransactionCoordinator.restoreReview({
    campusSlug: "vit-ap",
    facultyId: "fac-101",
    userId: "student-res",
  });

  assert.equal(res.success, true);
  assert.equal(res.restored, true);
  assert.equal(reviewRestored, true);
});
