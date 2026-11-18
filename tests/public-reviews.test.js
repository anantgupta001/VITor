import test from "node:test";
import assert from "node:assert/strict";
import {
  clampPageSize,
  encodeCursor,
  decodeCursor,
  getCursorKey,
  isPubliclyVisible,
  opaqueReviewId,
  toPublicReview,
  listPublicReviews,
  DEFAULT_PAGE_SIZE,
  MIN_PAGE_SIZE,
  MAX_PAGE_SIZE,
  MIN_CURSOR_SECRET_BYTES,
  MAX_CURSOR_LENGTH,
} from "../lib/server/public-reviews.js";
import { ValidationError } from "../lib/server/validation.js";
import { adminDb } from "../lib/firebase/admin.js";

const VALID_STRONG_SECRET = "vitor_test_strong_cursor_secret_key_at_least_32_bytes_2026_test_ok";

// ─────────────────────────────────────────────────────────────────────────────
// 1. clampPageSize
// ─────────────────────────────────────────────────────────────────────────────

test("clampPageSize - returns DEFAULT_PAGE_SIZE for missing or non-numeric inputs", () => {
  assert.equal(clampPageSize(undefined), DEFAULT_PAGE_SIZE);
  assert.equal(clampPageSize(null), DEFAULT_PAGE_SIZE);
  assert.equal(clampPageSize(""), DEFAULT_PAGE_SIZE);
  assert.equal(clampPageSize("abc"), DEFAULT_PAGE_SIZE);
  assert.equal(clampPageSize(NaN), DEFAULT_PAGE_SIZE);
});

test("clampPageSize - clamps values below MIN_PAGE_SIZE and above MAX_PAGE_SIZE", () => {
  assert.equal(clampPageSize(0), MIN_PAGE_SIZE);
  assert.equal(clampPageSize(-10), MIN_PAGE_SIZE);
  assert.equal(clampPageSize("-5"), MIN_PAGE_SIZE);
  assert.equal(clampPageSize(MAX_PAGE_SIZE + 100), MAX_PAGE_SIZE);
  assert.equal(clampPageSize("999999"), MAX_PAGE_SIZE);
  assert.equal(clampPageSize(15), 15);
  assert.equal(clampPageSize("25"), 25);
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. CURSOR_SECRET Validation & Fail-Closed Behavior
// ─────────────────────────────────────────────────────────────────────────────

test("getCursorKey - fails closed when CURSOR_SECRET is missing", () => {
  const original = process.env.CURSOR_SECRET;

  try {
    delete process.env.CURSOR_SECRET;

    assert.throws(
      () => getCursorKey(),
      (err) =>
        err instanceof Error &&
        /CURSOR_SECRET environment variable is missing/i.test(err.message)
    );
  } finally {
    if (original === undefined) {
      delete process.env.CURSOR_SECRET;
    } else {
      process.env.CURSOR_SECRET = original;
    }
  }
});

test("getCursorKey - fails closed when CURSOR_SECRET is fewer than 32 bytes", () => {
  const original = process.env.CURSOR_SECRET;
  try {
    process.env.CURSOR_SECRET = "too-short-secret-123456789012";
    assert.ok(Buffer.byteLength(process.env.CURSOR_SECRET, "utf8") < MIN_CURSOR_SECRET_BYTES);
    assert.throws(
      () => getCursorKey(),
      (err) => err instanceof Error && /at least 32 bytes/i.test(err.message)
    );
  } finally {
    process.env.CURSOR_SECRET = original || VALID_STRONG_SECRET;
  }
});

test("getCursorKey - returns 32-byte key when strong secret is configured", () => {
  process.env.CURSOR_SECRET = VALID_STRONG_SECRET;
  const key = getCursorKey();
  assert.ok(Buffer.isBuffer(key));
  assert.equal(key.length, 32);
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Cursor Encoding, Decoding, and Security Validations
// ─────────────────────────────────────────────────────────────────────────────

test("encodeCursor and decodeCursor - successfully roundtrips valid cursor", () => {
  process.env.CURSOR_SECRET = VALID_STRONG_SECRET;
  const campusSlug = "vit-ap";
  const facultyId = "fac-101";
  const lastDocId = "uid-author-42";

  const cursor = encodeCursor({ campusSlug, facultyId, lastDocId });
  assert.equal(typeof cursor, "string");
  assert.ok(cursor.length > 20);
  assert.ok(!cursor.includes(lastDocId), "cursor must be opaque and not contain raw docId/UID");

  const decodedDocId = decodeCursor(cursor, campusSlug, facultyId);
  assert.equal(decodedDocId, lastDocId);
});

test("decodeCursor - rejects tampered cursor with ValidationError", () => {
  process.env.CURSOR_SECRET = VALID_STRONG_SECRET;
  const cursor = encodeCursor({ campusSlug: "vit-ap", facultyId: "fac-1", lastDocId: "doc-1" });
  // Flip a character in the middle
  const tampered =
    cursor.slice(0, 10) +
    (cursor[10] === "a" ? "b" : "a") +
    cursor.slice(11);

  assert.throws(
    () => decodeCursor(tampered, "vit-ap", "fac-1"),
    (err) => err instanceof ValidationError && err.statusCode === 400
  );
});

test("decodeCursor - rejects malformed or truncated cursors", () => {
  process.env.CURSOR_SECRET = VALID_STRONG_SECRET;
  for (const bad of ["", "   ", "not-base64-at-all!!!", "short", null, undefined, 123]) {
    assert.throws(
      () => decodeCursor(bad, "vit-ap", "fac-1"),
      (err) => err instanceof ValidationError
    );
  }
});

test("decodeCursor - rejects oversized cursors", () => {
  process.env.CURSOR_SECRET = VALID_STRONG_SECRET;
  const oversized = "a".repeat(MAX_CURSOR_LENGTH + 1);
  assert.throws(
    () => decodeCursor(oversized, "vit-ap", "fac-1"),
    (err) => err instanceof ValidationError && /exceeds maximum allowed length/i.test(err.message)
  );
});

test("decodeCursor - rejects cursor from a different campus or faculty", () => {
  process.env.CURSOR_SECRET = VALID_STRONG_SECRET;
  const cursor = encodeCursor({ campusSlug: "vit-ap", facultyId: "fac-1", lastDocId: "doc-1" });
  assert.throws(
    () => decodeCursor(cursor, "vit-v", "fac-1"),
    (err) => err instanceof ValidationError && /does not match/i.test(err.message)
  );
  assert.throws(
    () => decodeCursor(cursor, "vit-ap", "fac-2"),
    (err) => err instanceof ValidationError && /does not match/i.test(err.message)
  );
});

test("decodeCursor - rejects expired cursor older than 24 hours", () => {
  process.env.CURSOR_SECRET = VALID_STRONG_SECRET;
  // Created 25 hours ago
  const expiredTime = Date.now() - (25 * 60 * 60 * 1000);
  const cursor = encodeCursor({
    campusSlug: "vit-ap",
    facultyId: "fac-1",
    lastDocId: "doc-1",
    timestamp: expiredTime,
  });

  assert.throws(
    () => decodeCursor(cursor, "vit-ap", "fac-1"),
    (err) => err instanceof ValidationError && /has expired/i.test(err.message)
  );
});

test("decodeCursor - rejects future-dated cursor exceeding clock skew allowance", () => {
  process.env.CURSOR_SECRET = VALID_STRONG_SECRET;
  // 15 minutes in the future (> 5 min tolerance)
  const futureTime = Date.now() + (15 * 60 * 1000);
  const cursor = encodeCursor({
    campusSlug: "vit-ap",
    facultyId: "fac-1",
    lastDocId: "doc-1",
    timestamp: futureTime,
  });

  assert.throws(
    () => decodeCursor(cursor, "vit-ap", "fac-1"),
    (err) => err instanceof ValidationError && /future dated/i.test(err.message)
  );
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Visibility and Privacy Whitelist
// ─────────────────────────────────────────────────────────────────────────────

test("isPubliclyVisible - treats ACTIVE and undefined (legacy) as visible, filters others", () => {
  assert.equal(isPubliclyVisible({ status: "ACTIVE" }), true);
  assert.equal(isPubliclyVisible({}), true);
  assert.equal(isPubliclyVisible({ status: undefined }), true);
  assert.equal(isPubliclyVisible({ status: "HIDDEN" }), false);
  assert.equal(isPubliclyVisible({ status: "FLAGGED" }), false);
  assert.equal(isPubliclyVisible({ status: "DELETED" }), false);
  assert.equal(isPubliclyVisible({ status: "QUARANTINED" }), false);
});

test("toPublicReview - strictly whitelists fields, produces opaque 24-char hex ID, and leaks no internals", () => {
  const storedData = {
    userId: "secret-author-uid",
    user: "Secret Student",
    status: "ACTIVE",
    version: 3,
    shardId: "2",
    createdAt: { seconds: 123456 },
    acceptedAtMs: 1700000000000,
    ratings: { attendance: 5, correction: 4, teaching: 5, approachability: 4, overall: 4.5 },
    comment: "Excellent teacher.",
    internalModerationFlag: "ok",
  };

  const publicReview = toPublicReview("vit-ap", "fac-1", "secret-author-uid", storedData);
  assert.deepEqual(Object.keys(publicReview).sort(), ["comment", "id", "ratings"]);
  assert.match(publicReview.id, /^[0-9a-f]{24}$/);
  assert.equal(publicReview.comment, "Excellent teacher.");
  assert.deepEqual(publicReview.ratings, {
    attendance: 5,
    correction: 4,
    teaching: 5,
    approachability: 4,
    overall: 4.5,
  });

  const serialized = JSON.stringify(publicReview);
  assert.ok(!serialized.includes("secret-author-uid"));
  assert.ok(!serialized.includes("Secret Student"));
  assert.ok(!serialized.includes("status"));
  assert.ok(!serialized.includes("version"));
  assert.ok(!serialized.includes("shardId"));
  assert.ok(!serialized.includes("internalModerationFlag"));
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Bounded Firestore Queries & Pagination Sequence
// ─────────────────────────────────────────────────────────────────────────────

test("listPublicReviews - bounded Firestore queries and multi-page sequence with no duplicates or missing reviews", async (t) => {
  process.env.CURSOR_SECRET = VALID_STRONG_SECRET;
  const campusSlug = "vit-ap";
  const facultyId = "fac-pagination-test";

  const mockDataset = [
    { id: "doc-01", data: { ratings: { overall: 4 }, comment: "Rev 1", status: "ACTIVE" } },
    { id: "doc-02", data: { ratings: { overall: 2 }, comment: "Rev 2 Hidden", status: "HIDDEN" } },
    { id: "doc-03", data: { ratings: { overall: 5 }, comment: "Rev 3 Legacy" } }, // legacy: no status, no timestamp
    { id: "doc-04", data: { ratings: { overall: 3 }, comment: "Rev 4", status: "ACTIVE" } },
    { id: "doc-05", data: { ratings: { overall: 1 }, comment: "Rev 5 Deleted", status: "DELETED" } },
    { id: "doc-06", data: { ratings: { overall: 4 }, comment: "Rev 6", status: "ACTIVE" } },
    { id: "doc-07", data: { ratings: { overall: 5 }, comment: "Rev 7 Legacy" } }, // legacy: no status, no timestamp
  ];

  const queriesExecuted = [];

  function createMockQuery(startAfter = null, limitVal = 10) {
    return {
      orderBy: () => createMockQuery(startAfter, limitVal),
      startAfter: (afterId) => createMockQuery(afterId, limitVal),
      limit: (n) => createMockQuery(startAfter, n),
      get: async () => {
        assert.ok(typeof limitVal === "number" && limitVal > 0, "Query must have a positive limit");
        queriesExecuted.push({ startAfter, limit: limitVal });

        let startIndex = 0;
        if (startAfter) {
          const idx = mockDataset.findIndex((d) => d.id === startAfter);
          startIndex = idx >= 0 ? idx + 1 : 0;
        }
        const slice = mockDataset.slice(startIndex, startIndex + limitVal);
        return {
          empty: slice.length === 0,
          docs: slice.map((d) => ({
            id: d.id,
            data: () => d.data,
          })),
        };
      },
    };
  }

  t.mock.method(adminDb, "collection", () => ({
    doc: () => ({
      collection: () => ({
        doc: () => ({
          collection: () => createMockQuery(),
        }),
      }),
    }),
  }));

  // Page 1: limit 2
  const page1 = await listPublicReviews(campusSlug, facultyId, { limit: 2 });
  assert.equal(page1.reviews.length, 2);
  assert.equal(page1.reviews[0].comment, "Rev 1");
  assert.equal(page1.reviews[1].comment, "Rev 3 Legacy");
  assert.equal(page1.hasMore, true);
  assert.ok(page1.nextCursor);

  // Page 2: limit 2 using nextCursor
  const page2 = await listPublicReviews(campusSlug, facultyId, { cursor: page1.nextCursor, limit: 2 });
  assert.equal(page2.reviews.length, 2);
  assert.equal(page2.reviews[0].comment, "Rev 4");
  assert.equal(page2.reviews[1].comment, "Rev 6");
  assert.equal(page2.hasMore, true);
  assert.ok(page2.nextCursor);

  // Page 3: limit 2 using nextCursor
  const page3 = await listPublicReviews(campusSlug, facultyId, { cursor: page2.nextCursor, limit: 2 });
  assert.equal(page3.reviews.length, 1);
  assert.equal(page3.reviews[0].comment, "Rev 7 Legacy");
  assert.equal(page3.hasMore, false);
  assert.equal(page3.nextCursor, null);

  const allComments = [
    ...page1.reviews.map((r) => r.comment),
    ...page2.reviews.map((r) => r.comment),
    ...page3.reviews.map((r) => r.comment),
  ];
  assert.deepEqual(allComments, [
    "Rev 1",
    "Rev 3 Legacy",
    "Rev 4",
    "Rev 6",
    "Rev 7 Legacy",
  ]);

  assert.ok(!allComments.includes("Rev 2 Hidden"));
  assert.ok(!allComments.includes("Rev 5 Deleted"));

  assert.ok(queriesExecuted.length > 0);
  for (const q of queriesExecuted) {
    assert.ok(q.limit <= 10, `Every Firestore query must be strictly bounded, got limit: ${q.limit}`);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Scan Budget Exhaustion with > 20 Consecutive Non-Public Documents
// ─────────────────────────────────────────────────────────────────────────────

test("listPublicReviews - handles > 20 consecutive non-public documents by returning underfilled page with hasMore: true and cursor at last scanned document", async (t) => {
  process.env.CURSOR_SECRET = VALID_STRONG_SECRET;
  const campusSlug = "vit-ap";
  const facultyId = "fac-dense-hidden";

  // Build a dataset with 25 consecutive HIDDEN reviews, followed by 3 ACTIVE reviews
  // doc-hidden-01 .. doc-hidden-25 (all HIDDEN)
  // doc-active-01 .. doc-active-03 (all ACTIVE)
  const denseDataset = [];
  for (let i = 1; i <= 25; i++) {
    const id = `doc-hidden-${String(i).padStart(2, "0")}`;
    denseDataset.push({
      id,
      data: { ratings: { overall: 2 }, comment: `Hidden Review ${i}`, status: "HIDDEN" },
    });
  }
  for (let i = 1; i <= 3; i++) {
    const id = `doc-active-${String(i).padStart(2, "0")}`;
    denseDataset.push({
      id,
      data: { ratings: { overall: 5 }, comment: `Active Review ${i}`, status: "ACTIVE" },
    });
  }

  function createDenseMockQuery(startAfter = null, limitVal = 10) {
    return {
      orderBy: () => createDenseMockQuery(startAfter, limitVal),
      startAfter: (afterId) => createDenseMockQuery(afterId, limitVal),
      limit: (n) => createDenseMockQuery(startAfter, n),
      get: async () => {
        let startIndex = 0;
        if (startAfter) {
          const idx = denseDataset.findIndex((d) => d.id === startAfter);
          startIndex = idx >= 0 ? idx + 1 : 0;
        }
        const slice = denseDataset.slice(startIndex, startIndex + limitVal);
        return {
          empty: slice.length === 0,
          docs: slice.map((d) => ({
            id: d.id,
            data: () => d.data,
          })),
        };
      },
    };
  }

  t.mock.method(adminDb, "collection", () => ({
    doc: () => ({
      collection: () => ({
        doc: () => ({
          collection: () => createDenseMockQuery(),
        }),
      }),
    }),
  }));

  // Request with limit: 5 (pageSize = 5, maxScanBudget = max(15, 20) = 20)
  // Request 1: Scans 20 hidden reviews (budget exhausted).
  // Must return 0 public reviews, hasMore: true, and cursor pointing to doc-hidden-20
  const req1 = await listPublicReviews(campusSlug, facultyId, { limit: 5 });
  assert.equal(req1.reviews.length, 0, "no public reviews found in first 20 hidden docs");
  assert.equal(req1.hasMore, true, "hasMore must be true when scan budget exhausted and more docs may exist");
  assert.ok(req1.nextCursor, "nextCursor must be provided to advance past scanned hidden docs");

  // Verify the cursor was generated from the last SCANNED doc (doc-hidden-20)
  const decodedDoc1 = decodeCursor(req1.nextCursor, campusSlug, facultyId);
  assert.equal(decodedDoc1, "doc-hidden-20", "nextCursor must point to last scanned document to prevent repeat scan");

  // Request 2: Starts after doc-hidden-20.
  // Scans remaining 5 hidden docs (doc-hidden-21..25), then reaches doc-active-01..03
  const req2 = await listPublicReviews(campusSlug, facultyId, { cursor: req1.nextCursor, limit: 5 });
  assert.equal(req2.reviews.length, 3, "must collect all 3 active reviews");
  assert.deepEqual(
    req2.reviews.map((r) => r.comment),
    ["Active Review 1", "Active Review 2", "Active Review 3"]
  );
  assert.equal(req2.hasMore, false, "reached end of collection");
  assert.equal(req2.nextCursor, null);
});
