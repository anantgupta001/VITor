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

import { createLogger } from "../logger.js";

const log = createLogger("API");

// Expected rejections worth a warning (security/availability signals). Other expected
// statuses (400 validation, 409 conflicts, 413 oversized bodies) are normal client
// mistakes and stay silent.
const WARN_STATUSES = new Set([401, 403, 429, 503]);

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
  "PayloadTooLargeError",
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
    log.error("Unexpected error", err);
    return Response.json(
      { error: "An unexpected error occurred.", code: "INTERNAL_SERVER_ERROR" },
      { status: 500 }
    );
  }

  if (WARN_STATUSES.has(err.statusCode)) {
    // Only the safe error code and status are logged: never the message, body or user data.
    log.warn("Request rejected", { code: err.code || "REQUEST_FAILED", status: err.statusCode });
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
 * Maximum accepted JSON request body. The largest legitimate payload is a review
 * (comment <= 1000 chars + a few small fields), so 16 KiB is generous.
 */
export const MAX_BODY_BYTES = 16 * 1024;

export class PayloadTooLargeError extends Error {
  constructor(message = "Request body is too large.") {
    super(message);
    this.name = "PayloadTooLargeError";
    this.statusCode = 413;
    this.code = "PAYLOAD_TOO_LARGE";
  }
}

/**
 * Reads the request body as text, refusing to buffer more than `maxBytes`.
 * Checks Content-Length first, then enforces the cap while streaming so chunked
 * bodies without a Content-Length cannot bypass it.
 */
async function readBoundedText(req, maxBytes) {
  const declared = Number(req.headers?.get?.("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new PayloadTooLargeError();
  }

  if (req.body && typeof req.body.getReader === "function") {
    const reader = req.body.getReader();
    const chunks = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new PayloadTooLargeError();
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  }

  if (typeof req.text === "function") {
    const text = await req.text();
    if (Buffer.byteLength(text, "utf8") > maxBytes) throw new PayloadTooLargeError();
    return text;
  }

  return null;
}

/**
 * Parses a JSON request body that must be a plain object.
 * Returns null when the body is missing, malformed, or not an object.
 * Throws PayloadTooLargeError (HTTP 413) when the body exceeds `maxBytes`.
 */
export async function readJsonObject(req, maxBytes = MAX_BODY_BYTES) {
  let body;
  try {
    const text = await readBoundedText(req, maxBytes);
    body = text === null ? await req.json() : JSON.parse(text);
  } catch (err) {
    if (err instanceof PayloadTooLargeError) throw err;
    return null;
  }
  return body && typeof body === "object" && !Array.isArray(body) ? body : null;
}
