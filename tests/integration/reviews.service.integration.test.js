/**
 * Integration Tests: ReviewsService End-to-End + Firestore Emulator
 *
 * Tests the complete review submission pipeline using actual service and repository
 * implementations against a live Firestore Emulator.
 * No mocks are used anywhere in this test suite.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { ensureEmulatorConnection, db } from "./helpers/setup.js";
import {
  clearCollection,
  facultiesRef,
  reviewsRef,
  usersRef,
} from "./helpers/firestore-helpers.js";
import { ReviewsService } from "../../services/reviews/reviews.service.js";
import { FacultyRepository } from "../../repositories/faculty.repository.js";
import { ReviewsRepository } from "../../repositories/reviews.repository.js";

const CAMPUS = "vit-vellore-e2e";

// Valid mock user (represents the authenticated session user object)
function makeUser(uid = "user-e2e-001") {
  return { uid };
}

// Valid review payload
function validRatings() {
  return { attendance: 4, correction: 4, teaching: 5, approachability: 3 };
}

async function seedFaculty(facultyId, data = {}) {
  await setDoc(doc(db, "campuses", CAMPUS, "faculties", facultyId), {
    name: "Test E2E Faculty",
    department: "CSE",
    avgRating: 0,
    reviewCount: 0,
    ...data,
  });
}

test.before(() => {
  ensureEmulatorConnection();
});

test.after(async () => {
  await clearCollection(reviewsRef(CAMPUS, "fac-e2e-1"));
  await clearCollection(reviewsRef(CAMPUS, "fac-e2e-2"));
  await clearCollection(reviewsRef(CAMPUS, "fac-e2e-dup"));
  await clearCollection(reviewsRef(CAMPUS, "fac-e2e-invalid"));
  await clearCollection(facultiesRef(CAMPUS));
  await clearCollection(usersRef());
});

// ───────────────────────────────────────────────────────────────────────────────
// Complete review submission workflow
// ───────────────────────────────────────────────────────────────────────────────

test("ReviewsService [INT E2E] - complete review submission workflow", async () => {
  const facultyId = "fac-e2e-1";
  await clearCollection(reviewsRef(CAMPUS, facultyId));
  await seedFaculty(facultyId);

  const user = makeUser("user-e2e-flow");
  const ratings = validRatings();
  const comment = "This professor explains concepts very clearly and is approachable.";

  // 1. Submit via service
  const result = await ReviewsService.submitReview({
    campusSlug: CAMPUS,
    facultyId,
    user,
    userCampus: CAMPUS,
    ratings,
    comment,
  });

  // 2. Check returned shape
  assert.equal(result.success, true);
  assert.equal(typeof result.overall, "number");
  assert.ok(result.updatedStats, "should return updatedStats");
  assert.ok(Array.isArray(result.reviews), "should return reviews array");
  assert.equal(result.reviews.length, 1);

  // 3. Verify overall is correctly calculated
  const expectedOverall = ReviewsService.calculateOverallRating(ratings);
  assert.equal(result.overall, expectedOverall);

  // 4. Verify review document was actually persisted in Firestore
  const savedSnap = await getDoc(doc(db, "campuses", CAMPUS, "faculties", facultyId, "reviews", user.uid));
  const savedReview = savedSnap.exists() ? { id: savedSnap.id, ...savedSnap.data() } : null;
  assert.ok(savedReview !== null, "review document should exist in Firestore");
  assert.equal(savedReview.userId, user.uid);
  assert.equal(savedReview.text, comment.trim());
  assert.equal(savedReview.attendance, ratings.attendance);
  assert.equal(savedReview.teaching, ratings.teaching);
  assert.equal(savedReview.overall, expectedOverall);
  assert.ok(savedReview.updatedAt !== undefined, "updatedAt should be set");

  // 5. Verify faculty aggregate stats were recalculated and persisted
  const facultyDoc = await FacultyRepository.getFacultyById(CAMPUS, facultyId);
  assert.ok(facultyDoc !== null);
  assert.equal(facultyDoc.reviewCount, 1);

  const expectedStats = ReviewsService.calculateAggregateStats(result.reviews);
  assert.equal(facultyDoc.avgRating, expectedStats.avgRating);
  assert.equal(facultyDoc.avgAttendance, expectedStats.avgAttendance);
  assert.equal(facultyDoc.avgTeaching, expectedStats.avgTeaching);

  // 6. Verify updatedStats in result matches persisted faculty stats
  assert.equal(result.updatedStats.reviewCount, 1);
  assert.equal(result.updatedStats.avgRating, facultyDoc.avgRating);
});

// ───────────────────────────────────────────────────────────────────────────────
// Invalid review does not create document
// ───────────────────────────────────────────────────────────────────────────────

test("ReviewsService [INT E2E] - invalid review (short comment) does not create a review document", async () => {
  const facultyId = "fac-e2e-invalid";
  await clearCollection(reviewsRef(CAMPUS, facultyId));
  await seedFaculty(facultyId);

  const user = makeUser("user-e2e-invalid");

  await assert.rejects(
    () =>
      ReviewsService.submitReview({
        campusSlug: CAMPUS,
        facultyId,
        user,
        userCampus: CAMPUS,
        ratings: validRatings(),
        comment: "Too short",
      }),
    (err) => {
      assert.ok(err.message.includes("characters"), "should include character-length error");
      return true;
    }
  );

  // No review should have been persisted
  const reviews = await ReviewsRepository.getReviewsByFaculty(CAMPUS, facultyId);
  assert.equal(reviews.length, 0, "no review should be saved on validation failure");
});

test("ReviewsService [INT E2E] - invalid review (missing user) does not create a review document", async () => {
  const facultyId = "fac-e2e-invalid";

  await assert.rejects(
    () =>
      ReviewsService.submitReview({
        campusSlug: CAMPUS,
        facultyId,
        user: null,
        userCampus: CAMPUS,
        ratings: validRatings(),
        comment: "This professor is very helpful and explains well.",
      }),
    (err) => {
      assert.ok(err.message.includes("sign in"), "should include sign-in error");
      return true;
    }
  );
});

test("ReviewsService [INT E2E] - cross-campus submission is rejected", async () => {
  const facultyId = "fac-e2e-invalid";

  await assert.rejects(
    () =>
      ReviewsService.submitReview({
        campusSlug: CAMPUS,
        facultyId,
        user: makeUser(),
        userCampus: "vit-chennai",
        ratings: validRatings(),
        comment: "This professor is excellent at explaining complex topics.",
      }),
    (err) => {
      assert.ok(err.message.includes("own campus"), "should include campus restriction error");
      return true;
    }
  );
});

// ───────────────────────────────────────────────────────────────────────────────
// Second review updates aggregate stats correctly
// ───────────────────────────────────────────────────────────────────────────────

test("ReviewsService [INT E2E] - second review from different user updates aggregate statistics correctly", async () => {
  const facultyId = "fac-e2e-2";
  await clearCollection(reviewsRef(CAMPUS, facultyId));
  await seedFaculty(facultyId);

  const user1 = makeUser("user-e2e-agg-1");
  const user2 = makeUser("user-e2e-agg-2");
  const ratings1 = { attendance: 5, correction: 5, teaching: 5, approachability: 5 };
  const ratings2 = { attendance: 1, correction: 1, teaching: 1, approachability: 1 };
  const comment = "This professor has been a great help throughout the semester.";

  // First submission
  const result1 = await ReviewsService.submitReview({
    campusSlug: CAMPUS,
    facultyId,
    user: user1,
    userCampus: CAMPUS,
    ratings: ratings1,
    comment,
  });

  assert.equal(result1.reviews.length, 1);
  assert.equal(result1.updatedStats.reviewCount, 1);
  assert.equal(result1.updatedStats.avgRating, 5);

  // Second submission
  const result2 = await ReviewsService.submitReview({
    campusSlug: CAMPUS,
    facultyId,
    user: user2,
    userCampus: CAMPUS,
    ratings: ratings2,
    comment,
  });

  assert.equal(result2.reviews.length, 2);
  assert.equal(result2.updatedStats.reviewCount, 2);

  // Averages should be (5+1)/2 = 3.0
  assert.equal(result2.updatedStats.avgRating, 3.0);
  assert.equal(result2.updatedStats.avgAttendance, 3.0);
  assert.equal(result2.updatedStats.avgTeaching, 3.0);

  // Verify persisted in Firestore
  const facultyDoc = await FacultyRepository.getFacultyById(CAMPUS, facultyId);
  assert.equal(facultyDoc.reviewCount, 2);
  assert.equal(facultyDoc.avgRating, 3.0);
});

// ───────────────────────────────────────────────────────────────────────────────
// Existing review behaviour (upsert by userId document ID)
// ───────────────────────────────────────────────────────────────────────────────

test("ReviewsService [INT E2E] - resubmitting review from same user updates the existing document", async () => {
  const facultyId = "fac-e2e-dup";
  await clearCollection(reviewsRef(CAMPUS, facultyId));
  await seedFaculty(facultyId);

  const user = makeUser("user-e2e-dup-1");
  const comment = "This is a great faculty member who explains everything clearly.";

  // First submission
  await ReviewsService.submitReview({
    campusSlug: CAMPUS,
    facultyId,
    user,
    userCampus: CAMPUS,
    ratings: { attendance: 2, correction: 2, teaching: 2, approachability: 2 },
    comment,
  });

  // Check only 1 review exists
  let reviews = await ReviewsRepository.getReviewsByFaculty(CAMPUS, facultyId);
  assert.equal(reviews.length, 1);

  // Resubmit with updated ratings
  await ReviewsService.submitReview({
    campusSlug: CAMPUS,
    facultyId,
    user,
    userCampus: CAMPUS,
    ratings: { attendance: 5, correction: 5, teaching: 5, approachability: 5 },
    comment,
  });

  // Should still be only 1 review (upsert)
  reviews = await ReviewsRepository.getReviewsByFaculty(CAMPUS, facultyId);
  assert.equal(reviews.length, 1, "resubmission should update, not create duplicate");

  // Stats should reflect updated ratings (all 5s)
  const facultyDoc = await FacultyRepository.getFacultyById(CAMPUS, facultyId);
  assert.equal(facultyDoc.reviewCount, 1, "review count should still be 1 after upsert");
  assert.equal(facultyDoc.avgRating, 5.0, "avg rating should reflect updated review");
});
