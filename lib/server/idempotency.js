/**
 * Idempotency & Durable Request Receipts for VITor.
 *
 * Implements:
 * - Recursive canonical JSON serialization.
 * - Deterministic SHA-256 payload hashing.
 * - Idempotency key checking and receipt coordination within Firestore transactions.
 * - Distinction between idempotent replays (safe return) and payload collisions (409 conflict).
 * - Documented retention policy (30-day default TTL).
 */

import crypto from "crypto";
import { Timestamp } from "../firebase/admin.js";

export const RECEIPT_RETENTION_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export class IdempotencyConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = "IdempotencyConflictError";
    this.statusCode = 409;
    this.code = "IDEMPOTENCY_CONFLICT";
  }
}

/**
 * Deterministically serializes any JSON-compatible value by recursively sorting object keys.
 */
export function canonicalize(val) {
  if (val === null || typeof val !== "object") {
    return JSON.stringify(val);
  }
  if (Array.isArray(val)) {
    return "[" + val.map(canonicalize).join(",") + "]";
  }
  const sortedKeys = Object.keys(val).sort();
  const pairs = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalize(val[k])}`);
  return "{" + pairs.join(",") + "}";
}

/**
 * Computes deterministic SHA-256 hex digest for a request payload.
 */
export function computePayloadHash(payload) {
  const canonicalString = canonicalize(payload);
  return crypto.createHash("sha256").update(canonicalString, "utf8").digest("hex");
}

/**
 * Generates or validates an idempotency key.
 */
export function validateIdempotencyKey(key) {
  if (!key || typeof key !== "string" || key.trim().length === 0) {
    throw new Error("Idempotency key must be a non-empty string.");
  }
  if (key.length > 128) {
    throw new Error("Idempotency key exceeds maximum length of 128 characters.");
  }
  return key.trim();
}

/**
 * Evaluates an existing receipt snapshot inside a transaction.
 * Returns { isReplay: true, receipt } if matching payload hash.
 * Throws IdempotencyConflictError if key matches but payload hash differs.
 * Returns { isReplay: false } if no receipt exists.
 */
export function evaluateReceipt(receiptSnap, payloadHash) {
  if (!receiptSnap || !receiptSnap.exists) {
    return { isReplay: false };
  }

  const receiptData = receiptSnap.data();
  if (receiptData.payloadHash !== payloadHash) {
    throw new IdempotencyConflictError(
      "Idempotency key collision: This key was already used with a different request payload."
    );
  }

  return {
    isReplay: true,
    statusCode: receiptData.statusCode || 200,
    responseBody: receiptData.responseBody || {},
  };
}

/**
 * Builds the receipt document payload for storage inside transaction writes.
 */
export function buildReceiptPayload({
  idempotencyKey,
  userId,
  action,
  payloadHash,
  statusCode,
  responseBody,
}) {
  const now = Date.now();
  return {
    idempotencyKey,
    userId,
    action,
    payloadHash,
    statusCode,
    responseBody,
    createdAt: Timestamp.fromMillis(now),
    expiresAt: Timestamp.fromMillis(now + RECEIPT_RETENTION_MS),
  };
}
