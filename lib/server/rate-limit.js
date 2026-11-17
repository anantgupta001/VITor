/**
 * Firestore-Native Rolling-Window Rate Limiting for VITor.
 *
 * Implements:
 * - Rolling 24-hour window quota (configurable, default 5 submissions).
 * - Applies strictly to new review submissions (edits, moderation, restores do not consume quota).
 * - Atomic execution inside Firestore transactions.
 * - Accurate retryAfter calculation in seconds.
 * - Zero external dependencies (no Redis / Memcached).
 */

import { Timestamp } from "../firebase/admin.js";

export const DEFAULT_RATE_LIMIT_CONFIG = {
  maxSubmissions: 5,
  windowMs: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
};

export class RateLimitExceededError extends Error {
  constructor(message, retryAfterSeconds) {
    super(message);
    this.name = "RateLimitExceededError";
    this.statusCode = 429;
    this.code = "RATE_LIMIT_EXCEEDED";
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * Checks and updates review submission quota inside a Firestore transaction.
 *
 * @param {object} quotaSnap - DocumentSnapshot of campuses/{campusSlug}/users/{userId}/rateLimits/reviewQuota
 * @param {number} currentTimeMs - Current timestamp in ms (deterministic across retries)
 * @param {object} config - Rate limit configuration { maxSubmissions, windowMs }
 * @returns {object} { allowed: true, newTimestamps, quotaPayload }
 * @throws {RateLimitExceededError} if quota is exceeded
 */
export function evaluateAndConsumeSubmissionQuota(
  quotaSnap,
  currentTimeMs = Date.now(),
  config = DEFAULT_RATE_LIMIT_CONFIG
) {
  const windowMs = config.windowMs || DEFAULT_RATE_LIMIT_CONFIG.windowMs;
  const maxSubmissions = config.maxSubmissions || DEFAULT_RATE_LIMIT_CONFIG.maxSubmissions;

  const existingData = quotaSnap && quotaSnap.exists ? quotaSnap.data() : null;
  const existingTimestamps = Array.isArray(existingData?.timestamps)
    ? existingData.timestamps
    : [];

  // Filter timestamps within the rolling window
  const validTimestamps = existingTimestamps.filter(
    (ts) => typeof ts === "number" && currentTimeMs - ts < windowMs
  );

  if (validTimestamps.length >= maxSubmissions) {
    // Oldest timestamp in window dictates when a slot opens up
    const oldest = validTimestamps[0];
    const msUntilExpiry = windowMs - (currentTimeMs - oldest);
    const retryAfterSeconds = Math.max(1, Math.ceil(msUntilExpiry / 1000));

    throw new RateLimitExceededError(
      `Submission rate limit reached: Maximum ${maxSubmissions} reviews per 24 hours. Try again in ${retryAfterSeconds} seconds.`,
      retryAfterSeconds
    );
  }

  const updatedTimestamps = [...validTimestamps, currentTimeMs];

  return {
    allowed: true,
    timestamps: updatedTimestamps,
    quotaPayload: {
      timestamps: updatedTimestamps,
      count: updatedTimestamps.length,
      updatedAt: Timestamp.fromMillis(currentTimeMs),
    },
  };
}
