/**
 * Lightweight application logger (client + server). No dependencies.
 *
 * - Levels: error, warn (always on) and debug (development only).
 * - Output is "[Scope] message" followed by the details you pass.
 * - console methods are resolved at call time, so test spies and runtime
 *   replacements always take effect.
 * - Error instances and primitives are passed through untouched (stack traces
 *   stay intact). Plain-object context is shallow-copied and any field whose
 *   name looks sensitive (token, password, secret, credential, authorization,
 *   cookie, key, email) is replaced with "[redacted]".
 *
 * Usage:
 *   const log = createLogger("API");
 *   log.error("Unexpected error", err);
 *   log.warn("Request rejected", { code: "TOKEN_EXPIRED", status: 401 });
 *   log.debug("cache hit", { campusSlug });
 */

const SENSITIVE_KEY = /token|password|passwd|secret|credential|authorization|cookie|key|email/i;
const REDACTED = "[redacted]";

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/** Returns a shallow copy of `context` with sensitive-looking fields redacted. */
export function sanitizeContext(context) {
  const safe = {};
  for (const [name, value] of Object.entries(context)) {
    safe[name] = SENSITIVE_KEY.test(name) ? REDACTED : value;
  }
  return safe;
}

function sanitizeDetail(detail) {
  return isPlainObject(detail) ? sanitizeContext(detail) : detail;
}

function isDebugEnabled() {
  return process.env.NODE_ENV !== "production";
}

function emit(method, scope, message, details) {
  const prefix = scope ? `[${scope}] ${message}` : String(message);
  // Resolved here (not at import) so spies/mocks installed later are honoured.
  console[method](prefix, ...details.map(sanitizeDetail));
}

export function createLogger(scope) {
  return {
    error: (message, ...details) => emit("error", scope, message, details),
    warn: (message, ...details) => emit("warn", scope, message, details),
    debug: (message, ...details) => {
      if (isDebugEnabled()) emit("debug", scope, message, details);
    },
  };
}
