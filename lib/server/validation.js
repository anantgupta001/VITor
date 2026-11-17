/**
 * Input Schema & Request Validation for VITor Review APIs.
 */

export const MIN_COMMENT_LENGTH = 10;
export const MAX_COMMENT_LENGTH = 1000;
export const METRIC_KEYS = ["attendance", "correction", "teaching", "approachability"];

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
    this.code = "VALIDATION_ERROR";
  }
}

/**
 * Returns true when `value` can be safely used as a single Firestore document ID
 * segment. Client-supplied IDs that contain '/' or are reserved ('.', '..',
 * '__name__') make Firestore throw a path error, which would otherwise surface as
 * an HTTP 500 instead of a 400.
 */
export function isSafeDocumentId(value) {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    !value.includes("/") &&
    value !== "." &&
    value !== ".." &&
    !/^__.*__$/.test(value)
  );
}

/**
 * Validates ratings object.
 */
export function validateRatings(ratings) {
  if (!ratings || typeof ratings !== "object") {
    throw new ValidationError("Ratings must be an object with attendance, correction, teaching, and approachability.");
  }

  for (const key of METRIC_KEYS) {
    const val = ratings[key];
    if (typeof val !== "number" || isNaN(val) || val < 1 || val > 5) {
      throw new ValidationError(`Rating '${key}' must be a number between 1 and 5.`);
    }
  }

  return {
    attendance: ratings.attendance,
    correction: ratings.correction,
    teaching: ratings.teaching,
    approachability: ratings.approachability,
  };
}

/**
 * Validates review comment text.
 */
export function validateComment(comment) {
  if (typeof comment !== "string") {
    throw new ValidationError("Comment must be a text string.");
  }

  const trimmed = comment.trim();
  if (trimmed.length < MIN_COMMENT_LENGTH) {
    throw new ValidationError(`Experience comment must be at least ${MIN_COMMENT_LENGTH} characters.`);
  }
  if (trimmed.length > MAX_COMMENT_LENGTH) {
    throw new ValidationError(`Experience comment must not exceed ${MAX_COMMENT_LENGTH} characters.`);
  }

  return trimmed;
}

/**
 * Full review submission payload validation.
 */
export function validateReviewSubmissionPayload(body) {
  if (!body || typeof body !== "object") {
    throw new ValidationError("Request body is missing or not JSON.");
  }

  const { campusSlug, facultyId, ratings, comment, expectedVersion } = body;

  if (!campusSlug || typeof campusSlug !== "string" || !campusSlug.trim()) {
    throw new ValidationError("Valid 'campusSlug' is required.");
  }

  if (!facultyId || typeof facultyId !== "string" || !facultyId.trim()) {
    throw new ValidationError("Valid 'facultyId' is required.");
  }

  const validatedRatings = validateRatings(ratings);
  const validatedComment = validateComment(comment);

  let validatedVersion = undefined;
  if (expectedVersion !== undefined && expectedVersion !== null) {
    if (typeof expectedVersion !== "number" || isNaN(expectedVersion) || expectedVersion < 0) {
      throw new ValidationError("'expectedVersion' must be a non-negative number.");
    }
    validatedVersion = expectedVersion;
  }

  return {
    campusSlug: campusSlug.trim(),
    facultyId: facultyId.trim(),
    ratings: validatedRatings,
    comment: validatedComment,
    expectedVersion: validatedVersion,
  };
}
