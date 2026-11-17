import test from "node:test";
import assert from "node:assert/strict";
import {
  checkOptimisticConcurrency,
  isReviewNoOp,
  ConcurrencyConflictError,
} from "../lib/server/concurrency.js";

test("Concurrency - checkOptimisticConcurrency passes when expectedVersion matches currentVersion", () => {
  const currentReview = { version: 3, comment: "Hello", ratings: { attendance: 4 } };

  // Matching version passes
  assert.doesNotThrow(() => checkOptimisticConcurrency(currentReview, 3));
});

test("Concurrency - checkOptimisticConcurrency allows undefined expectedVersion for blind updates", () => {
  const currentReview = { version: 2 };
  assert.doesNotThrow(() => checkOptimisticConcurrency(currentReview, undefined));
  assert.doesNotThrow(() => checkOptimisticConcurrency(currentReview, null));
});

test("Concurrency - checkOptimisticConcurrency rejects stale expectedVersion with 409 Conflict", () => {
  const currentReview = { version: 5 };

  assert.throws(
    () => checkOptimisticConcurrency(currentReview, 4),
    (err) => {
      assert.ok(err instanceof ConcurrencyConflictError);
      assert.equal(err.statusCode, 409);
      assert.equal(err.code, "VERSION_CONFLICT");
      assert.equal(err.currentVersion, 5);
      assert.match(err.message, /Current version is 5, expected 4/);
      return true;
    }
  );
});

test("Concurrency - checkOptimisticConcurrency handles new review (null currentReview)", () => {
  // New review with expectedVersion undefined or 0 passes
  assert.doesNotThrow(() => checkOptimisticConcurrency(null, undefined));
  assert.doesNotThrow(() => checkOptimisticConcurrency(null, 0));

  // If client expects version 2 on non-existent review -> conflict
  assert.throws(
    () => checkOptimisticConcurrency(null, 2),
    (err) => {
      assert.ok(err instanceof ConcurrencyConflictError);
      assert.equal(err.statusCode, 409);
      return true;
    }
  );
});

test("Concurrency - isReviewNoOp accurately detects true no-ops", () => {
  const currentReview = {
    status: "ACTIVE",
    comment: "Consistent and fair grader.",
    ratings: { attendance: 4, correction: 4, teaching: 5, approachability: 4 },
  };

  // Identical payload -> true no-op
  const noOpResult = isReviewNoOp(currentReview, {
    status: "ACTIVE",
    comment: "Consistent and fair grader.   ", // trailing whitespace trimmed
    ratings: { attendance: 4, correction: 4, teaching: 5, approachability: 4 },
  });
  assert.equal(noOpResult, true);

  // Changed comment -> not a no-op
  const changedCommentResult = isReviewNoOp(currentReview, {
    status: "ACTIVE",
    comment: "Updated comment text here.",
    ratings: { attendance: 4, correction: 4, teaching: 5, approachability: 4 },
  });
  assert.equal(changedCommentResult, false);

  // Changed rating -> not a no-op
  const changedRatingResult = isReviewNoOp(currentReview, {
    status: "ACTIVE",
    comment: "Consistent and fair grader.",
    ratings: { attendance: 5, correction: 4, teaching: 5, approachability: 4 },
  });
  assert.equal(changedRatingResult, false);
});
