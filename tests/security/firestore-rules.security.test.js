/**
 * Dedicated Security Regression Test Suite for Production Firestore Security Rules (Phase 6.1).
 *
 * Requirements Tested:
 * 1. Deny direct client review creation, update, and deletion across all campuses.
 * 2. Deny direct client aggregate and shard writes.
 * 3. Deny direct client request receipt reads and writes.
 * 4. Deny direct client rate-limit quota reads and writes.
 * 5. Deny direct client maintenance document writes (public read permitted).
 * 6. User ownership & Profile security:
 *    - Owner-only read and write on /users/{userId}.
 *    - Schema restriction: only 'campusSlug' permitted.
 *    - Domain-bound campusSlug validation.
 *    - Cross-user profile modification denial.
 *    - Profile deletion denial.
 * 7. Faculty permissions & Public Reads:
 *    - Public read allowed on valid campus faculties and shards.
 *    - Review documents are never client-readable (public reads go through GET /api/reviews).
 *    - Public read on invalid campus denied.
 *    - Direct client faculty creation, update, and deletion denied.
 * 8. Default deny on any undeclared root collections.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "url";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
} from "firebase/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..", "..");
const rulesPath = path.join(root, "firestore.rules");
const rulesContent = readFileSync(rulesPath, "utf8");

const PROJECT_ID = "demo-vitor-security";
const EMULATOR_HOST = "127.0.0.1";
const EMULATOR_PORT = 8087;

let testEnv;

// Identities for testing
const USER_AP = {
  uid: "student_ap_101",
  email: "student101@vitapstudent.ac.in",
};
const USER_BHOPAL = {
  uid: "student_bhopal_202",
  email: "student202@vitbhopal.ac.in",
};
const USER_VELLORE = {
  uid: "student_vellore_303",
  email: "student303@vitstudent.ac.in",
};
const USER_CHENNAI = {
  uid: "student_chennai_404",
  email: "student404@vitstudent.ac.in",
};
const USER_ATTACKER = {
  uid: "attacker_evil_666",
  email: "hacker@evil.com",
};

function validReviewPayload(uid) {
  return {
    userId: uid,
    user: "Anonymous User",
    attendance: 4,
    correction: 4,
    teaching: 5,
    approachability: 5,
    overall: 4.5,
    text: "Clear explanations and very helpful in lab sessions.",
  };
}

test.before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: EMULATOR_HOST,
      port: EMULATOR_PORT,
      rules: rulesContent,
    },
  });
});

test.beforeEach(async () => {
  await testEnv.clearFirestore();

  // Seed baseline documents via security-disabled administrative context
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, "campuses", "vit-ap", "faculties", "fac-ap-1"), {
      name: "Dr. AP Professor",
      department: "CSE",
      avgRating: 4.0,
      reviewCount: 1,
    });
    await setDoc(doc(adminDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", "existing_review"), {
      userId: "existing_review",
      overall: 4.0,
      comment: "Good teaching.",
      status: "ACTIVE",
    });
    // Non-public reviews: must never be readable by clients (F-02)
    for (const status of ["HIDDEN", "FLAGGED", "DELETED"]) {
      const id = `${status.toLowerCase()}_review`;
      await setDoc(doc(adminDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", id), {
        userId: id,
        overall: 1.0,
        comment: `Non-public ${status} text.`,
        status,
      });
    }
    await setDoc(doc(adminDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "shards", "0"), {
      shardId: "0",
      reviewCount: 1,
    });
    await setDoc(doc(adminDb, "system", "reviewMaintenance"), {
      status: "OPEN",
    });

    // Seed dual-campus user profiles
    await setDoc(doc(adminDb, "users", USER_VELLORE.uid), {
      campusSlug: "vit-v",
    });
    await setDoc(doc(adminDb, "users", USER_CHENNAI.uid), {
      campusSlug: "vit-c",
    });
  });
});

test.after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

// ============================================================================
// 1. Direct Client Review Writes Denied (Phase 6.1 Trusted Architecture)
// ============================================================================

test("Security Rules [Trusted Reviews] - direct client review creation is DENIED for authenticated users", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const reviewRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", USER_AP.uid);
  await assertFails(setDoc(reviewRef, validReviewPayload(USER_AP.uid)));
});

test("Security Rules [Trusted Reviews] - direct client review update is DENIED", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const reviewRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", "existing_review");
  await assertFails(updateDoc(reviewRef, { comment: "Tampered review text" }));
});

test("Security Rules [Trusted Reviews] - direct client review deletion is DENIED", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const reviewRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", "existing_review");
  await assertFails(deleteDoc(reviewRef));
});

// ============================================================================
// 2. Direct Client Shard & Aggregate Writes Denied
// ============================================================================

test("Security Rules [Shards] - direct client shard writes are DENIED", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const shardRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "shards", "0");
  await assertFails(updateDoc(shardRef, { reviewCount: 999 }));
  await assertFails(setDoc(shardRef, { reviewCount: 1 }));
});

// ============================================================================
// 3. Request Receipts & Rate Limits Client Access Denied
// ============================================================================

test("Security Rules [Receipts & Quota] - client access to request receipts is DENIED", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const receiptRef = doc(apDb, "campuses", "vit-ap", "requestReceipts", "key-123");
  await assertFails(getDoc(receiptRef));
  await assertFails(setDoc(receiptRef, { payloadHash: "abc" }));
});

test("Security Rules [Receipts & Quota] - client access to rate limit quota is DENIED", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const quotaRef = doc(apDb, "campuses", "vit-ap", "users", USER_AP.uid, "rateLimits", "reviewQuota");
  await assertFails(getDoc(quotaRef));
  await assertFails(setDoc(quotaRef, { timestamps: [] }));
});

// ============================================================================
// 4. Maintenance Gate Permissions
// ============================================================================

test("Security Rules [Maintenance] - client can read maintenance gate status", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const gateRef = doc(apDb, "system", "reviewMaintenance");
  await assertSucceeds(getDoc(gateRef));
});

test("Security Rules [Maintenance] - client write to maintenance gate is DENIED", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const gateRef = doc(apDb, "system", "reviewMaintenance");
  await assertFails(setDoc(gateRef, { status: "CLOSED" }));
});

// ============================================================================
// 5. User Profile Permissions & Validation
// ============================================================================

test("Security Rules [Profile] - user can read their own profile", async () => {
  const velloreDb = testEnv.authenticatedContext(USER_VELLORE.uid, { email: USER_VELLORE.email }).firestore();
  const userRef = doc(velloreDb, "users", USER_VELLORE.uid);
  await assertSucceeds(getDoc(userRef));
});

test("Security Rules [Profile] - user cannot read another user's profile", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const velloreUserRef = doc(apDb, "users", USER_VELLORE.uid);
  await assertFails(getDoc(velloreUserRef));
});

test("Security Rules [Profile] - user cannot modify another user's profile", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const velloreUserRef = doc(apDb, "users", USER_VELLORE.uid);
  await assertFails(setDoc(velloreUserRef, { campusSlug: "vit-v" }));
});

test("Security Rules [Profile] - dual-campus user can set valid campus preference (vit-v or vit-c)", async () => {
  const user = { uid: "dual_new_1", email: "newstudent@vitstudent.ac.in" };
  const userDb = testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
  const userRef = doc(userDb, "users", user.uid);
  await assertSucceeds(setDoc(userRef, { campusSlug: "vit-v" }));
  await assertSucceeds(setDoc(userRef, { campusSlug: "vit-c" }));
});

test("Security Rules [Profile] - dual-campus user cannot set non-dual campus (vit-ap or vit-b)", async () => {
  const user = { uid: "dual_new_2", email: "newstudent2@vitstudent.ac.in" };
  const userDb = testEnv.authenticatedContext(user.uid, { email: user.email }).firestore();
  const userRef = doc(userDb, "users", user.uid);
  await assertFails(setDoc(userRef, { campusSlug: "vit-ap" }));
  await assertFails(setDoc(userRef, { campusSlug: "vit-b" }));
});

test("Security Rules [Profile] - arbitrary or protected fields (e.g. role, admin) are denied", async () => {
  const velloreDb = testEnv.authenticatedContext(USER_VELLORE.uid, { email: USER_VELLORE.email }).firestore();
  const userRef = doc(velloreDb, "users", USER_VELLORE.uid);
  await assertFails(setDoc(userRef, { campusSlug: "vit-v", role: "admin" }));
  await assertFails(setDoc(userRef, { campusSlug: "vit-v", isAdmin: true }));
});

test("Security Rules [Profile] - profile deletion is denied", async () => {
  const velloreDb = testEnv.authenticatedContext(USER_VELLORE.uid, { email: USER_VELLORE.email }).firestore();
  const userRef = doc(velloreDb, "users", USER_VELLORE.uid);
  await assertFails(deleteDoc(userRef));
});

// ============================================================================
// 6. Public Reads & Faculty Permissions
// ============================================================================

test("Security Rules [Public Reads] - public read allowed on valid campus faculties and shards", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const facRef = doc(unauthDb, "campuses", "vit-ap", "faculties", "fac-ap-1");
  const shardRef = doc(unauthDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "shards", "0");

  await assertSucceeds(getDoc(facRef));
  await assertSucceeds(getDoc(shardRef));
});

// F-02 regression: review documents are keyed by the author's UID and carry moderation
// status, so clients must never read them directly (public reads go via GET /api/reviews).
test("Security Rules [Reviews Privacy] - unauthenticated clients cannot read any review document", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  for (const id of ["existing_review", "hidden_review", "flagged_review", "deleted_review"]) {
    await assertFails(
      getDoc(doc(unauthDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", id))
    );
  }
});

test("Security Rules [Reviews Privacy] - unauthenticated clients cannot list the reviews collection", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(
    getDocs(collection(unauthDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews"))
  );
});

test("Security Rules [Reviews Privacy] - authenticated students cannot read or list reviews, including their own", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  await assertFails(
    getDoc(doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", USER_AP.uid))
  );
  await assertFails(
    getDoc(doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", "hidden_review"))
  );
  await assertFails(
    getDocs(collection(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews"))
  );
});

test("Security Rules [Public Reads] - public read on invalid campus is denied", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const invalidRef = doc(unauthDb, "campuses", "invalid-campus", "faculties", "fac-1");
  await assertFails(getDoc(invalidRef));
});

test("Security Rules [Faculty Permissions] - direct client faculty creation/update/deletion is denied", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const facRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1");
  await assertFails(updateDoc(facRef, { avgRating: 5.0 }));
  await assertFails(deleteDoc(facRef));
  await assertFails(setDoc(doc(apDb, "campuses", "vit-ap", "faculties", "new-fac"), { name: "Fake" }));
});

// ============================================================================
// 7. Default Deny Tests
// ============================================================================

test("Security Rules [Default Deny] - undeclared root collections are denied for read and write", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const secretRef = doc(apDb, "admin_secrets", "config");
  await assertFails(getDoc(secretRef));
  await assertFails(setDoc(secretRef, { secret: "exposed" }));
});
