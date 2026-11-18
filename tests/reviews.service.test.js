import test from "node:test";
import assert from "node:assert/strict";
import { ReviewsService } from "../services/reviews/reviews.service.js";
import { ReviewsRepository } from "../repositories/reviews.repository.js";

// ============================================================================
// validateReview() tests & edge cases
// ============================================================================

const validBasePayload = {
  user: { uid: "user123", email: "student@vitapstudent.ac.in" },
  userCampus: "vit-ap",
  campusSlug: "vit-ap",
  ratings: { attendance: 4, correction: 4, teaching: 5, approachability: 5 },
  comment: "Excellent professor with clear explanations.",
};

test("ReviewsService.validateReview - enforces validation rules for standard valid payload", () => {
  const result = ReviewsService.validateReview(validBasePayload);
  assert.equal(result.valid, true);
  assert.equal(result.error, null);
});

test("ReviewsService.validateReview - comment length boundary edge cases (9 vs 10 chars)", () => {
  // Exactly 9 characters -> invalid
  const comment9 = ReviewsService.validateReview({
    ...validBasePayload,
    comment: "123456789",
  });
  assert.equal(comment9.valid, false);
  assert.equal(comment9.error, "Experience must be at least 10 characters.");

  // Exactly 10 characters -> valid
  const comment10 = ReviewsService.validateReview({
    ...validBasePayload,
    comment: "1234567890",
  });
  assert.equal(comment10.valid, true);
  assert.equal(comment10.error, null);
});

test("ReviewsService.validateReview - missing or whitespace-only comment", () => {
  assert.equal(
    ReviewsService.validateReview({ ...validBasePayload, comment: null }).valid,
    false
  );
  assert.equal(
    ReviewsService.validateReview({ ...validBasePayload, comment: undefined }).valid,
    false
  );
  assert.equal(
    ReviewsService.validateReview({ ...validBasePayload, comment: "" }).valid,
    false
  );
  assert.equal(
    ReviewsService.validateReview({ ...validBasePayload, comment: "          " }).valid,
    false
  );
  // 10 chars of whitespace around 5 chars of text -> trimmed length is 5 (< 10)
  assert.equal(
    ReviewsService.validateReview({ ...validBasePayload, comment: "     abc     " }).valid,
    false
  );
});

test("ReviewsService.validateReview - missing rating object", () => {
  const noRatings = ReviewsService.validateReview({ ...validBasePayload, ratings: null });
  assert.equal(noRatings.valid, false);
  assert.equal(noRatings.error, "Please rate all criteria from 1 to 5 stars.");

  const undefRatings = ReviewsService.validateReview({ ...validBasePayload, ratings: undefined });
  assert.equal(undefRatings.valid, false);
});

test("ReviewsService.validateReview - missing individual rating properties", () => {
  // Missing approachability
  const missingOne = ReviewsService.validateReview({
    ...validBasePayload,
    ratings: { attendance: 4, correction: 4, teaching: 5 },
  });
  assert.equal(missingOne.valid, false);
  assert.equal(missingOne.error, "Please rate all criteria from 1 to 5 stars.");

  // Missing teaching and correction
  const missingTwo = ReviewsService.validateReview({
    ...validBasePayload,
    ratings: { attendance: 4, approachability: 5 },
  });
  assert.equal(missingTwo.valid, false);
});

test("ReviewsService.validateReview - ratings containing null, undefined, or NaN", () => {
  const nullRating = ReviewsService.validateReview({
    ...validBasePayload,
    ratings: { attendance: null, correction: 4, teaching: 5, approachability: 5 },
  });
  assert.equal(nullRating.valid, false);

  const undefRating = ReviewsService.validateReview({
    ...validBasePayload,
    ratings: { attendance: 4, correction: undefined, teaching: 5, approachability: 5 },
  });
  assert.equal(undefRating.valid, false);

  const nanRating = ReviewsService.validateReview({
    ...validBasePayload,
    ratings: { attendance: 4, correction: 4, teaching: NaN, approachability: 5 },
  });
  assert.equal(nanRating.valid, false);
});

test("ReviewsService.validateReview - non-numeric rating values", () => {
  const stringRating = ReviewsService.validateReview({
    ...validBasePayload,
    ratings: { attendance: "4", correction: 4, teaching: 5, approachability: 5 },
  });
  assert.equal(stringRating.valid, false);

  const boolRating = ReviewsService.validateReview({
    ...validBasePayload,
    ratings: { attendance: true, correction: 4, teaching: 5, approachability: 5 },
  });
  assert.equal(boolRating.valid, false);
});

test("ReviewsService.validateReview - ratings below 1 and above 5", () => {
  // Below 1
  assert.equal(
    ReviewsService.validateReview({
      ...validBasePayload,
      ratings: { attendance: 0, correction: 4, teaching: 5, approachability: 5 },
    }).valid,
    false
  );
  assert.equal(
    ReviewsService.validateReview({
      ...validBasePayload,
      ratings: { attendance: -1, correction: 4, teaching: 5, approachability: 5 },
    }).valid,
    false
  );

  // Above 5
  assert.equal(
    ReviewsService.validateReview({
      ...validBasePayload,
      ratings: { attendance: 6, correction: 4, teaching: 5, approachability: 5 },
    }).valid,
    false
  );
  assert.equal(
    ReviewsService.validateReview({
      ...validBasePayload,
      ratings: { attendance: 10, correction: 4, teaching: 5, approachability: 5 },
    }).valid,
    false
  );
});

test("ReviewsService.validateReview - valid boundary ratings: 1 and 5", () => {
  // All 1s
  const minRatings = ReviewsService.validateReview({
    ...validBasePayload,
    ratings: { attendance: 1, correction: 1, teaching: 1, approachability: 1 },
  });
  assert.equal(minRatings.valid, true);
  assert.equal(minRatings.error, null);

  // All 5s
  const maxRatings = ReviewsService.validateReview({
    ...validBasePayload,
    ratings: { attendance: 5, correction: 5, teaching: 5, approachability: 5 },
  });
  assert.equal(maxRatings.valid, true);
  assert.equal(maxRatings.error, null);

  // Mixed 1s and 5s
  const boundaryMixed = ReviewsService.validateReview({
    ...validBasePayload,
    ratings: { attendance: 1, correction: 5, teaching: 1, approachability: 5 },
  });
  assert.equal(boundaryMixed.valid, true);
});

test("ReviewsService.validateReview - missing user or campus information", () => {
  // Missing user
  const noUser = ReviewsService.validateReview({ ...validBasePayload, user: null });
  assert.equal(noUser.valid, false);
  assert.equal(noUser.error, "Please sign in to submit a review.");

  const undefUser = ReviewsService.validateReview({ ...validBasePayload, user: undefined });
  assert.equal(undefUser.valid, false);

  // Missing userCampus
  const noUserCampus = ReviewsService.validateReview({ ...validBasePayload, userCampus: null });
  assert.equal(noUserCampus.valid, false);
  assert.equal(noUserCampus.error, "You can only rate faculty members from your own campus.");

  // Missing campusSlug
  const noCampusSlug = ReviewsService.validateReview({ ...validBasePayload, campusSlug: null });
  assert.equal(noCampusSlug.valid, false);
});

test("ReviewsService.validateReview - cross-campus submission rejection", () => {
  const mismatch = ReviewsService.validateReview({
    ...validBasePayload,
    userCampus: "vit-ap",
    campusSlug: "vit-v",
  });
  assert.equal(mismatch.valid, false);
  assert.equal(mismatch.error, "You can only rate faculty members from your own campus.");
});

// ============================================================================
// submitReviewApi() — the path the browser actually uses (audit F-07)
// ============================================================================

const API_USER = {
  uid: "api-user-1",
  email: "student@vitapstudent.ac.in",
  getIdToken: async () => "fresh-id-token",
};
const API_RATINGS = { attendance: 4, correction: 4, teaching: 5, approachability: 3 };

test("ReviewsService.submitReviewApi - posts to /api/reviews with bearer token, idempotency key and trimmed comment", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    status: 201,
    json: async () => ({ overall: 4, updatedStats: { reviewCount: 1 }, review: { id: "api-user-1" } }),
  }));
  t.mock.method(ReviewsRepository, "getPublicReviews", async () => [{ id: "opaque", comment: "x" }]);

  const result = await ReviewsService.submitReviewApi({
    campusSlug: "vit-ap",
    facultyId: "fac-1",
    user: API_USER,
    userCampus: "vit-ap",
    ratings: API_RATINGS,
    comment: "  A thoughtful review comment.  ",
    idempotencyKey: "retry-key-1",
  });

  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "/api/reviews");
  assert.equal(options.method, "POST");
  assert.equal(options.headers.Authorization, "Bearer fresh-id-token");
  assert.equal(options.headers["Idempotency-Key"], "retry-key-1");
  const body = JSON.parse(options.body);
  assert.equal(body.comment, "A thoughtful review comment.");
  assert.equal(body.campusSlug, "vit-ap");

  assert.equal(result.success, true);
  assert.deepEqual(result.reviews, [{ id: "opaque", comment: "x" }]);
  assert.deepEqual(result.updatedStats, { reviewCount: 1 });
});

test("ReviewsService.submitReviewApi - refreshes reviews through the public endpoint, never direct Firestore reads", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, status: 200, json: async () => ({ overall: 4 }) }));
  const publicMock = t.mock.method(ReviewsRepository, "getPublicReviews", async () => []);

  await ReviewsService.submitReviewApi({
    campusSlug: "vit-ap", facultyId: "fac-1", user: API_USER, userCampus: "vit-ap",
    ratings: API_RATINGS, comment: "A thoughtful review comment.",
  });

  assert.equal(publicMock.mock.callCount(), 1);
});

test("ReviewsService.submitReviewApi - surfaces server error code/status (e.g. moderated review) to the caller", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({
    ok: false,
    status: 403,
    json: async () => ({ error: "This review has been restricted by a moderator and cannot be changed.", code: "REVIEW_MODERATED" }),
  }));

  await assert.rejects(
    () => ReviewsService.submitReviewApi({
      campusSlug: "vit-ap", facultyId: "fac-1", user: API_USER, userCampus: "vit-ap",
      ratings: API_RATINGS, comment: "A thoughtful review comment.",
    }),
    (err) => err.statusCode === 403 && err.code === "REVIEW_MODERATED" && /restricted by a moderator/.test(err.message)
  );
});

test("ReviewsService.submitReviewApi - falls back to the returned review when the refresh read fails", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({
    ok: true, status: 201, json: async () => ({ overall: 4, review: { id: "me", comment: "mine" } }),
  }));
  t.mock.method(ReviewsRepository, "getPublicReviews", async () => { throw new Error("network down"); });

  const result = await ReviewsService.submitReviewApi({
    campusSlug: "vit-ap", facultyId: "fac-1", user: API_USER, userCampus: "vit-ap",
    ratings: API_RATINGS, comment: "A thoughtful review comment.",
  });
  assert.deepEqual(result.reviews, [{ id: "me", comment: "mine" }]);
});

test("ReviewsService.submitReviewApi - rejects client-side validation failures without any network call", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not be called"); });
  await assert.rejects(
    () => ReviewsService.submitReviewApi({
      campusSlug: "vit-ap", facultyId: "fac-1", user: API_USER, userCampus: "vit-ap",
      ratings: API_RATINGS, comment: "short",
    }),
    /at least/
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});

// ============================================================================
// submitReview() — always delegates to the trusted API
// ============================================================================

test("ReviewsService.submitReview - delegates to submitReviewApi with the full payload", async (t) => {
  const apiMock = t.mock.method(ReviewsService, "submitReviewApi", async () => ({ success: true }));
  const payload = {
    campusSlug: "vit-ap", facultyId: "fac-1", user: API_USER, userCampus: "vit-ap",
    ratings: API_RATINGS, comment: "A thoughtful review comment.", idempotencyKey: "k1",
  };

  const result = await ReviewsService.submitReview(payload);

  assert.deepEqual(result, { success: true });
  assert.equal(apiMock.mock.callCount(), 1);
  assert.deepEqual(apiMock.mock.calls[0].arguments, [payload]);
});

test("ReviewsService.submitReview - validation failure rejects without any network call", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not be called"); });

  await assert.rejects(
    () => ReviewsService.submitReview({
      campusSlug: "vit-ap", facultyId: "fac-1", user: API_USER, userCampus: "vit-ap",
      ratings: API_RATINGS, comment: "Short",
    }),
    { message: "Experience must be at least 10 characters." }
  );
  assert.equal(fetchMock.mock.callCount(), 0);
});
