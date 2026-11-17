/**
 * Integration Test: concurrent first submissions (audit F-04).
 *
 * Two simultaneous first submissions by the same author for the same faculty, with
 * DIFFERENT idempotency keys and NO expectedVersion. Runs the real coordinator against
 * the Firestore Emulator. Verifies the one-review-per-author/faculty policy and that
 * faculty aggregates stay consistent (no double counting, no lost contribution).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { adminDb } from "../../lib/firebase/admin.js";
import { ReviewsTransactionCoordinator } from "../../lib/server/reviews-transaction.js";

const CAMPUS = "vit-int-race";
const FACULTY = "fac-race-1";
const AUTHOR = "author-uid-race-1";
const A = { attendance: 2, correction: 2, teaching: 2, approachability: 2 };
const B = { attendance: 4, correction: 4, teaching: 4, approachability: 4 };

const facultyRef = () => adminDb.collection("campuses").doc(CAMPUS).collection("faculties").doc(FACULTY);

async function reset() {
  await adminDb.recursiveDelete(adminDb.collection("campuses").doc(CAMPUS));
  await facultyRef().set({ name: "Race Faculty", reviewCount: 0, avgRating: 0 });
}

const submit = (ratings, key) =>
  ReviewsTransactionCoordinator.submitOrUpdateReview({
    campusSlug: CAMPUS,
    facultyId: FACULTY,
    userId: AUTHOR,
    ratings,
    comment: "",
    idempotencyKey: key,
  });

test("F-04: concurrent first submissions keep exactly one review and consistent aggregates", async () => {
  for (let round = 0; round < 5; round++) {
    await reset();
    const results = await Promise.allSettled([
      submit(A, `race-key-a-${round}-aaaaaaaa`),
      submit(B, `race-key-b-${round}-bbbbbbbb`),
    ]);

    const ok = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
    const failed = results.filter((r) => r.status === "rejected");
    console.log(
      `round ${round}:`,
      results.map((r) => (r.status === "fulfilled" ? `${r.value.statusCode} v${r.value.version}` : `ERR ${r.reason.code || r.reason.message}`)).join(" | ")
    );
    assert.equal(failed.length, 0, "neither request should error");

    // Exactly one review document, for the author.
    const reviews = await facultyRef().collection("reviews").get();
    assert.equal(reviews.size, 1);
    const review = reviews.docs[0].data();

    // Exactly one creation (201); the other is processed as an update (200) of that review.
    assert.deepEqual(ok.map((r) => r.statusCode).sort(), [200, 201]);
    assert.equal(review.version, 2);

    // Aggregates reflect exactly one review: the surviving one.
    const faculty = (await facultyRef().get()).data();
    assert.equal(faculty.reviewCount, 1);
    assert.equal(faculty.avgRating, review.overall);
  }
});
