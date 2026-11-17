import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateAndConsumeSubmissionQuota,
  DEFAULT_RATE_LIMIT_CONFIG,
  RateLimitExceededError,
} from "../lib/server/rate-limit.js";

test("Rate Limit - allows first submission for new user with empty quota document", () => {
  const missingSnap = { exists: false };
  const now = Date.now();

  const result = evaluateAndConsumeSubmissionQuota(missingSnap, now);
  assert.equal(result.allowed, true);
  assert.equal(result.timestamps.length, 1);
  assert.equal(result.timestamps[0], now);
});

test("Rate Limit - enforces 5 submissions per rolling 24 hours", () => {
  const now = 100000000;
  const hourMs = 60 * 60 * 1000;

  // Simulate 4 prior submissions within 24 hours
  const priorTimestamps = [
    now - 10 * hourMs,
    now - 8 * hourMs,
    now - 4 * hourMs,
    now - 1 * hourMs,
  ];

  const snap = {
    exists: true,
    data: () => ({ timestamps: priorTimestamps }),
  };

  // 5th submission -> allowed
  const fifthResult = evaluateAndConsumeSubmissionQuota(snap, now);
  assert.equal(fifthResult.allowed, true);
  assert.equal(fifthResult.timestamps.length, 5);

  // 6th submission with 5 active timestamps -> rejected with 429
  const fullSnap = {
    exists: true,
    data: () => ({ timestamps: fifthResult.timestamps }),
  };

  assert.throws(
    () => evaluateAndConsumeSubmissionQuota(fullSnap, now),
    (err) => {
      assert.ok(err instanceof RateLimitExceededError);
      assert.equal(err.statusCode, 429);
      assert.equal(err.code, "RATE_LIMIT_EXCEEDED");
      // Oldest is (now - 10h). In 24h window, expires at (now - 10h + 24h) = now + 14h.
      // Expected retryAfter: 14 * 3600 seconds = 50400 seconds
      assert.equal(err.retryAfterSeconds, 14 * 3600);
      return true;
    }
  );
});

test("Rate Limit - rolling-window expiry frees up quota for expired submissions", () => {
  const now = 200000000;
  const hourMs = 60 * 60 * 1000;

  // 5 prior submissions, but 2 of them are older than 24 hours
  const timestampsWithExpired = [
    now - 30 * hourMs, // EXPIRED (> 24h)
    now - 26 * hourMs, // EXPIRED (> 24h)
    now - 10 * hourMs, // ACTIVE
    now - 5 * hourMs,  // ACTIVE
    now - 1 * hourMs,  // ACTIVE
  ];

  const snap = {
    exists: true,
    data: () => ({ timestamps: timestampsWithExpired }),
  };

  // 2 expired, 3 active -> allowed!
  const result = evaluateAndConsumeSubmissionQuota(snap, now);
  assert.equal(result.allowed, true);
  // Contains 3 active + 1 new = 4 total
  assert.equal(result.timestamps.length, 4);
});

test("Rate Limit - custom policy configuration", () => {
  const customConfig = {
    maxSubmissions: 2,
    windowMs: 60 * 1000, // 1 minute window
  };

  const now = Date.now();
  const snap = {
    exists: true,
    data: () => ({ timestamps: [now - 10000, now - 5000] }),
  };

  assert.throws(
    () => evaluateAndConsumeSubmissionQuota(snap, now, customConfig),
    (err) => {
      assert.ok(err instanceof RateLimitExceededError);
      assert.equal(err.statusCode, 429);
      return true;
    }
  );
});
