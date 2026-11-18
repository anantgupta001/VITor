import test from "node:test";
import assert from "node:assert/strict";

const { ReviewsRepository } = await import("../repositories/reviews.repository.js");
test("ReviewsRepository - does not expose direct client read getUserReview", () => {
  assert.equal(ReviewsRepository.getUserReview, undefined);
});

// ──────────────────────────────────────────────────────────────────────────────
// getPublicReviews — server-backed public read (audit F-02 & Phase 6B pagination)
// ──────────────────────────────────────────────────────────────────────────────

test("ReviewsRepository.getPublicReviews - returns empty pagination contract when parameters are missing without calling the network", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("fetch must not be called");
  });
  assert.deepEqual(await ReviewsRepository.getPublicReviews(null, "fac-1"), {
    reviews: [],
    nextCursor: null,
    hasMore: false,
  });
  assert.deepEqual(await ReviewsRepository.getPublicReviews("vit-ap", ""), {
    reviews: [],
    nextCursor: null,
    hasMore: false,
  });
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("ReviewsRepository.getPublicReviews - requests the trusted endpoint with encoded params, cursor, limit and returns paginated response", async (t) => {
  const reviews = [{ id: "abc", ratings: { overall: 4 }, comment: "Great" }];
  const fetchMock = t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ reviews, nextCursor: "cursor_xyz", hasMore: true }),
  }));

  const result = await ReviewsRepository.getPublicReviews("vit-ap", "fac 1/x", {
    cursor: "cur-1",
    limit: 5,
  });
  assert.deepEqual(result, {
    reviews,
    nextCursor: "cursor_xyz",
    hasMore: true,
  });

  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(
    url,
    "/api/reviews?campusSlug=vit-ap&facultyId=fac+1%2Fx&cursor=cur-1&limit=5"
  );
  assert.equal(options.cache, "no-store");
});

test("ReviewsRepository.getPublicReviews - throws with statusCode on non-OK response", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 503, json: async () => ({}) }));
  await assert.rejects(
    () => ReviewsRepository.getPublicReviews("vit-ap", "fac-1"),
    (err) => err.statusCode === 503
  );
});

test("ReviewsRepository.getPublicReviews - tolerates a malformed payload by returning an empty list and false hasMore", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => ({ reviews: "nope" }) }));
  assert.deepEqual(await ReviewsRepository.getPublicReviews("vit-ap", "fac-1"), {
    reviews: [],
    nextCursor: null,
    hasMore: false,
  });
});
