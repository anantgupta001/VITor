import test from "node:test";
import assert from "node:assert/strict";
import {
  AuthError,
  authenticateRequest,
  verifyAppCheck,
  getAuthorizedCampusGroup,
  getAuthorizedCampuses,
  resolveTrustedUserCampus,
  authorizeFacultyAccess,
  isAuthorizedModerator,
} from "../lib/server/campus-auth.js";
import { adminAuth, adminDb, adminAppCheck } from "../lib/firebase/admin.js";

// ============================================================================
// Token Authentication & Revocation Tests
// ============================================================================

test("Campus Auth - authenticateRequest validates Bearer token and email verification", async (t) => {
  const mockDecoded = {
    uid: "student-101",
    email: "student@vitapstudent.ac.in",
    email_verified: true,
  };

  const verifyIdTokenMock = t.mock.method(adminAuth, "verifyIdToken", async (token, checkRevoked) => {
    assert.equal(token, "valid-jwt-token");
    assert.equal(checkRevoked, true, "verifyIdToken MUST be called with checkRevoked=true");
    return mockDecoded;
  });

  const req = {
    headers: {
      get: (h) => (h === "authorization" ? "Bearer valid-jwt-token" : null),
    },
  };

  const result = await authenticateRequest(req);
  assert.deepEqual(result, mockDecoded);
  assert.equal(verifyIdTokenMock.mock.callCount(), 1);
});

test("Campus Auth - authenticateRequest rejects revoked ID token with 401", async (t) => {
  t.mock.method(adminAuth, "verifyIdToken", async () => {
    const err = new Error("Token revoked");
    err.code = "auth/id-token-revoked";
    throw err;
  });

  const req = {
    headers: {
      get: (h) => (h === "authorization" ? "Bearer revoked-token" : null),
    },
  };

  await assert.rejects(
    () => authenticateRequest(req),
    (err) => {
      assert.ok(err instanceof AuthError);
      assert.equal(err.statusCode, 401);
      assert.equal(err.code, "TOKEN_REVOKED");
      return true;
    }
  );
});

test("Campus Auth - authenticateRequest rejects unverified email with 403", async (t) => {
  t.mock.method(adminAuth, "verifyIdToken", async () => ({
    uid: "student-unverified",
    email: "student@vitapstudent.ac.in",
    email_verified: false,
  }));

  const req = {
    headers: {
      get: (h) => (h === "authorization" ? "Bearer token-unverified-email" : null),
    },
  };

  await assert.rejects(
    () => authenticateRequest(req),
    (err) => {
      assert.ok(err instanceof AuthError);
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, "EMAIL_NOT_VERIFIED");
      return true;
    }
  );
});

test("Campus Auth - authenticateRequest rejects missing or malformed header", async () => {
  const noHeaderReq = { headers: { get: () => null } };
  await assert.rejects(
    () => authenticateRequest(noHeaderReq),
    /Missing or malformed Authorization header/
  );

  const basicHeaderReq = { headers: { get: () => "Basic xyz" } };
  await assert.rejects(
    () => authenticateRequest(basicHeaderReq),
    /Missing or malformed Authorization header/
  );
});

// ============================================================================
// App Check Tests & Production Enforcement
// ============================================================================

test("Campus Auth - verifyAppCheck verifies valid token and rejects invalid token", async (t) => {
  t.mock.method(adminAppCheck, "verifyToken", async (token) => {
    if (token === "valid-appcheck-token") {
      return { appId: "vitor-web-app" };
    }
    throw new Error("Invalid app check token");
  });

  // Valid token
  const validReq = { headers: { get: (h) => (h === "x-firebase-appcheck" ? "valid-appcheck-token" : null) } };
  const verified = await verifyAppCheck(validReq);
  assert.deepEqual(verified, { appId: "vitor-web-app" });

  // Invalid token -> 401
  const invalidReq = { headers: { get: (h) => (h === "x-firebase-appcheck" ? "bad-token" : null) } };
  await assert.rejects(
    () => verifyAppCheck(invalidReq),
    (err) => {
      assert.ok(err instanceof AuthError);
      assert.equal(err.statusCode, 401);
      assert.equal(err.code, "APP_CHECK_INVALID");
      return true;
    }
  );
});

test("Campus Auth - verifyAppCheck is strictly mandatory in production mode", async () => {
  const origEnv = process.env.NODE_ENV;
  const origBypass = process.env.DISABLE_APP_CHECK_FOR_TESTS;

  try {
    process.env.NODE_ENV = "production";
    process.env.DISABLE_APP_CHECK_FOR_TESTS = "true"; // Must be IGNORED in production!

    const missingReq = { headers: { get: () => null } };
    await assert.rejects(
      () => verifyAppCheck(missingReq),
      (err) => {
        assert.ok(err instanceof AuthError);
        assert.equal(err.statusCode, 401);
        assert.equal(err.code, "APP_CHECK_MISSING");
        return true;
      }
    );
  } finally {
    process.env.NODE_ENV = origEnv;
    process.env.DISABLE_APP_CHECK_FOR_TESTS = origBypass;
  }
});

// ============================================================================
// Trusted Campus Resolution Tests (Final Approved Policy)
// ============================================================================

test("Campus Auth - domain mapping and authorized groups", () => {
  // vitapstudent.ac.in -> vit-ap
  assert.equal(getAuthorizedCampusGroup({ email: "student@vitapstudent.ac.in" }), "vit-ap");
  assert.deepEqual(getAuthorizedCampuses({ email: "student@vitapstudent.ac.in" }), ["vit-ap"]);

  // vitbhopal.ac.in -> vit-b
  assert.equal(getAuthorizedCampusGroup({ email: "student@vitbhopal.ac.in" }), "vit-b");
  assert.deepEqual(getAuthorizedCampuses({ email: "student@vitbhopal.ac.in" }), ["vit-b"]);

  // vitstudent.ac.in -> vit-vc (interchangeable access to both Vellore and Chennai)
  assert.equal(getAuthorizedCampusGroup({ email: "student@vitstudent.ac.in" }), "vit-vc");
  assert.deepEqual(getAuthorizedCampuses({ email: "student@vitstudent.ac.in" }), ["vit-v", "vit-c"]);
});

test("Campus Auth - ignores client attempts to manipulate authorization fields", async () => {
  // Attacker provides vitapstudent.ac.in email but injects fake campusSlug in token
  const manipulatedToken = {
    uid: "attacker-1",
    email: "student@vitapstudent.ac.in",
    campusSlug: "vit-v",
    authorizedCampus: "vit-v",
    role: "admin",
  };

  // Group must still be derived 100% from email domain
  assert.equal(getAuthorizedCampusGroup(manipulatedToken), "vit-ap");
  assert.deepEqual(getAuthorizedCampuses(manipulatedToken), ["vit-ap"]);
});

test("Campus Auth - resolveTrustedUserCampus rejects unauthorized domains with 403", async () => {
  await assert.rejects(
    () => resolveTrustedUserCampus({ email: "attacker@gmail.com" }),
    /Email domain '@gmail.com' is not authorized/
  );
  await assert.rejects(
    () => resolveTrustedUserCampus({ email: "random@yahoo.com" }),
    /Email domain '@yahoo.com' is not authorized/
  );
});

// ============================================================================
// Cross-Campus & Faculty Access Tests
// ============================================================================

test("Campus Auth - dual campus vitstudent.ac.in can access both vit-v and vit-c faculty", async (t) => {
  const dualToken = { uid: "student-dual", email: "student@vitstudent.ac.in" };

  // Mock faculty doc
  t.mock.method(adminDb, "collection", (col) => {
    return {
      doc: (campusId) => ({
        collection: (subCol) => ({
          doc: (facId) => ({
            get: async () => ({
              exists: true,
              id: facId,
              data: () => ({ name: "Prof. Test" }),
            }),
          }),
        }),
      }),
    };
  });

  // Accessing Vellore faculty -> allowed
  const resV = await authorizeFacultyAccess({ decodedToken: dualToken, campusSlug: "vit-v", facultyId: "fac-v1" });
  assert.equal(resV.authGroup, "vit-vc");
  assert.deepEqual(resV.authorizedCampuses, ["vit-v", "vit-c"]);

  // Accessing Chennai faculty -> allowed
  const resC = await authorizeFacultyAccess({ decodedToken: dualToken, campusSlug: "vit-c", facultyId: "fac-c1" });
  assert.equal(resC.authGroup, "vit-vc");
  assert.deepEqual(resC.authorizedCampuses, ["vit-v", "vit-c"]);
});

test("Campus Auth - authorizeFacultyAccess rejects cross-campus requests", async () => {
  // AP student requests vit-v -> denied
  const apToken = { uid: "student-ap", email: "student@vitapstudent.ac.in" };
  await assert.rejects(
    () => authorizeFacultyAccess({ decodedToken: apToken, campusSlug: "vit-v", facultyId: "fac-1" }),
    (err) => {
      assert.ok(err instanceof AuthError);
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, "CROSS_CAMPUS_DENIED");
      return true;
    }
  );

  // Dual campus student requests vit-ap -> denied
  const dualToken = { uid: "student-dual", email: "student@vitstudent.ac.in" };
  await assert.rejects(
    () => authorizeFacultyAccess({ decodedToken: dualToken, campusSlug: "vit-ap", facultyId: "fac-ap1" }),
    (err) => {
      assert.ok(err instanceof AuthError);
      assert.equal(err.statusCode, 403);
      assert.equal(err.code, "CROSS_CAMPUS_DENIED");
      return true;
    }
  );
});

// ============================================================================
// Moderator Authorization Tests
// ============================================================================

test("Campus Auth - isAuthorizedModerator recognizes custom claims and server admin emails", () => {
  // Custom claim admin
  assert.equal(isAuthorizedModerator({ admin: true }), true);
  // Custom claim moderator
  assert.equal(isAuthorizedModerator({ moderator: true }), true);

  // Normal student without admin privileges
  assert.equal(isAuthorizedModerator({ email: "regular.student@vitapstudent.ac.in" }), false);

  // Server ADMIN_EMAILS environment check
  process.env.ADMIN_EMAILS = "admin1@vitor.org, moderator@vitor.org";
  assert.equal(isAuthorizedModerator({ email: "admin1@vitor.org" }), true);
  assert.equal(isAuthorizedModerator({ email: "MODERATOR@VITOR.ORG" }), true);
  assert.equal(isAuthorizedModerator({ email: "hacker@evil.com" }), false);
});
