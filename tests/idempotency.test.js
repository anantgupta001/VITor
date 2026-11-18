import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalize,
  computePayloadHash,
  validateIdempotencyKey,
  evaluateReceipt,
  buildReceiptPayload,
  RECEIPT_RETENTION_MS,
  IdempotencyConflictError,
} from "../lib/server/idempotency.js";

test("Idempotency - canonicalize sorts keys recursively and preserves primitive values", () => {
  const objA = { z: 1, a: 2, m: { b: 3, a: 4 } };
  const objB = { a: 2, m: { a: 4, b: 3 }, z: 1 };

  assert.equal(canonicalize(objA), canonicalize(objB));
  assert.equal(canonicalize(objA), '{"a":2,"m":{"a":4,"b":3},"z":1}');

  // Arrays preserve order
  assert.equal(canonicalize([3, 1, 2]), "[3,1,2]");
  assert.notEqual(canonicalize([1, 2]), canonicalize([2, 1]));
});

test("Idempotency - computePayloadHash returns identical sha256 for key-permuted payloads", () => {
  const payload1 = {
    campusSlug: "vit-ap",
    facultyId: "fac-101",
    ratings: { attendance: 4, correction: 4, teaching: 5, approachability: 4 },
  };
  const payload2 = {
    ratings: { approachability: 4, teaching: 5, correction: 4, attendance: 4 },
    facultyId: "fac-101",
    campusSlug: "vit-ap",
  };

  const hash1 = computePayloadHash(payload1);
  const hash2 = computePayloadHash(payload2);

  assert.equal(hash1, hash2);
  assert.equal(typeof hash1, "string");
  assert.equal(hash1.length, 64); // SHA-256 hex length
});

test("Idempotency - computePayloadHash returns different hash for different payloads", () => {
  const hashA = computePayloadHash({ comment: "Good professor" });
  const hashB = computePayloadHash({ comment: "Great professor" });
  assert.notEqual(hashA, hashB);
});

test("Idempotency - validateIdempotencyKey checks length and validity", () => {
  assert.equal(validateIdempotencyKey("uuid-12345"), "uuid-12345");
  assert.equal(validateIdempotencyKey("  trimmed-key  "), "trimmed-key");

  assert.throws(() => validateIdempotencyKey(""), /non-empty string/);
  assert.throws(() => validateIdempotencyKey("   "), /non-empty string/);
  assert.throws(() => validateIdempotencyKey(null), /non-empty string/);
  assert.throws(() => validateIdempotencyKey("a".repeat(129)), /maximum length/);
});

test("Idempotency - evaluateReceipt returns isReplay=false for non-existent receipts", () => {
  const missingSnap = { exists: false };
  const result = evaluateReceipt(missingSnap, "hash-123");
  assert.equal(result.isReplay, false);
});

test("Idempotency - evaluateReceipt returns cached response when payload hash matches", () => {
  const snap = {
    exists: true,
    data: () => ({
      payloadHash: "hash-matched-abc",
      statusCode: 201,
      responseBody: { success: true, overall: 4.5 },
    }),
  };

  const result = evaluateReceipt(snap, "hash-matched-abc");
  assert.equal(result.isReplay, true);
  assert.equal(result.statusCode, 201);
  assert.deepEqual(result.responseBody, { success: true, overall: 4.5 });
});

test("Idempotency - evaluateReceipt throws 409 conflict when payload hash mismatches", () => {
  const snap = {
    exists: true,
    data: () => ({
      payloadHash: "hash-original-111",
      statusCode: 200,
      responseBody: { success: true },
    }),
  };

  assert.throws(
    () => evaluateReceipt(snap, "hash-different-222"),
    (err) => {
      assert.ok(err instanceof IdempotencyConflictError);
      assert.equal(err.statusCode, 409);
      assert.match(err.message, /Idempotency key collision/);
      return true;
    }
  );
});

test("Idempotency - buildReceiptPayload sets 30-day retention expiration", () => {
  const receipt = buildReceiptPayload({
    idempotencyKey: "test-key-99",
    userId: "user-42",
    action: "SUBMIT_REVIEW",
    payloadHash: "hash-xyz",
    statusCode: 201,
    responseBody: { success: true },
  });

  assert.equal(receipt.idempotencyKey, "test-key-99");
  assert.equal(receipt.userId, "user-42");
  assert.equal(receipt.statusCode, 201);
  assert.ok(receipt.createdAt);
  assert.ok(receipt.expiresAt);

  const createdMs = receipt.createdAt.toMillis();
  const expiresMs = receipt.expiresAt.toMillis();
  assert.equal(expiresMs - createdMs, RECEIPT_RETENTION_MS);
  assert.equal(RECEIPT_RETENTION_MS, 30 * 24 * 60 * 60 * 1000);
});
