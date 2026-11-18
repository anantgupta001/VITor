/**
 * Integration Tests: ReviewsRepository + Firestore Emulator
 *
 * Tests the actual ReviewsRepository against a live Firestore Emulator.
 * No mocks are used. Data is seeded and cleaned up per test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { ensureEmulatorConnection, db } from "./helpers/setup.js";
import { clearCollection, reviewsRef, facultiesRef } from "./helpers/firestore-helpers.js";
import { ReviewsRepository } from "../../repositories/reviews.repository.js";

const CAMPUS = "vit-vellore-int";
const CAMPUS_B = "vit-chennai-int";
const FACULTY_A = "fac-rev-a";
const FACULTY_B = "fac-rev-b";

async function seedFaculty(campusSlug, facultyId) {
  await setDoc(doc(db, "campuses", campusSlug, "faculties", facultyId), {
    name: "Test Faculty",
    department: "CSE",
  });
}

test.before(() => {
  ensureEmulatorConnection();
});

test.after(async () => {
  await clearCollection(reviewsRef(CAMPUS, FACULTY_A));
  await clearCollection(reviewsRef(CAMPUS, FACULTY_B));
  await clearCollection(reviewsRef(CAMPUS_B, FACULTY_A));
  await clearCollection(facultiesRef(CAMPUS));
  await clearCollection(facultiesRef(CAMPUS_B));
});

// ───────────────────────────────────────────────────────────────────────────────
// getReviewsByFaculty
// ───────────────────────────────────────────────────────────────────────────────

test("ReviewsRepository [INT] - returns empty array for empty reviews collection", async () => {
  await clearCollection(reviewsRef(CAMPUS, FACULTY_A));
  const result = await ReviewsRepository.getReviewsByFaculty(CAMPUS, FACULTY_A);
  assert.deepEqual(result, []);
});

test("ReviewsRepository [INT] - returns empty array when params are missing", async () => {
  assert.deepEqual(await ReviewsRepository.getReviewsByFaculty(null, FACULTY_A), []);
  assert.deepEqual(await ReviewsRepository.getReviewsByFaculty(CAMPUS, null), []);
});

test("ReviewsRepository [INT] - reads saved reviews for a faculty", async () => {
  await clearCollection(reviewsRef(CAMPUS, FACULTY_A));
  await seedFaculty(CAMPUS, FACULTY_A);

  // Pre-seed a review directly
  await setDoc(
    doc(db, "campuses", CAMPUS, "faculties", FACULTY_A, "reviews", "user-seed-1"),
    {
      user: "Anonymous User",
      attendance: 4,
      correction: 3,
      teaching: 5,
      approachability: 4,
      overall: 4,
      text: "Great teacher!",
      userId: "user-seed-1",
    }
  );

  const result = await ReviewsRepository.getReviewsByFaculty(CAMPUS, FACULTY_A);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, "user-seed-1");
  assert.equal(result[0].userId, "user-seed-1");
  assert.equal(result[0].text, "Great teacher!");
  assert.equal(result[0].overall, 4);
});

test("ReviewsRepository [INT] - separate faculty review subcollections are isolated", async () => {
  await clearCollection(reviewsRef(CAMPUS, FACULTY_A));
  await clearCollection(reviewsRef(CAMPUS, FACULTY_B));
  await seedFaculty(CAMPUS, FACULTY_A);
  await seedFaculty(CAMPUS, FACULTY_B);

  await setDoc(doc(db, "campuses", CAMPUS, "faculties", FACULTY_A, "reviews", "user-a"), {
    user: "Anonymous User",
    text: "Review for A",
    userId: "user-a",
    overall: 4,
  });
  await setDoc(doc(db, "campuses", CAMPUS, "faculties", FACULTY_B, "reviews", "user-b"), {
    user: "Anonymous User",
    text: "Review for B",
    userId: "user-b",
    overall: 3,
  });

  const reviewsA = await ReviewsRepository.getReviewsByFaculty(CAMPUS, FACULTY_A);
  const reviewsB = await ReviewsRepository.getReviewsByFaculty(CAMPUS, FACULTY_B);

  assert.equal(reviewsA.length, 1);
  assert.equal(reviewsA[0].text, "Review for A");
  assert.equal(reviewsB.length, 1);
  assert.equal(reviewsB[0].text, "Review for B");
});

test("ReviewsRepository [INT] - campus-specific review paths are isolated", async () => {
  await clearCollection(reviewsRef(CAMPUS, FACULTY_A));
  await clearCollection(reviewsRef(CAMPUS_B, FACULTY_A));
  await seedFaculty(CAMPUS, FACULTY_A);
  await seedFaculty(CAMPUS_B, FACULTY_A);

  await setDoc(doc(db, "campuses", CAMPUS, "faculties", FACULTY_A, "reviews", "user-campus-1"), {
    text: "Vellore review",
    userId: "user-campus-1",
    overall: 4,
  });

  const velloreReviews = await ReviewsRepository.getReviewsByFaculty(CAMPUS, FACULTY_A);
  const chennaiReviews = await ReviewsRepository.getReviewsByFaculty(CAMPUS_B, FACULTY_A);

  assert.equal(velloreReviews.length, 1);
  assert.equal(velloreReviews[0].text, "Vellore review");
  assert.equal(chennaiReviews.length, 0);
});

// ───────────────────────────────────────────────────────────────────────────────
// getUserReview (removed)
// ───────────────────────────────────────────────────────────────────────────────

test("ReviewsRepository [INT] - getUserReview is not exposed on repository", () => {
  assert.equal(ReviewsRepository.getUserReview, undefined);
});

// ───────────────────────────────────────────────────────────────────────────────
// saveReview
// ───────────────────────────────────────────────────────────────────────────────

test("ReviewsRepository [INT] - saveReview throws when params are missing", async () => {
  await assert.rejects(
    () => ReviewsRepository.saveReview(null, FACULTY_A, "user-x", {}),
    (err) => {
      assert.ok(err.message.includes("Missing parameters"));
      return true;
    }
  );
  await assert.rejects(() => ReviewsRepository.saveReview(CAMPUS, null, "user-x", {}));
  await assert.rejects(() => ReviewsRepository.saveReview(CAMPUS, FACULTY_A, null, {}));
});

test("ReviewsRepository [INT] - saveReview persists review document to emulator", async () => {
  await clearCollection(reviewsRef(CAMPUS, FACULTY_A));
  await seedFaculty(CAMPUS, FACULTY_A);

  const userId = "user-save-1";
  const reviewData = {
    user: "Anonymous User",
    attendance: 5,
    correction: 4,
    teaching: 4,
    approachability: 3,
    overall: 4,
    text: "Good experience with this professor.",
  };

  await ReviewsRepository.saveReview(CAMPUS, FACULTY_A, userId, reviewData);

  // Verify via getDoc
  const snap = await getDoc(doc(db, "campuses", CAMPUS, "faculties", FACULTY_A, "reviews", userId));
  const saved = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  assert.ok(saved !== null);
  assert.equal(saved.id, userId);
  assert.equal(saved.userId, userId);
  assert.equal(saved.text, "Good experience with this professor.");
  assert.equal(saved.attendance, 5);
  assert.equal(saved.overall, 4);
  assert.ok(saved.updatedAt !== undefined, "updatedAt should be set by serverTimestamp");
});

test("ReviewsRepository [INT] - saveReview adds userId field to saved document", async () => {
  await clearCollection(reviewsRef(CAMPUS, FACULTY_A));
  await seedFaculty(CAMPUS, FACULTY_A);

  const userId = "user-uid-check";
  await ReviewsRepository.saveReview(CAMPUS, FACULTY_A, userId, {
    user: "Anonymous User",
    text: "Checking userId field presence.",
    overall: 3,
  });

  const snap = await getDoc(doc(db, "campuses", CAMPUS, "faculties", FACULTY_A, "reviews", userId));
  const saved = snap.exists() ? { id: snap.id, ...snap.data() } : null;
  assert.equal(saved.userId, userId);
});

test("ReviewsRepository [INT] - saveReview uses merge so it updates an existing review", async () => {
  await clearCollection(reviewsRef(CAMPUS, FACULTY_A));
  await seedFaculty(CAMPUS, FACULTY_A);

  const userId = "user-update-1";
  await ReviewsRepository.saveReview(CAMPUS, FACULTY_A, userId, {
    user: "Anonymous User",
    text: "First version of review.",
    overall: 2,
  });
  await ReviewsRepository.saveReview(CAMPUS, FACULTY_A, userId, {
    user: "Anonymous User",
    text: "Updated version of review.",
    overall: 5,
  });

  const all = await ReviewsRepository.getReviewsByFaculty(CAMPUS, FACULTY_A);
  // Should only be one document per userId (merge/upsert by userId docID)
  const userReviews = all.filter((r) => r.userId === userId);
  assert.equal(userReviews.length, 1);
  assert.equal(userReviews[0].text, "Updated version of review.");
  assert.equal(userReviews[0].overall, 5);
});

test("ReviewsRepository [INT] - getReviewsByFaculty returns all reviews and maps document ID as id", async () => {
  await clearCollection(reviewsRef(CAMPUS, FACULTY_A));
  await seedFaculty(CAMPUS, FACULTY_A);

  await ReviewsRepository.saveReview(CAMPUS, FACULTY_A, "user-list-1", {
    text: "Review 1",
    overall: 3,
    user: "Anonymous User",
  });
  await ReviewsRepository.saveReview(CAMPUS, FACULTY_A, "user-list-2", {
    text: "Review 2",
    overall: 4,
    user: "Anonymous User",
  });

  const reviews = await ReviewsRepository.getReviewsByFaculty(CAMPUS, FACULTY_A);
  assert.equal(reviews.length, 2);

  const ids = reviews.map((r) => r.id).sort();
  assert.deepEqual(ids, ["user-list-1", "user-list-2"]);

  for (const r of reviews) {
    assert.ok(r.id, "each review should have id from document ID");
    assert.ok(r.userId, "each review should have userId field");
  }
});
