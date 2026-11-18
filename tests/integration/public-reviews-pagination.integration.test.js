import test from "node:test";
import assert from "node:assert/strict";
import { adminDb } from "../../lib/firebase/admin.js";
import { GET as reviewsGet } from "../../app/api/reviews/route.js";
import { decodeCursor } from "../../lib/server/public-reviews.js";

const CAMPUS = "vit-ap";
const FACULTY = "fac-pagination-integration";

function makeGetRequest(campusSlug, facultyId, { cursor, limit } = {}) {
  const params = new URLSearchParams({ campusSlug, facultyId });
  if (cursor) params.set("cursor", cursor);
  if (limit !== undefined) params.set("limit", String(limit));
  return {
    method: "GET",
    url: `http://localhost:3000/api/reviews?${params.toString()}`,
  };
}

test("Public Reviews Pagination [INT] - complete multi-page pagination sequence with emulator", async () => {
  const facRef = adminDb.collection("campuses").doc(CAMPUS).collection("faculties").doc(FACULTY);
  const reviewsCol = facRef.collection("reviews");

  try {
    await facRef.set({ name: "Dr. Pagination Test", reviewCount: 5 });

    // Seed 9 reviews:
    // 3 ACTIVE reviews
    // 2 legacy reviews (no status, no timestamps)
    // 4 non-public reviews (HIDDEN, FLAGGED, DELETED, QUARANTINED)
    const baseRatings = { attendance: 4, correction: 4, teaching: 5, approachability: 4, overall: 4.25 };

    await reviewsCol.doc("uid-active-1").set({
      userId: "uid-active-1",
      status: "ACTIVE",
      ratings: baseRatings,
      comment: "Active Review One",
      createdAt: { seconds: 1700000001 },
      acceptedAtMs: 1700000001000,
      version: 1,
    });

    await reviewsCol.doc("uid-hidden-1").set({
      userId: "uid-hidden-1",
      status: "HIDDEN",
      ratings: baseRatings,
      comment: "Hidden Secret Text",
    });

    await reviewsCol.doc("uid-legacy-1").set({
      userId: "uid-legacy-1",
      attendance: 5,
      correction: 4,
      teaching: 4,
      approachability: 5,
      overall: 4.5,
      text: "Legacy Review Alpha",
    });

    await reviewsCol.doc("uid-flagged-1").set({
      userId: "uid-flagged-1",
      status: "FLAGGED",
      ratings: baseRatings,
      comment: "Flagged Secret Text",
    });

    await reviewsCol.doc("uid-active-2").set({
      userId: "uid-active-2",
      status: "ACTIVE",
      ratings: baseRatings,
      comment: "Active Review Two",
      createdAt: { seconds: 1700000002 },
      acceptedAtMs: 1700000002000,
      version: 1,
    });

    await reviewsCol.doc("uid-deleted-1").set({
      userId: "uid-deleted-1",
      status: "DELETED",
      ratings: baseRatings,
      comment: "Deleted Secret Text",
    });

    await reviewsCol.doc("uid-legacy-2").set({
      userId: "uid-legacy-2",
      attendance: 4,
      correction: 4,
      teaching: 4,
      approachability: 4,
      overall: 4.0,
      comment: "Legacy Review Beta",
    });

    await reviewsCol.doc("uid-quarantined-1").set({
      userId: "uid-quarantined-1",
      status: "QUARANTINED",
      ratings: baseRatings,
      comment: "Quarantined Secret Text",
    });

    await reviewsCol.doc("uid-active-3").set({
      userId: "uid-active-3",
      status: "ACTIVE",
      ratings: baseRatings,
      comment: "Active Review Three",
      createdAt: { seconds: 1700000003 },
      acceptedAtMs: 1700000003000,
      version: 1,
    });

    // ─────────────────────────────────────────────────────────────────────────
    // Request Page 1 (limit: 2)
    // ─────────────────────────────────────────────────────────────────────────
    const res1 = await reviewsGet(makeGetRequest(CAMPUS, FACULTY, { limit: 2 }));
    assert.equal(res1.status, 200);
    assert.equal(res1.headers.get("Cache-Control"), "no-store");
    const page1 = await res1.json();

    assert.equal(page1.reviews.length, 2);
    assert.equal(page1.hasMore, true);
    assert.ok(page1.nextCursor);

    // ─────────────────────────────────────────────────────────────────────────
    // Request Page 2 (limit: 2) with cursor from Page 1
    // ─────────────────────────────────────────────────────────────────────────
    const res2 = await reviewsGet(makeGetRequest(CAMPUS, FACULTY, { cursor: page1.nextCursor, limit: 2 }));
    assert.equal(res2.status, 200);
    const page2 = await res2.json();

    assert.equal(page2.reviews.length, 2);
    assert.equal(page2.hasMore, true);
    assert.ok(page2.nextCursor);

    // ─────────────────────────────────────────────────────────────────────────
    // Request Page 3 (limit: 2) with cursor from Page 2
    // ─────────────────────────────────────────────────────────────────────────
    const res3 = await reviewsGet(makeGetRequest(CAMPUS, FACULTY, { cursor: page2.nextCursor, limit: 2 }));
    assert.equal(res3.status, 200);
    const page3 = await res3.json();

    assert.equal(page3.reviews.length, 1);
    assert.equal(page3.hasMore, false);
    assert.equal(page3.nextCursor, null);

    // ─────────────────────────────────────────────────────────────────────────
    // Assertions across all pages
    // ─────────────────────────────────────────────────────────────────────────
    const allReviews = [...page1.reviews, ...page2.reviews, ...page3.reviews];
    assert.equal(allReviews.length, 5, "exactly 5 public reviews must be returned");

    // No duplicates
    const allIds = allReviews.map((r) => r.id);
    assert.equal(new Set(allIds).size, 5, "all review IDs must be unique across pages");

    // All 5 public comments must be present
    const comments = allReviews.map((r) => r.comment).sort();
    assert.deepEqual(comments, [
      "Active Review One",
      "Active Review Three",
      "Active Review Two",
      "Legacy Review Alpha",
      "Legacy Review Beta",
    ]);

    // Privacy assertions: no internal fields or author UIDs leaked anywhere
    const rawAll = JSON.stringify({ page1, page2, page3 });
    for (const leaked of [
      "uid-",
      "userId",
      "Secret",
      "HIDDEN",
      "FLAGGED",
      "DELETED",
      "QUARANTINED",
      "version",
      "acceptedAtMs",
    ]) {
      assert.ok(!rawAll.includes(leaked), `response must not leak '${leaked}'`);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // Error cases
    // ─────────────────────────────────────────────────────────────────────────
    // Tampered cursor
    const badCursorRes = await reviewsGet(makeGetRequest(CAMPUS, FACULTY, { cursor: page1.nextCursor + "xyz" }));
    assert.equal(badCursorRes.status, 400);

    // Mismatched campus cursor
    const otherCampusRes = await reviewsGet(makeGetRequest("vit-v", FACULTY, { cursor: page1.nextCursor }));
    assert.equal(otherCampusRes.status, 400);
  } finally {
    await adminDb.recursiveDelete(facRef);
  }
});

test("Public Reviews Pagination [INT] - scans past > 20 consecutive non-public documents across pages without skipping public reviews", async () => {
  const facId = "fac-dense-hidden-int";
  const facRef = adminDb.collection("campuses").doc(CAMPUS).collection("faculties").doc(facId);
  const reviewsCol = facRef.collection("reviews");

  try {
    await facRef.set({ name: "Dr. Dense Hidden Test" });

    // Seed 22 consecutive non-public documents
    const writes = [];
    for (let i = 1; i <= 22; i++) {
      const id = `dense-hidden-${String(i).padStart(2, "0")}`;
      writes.push(
        reviewsCol.doc(id).set({
          userId: id,
          status: "HIDDEN",
          ratings: { attendance: 3, correction: 3, teaching: 3, approachability: 3, overall: 3 },
          comment: `Hidden review ${i}`,
        })
      );
    }
    // Seed 2 active documents after the 22 hidden documents
    writes.push(
      reviewsCol.doc("dense-visible-01").set({
        userId: "dense-visible-01",
        status: "ACTIVE",
        ratings: { attendance: 5, correction: 5, teaching: 5, approachability: 5, overall: 5 },
        comment: "Visible Active Alpha",
      }),
      reviewsCol.doc("dense-visible-02").set({
        userId: "dense-visible-02",
        status: "ACTIVE",
        ratings: { attendance: 4, correction: 4, teaching: 4, approachability: 4, overall: 4 },
        comment: "Visible Active Beta",
      })
    );
    await Promise.all(writes);

    // Page 1: limit 5 (maxScanBudget = 20).
    // Scans 20 hidden docs. Returns 0 reviews, hasMore: true, nextCursor pointing to dense-hidden-20
    const res1 = await reviewsGet(makeGetRequest(CAMPUS, facId, { limit: 5 }));
    assert.equal(res1.status, 200);
    const page1 = await res1.json();
    assert.equal(page1.reviews.length, 0);
    assert.equal(page1.hasMore, true);
    assert.ok(page1.nextCursor);

    // Verify nextCursor decodes to dense-hidden-20 (the last scanned document)
    const decodedDocId = decodeCursor(page1.nextCursor, CAMPUS, facId);
    assert.equal(decodedDocId, "dense-hidden-20");

    // Page 2: with cursor from page 1.
    // Starts after dense-hidden-20. Scans dense-hidden-21..22, then finds dense-visible-01 and 02.
    const res2 = await reviewsGet(makeGetRequest(CAMPUS, facId, { cursor: page1.nextCursor, limit: 5 }));
    assert.equal(res2.status, 200);
    const page2 = await res2.json();

    assert.equal(page2.reviews.length, 2);
    assert.equal(page2.hasMore, false);
    assert.equal(page2.nextCursor, null);
    assert.deepEqual(
      page2.reviews.map((r) => r.comment),
      ["Visible Active Alpha", "Visible Active Beta"]
    );
  } finally {
    await adminDb.recursiveDelete(facRef);
  }
});
