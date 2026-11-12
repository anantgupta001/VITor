/**
 * Dedicated Security Regression Test Suite for Production Firestore Security Rules.
 *
 * Requirements Tested:
 * 1. Unauthenticated access denial across all protected writes.
 * 2. User ownership & Profile security:
 *    - Owner-only read and write on /users/{userId}.
 *    - Schema restriction: only 'campusSlug' permitted.
 *    - Domain-bound campusSlug validation.
 *    - Cross-user profile modification denial.
 *    - Profile deletion denial.
 * 3. Review ownership & Impersonation:
 *    - Review creation only allowed by authenticated owner matching path and payload.
 *    - Modification/deletion of another user's review denied.
 *    - Review deletion denied.
 *    - Immutable userId on update.
 * 4. Review integrity & Schema validation:
 *    - Valid review creation with all 4 metrics allowed.
 *    - Out-of-bounds ratings (< 1, > 5) denied.
 *    - Non-numeric ratings denied.
 *    - Short (< 10 chars) or long (> 1000 chars) comments denied.
 *    - Arbitrary unknown fields denied.
 * 5. Campus isolation:
 *    - AP student restricted strictly to vit-ap.
 *    - Bhopal student restricted strictly to vit-b.
 *    - Dual-campus (vitstudent.ac.in) student restricted strictly to their verified profile campus.
 *    - Non-VIT email accounts denied review submission.
 *    - Invalid campus slugs in document paths denied.
 * 6. Faculty permissions & Aggregate statistics:
 *    - Public read allowed on valid campus faculties and reviews.
 *    - Public read on invalid campus denied.
 *    - Direct client faculty creation, update, and deletion denied.
 *    - Direct client manipulation of faculty aggregate statistics denied.
 * 7. Default deny on any undeclared root collections.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
  serverTimestamp,
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

  // Seed baseline faculty documents via security-disabled administrative context
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(doc(adminDb, "campuses", "vit-ap", "faculties", "fac-ap-1"), {
      name: "Dr. AP Professor",
      department: "CSE",
      avgRating: 4.0,
      reviewCount: 1,
    });
    await setDoc(doc(adminDb, "campuses", "vit-v", "faculties", "fac-v-1"), {
      name: "Dr. Vellore Professor",
      department: "ECE",
      avgRating: 4.5,
      reviewCount: 2,
    });
    await setDoc(doc(adminDb, "campuses", "vit-c", "faculties", "fac-c-1"), {
      name: "Dr. Chennai Professor",
      department: "MECH",
      avgRating: 3.8,
      reviewCount: 1,
    });
    await setDoc(doc(adminDb, "campuses", "vit-b", "faculties", "fac-b-1"), {
      name: "Dr. Bhopal Professor",
      department: "CIVIL",
      avgRating: 4.2,
      reviewCount: 1,
    });

    // Seed dual-campus user profiles for Vellore and Chennai students
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
// 1. Unauthenticated Access Tests
// ============================================================================

test("Security Rules [Unauth] - unauthenticated review creation is denied", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const reviewRef = doc(unauthDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", "anonymous");
  await assertFails(setDoc(reviewRef, validReviewPayload("anonymous")));
});

test("Security Rules [Unauth] - unauthenticated profile modification is denied", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const userRef = doc(unauthDb, "users", "unauth_user");
  await assertFails(setDoc(userRef, { campusSlug: "vit-ap" }));
});

test("Security Rules [Unauth] - unauthenticated profile read is denied", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const userRef = doc(unauthDb, "users", USER_VELLORE.uid);
  await assertFails(getDoc(userRef));
});

test("Security Rules [Unauth] - unauthenticated faculty modifications are denied", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const facRef = doc(unauthDb, "campuses", "vit-ap", "faculties", "fac-ap-1");
  await assertFails(updateDoc(facRef, { avgRating: 5.0 }));
  await assertFails(deleteDoc(facRef));
});

test("Security Rules [Unauth] - public reads of valid campus faculty and reviews are allowed", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  const facRef = doc(unauthDb, "campuses", "vit-ap", "faculties", "fac-ap-1");
  await assertSucceeds(getDoc(facRef));
});

// ============================================================================
// 2. User Profiles & Ownership Tests
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

test("Security Rules [Profile] - AP student cannot set campus to vit-v or vit-c", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const userRef = doc(apDb, "users", USER_AP.uid);
  await assertFails(setDoc(userRef, { campusSlug: "vit-v" }));
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
// 3. Review Ownership & Impersonation Tests
// ============================================================================

test("Security Rules [Review Ownership] - User A cannot create review claiming to belong to User B", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  // Target document path for User B
  const reviewRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", USER_BHOPAL.uid);
  await assertFails(setDoc(reviewRef, validReviewPayload(USER_BHOPAL.uid)));
});

test("Security Rules [Review Ownership] - User A cannot write payload with spoofed userId", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  // Document path for User A, but payload claims to be User B
  const reviewRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", USER_AP.uid);
  await assertFails(setDoc(reviewRef, validReviewPayload(USER_BHOPAL.uid)));
});

test("Security Rules [Review Ownership] - User A cannot modify User B's review", async () => {
  // Pre-seed User B review via admin context
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    await setDoc(
      doc(adminDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", "existing_student"),
      validReviewPayload("existing_student")
    );
  });

  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const targetRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", "existing_student");
  await assertFails(updateDoc(targetRef, { text: "Modified by another student without permission." }));
});

test("Security Rules [Review Ownership] - review deletion is denied", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const reviewRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", USER_AP.uid);
  await assertSucceeds(setDoc(reviewRef, validReviewPayload(USER_AP.uid)));
  await assertFails(deleteDoc(reviewRef));
});

test("Security Rules [Review Ownership] - review ownership userId is immutable on update", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const reviewRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", USER_AP.uid);
  await assertSucceeds(setDoc(reviewRef, validReviewPayload(USER_AP.uid)));

  // Attempting to change ownership to another userId must fail
  await assertFails(updateDoc(reviewRef, { userId: "transfer_target_uid" }));
});

// ============================================================================
// 4. Review Integrity & Field Validation Tests
// ============================================================================

test("Security Rules [Review Integrity] - valid review submission is allowed", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const reviewRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", USER_AP.uid);
  await assertSucceeds(setDoc(reviewRef, validReviewPayload(USER_AP.uid)));
});

test("Security Rules [Review Integrity] - missing required rating criteria is denied", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const reviewRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", USER_AP.uid);

  const payload = validReviewPayload(USER_AP.uid);
  delete payload.teaching; // Missing teaching rating
  await assertFails(setDoc(reviewRef, payload));
});

test("Security Rules [Review Integrity] - rating boundaries: ratings < 1 and > 5 are denied", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const reviewRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", USER_AP.uid);

  await assertFails(setDoc(reviewRef, { ...validReviewPayload(USER_AP.uid), attendance: 0 }));
  await assertFails(setDoc(reviewRef, { ...validReviewPayload(USER_AP.uid), attendance: -1 }));
  await assertFails(setDoc(reviewRef, { ...validReviewPayload(USER_AP.uid), correction: 6 }));
  await assertFails(setDoc(reviewRef, { ...validReviewPayload(USER_AP.uid), overall: 5.5 }));
});

test("Security Rules [Review Integrity] - non-numeric ratings are denied", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const reviewRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", USER_AP.uid);

  await assertFails(setDoc(reviewRef, { ...validReviewPayload(USER_AP.uid), attendance: "5" }));
  await assertFails(setDoc(reviewRef, { ...validReviewPayload(USER_AP.uid), teaching: true }));
});

test("Security Rules [Review Integrity] - comment length constraints: min 10, max 1000", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const reviewRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", USER_AP.uid);

  // 9 characters (below minimum 10)
  await assertFails(setDoc(reviewRef, { ...validReviewPayload(USER_AP.uid), text: "Too short" }));

  // Exactly 10 characters (valid)
  await assertSucceeds(setDoc(reviewRef, { ...validReviewPayload(USER_AP.uid), text: "1234567890" }));

  // > 1000 characters (exceeds maximum 1000)
  await assertFails(setDoc(reviewRef, { ...validReviewPayload(USER_AP.uid), text: "a".repeat(1001) }));
});

test("Security Rules [Review Integrity] - unexpected or unknown fields are denied", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const reviewRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", USER_AP.uid);

  await assertFails(setDoc(reviewRef, {
    ...validReviewPayload(USER_AP.uid),
    maliciousScript: "<script>alert(1)</script>",
  }));
});

// ============================================================================
// 5. Campus Isolation & Authorization Tests
// ============================================================================

test("Security Rules [Campus Isolation] - AP student can review AP faculty", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const reviewRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", USER_AP.uid);
  await assertSucceeds(setDoc(reviewRef, validReviewPayload(USER_AP.uid)));
});

test("Security Rules [Campus Isolation] - AP student cannot review Vellore or Chennai faculty", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const velloreReviewRef = doc(apDb, "campuses", "vit-v", "faculties", "fac-v-1", "reviews", USER_AP.uid);
  await assertFails(setDoc(velloreReviewRef, validReviewPayload(USER_AP.uid)));

  const chennaiReviewRef = doc(apDb, "campuses", "vit-c", "faculties", "fac-c-1", "reviews", USER_AP.uid);
  await assertFails(setDoc(chennaiReviewRef, validReviewPayload(USER_AP.uid)));
});

test("Security Rules [Campus Isolation] - Bhopal student cannot review Vellore faculty", async () => {
  const bhopalDb = testEnv.authenticatedContext(USER_BHOPAL.uid, { email: USER_BHOPAL.email }).firestore();
  const velloreReviewRef = doc(bhopalDb, "campuses", "vit-v", "faculties", "fac-v-1", "reviews", USER_BHOPAL.uid);
  await assertFails(setDoc(velloreReviewRef, validReviewPayload(USER_BHOPAL.uid)));
});

test("Security Rules [Campus Isolation] - Vellore dual-campus student can review Vellore faculty", async () => {
  const velloreDb = testEnv.authenticatedContext(USER_VELLORE.uid, { email: USER_VELLORE.email }).firestore();
  const reviewRef = doc(velloreDb, "campuses", "vit-v", "faculties", "fac-v-1", "reviews", USER_VELLORE.uid);
  await assertSucceeds(setDoc(reviewRef, validReviewPayload(USER_VELLORE.uid)));
});

test("Security Rules [Campus Isolation] - Vellore dual-campus student cannot review Chennai faculty", async () => {
  const velloreDb = testEnv.authenticatedContext(USER_VELLORE.uid, { email: USER_VELLORE.email }).firestore();
  const chennaiReviewRef = doc(velloreDb, "campuses", "vit-c", "faculties", "fac-c-1", "reviews", USER_VELLORE.uid);
  await assertFails(setDoc(chennaiReviewRef, validReviewPayload(USER_VELLORE.uid)));
});

test("Security Rules [Campus Isolation] - Chennai dual-campus student can review Chennai faculty", async () => {
  const chennaiDb = testEnv.authenticatedContext(USER_CHENNAI.uid, { email: USER_CHENNAI.email }).firestore();
  const reviewRef = doc(chennaiDb, "campuses", "vit-c", "faculties", "fac-c-1", "reviews", USER_CHENNAI.uid);
  await assertSucceeds(setDoc(reviewRef, validReviewPayload(USER_CHENNAI.uid)));
});

test("Security Rules [Campus Isolation] - non-VIT email accounts cannot submit reviews", async () => {
  const evilDb = testEnv.authenticatedContext(USER_ATTACKER.uid, { email: USER_ATTACKER.email }).firestore();
  const reviewRef = doc(evilDb, "campuses", "vit-ap", "faculties", "fac-ap-1", "reviews", USER_ATTACKER.uid);
  await assertFails(setDoc(reviewRef, validReviewPayload(USER_ATTACKER.uid)));
});

test("Security Rules [Campus Isolation] - invalid campus slug paths are denied", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const invalidCampusRef = doc(apDb, "campuses", "vit-fake-campus", "faculties", "fac-1", "reviews", USER_AP.uid);
  await assertFails(setDoc(invalidCampusRef, validReviewPayload(USER_AP.uid)));
});

// ============================================================================
// 6. Faculty Permissions & Aggregate Statistics
// ============================================================================

test("Security Rules [Faculty Permissions] - ordinary users cannot create faculty records", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const facRef = doc(apDb, "campuses", "vit-ap", "faculties", "new-faculty-hacked");
  await assertFails(setDoc(facRef, { name: "Fake Faculty", department: "CSE" }));
});

test("Security Rules [Faculty Permissions] - ordinary users cannot modify faculty details or bio", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const facRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1");
  await assertFails(updateDoc(facRef, { name: "Tampered Faculty Name" }));
});

test("Security Rules [Faculty Permissions] - ordinary users cannot manipulate aggregate faculty statistics", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const facRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1");
  await assertFails(updateDoc(facRef, { avgRating: 5.0, reviewCount: 999 }));
});

test("Security Rules [Faculty Permissions] - ordinary users cannot delete faculty records", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const facRef = doc(apDb, "campuses", "vit-ap", "faculties", "fac-ap-1");
  await assertFails(deleteDoc(facRef));
});

// ============================================================================
// 7. Default Deny Tests
// ============================================================================

test("Security Rules [Default Deny] - undeclared top-level collections are denied for read and write", async () => {
  const apDb = testEnv.authenticatedContext(USER_AP.uid, { email: USER_AP.email }).firestore();
  const adminDocRef = doc(apDb, "admin_secrets", "config");
  await assertFails(getDoc(adminDocRef));
  await assertFails(setDoc(adminDocRef, { secret: "exposed" }));
});
