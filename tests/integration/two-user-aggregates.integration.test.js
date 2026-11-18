/**
 * Integration Test: two different users' reviews update persisted aggregates
 * through the trusted review API.
 *
 * Drives the REAL `POST /api/reviews` route handler, which runs authorization,
 * validation and the real ReviewsTransactionCoordinator against the Firestore
 * Emulator. Only `adminAuth.verifyIdToken` is stubbed (no real Firebase Auth
 * backend in the test environment); App Check is bypassed outside production
 * exactly as in the other integration tests. Requires FIRESTORE_EMULATOR_HOST,
 * which scripts/run-integration-tests.mjs sets.
 *
 * Scenario: user A submits all-5 ratings, user B submits all-1 ratings for the
 * same faculty. Persisted reviews, shards and faculty aggregates must reflect
 * exactly those two ACTIVE reviews, with every average equal to 3.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { adminAuth, adminDb } from "../../lib/firebase/admin.js";
import { POST as reviewPost } from "../../app/api/reviews/route.js";
import { combineShards, getShardDocId, getShardId, NUM_SHARDS, SHARD_SCHEME_VERSION } from "../../lib/server/aggregates.js";

// "vit-ap" is a real campus slug (required by route authorization); the faculty id is
// unique to this test and only this faculty's data is created and deleted.
const CAMPUS = "vit-ap";
const FACULTY = "fac-int-two-user-aggregates";
const EMAIL_DOMAIN = "vitapstudent.ac.in";

const USER_A = { uid: "agg-user-a-uid-0001", token: "token-user-a", key: "agg-two-user-key-a-0001" };
const USER_B = { uid: "agg-user-b-uid-0002", token: "token-user-b", key: "agg-two-user-key-b-0002" };
const USERS = [USER_A, USER_B];

const RATINGS_A = { attendance: 5, correction: 5, teaching: 5, approachability: 5 };
const RATINGS_B = { attendance: 1, correction: 1, teaching: 1, approachability: 1 };
const CRITERIA = ["attendance", "correction", "teaching", "approachability"];

const campusRef = () => adminDb.collection("campuses").doc(CAMPUS);
const facultyRef = () => campusRef().collection("faculties").doc(FACULTY);

async function cleanup() {
  await adminDb.recursiveDelete(facultyRef());
  for (const u of USERS) {
    await adminDb.recursiveDelete(campusRef().collection("users").doc(u.uid));
    await campusRef().collection("requestReceipts").doc(u.key).delete();
  }
}

async function reset() {
  await cleanup();
  await facultyRef().set({ name: "Two User Aggregate Faculty", reviewCount: 0, avgRating: 0 });
}

function submitRequest(user, ratings, comment) {
  return new Request("http://localhost:3000/api/reviews", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${user.token}`,
      "idempotency-key": user.key,
    },
    body: JSON.stringify({ campusSlug: CAMPUS, facultyId: FACULTY, ratings, comment }),
  });
}

test.after(async () => {
  await cleanup();
});

test("Trusted API [INT] - two different users' reviews update persisted aggregates to the arithmetic mean", async (t) => {
  await reset();

  const usersByToken = new Map(
    USERS.map((u) => [u.token, { uid: u.uid, email: `${u.uid}@${EMAIL_DOMAIN}`, email_verified: true }])
  );
  t.mock.method(adminAuth, "verifyIdToken", async (token) => {
    const decoded = usersByToken.get(token);
    if (!decoded) throw new Error("unknown test token");
    return decoded;
  });

  // ── Both submissions succeed (sequentially, deterministic order) ──────────
  const resA = await reviewPost(submitRequest(USER_A, RATINGS_A, "Excellent teaching and always approachable."));
  const bodyA = await resA.json();
  assert.equal(resA.status, 201, JSON.stringify(bodyA));
  assert.equal(bodyA.success, true);

  const resB = await reviewPost(submitRequest(USER_B, RATINGS_B, "Classes were hard to follow and rushed."));
  const bodyB = await resB.json();
  assert.equal(resB.status, 201, JSON.stringify(bodyB));
  assert.equal(bodyB.success, true);

  // ── Persisted review documents: exactly two, both ACTIVE ──────────────────
  const reviewsSnap = await facultyRef().collection("reviews").get();
  assert.equal(reviewsSnap.size, 2, "exactly two review documents, no duplicates");
  assert.deepEqual(reviewsSnap.docs.map((d) => d.id).sort(), [USER_A.uid, USER_B.uid].sort());

  const reviews = Object.fromEntries(reviewsSnap.docs.map((d) => [d.id, d.data()]));
  assert.equal(reviewsSnap.docs.filter((d) => d.data().status === "ACTIVE").length, 2, "both reviews are ACTIVE");
  for (const [uid, ratings, overall] of [
    [USER_A.uid, RATINGS_A, 5],
    [USER_B.uid, RATINGS_B, 1],
  ]) {
    const review = reviews[uid];
    assert.equal(review.userId, uid);
    assert.equal(review.status, "ACTIVE");
    assert.equal(review.version, 1);
    for (const key of CRITERIA) assert.equal(review.ratings[key], ratings[key], `${uid} ${key}`);
    assert.equal(review.overall, overall);
  }

  // ── Persisted shards: only the two deterministically assigned shards ──────
  const expectedShards = {};
  for (const [user, ratings, overall] of [
    [USER_A, RATINGS_A, 5],
    [USER_B, RATINGS_B, 1],
  ]) {
    const docId = getShardDocId(SHARD_SCHEME_VERSION, getShardId(user.uid, NUM_SHARDS));
    const acc = (expectedShards[docId] ||= {
      reviewCount: 0,
      attendanceSum: 0,
      correctionSum: 0,
      teachingSum: 0,
      approachabilitySum: 0,
      overallSum: 0,
    });
    acc.reviewCount += 1;
    for (const key of CRITERIA) acc[`${key}Sum`] += ratings[key];
    acc.overallSum += overall;
  }

  const shardsSnap = await facultyRef().collection("shards").get();
  const allowedShardIds = Array.from({ length: NUM_SHARDS }, (_, i) => getShardDocId(SHARD_SCHEME_VERSION, String(i)));
  for (const d of shardsSnap.docs) {
    assert.ok(allowedShardIds.includes(d.id), `unexpected shard document '${d.id}'`);
  }
  assert.deepEqual(
    shardsSnap.docs.map((d) => d.id).sort(),
    Object.keys(expectedShards).sort(),
    "only the shards assigned to the two users exist"
  );
  for (const d of shardsSnap.docs) {
    const shard = d.data();
    const expected = expectedShards[d.id];
    for (const field of Object.keys(expected)) {
      assert.equal(shard[field], expected[field], `shard ${d.id} ${field}`);
    }
  }

  // Shard totals across both reviews: count 2, each criterion sums to 5 + 1 = 6.
  const shardDocs = shardsSnap.docs.map((d) => d.data());
  assert.equal(shardDocs.reduce((n, s) => n + s.reviewCount, 0), 2);
  for (const key of CRITERIA) {
    assert.equal(shardDocs.reduce((n, s) => n + s[`${key}Sum`], 0), 6, `${key} sum`);
  }
  assert.equal(shardDocs.reduce((n, s) => n + s.overallSum, 0), 6, "overall sum");

  // ── Persisted faculty aggregates: arithmetic mean of 5 and 1 is 3 ─────────
  const faculty = (await facultyRef().get()).data();
  assert.equal(faculty.reviewCount, 2);
  assert.equal(faculty.avgAttendance, 3);
  assert.equal(faculty.avgCorrection, 3);
  assert.equal(faculty.avgTeaching, 3);
  assert.equal(faculty.avgApproachability, 3);
  assert.equal(faculty.avgRating, 3);

  // Faculty document agrees with the existing aggregate implementation over the persisted shards.
  const combined = combineShards(shardDocs);
  for (const key of ["reviewCount", "avgAttendance", "avgCorrection", "avgTeaching", "avgApproachability", "avgRating"]) {
    assert.equal(faculty[key], combined[key], `faculty.${key} matches combineShards(persisted shards)`);
  }

  // The second response reports the same aggregate that was persisted.
  assert.equal(bodyB.updatedStats.reviewCount, 2);
  assert.equal(bodyB.updatedStats.avgRating, 3);
});
