/**
 * API hardening regression tests (audit F-03, F-24).
 *
 * - Invalid client input must produce 4xx responses, never a generic 500.
 * - Unexpected server errors must be logged server-side but must NOT leak internal
 *   messages (e.g. Firestore path errors) to the client.
 *
 * Unit tests only: Admin SDK token verification and the transaction coordinator are
 * mocked where a database would otherwise be needed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { POST as restorePost } from "../app/api/reviews/restore/route.js";
import { POST as moderatePost } from "../app/api/reviews/moderate/route.js";
import { adminAuth } from "../lib/firebase/admin.js";
import { ReviewsTransactionCoordinator } from "../lib/server/reviews-transaction.js";
import { handleApiError } from "../lib/server/http.js";
import { isSafeDocumentId } from "../lib/server/validation.js";
import { ConcurrencyConflictError } from "../lib/server/concurrency.js";
import { RateLimitExceededError } from "../lib/server/rate-limit.js";

function makeRequest({ headers = {}, body, rawJson } = {}) {
  const headerMap = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    method: "POST",
    url: "http://localhost:3000/api/reviews/moderate",
    headers: { get: (h) => headerMap.get(h.toLowerCase()) || null },
    json: async () => {
      if (rawJson !== undefined) return rawJson;
      return body ?? {};
    },
  };
}

function mockModerator(t) {
  t.mock.method(adminAuth, "verifyIdToken", async () => ({
    uid: "mod-uid",
    email: "moderator@vitor.org",
    email_verified: true,
    moderator: true,
  }));
}

function mockStudent(t) {
  t.mock.method(adminAuth, "verifyIdToken", async () => ({
    uid: "student-uid",
    email: "student@vitapstudent.ac.in",
    email_verified: true,
  }));
}

const AUTH = { authorization: "Bearer token" };
const validModerationBody = {
  campusSlug: "vit-ap",
  facultyId: "fac-1",
  targetUserId: "target-user",
  action: "HIDDEN",
};

async function postModerate(t, bodyOverrides, { headers = {}, rawJson } = {}) {
  mockModerator(t);
  const req = makeRequest({
    headers: { ...AUTH, ...headers },
    body: bodyOverrides === null ? undefined : { ...validModerationBody, ...bodyOverrides },
    rawJson,
  });
  const res = await moderatePost(req);
  return { res, data: await res.json() };
}

// ─────────────────────────────────────────────────────────────────────────────
// isSafeDocumentId
// ─────────────────────────────────────────────────────────────────────────────

test("isSafeDocumentId - accepts normal IDs and rejects path-breaking ones", () => {
  for (const ok of ["fac-1", "abc123", "Dr. Smith 1", "a_b-c"]) {
    assert.equal(isSafeDocumentId(ok), true, ok);
  }
  for (const bad of ["a/b", "", ".", "..", "__name__", "x".repeat(257), null, undefined, 42, {}, ["a"]]) {
    assert.equal(isSafeDocumentId(bad), false, String(bad));
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// handleApiError
// ─────────────────────────────────────────────────────────────────────────────

test("handleApiError - unexpected errors return a generic 500 and are logged server-side", async (t) => {
  const logged = [];
  t.mock.method(console, "error", (...args) => logged.push(args));

  const secret = 'Value for argument "documentPath" must point to a document, but was "a/b".';
  const res = handleApiError(new Error(secret));
  const data = await res.json();

  assert.equal(res.status, 500);
  assert.equal(data.code, "INTERNAL_SERVER_ERROR");
  assert.ok(!JSON.stringify(data).includes("documentPath"), "internal message must not reach the client");
  assert.equal(logged.length, 1, "full detail must be logged server-side");
  assert.ok(logged[0].some((a) => a instanceof Error && a.message === secret));
});

test("handleApiError - expected errors keep their status, code, and safe message", async () => {
  const conflict = handleApiError(new ConcurrencyConflictError("version moved", 7));
  assert.equal(conflict.status, 409);
  const conflictBody = await conflict.json();
  assert.equal(conflictBody.code, "VERSION_CONFLICT");
  assert.equal(conflictBody.currentVersion, 7);

  const limited = handleApiError(new RateLimitExceededError("slow down", 90));
  assert.equal(limited.status, 429);
  assert.equal(limited.headers.get("Retry-After"), "90");
  assert.equal((await limited.json()).retryAfter, 90);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/reviews/moderate input validation (F-03 / F-24)
// ─────────────────────────────────────────────────────────────────────────────

test("moderate route - non-object JSON bodies are a 400, not a 500", async (t) => {
  for (const rawJson of [null, [1, 2], "text", 5]) {
    const { res, data } = await postModerate(t, null, { rawJson });
    assert.equal(res.status, 400, `body ${JSON.stringify(rawJson)}`);
    assert.ok(["INVALID_CAMPUS", "MISSING_PARAMETERS"].includes(data.code));
  }
});

test("moderate route - non-string / path-breaking identifiers are a 400", async (t) => {
  for (const override of [
    { targetUserId: 12345 },
    { targetUserId: { $ne: "x" } },
    { targetUserId: "a/b" },
    { facultyId: "a/b" },
    { facultyId: [] },
    { action: { x: 1 } },
  ]) {
    const { res, data } = await postModerate(t, override);
    assert.equal(res.status, 400, JSON.stringify(override));
    assert.equal(data.code === "INVALID_PARAMETERS" || data.code === "MISSING_PARAMETERS", true, data.code);
  }
});

test("moderate route - reason must be a bounded string", async (t) => {
  let r = await postModerate(t, { reason: "x".repeat(501) });
  assert.equal(r.res.status, 400);
  assert.equal(r.data.code, "INVALID_PARAMETERS");

  r = await postModerate(t, { reason: { not: "a string" } });
  assert.equal(r.res.status, 400);
});

test("moderate route - unknown action is a 400 VALIDATION_ERROR (was a 500)", async (t) => {
  const { res, data } = await postModerate(t, { action: "NOPE" });
  assert.equal(res.status, 400);
  assert.equal(data.code, "VALIDATION_ERROR");
});

test("moderate route - invalid Idempotency-Key is a 400 VALIDATION_ERROR (was a 500)", async (t) => {
  for (const key of ["a/b", "k".repeat(129), "has space"]) {
    const { res, data } = await postModerate(t, {}, { headers: { "idempotency-key": key } });
    assert.equal(res.status, 400, key);
    assert.equal(data.code, "VALIDATION_ERROR");
  }
});

test("moderate route - valid request with a 500-bound failure returns a generic error and logs it", async (t) => {
  const logged = [];
  t.mock.method(console, "error", (...args) => logged.push(args));
  t.mock.method(ReviewsTransactionCoordinator, "moderateReview", async () => {
    throw new Error("Firestore internal path detail");
  });

  const { res, data } = await postModerate(t, {});
  assert.equal(res.status, 500);
  assert.equal(data.code, "INTERNAL_SERVER_ERROR");
  assert.ok(!JSON.stringify(data).includes("Firestore internal"));
  assert.equal(logged.length, 1);
});

test("moderate route - moderator privileges are still required (authorization unchanged)", async (t) => {
  mockStudent(t);
  const res = await moderatePost(makeRequest({ headers: AUTH, body: validModerationBody }));
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, "FORBIDDEN");
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/reviews/restore input validation
// ─────────────────────────────────────────────────────────────────────────────

test("restore route - null / non-object JSON body is a 400, not a 500", async (t) => {
  for (const rawJson of [null, [1], "x"]) {
    mockStudent(t);
    const res = await restorePost(makeRequest({ headers: AUTH, rawJson }));
    assert.equal(res.status, 400, JSON.stringify(rawJson));
    assert.equal((await res.json()).code, "MISSING_PARAMETERS");
  }
});

test("restore route - path-breaking facultyId is a 400 before any database access", async (t) => {
  mockStudent(t);
  const res = await restorePost(
    makeRequest({ headers: AUTH, body: { campusSlug: "vit-ap", facultyId: "a/b" } })
  );
  assert.equal(res.status, 400);
  assert.equal((await res.json()).code, "INVALID_FACULTY_ID");
});

test("restore route - cross-campus authorization is still enforced", async (t) => {
  mockStudent(t); // @vitapstudent.ac.in
  const res = await restorePost(
    makeRequest({ headers: AUTH, body: { campusSlug: "vit-b", facultyId: "fac-1" } })
  );
  assert.equal(res.status, 403);
  assert.equal((await res.json()).code, "CROSS_CAMPUS_DENIED");
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/reviews (public read model) input validation — rejects before any DB access
// ─────────────────────────────────────────────────────────────────────────────

import { GET as reviewsGet } from "../app/api/reviews/route.js";

for (const [label, query] of [
  ["missing campusSlug", "facultyId=fac-1"],
  ["unknown campusSlug", "campusSlug=not-a-campus&facultyId=fac-1"],
  ["missing facultyId", "campusSlug=vit-ap"],
  ["facultyId containing a path separator", "campusSlug=vit-ap&facultyId=a%2Fb"],
  ["reserved facultyId", "campusSlug=vit-ap&facultyId=.."],
]) {
  test(`GET /api/reviews - ${label} is a 400`, async () => {
    const res = await reviewsGet({ url: `http://localhost:3000/api/reviews?${query}` });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "VALIDATION_ERROR");
  });
}

test("handleApiError - a third-party error carrying a numeric statusCode is NOT treated as client-safe", async (t) => {
  t.mock.method(console, "error", () => {});
  const sdkError = Object.assign(new Error("upstream detail: project vitor secret path"), {
    statusCode: 502,
    code: "ECONNRESET",
  });
  const res = handleApiError(sdkError);
  const data = await res.json();
  assert.equal(res.status, 500);
  assert.ok(!JSON.stringify(data).includes("upstream detail"));
});
