/**
 * Request body size limits and error-message hygiene (Phase 6C.5).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { POST as reviewsPost, DELETE as reviewsDelete } from "../app/api/reviews/route.js";
import { POST as restorePost } from "../app/api/reviews/restore/route.js";
import { POST as moderatePost } from "../app/api/reviews/moderate/route.js";
import { adminAuth, adminAppCheck } from "../lib/firebase/admin.js";
import { readJsonObject, MAX_BODY_BYTES } from "../lib/server/http.js";

function realRequest(url, body, headers = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer t", ...headers },
    body,
  });
}

function mockStudent(t) {
  t.mock.method(adminAuth, "verifyIdToken", async () => ({
    uid: "u1",
    email: "s@vitapstudent.ac.in",
    email_verified: true,
    moderator: true,
  }));
}

const big = JSON.stringify({
  campusSlug: "vit-ap",
  facultyId: "f",
  pad: "x".repeat(MAX_BODY_BYTES + 10),
});

test("readJsonObject - parses a normal body, returns null for malformed/array/primitive", async () => {
  assert.deepEqual(await readJsonObject(realRequest("http://x/", '{"a":1}')), { a: 1 });
  assert.equal(await readJsonObject(realRequest("http://x/", "{nope")), null);
  assert.equal(await readJsonObject(realRequest("http://x/", "[1]")), null);
  assert.equal(await readJsonObject(realRequest("http://x/", "5")), null);
});

test("readJsonObject - rejects oversized bodies (declared and streamed)", async () => {
  await assert.rejects(() => readJsonObject(realRequest("http://x/", big)), {
    code: "PAYLOAD_TOO_LARGE",
  });
  const stream = new ReadableStream({
    start(c) {
      c.enqueue(new TextEncoder().encode(big));
      c.close();
    },
  });
  const req = new Request("http://x/", { method: "POST", body: stream, duplex: "half" });
  await assert.rejects(() => readJsonObject(req), { code: "PAYLOAD_TOO_LARGE" });
});

for (const [name, handler] of [
  ["POST /api/reviews", reviewsPost],
  ["POST /api/reviews/restore", restorePost],
  ["POST /api/reviews/moderate", moderatePost],
]) {
  test(`${name} - oversized body returns 413 after authentication`, async (t) => {
    mockStudent(t);
    const res = await handler(realRequest("http://localhost/api/reviews", big));
    assert.equal(res.status, 413);
    assert.equal((await res.json()).code, "PAYLOAD_TOO_LARGE");
  });
}

test("DELETE /api/reviews - oversized body returns 413", async (t) => {
  mockStudent(t);
  const res = await reviewsDelete(
    new Request("http://localhost/api/reviews", {
      method: "DELETE",
      headers: { authorization: "Bearer t" },
      body: big,
    })
  );
  assert.equal(res.status, 413);
});

test("oversized body without credentials is rejected as unauthenticated first", async () => {
  const res = await reviewsPost(
    new Request("http://localhost/api/reviews", { method: "POST", body: big })
  );
  assert.equal(res.status, 401);
});

test("auth failures do not echo Admin SDK error details", async (t) => {
  t.mock.method(adminAuth, "verifyIdToken", async () => {
    throw Object.assign(new Error("Decoding Firebase ID token failed: secret-detail"), {
      code: "auth/argument-error",
    });
  });
  const res = await reviewsPost(realRequest("http://localhost/api/reviews", "{}"));
  assert.equal(res.status, 401);
  assert.ok(!JSON.stringify(await res.json()).includes("secret-detail"));
});

test("App Check failures do not echo Admin SDK error details", async (t) => {
  mockStudent(t);
  t.mock.method(adminAppCheck, "verifyToken", async () => {
    throw new Error("internal appcheck detail");
  });
  const res = await reviewsPost(
    realRequest("http://localhost/api/reviews", "{}", { "x-firebase-appcheck": "bad" })
  );
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.equal(body.code, "APP_CHECK_INVALID");
  assert.ok(!JSON.stringify(body).includes("internal appcheck detail"));
});
