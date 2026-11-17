/**
 * Optimistic Concurrency Control for VITor Reviews.
 *
 * Implements:
 * - Version verification against client-supplied `expectedVersion`.
 * - Conflict rejection with 409 when version mismatch occurs.
 * - Meaningful change detection (prevents spurious version bumps and aggregate writes on no-ops).
 */

export class ConcurrencyConflictError extends Error {
  constructor(message, currentVersion) {
    super(message);
    this.name = "ConcurrencyConflictError";
    this.statusCode = 409;
    this.code = "VERSION_CONFLICT";
    this.currentVersion = currentVersion;
  }
}

/**
 * Checks optimistic concurrency version.
 *
 * @param {object|null} currentReview - Existing review data or null if creating new
 * @param {number|undefined} expectedVersion - Version sent by the client
 */
export function checkOptimisticConcurrency(currentReview, expectedVersion) {
  if (!currentReview) {
    // If review doesn't exist yet, expectedVersion should either be undefined or 0
    if (expectedVersion !== undefined && expectedVersion !== 0 && expectedVersion !== null) {
      throw new ConcurrencyConflictError(
        `Review does not exist, but expectedVersion ${expectedVersion} was specified.`,
        0
      );
    }
    return;
  }

  const currentVersion = currentReview.version ?? 1;

  if (expectedVersion !== undefined && expectedVersion !== null) {
    if (Number(expectedVersion) !== Number(currentVersion)) {
      throw new ConcurrencyConflictError(
        `Review has been modified by another request. Current version is ${currentVersion}, expected ${expectedVersion}.`,
        currentVersion
      );
    }
  }
}

/**
 * Checks whether an update is a true no-op.
 */
export function isReviewNoOp(currentReview, { ratings, comment, status }) {
  if (!currentReview) return false;

  const currentComment = (currentReview.comment || currentReview.text || "").trim();
  const newComment = (comment || "").trim();
  if (currentComment !== newComment) return false;

  if (status && currentReview.status && currentReview.status !== status) {
    return false;
  }

  const currentRatings = currentReview.ratings || currentReview;
  if (
    Number(currentRatings.attendance) !== Number(ratings.attendance) ||
    Number(currentRatings.correction) !== Number(ratings.correction) ||
    Number(currentRatings.teaching) !== Number(ratings.teaching) ||
    Number(currentRatings.approachability) !== Number(ratings.approachability)
  ) {
    return false;
  }

  return true;
}
