/**
 * Integration Tests: moderation integrity + public review read model (audit F-01, F-02, F-03).
 *
 * Runs the REAL ReviewsTransactionCoordinator / public-reviews module with the Firebase
 * Admin SDK against the Firestore Emulator (no mocks). Requires FIRESTORE_EMULATOR_HOST,
 * which scripts/run-integration-tests.mjs sets.
 *
 * Product decisions covered:
 *  1. An author cannot edit / resubmit / delete / restore a moderator-restricted review.
 *  2. A moderator cannot restore (or otherwise moderate) a review deleted by its author.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { adminDb } from "../../lib/firebase/admin.js";
import { ReviewsTransactionCoordinator } from "../../lib/server/reviews-transaction.js";
import { listPublicReviews } from "../../lib/server/public-reviews.js";

const CAMPUS = "vit-int-moderation";
const FACULTY = "fac-moderation-1";
const AUTHOR = "author-uid-123456";

const RATINGS = { attendance: 3, correction: 3, teaching: 3, approachability: 3 };
const NEW_RATINGS = { attendance: 5, correction: 5, teaching: 5, approachability: 5 };

const facultyRef = () => adminDb.collection("campuses").doc(CAMPUS).collection("faculties").doc(FACULTY);
const reviewRef = (uid = AUTHOR) => facultyRef().collection("reviews").doc(uid);

async function resetData() {
  await adminDb.recursiveDelete(adminDb.collection("campuses").doc(CAMPUS));
}

/**
 * Seeds a faculty + one review in the given status. Shard v1_s0 mirrors the aggregate
 * contribution only when the review is ACTIVE, matching real production state.
 */
async function seed(status, extra = {}) {
  await resetData();
  const active = status === "ACTIVE";
  await facultyRef().set({
    name: "Moderation Test Faculty",
    avgRating: active ? 3 : 0,
    reviewCount: active ? 1 : 0,
  });
  await reviewRef().set({
    userId: AUTHOR,
    status,
    ratings: { ...RATINGS, overall: 3 },
    ...RATINGS,
    overall: 3,
    comment: "Original review text here.",
    text: "Original review text here.",
    version: 2,
    shardId: "0",
    shardSchemeVersion: 1,
    ...extra,
  });
  await facultyRef().collection("shards").doc("v1_s0").set({
    schemeVersion: 1,
    shardId: "0",
    reviewCount: active ? 1 : 0,
    attendanceSum: active ? 3 : 0,
    correctionSum: active ? 3 : 0,
    teachingSum: active ? 3 : 0,
    approachabilitySum: active ? 3 : 0,
    overallSum: active ? 3 : 0,
  });
}

async function state() {
  const [review, faculty] = await Promise.all([reviewRef().get(), facultyRef().get()]);
  return { review: review.data(), faculty: faculty.data() };
}

async function assertRejects(promise, { statusCode, code }) {
  await assert.rejects(promise, (err) => {
    assert.equal(err.statusCode, statusCode, `statusCode: ${err.message}`);
    if (code) assert.equal(err.code, code);
    return true;
  });
}

test.after(async () => {
  await resetData();
});

// ─────────────────────────────────────────────────────────────────────────────
// F-01: authors cannot undo moderator actions
// ─────────────────────────────────────────────────────────────────────────────

for (const status of ["HIDDEN", "FLAGGED", "QUARANTINED"]) {
  test(`F-01 [INT] - author restore on a ${status} review is rejected and changes nothing`, async () => {
    await seed(status);
    await assertRejects(
      ReviewsTransactionCoordinator.restoreReview({ campusSlug: CAMPUS, facultyId: FACULTY, userId: AUTHOR }),
      { statusCode: 403, code: "REVIEW_MODERATED" }
    );
    const { review, faculty } = await state();
    assert.equal(review.status, status);
    assert.equal(review.version, 2);
    assert.equal(faculty.reviewCount, 0, "public aggregates must not include the restricted review");
  });

  test(`F-01 [INT] - author resubmit/edit on a ${status} review is rejected and changes nothing`, async () => {
    await seed(status);
    await assertRejects(
      ReviewsTransactionCoordinator.submitOrUpdateReview({
        campusSlug: CAMPUS,
        facultyId: FACULTY,
        userId: AUTHOR,
        ratings: NEW_RATINGS,
        comment: "Attempting to revive this review.",
      }),
      { statusCode: 403, code: "REVIEW_MODERATED" }
    );
    const { review, faculty } = await state();
    assert.equal(review.status, status);
    assert.equal(review.comment, "Original review text here.");
    assert.equal(faculty.reviewCount, 0);
  });

  test(`F-01 [INT] - author delete on a ${status} review is rejected (cannot launder status via delete+restore)`, async () => {
    await seed(status);
    await assertRejects(
      ReviewsTransactionCoordinator.deleteReview({ campusSlug: CAMPUS, facultyId: FACULTY, userId: AUTHOR }),
      { statusCode: 403, code: "REVIEW_MODERATED" }
    );
    assert.equal((await state()).review.status, status);
  });
}

test("F-01 [INT] - author can still edit their ACTIVE review (legitimate flow preserved)", async () => {
  await seed("ACTIVE");
  const res = await ReviewsTransactionCoordinator.submitOrUpdateReview({
    campusSlug: CAMPUS,
    facultyId: FACULTY,
    userId: AUTHOR,
    ratings: NEW_RATINGS,
    comment: "Updated honest experience text.",
    expectedVersion: 2,
  });
  assert.equal(res.statusCode, 200);
  const { review, faculty } = await state();
  assert.equal(review.status, "ACTIVE");
  assert.equal(review.comment, "Updated honest experience text.");
  assert.equal(faculty.reviewCount, 1);
  assert.equal(faculty.avgRating, 5);
});

test("F-01 [INT] - author can delete then restore their OWN deleted review (legitimate flow preserved)", async () => {
  await seed("ACTIVE");
  const del = await ReviewsTransactionCoordinator.deleteReview({ campusSlug: CAMPUS, facultyId: FACULTY, userId: AUTHOR });
  assert.equal(del.deleted, true);
  assert.equal((await state()).faculty.reviewCount, 0);

  const restored = await ReviewsTransactionCoordinator.restoreReview({ campusSlug: CAMPUS, facultyId: FACULTY, userId: AUTHOR });
  assert.equal(restored.restored, true);
  const { review, faculty } = await state();
  assert.equal(review.status, "ACTIVE");
  assert.equal(faculty.reviewCount, 1);
});

test("F-01 [INT] - author can resubmit after deleting their own review (new submission)", async () => {
  await seed("DELETED");
  const res = await ReviewsTransactionCoordinator.submitOrUpdateReview({
    campusSlug: CAMPUS,
    facultyId: FACULTY,
    userId: AUTHOR,
    ratings: NEW_RATINGS,
    comment: "Fresh review after deleting the old one.",
  });
  assert.equal(res.statusCode, 201);
  assert.equal((await state()).review.status, "ACTIVE");
});

// ─────────────────────────────────────────────────────────────────────────────
// Moderator workflows are preserved; author deletion is respected
// ─────────────────────────────────────────────────────────────────────────────

test("Moderation [INT] - moderator can hide an ACTIVE review and aggregates drop it", async () => {
  await seed("ACTIVE");
  const res = await ReviewsTransactionCoordinator.moderateReview({
    campusSlug: CAMPUS, facultyId: FACULTY, targetUserId: AUTHOR, action: "HIDDEN", reason: "spam",
  });
  assert.equal(res.status, "HIDDEN");
  const { review, faculty } = await state();
  assert.equal(review.status, "HIDDEN");
  assert.equal(review.moderationReason, "spam");
  assert.equal(faculty.reviewCount, 0);
});

test("Moderation [INT] - moderator can restore a HIDDEN review to ACTIVE and aggregates include it again", async () => {
  await seed("HIDDEN");
  const res = await ReviewsTransactionCoordinator.moderateReview({
    campusSlug: CAMPUS, facultyId: FACULTY, targetUserId: AUTHOR, action: "ACTIVE",
  });
  assert.equal(res.status, "ACTIVE");
  const { review, faculty } = await state();
  assert.equal(review.status, "ACTIVE");
  assert.equal(faculty.reviewCount, 1);
});

for (const action of ["ACTIVE", "HIDDEN", "FLAGGED"]) {
  test(`Decision 2 [INT] - moderator cannot apply ${action} to a review deleted by its author`, async () => {
    await seed("DELETED");
    await assertRejects(
      ReviewsTransactionCoordinator.moderateReview({
        campusSlug: CAMPUS, facultyId: FACULTY, targetUserId: AUTHOR, action,
      }),
      { statusCode: 409, code: "REVIEW_DELETED" }
    );
    const { review, faculty } = await state();
    assert.equal(review.status, "DELETED");
    assert.equal(faculty.reviewCount, 0);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// F-03: invalid client input -> 4xx, not generic 500
// ─────────────────────────────────────────────────────────────────────────────

test("F-03 [INT] - invalid moderation action is a 400 ValidationError", async () => {
  await seed("ACTIVE");
  await assertRejects(
    ReviewsTransactionCoordinator.moderateReview({
      campusSlug: CAMPUS, facultyId: FACULTY, targetUserId: AUTHOR, action: "DELETED",
    }),
    { statusCode: 400, code: "VALIDATION_ERROR" }
  );
});

for (const [label, key] of [
  ["contains a path separator", "a/b"],
  ["exceeds 128 characters", "k".repeat(129)],
  ["contains spaces", "has space"],
]) {
  test(`F-03 [INT] - idempotency key that ${label} is a 400, not an internal error`, async () => {
    await seed("ACTIVE");
    await assertRejects(
      ReviewsTransactionCoordinator.deleteReview({
        campusSlug: CAMPUS, facultyId: FACULTY, userId: AUTHOR, idempotencyKey: key,
      }),
      { statusCode: 400, code: "VALIDATION_ERROR" }
    );
    assert.equal((await state()).review.status, "ACTIVE", "rejected request must not mutate state");
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// F-02: public read model hides non-public reviews and author identifiers
// ─────────────────────────────────────────────────────────────────────────────

test("F-02 [INT] - listPublicReviews returns only ACTIVE/legacy reviews, with no author UID or internals", async () => {
  await resetData();
  await facultyRef().set({ name: "Public Read Faculty" });
  const reviews = facultyRef().collection("reviews");
  const base = { ratings: { ...RATINGS, overall: 3 }, comment: "text" };

  await reviews.doc("uid-active").set({ ...base, userId: "uid-active", status: "ACTIVE", comment: "Visible active review" });
  await reviews.doc("uid-legacy").set({
    userId: "uid-legacy", attendance: 4, correction: 4, teaching: 4, approachability: 4, overall: 4, text: "Visible legacy review",
  });
  for (const status of ["HIDDEN", "FLAGGED", "DELETED", "QUARANTINED"]) {
    await reviews.doc(`uid-${status}`).set({ ...base, userId: `uid-${status}`, status, comment: `Secret ${status} text` });
  }

  const result = await listPublicReviews(CAMPUS, FACULTY);
  const comments = result.map((r) => r.comment).sort();
  assert.deepEqual(comments, ["Visible active review", "Visible legacy review"]);

  const legacy = result.find((r) => r.comment === "Visible legacy review");
  assert.equal(legacy.ratings.attendance, 4);
  assert.equal(legacy.ratings.overall, 4);

  const serialized = JSON.stringify(result);
  assert.ok(!serialized.includes("uid-"), "no author UID may appear anywhere in the public payload");
  assert.ok(!serialized.includes("userId"), "userId field must not be exposed");
  for (const r of result) {
    assert.deepEqual(Object.keys(r).sort(), ["comment", "id", "ratings"], "whitelisted fields only");
    assert.match(r.id, /^[0-9a-f]{24}$/, "opaque id");
  }
});

test("F-02 [INT] - GET /api/reviews returns the public payload only, with no-store caching", async () => {
  const { GET } = await import("../../app/api/reviews/route.js");
  const slug = "vit-v";
  const facId = "fac-moderation-get";
  const fac = adminDb.collection("campuses").doc(slug).collection("faculties").doc(facId);
  try {
    await fac.set({ name: "GET Route Faculty" });
    const col = fac.collection("reviews");
    const ratings = { attendance: 5, correction: 4, teaching: 5, approachability: 4, overall: 4.5 };
    await col.doc("real-author-uid-1").set({ userId: "real-author-uid-1", status: "ACTIVE", ratings, comment: "Public one", version: 3, shardId: "2" });
    await col.doc("real-author-uid-2").set({ userId: "real-author-uid-2", status: "HIDDEN", ratings, comment: "Hidden one" });
    await col.doc("real-author-uid-3").set({ userId: "real-author-uid-3", status: "DELETED", ratings, comment: "Deleted one" });

    const res = await GET({ url: `http://localhost:3000/api/reviews?campusSlug=${slug}&facultyId=${facId}` });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("Cache-Control"), "no-store");
    const body = await res.json();

    assert.equal(body.reviews.length, 1);
    assert.equal(body.reviews[0].comment, "Public one");
    assert.deepEqual(body.reviews[0].ratings, ratings);
    const raw = JSON.stringify(body);
    for (const leaked of ["real-author-uid", "userId", "version", "shardId", "HIDDEN", "Hidden one", "Deleted one"]) {
      assert.ok(!raw.includes(leaked), `public payload must not contain '${leaked}'`);
    }
  } finally {
    await adminDb.recursiveDelete(fac);
  }
});

test("F-01 [INT] - restore on a legacy review with no status field is a harmless no-op (treated as ACTIVE)", async () => {
  await resetData();
  await facultyRef().set({ name: "Legacy Faculty", avgRating: 4, reviewCount: 1 });
  await reviewRef().set({ userId: AUTHOR, attendance: 4, correction: 4, teaching: 4, approachability: 4, overall: 4, text: "Legacy review text." });
  const res = await ReviewsTransactionCoordinator.restoreReview({ campusSlug: CAMPUS, facultyId: FACULTY, userId: AUTHOR });
  assert.equal(res.alreadyActive, true);
  const { review, faculty } = await state();
  assert.equal(review.status, undefined, "legacy document must not be rewritten");
  assert.equal(faculty.reviewCount, 1);
});
