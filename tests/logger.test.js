/**
 * Central logger + API error logging levels.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { createLogger, sanitizeContext } from "../lib/logger.js";
import { handleApiError, PayloadTooLargeError } from "../lib/server/http.js";
import { ValidationError } from "../lib/server/validation.js";
import { AuthError } from "../lib/server/campus-auth.js";
import { ConcurrencyConflictError } from "../lib/server/concurrency.js";
import { RateLimitExceededError } from "../lib/server/rate-limit.js";
import { MaintenanceError } from "../lib/server/maintenance.js";

function spyConsole(t) {
  const calls = { error: [], warn: [], debug: [] };
  for (const level of Object.keys(calls)) {
    t.mock.method(console, level, (...args) => calls[level].push(args));
  }
  return calls;
}

test("logger - prefixes the scope and keeps Error instances untouched", (t) => {
  const calls = spyConsole(t);
  const err = new Error("boom");

  createLogger("Scope").error("Something failed", err);

  assert.equal(calls.error.length, 1);
  assert.equal(calls.error[0][0], "[Scope] Something failed");
  assert.equal(calls.error[0][1], err);
});

test("logger - warn is emitted in every environment", (t) => {
  const calls = spyConsole(t);
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    createLogger("S").warn("careful");
    createLogger("S").error("bad");
  } finally {
    process.env.NODE_ENV = previous;
  }
  assert.equal(calls.warn.length, 1);
  assert.equal(calls.error.length, 1);
});

test("logger - debug is development-only", (t) => {
  const calls = spyConsole(t);
  const previous = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    createLogger("S").debug("hidden");
    assert.equal(calls.debug.length, 0);

    process.env.NODE_ENV = "development";
    createLogger("S").debug("shown");
    assert.equal(calls.debug.length, 1);
    assert.equal(calls.debug[0][0], "[S] shown");
  } finally {
    process.env.NODE_ENV = previous;
  }
});

test("logger - resolves console methods at call time", (t) => {
  const log = createLogger("S"); // created BEFORE the spy is installed
  const calls = spyConsole(t);
  log.error("late");
  assert.equal(calls.error.length, 1);
});

test("logger - redacts sensitive context fields", () => {
  const safe = sanitizeContext({
    code: "TOKEN_EXPIRED",
    status: 401,
    idToken: "abc",
    Authorization: "Bearer abc",
    password: "pw",
    userEmail: "a@b.c",
    apiKey: "k",
  });
  assert.deepEqual(safe, {
    code: "TOKEN_EXPIRED",
    status: 401,
    idToken: "[redacted]",
    Authorization: "[redacted]",
    password: "[redacted]",
    userEmail: "[redacted]",
    apiKey: "[redacted]",
  });
});

test("logger - sanitizes plain-object details when logging", (t) => {
  const calls = spyConsole(t);
  createLogger("S").warn("ctx", { code: "X", token: "secret" });
  assert.deepEqual(calls.warn[0][1], { code: "X", token: "[redacted]" });
});

// ── handleApiError levels ────────────────────────────────────────────────────

test("handleApiError - unexpected errors log exactly one console.error with the Error", async (t) => {
  const calls = spyConsole(t);
  const err = new Error("internal detail");
  const res = handleApiError(err);

  assert.equal(res.status, 500);
  assert.equal(calls.error.length, 1);
  assert.ok(calls.error[0].includes(err));
  assert.equal(calls.warn.length, 0);
});

test("handleApiError - 401/403/429/503 warn with only code and status", async (t) => {
  const cases = [
    [new AuthError("Token expired for someone@example.com", 401, "TOKEN_EXPIRED"), 401, "TOKEN_EXPIRED"],
    [new AuthError("Cross-campus denied", 403, "CROSS_CAMPUS_DENIED"), 403, "CROSS_CAMPUS_DENIED"],
    [new RateLimitExceededError("slow down", 90), 429, "RATE_LIMIT_EXCEEDED"],
    [new MaintenanceError("paused"), 503, "SERVICE_MAINTENANCE"],
  ];

  for (const [err, status, code] of cases) {
    const calls = spyConsole(t);
    const res = handleApiError(err);

    assert.equal(res.status, status);
    assert.equal(calls.error.length, 0);
    assert.equal(calls.warn.length, 1, `status ${status} should warn once`);
    assert.deepEqual(calls.warn[0][1], { code, status });
    assert.ok(!JSON.stringify(calls.warn[0]).includes("someone@example.com"));
    t.mock.restoreAll();
  }
});

test("handleApiError - 400/409/413 stay silent", async (t) => {
  const calls = spyConsole(t);
  const errors = [new ValidationError("bad"), new ConcurrencyConflictError("moved", 3), new PayloadTooLargeError()];

  for (const err of errors) handleApiError(err);

  assert.equal(calls.error.length, 0);
  assert.equal(calls.warn.length, 0);
});
