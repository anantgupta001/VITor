/**
 * Shared HTTP helpers for the review API routes.
 *
 * Error contract:
 * - Errors that carry an integer `statusCode` (ValidationError, AuthError,
 *   RateLimitExceededError, MaintenanceError, ConcurrencyConflictError,
 *   IdempotencyConflictError) are deliberate, client-safe responses.
 * - Anything else is an unexpected failure: it is logged server-side with full
 *   detail, and the client only receives a generic 500 (no internal messages such
 *   as Firestore path errors).
 */

export function extractIdempotencyKey(req) {
  return (
    req.headers.get("idempotency-key") ||
    req.headers.get("x-idempotency-key") ||
    null
  );
}

// Only errors raised deliberately by our own server code are client-safe. Matching on
// class name (not merely on a `statusCode` property) ensures a third-party/SDK error
// that happens to carry a numeric `statusCode` can never echo its message to clients.
const CLIENT_SAFE_ERROR_NAMES = new Set([
  "ValidationError",
  "AuthError",
  "RateLimitExceededError",
  "MaintenanceError",
  "ConcurrencyConflictError",
  "IdempotencyConflictError",
]);

export function handleApiError(err) {
  const isExpected =
    CLIENT_SAFE_ERROR_NAMES.has(err?.name) && Number.isInteger(err?.statusCode);

  if (!isExpected) {
    console.error("[API] Unexpected error:", err);
    return Response.json(
      { error: "An unexpected error occurred.", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 }
    );
  }

  const payload = {
    error: err.message || "Request failed.",
    code: err.code || "REQUEST_FAILED",
  };

  if (err.currentVersion !== undefined) {
    payload.currentVersion = err.currentVersion;
  }

  const headers = {};
  if (err.retryAfterSeconds) {
    headers["Retry-After"] = String(err.retryAfterSeconds);
    payload.retryAfter = err.retryAfterSeconds;
  }

  return Response.json(payload, { status: err.statusCode, headers });
}

/**
 * Parses a JSON request body that must be a plain object.
 * Returns null when the body is missing, malformed, or not an object.
 */
export async function readJsonObject(req) {
  try {
    const body = await req.json();
    return body && typeof body === "object" && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}
