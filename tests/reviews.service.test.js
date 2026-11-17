import test from "node:test";
import assert from "node:assert/strict";
import { ReviewsService } from "../services/reviews/reviews.service.js";
import { ReviewsRepository } from "../repositories/reviews.repository.js";
import { FacultyRepository } from "../repositories/faculty.repository.js";

// ============================================================================
// calculateOverallRating() tests
// ============================================================================

test("ReviewsService.calculateOverallRating - calculates arithmetic mean of 4 criteria", () => {
  const ratings = {
    attendance: 4,
    correction: 3,
    teaching: 5,
    approachability: 4,
  };
  const overall = ReviewsService.calculateOverallRating(ratings);
  assert.equal(overall, 4); // (4+3+5+4)/4 = 16/4 = 4
});

test("ReviewsService.calculateOverallRating - handles fractional values accurately", () => {
  const ratings = {
    attendance: 4,
    correction: 4,
    teaching: 3,
    approachability: 4,
  };
  const overall = ReviewsService.calculateOverallRating(ratings);
  assert.equal(overall, 3.75); // 15/4 = 3.75
});

test("ReviewsService.calculateOverallRating - handles null, undefined, and missing criteria gracefully", () => {
  assert.equal(ReviewsService.calculateOverallRating(null), 0);
  assert.equal(ReviewsService.calculateOverallRating(undefined), 0);

  // Partial criteria (missing values default to 0)
  const partial = { attendance: 4, correction: 4 };
  assert.equal(ReviewsService.calculateOverallRating(partial), 2); // (4+4+0+0)/4 = 2
});

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
// calculateAggregateStats() tests
// ============================================================================

test("ReviewsService.calculateAggregateStats - accurately computes faculty averages", () => {
  const reviews = [
    { attendance: 4, correction: 3, teaching: 5, approachability: 4, overall: 4.0 },
    { attendance: 5, correction: 4, teaching: 4, approachability: 5, overall: 4.5 },
    { attendance: 3, correction: 3, teaching: 4, approachability: 3, overall: 3.25 },
  ];

  const stats = ReviewsService.calculateAggregateStats(reviews);
  assert.equal(stats.reviewCount, 3);
  // attendance: (4+5+3)/3 = 4.0
  assert.equal(stats.avgAttendance, 4.0);
  // correction: (3+4+3)/3 = 10/3 = 3.33
  assert.equal(stats.avgCorrection, 3.33);
  // teaching: (5+4+4)/3 = 13/3 = 4.33
  assert.equal(stats.avgTeaching, 4.33);
  // approachability: (4+5+3)/3 = 4.0
  assert.equal(stats.avgApproachability, 4.0);
  // overall: (4 + 4.5 + 3.25)/3 = 11.75/3 = 3.92
  assert.equal(stats.avgRating, 3.92);
});

test("ReviewsService.calculateAggregateStats - handles empty reviews gracefully", () => {
  const stats = ReviewsService.calculateAggregateStats([]);
  assert.equal(stats.reviewCount, 0);
  assert.equal(stats.avgRating, 0);
  assert.equal(stats.avgAttendance, 0);
  assert.equal(stats.avgCorrection, 0);
  assert.equal(stats.avgTeaching, 0);
  assert.equal(stats.avgApproachability, 0);
});

test("ReviewsService.calculateAggregateStats - handles single review accurately", () => {
  const reviews = [
    { attendance: 5, correction: 4, teaching: 5, approachability: 3, overall: 4.25 },
  ];

  const stats = ReviewsService.calculateAggregateStats(reviews);
  assert.equal(stats.reviewCount, 1);
  assert.equal(stats.avgAttendance, 5.0);
  assert.equal(stats.avgCorrection, 4.0);
  assert.equal(stats.avgTeaching, 5.0);
  assert.equal(stats.avgApproachability, 3.0);
  assert.equal(stats.avgRating, 4.25);
});

// ============================================================================
// submitReview() service orchestration tests
// ============================================================================

test("ReviewsService.submitReview - successful review submission orchestration pipeline", async (t) => {
  const fetchedReviewsAfterSave = [
    { attendance: 4, correction: 4, teaching: 4, approachability: 4, overall: 4.0 },
    { attendance: 4, correction: 4, teaching: 5, approachability: 5, overall: 4.5 },
  ];

  const saveReviewMock = t.mock.method(ReviewsRepository, "saveReview", async () => ({}));
  const getReviewsMock = t.mock.method(
    ReviewsRepository,
    "getReviewsByFaculty",
    async () => fetchedReviewsAfterSave
  );
  const updateStatsMock = t.mock.method(FacultyRepository, "updateFacultyStats", async () => {});

  const submissionPayload = {
    campusSlug: "vit-ap",
    facultyId: "fac-42",
    user: { uid: "student-uid-99", email: "student@vitapstudent.ac.in" },
    userCampus: "vit-ap",
    ratings: { attendance: 4, correction: 4, teaching: 5, approachability: 5 },
    comment: "Outstanding mentor with deep subject knowledge.",
  };

  const result = await ReviewsService.submitReview(submissionPayload);

  // 1. Verify calculated overall rating
  assert.equal(result.success, true);
  assert.equal(result.overall, 4.5); // (4+4+5+5)/4 = 4.5

  // 2. Verify saveReview call and arguments
  assert.equal(saveReviewMock.mock.callCount(), 1);
  const [saveCampus, saveFacId, saveUid, saveBody] = saveReviewMock.mock.calls[0].arguments;
  assert.equal(saveCampus, "vit-ap");
  assert.equal(saveFacId, "fac-42");
  assert.equal(saveUid, "student-uid-99");
  assert.deepEqual(saveBody, {
    user: "Anonymous User",
    attendance: 4,
    correction: 4,
    teaching: 5,
    approachability: 5,
    overall: 4.5,
    text: "Outstanding mentor with deep subject knowledge.",
  });

  // 3. Verify getReviewsByFaculty call
  assert.equal(getReviewsMock.mock.callCount(), 1);
  assert.deepEqual(getReviewsMock.mock.calls[0].arguments, ["vit-ap", "fac-42"]);

  // 4. Verify updateFacultyStats call and newly computed aggregates
  assert.equal(updateStatsMock.mock.callCount(), 1);
  const [upCampus, upFacId, upStats] = updateStatsMock.mock.calls[0].arguments;
  assert.equal(upCampus, "vit-ap");
  assert.equal(upFacId, "fac-42");
  assert.equal(upStats.reviewCount, 2);
  assert.equal(upStats.avgAttendance, 4.0); // (4+4)/2
  assert.equal(upStats.avgCorrection, 4.0); // (4+4)/2
  assert.equal(upStats.avgTeaching, 4.5);   // (4+5)/2
  assert.equal(upStats.avgApproachability, 4.5); // (4+5)/2
  assert.equal(upStats.avgRating, 4.25);    // (4.0+4.5)/2

  // 5. Verify returned result structure
  assert.deepEqual(result.updatedStats, upStats);
  assert.deepEqual(result.reviews, fetchedReviewsAfterSave);
});

test("ReviewsService.submitReview - validation failure halts execution without repository calls", async (t) => {
  const saveReviewMock = t.mock.method(ReviewsRepository, "saveReview", async () => ({}));
  const getReviewsMock = t.mock.method(ReviewsRepository, "getReviewsByFaculty", async () => []);
  const updateStatsMock = t.mock.method(FacultyRepository, "updateFacultyStats", async () => {});

  // Invalid payload: comment is too short (< 10 chars)
  const invalidPayload = {
    campusSlug: "vit-ap",
    facultyId: "fac-42",
    user: { uid: "student-uid-99" },
    userCampus: "vit-ap",
    ratings: { attendance: 4, correction: 4, teaching: 5, approachability: 5 },
    comment: "Short",
  };

  await assert.rejects(
    async () => {
      await ReviewsService.submitReview(invalidPayload);
    },
    {
      name: "Error",
      message: "Experience must be at least 10 characters.",
    }
  );

  // Assert no repository operations occurred
  assert.equal(saveReviewMock.mock.callCount(), 0);
  assert.equal(getReviewsMock.mock.callCount(), 0);
  assert.equal(updateStatsMock.mock.callCount(), 0);
});

test("ReviewsService.submitReview - repository failure when saving review", async (t) => {
  const saveReviewMock = t.mock.method(ReviewsRepository, "saveReview", async () => {
    throw new Error("Firestore save failure: PERMISSION_DENIED");
  });
  const getReviewsMock = t.mock.method(ReviewsRepository, "getReviewsByFaculty", async () => []);
  const updateStatsMock = t.mock.method(FacultyRepository, "updateFacultyStats", async () => {});

  const validPayload = {
    campusSlug: "vit-ap",
    facultyId: "fac-42",
    user: { uid: "student-uid-99" },
    userCampus: "vit-ap",
    ratings: { attendance: 4, correction: 4, teaching: 5, approachability: 5 },
    comment: "Great experience with this professor.",
  };

  await assert.rejects(
    async () => {
      await ReviewsService.submitReview(validPayload);
    },
    {
      name: "Error",
      message: "Firestore save failure: PERMISSION_DENIED",
    }
  );

  assert.equal(saveReviewMock.mock.callCount(), 1);
  // Subsequent read and update must not run
  assert.equal(getReviewsMock.mock.callCount(), 0);
  assert.equal(updateStatsMock.mock.callCount(), 0);
});

test("ReviewsService.submitReview - repository failure when fetching reviews after save", async (t) => {
  const saveReviewMock = t.mock.method(ReviewsRepository, "saveReview", async () => ({}));
  const getReviewsMock = t.mock.method(ReviewsRepository, "getReviewsByFaculty", async () => {
    throw new Error("Firestore read failure: NETWORK_TIMEOUT");
  });
  const updateStatsMock = t.mock.method(FacultyRepository, "updateFacultyStats", async () => {});

  const validPayload = {
    campusSlug: "vit-ap",
    facultyId: "fac-42",
    user: { uid: "student-uid-99" },
    userCampus: "vit-ap",
    ratings: { attendance: 4, correction: 4, teaching: 5, approachability: 5 },
    comment: "Great experience with this professor.",
  };

  await assert.rejects(
    async () => {
      await ReviewsService.submitReview(validPayload);
    },
    {
      name: "Error",
      message: "Firestore read failure: NETWORK_TIMEOUT",
    }
  );

  assert.equal(saveReviewMock.mock.callCount(), 1);
  assert.equal(getReviewsMock.mock.callCount(), 1);
  // Faculty stats update must not execute if review read failed
  assert.equal(updateStatsMock.mock.callCount(), 0);
});

test("ReviewsService.submitReview - repository failure when updating faculty stats", async (t) => {
  const saveReviewMock = t.mock.method(ReviewsRepository, "saveReview", async () => ({}));
  const getReviewsMock = t.mock.method(ReviewsRepository, "getReviewsByFaculty", async () => [
    { attendance: 4, correction: 4, teaching: 5, approachability: 5, overall: 4.5 },
  ]);
  const updateStatsMock = t.mock.method(FacultyRepository, "updateFacultyStats", async () => {
    throw new Error("Firestore update failure: UNAVAILABLE");
  });

  const validPayload = {
    campusSlug: "vit-ap",
    facultyId: "fac-42",
    user: { uid: "student-uid-99" },
    userCampus: "vit-ap",
    ratings: { attendance: 4, correction: 4, teaching: 5, approachability: 5 },
    comment: "Great experience with this professor.",
  };

  await assert.rejects(
    async () => {
      await ReviewsService.submitReview(validPayload);
    },
    {
      name: "Error",
      message: "Firestore update failure: UNAVAILABLE",
    }
  );

  assert.equal(saveReviewMock.mock.callCount(), 1);
  assert.equal(getReviewsMock.mock.callCount(), 1);
  assert.equal(updateStatsMock.mock.callCount(), 1);
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
  const directMock = t.mock.method(ReviewsRepository, "getReviewsByFaculty", async () => {
    throw new Error("direct Firestore review reads are denied by production rules");
  });

  await ReviewsService.submitReviewApi({
    campusSlug: "vit-ap", facultyId: "fac-1", user: API_USER, userCampus: "vit-ap",
    ratings: API_RATINGS, comment: "A thoughtful review comment.",
  });

  assert.equal(publicMock.mock.callCount(), 1);
  assert.equal(directMock.mock.callCount(), 0);
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
