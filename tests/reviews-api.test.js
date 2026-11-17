import test from "node:test";
import assert from "node:assert/strict";
import { POST as reviewPost, DELETE as reviewDelete } from "../app/api/reviews/route.js";
import { POST as restorePost } from "../app/api/reviews/restore/route.js";
import { POST as moderatePost } from "../app/api/reviews/moderate/route.js";
import { adminAuth, adminDb, adminAppCheck } from "../lib/firebase/admin.js";
import { ReviewsTransactionCoordinator } from "../lib/server/reviews-transaction.js";

function makeMockRequest({ method = "POST", headers = {}, body = null, url = "http://localhost:3000/api/reviews" } = {}) {
  const headerMap = new Map();
  for (const [k, v] of Object.entries(headers)) {
    headerMap.set(k.toLowerCase(), v);
  }

  return {
    method,
    url,
    headers: {
      get: (h) => headerMap.get(h.toLowerCase()) || null,
    },
    json: async () => {
      if (typeof body === "string") return JSON.parse(body);
      return body || {};
    },
  };
}

// ============================================================================
// API Route Handler Tests
// ============================================================================

test("API Routes - POST /api/reviews rejects unauthenticated requests with 401", async () => {
  const req = makeMockRequest({ headers: {} });
  const res = await reviewPost(req);
  assert.equal(res.status, 401);

  const data = await res.json();
  assert.equal(data.code, "MISSING_TOKEN");
});

test("API Routes - POST /api/reviews rejects unverified student emails with 403", async (t) => {
  t.mock.method(adminAuth, "verifyIdToken", async () => ({
    uid: "user-unverified",
    email: "student@vitapstudent.ac.in",
    email_verified: false,
  }));

  const req = makeMockRequest({
    headers: { authorization: "Bearer valid-token-unverified" },
    body: {
      campusSlug: "vit-ap",
      facultyId: "fac-1",
      ratings: { attendance: 4, correction: 4, teaching: 4, approachability: 4 },
      comment: "A valid experience comment text.",
    },
  });

  const res = await reviewPost(req);
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.code, "EMAIL_NOT_VERIFIED");
});

test("API Routes - POST /api/reviews rejects invalid rating inputs with 400", async (t) => {
  t.mock.method(adminAuth, "verifyIdToken", async () => ({
    uid: "user-valid",
    email: "student@vitapstudent.ac.in",
    email_verified: true,
  }));

  const req = makeMockRequest({
    headers: { authorization: "Bearer valid-token" },
    body: {
      campusSlug: "vit-ap",
      facultyId: "fac-1",
      ratings: { attendance: 6, correction: 4, teaching: 4, approachability: 4 }, // out of bounds
      comment: "A valid experience comment text.",
    },
  });

  const res = await reviewPost(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /between 1 and 5/);
});

test("API Routes - POST /api/reviews rejects comments shorter than 10 chars with 400", async (t) => {
  t.mock.method(adminAuth, "verifyIdToken", async () => ({
    uid: "user-valid",
    email: "student@vitapstudent.ac.in",
    email_verified: true,
  }));

  const req = makeMockRequest({
    headers: { authorization: "Bearer valid-token" },
    body: {
      campusSlug: "vit-ap",
      facultyId: "fac-1",
      ratings: { attendance: 4, correction: 4, teaching: 4, approachability: 4 },
      comment: "Short",
    },
  });

  const res = await reviewPost(req);
  assert.equal(res.status, 400);
  const data = await res.json();
  assert.match(data.error, /at least 10 characters/);
});

test("API Routes - POST /api/reviews delegates to transaction coordinator and returns 201 on success", async (t) => {
  t.mock.method(adminAuth, "verifyIdToken", async () => ({
    uid: "user-valid-1",
    email: "student@vitapstudent.ac.in",
    email_verified: true,
  }));

  // Mock faculty doc existence
  t.mock.method(adminDb, "collection", (col) => ({
    doc: (docId) => ({
      collection: (subCol) => ({
        doc: (facId) => ({
          get: async () => ({ exists: true, data: () => ({ name: "Dr. Faculty" }) }),
        }),
      }),
    }),
  }));

  // Mock transaction coordinator
  const coordinatorMock = t.mock.method(
    ReviewsTransactionCoordinator,
    "submitOrUpdateReview",
    async (params) => {
      assert.equal(params.userId, "user-valid-1");
      assert.equal(params.campusSlug, "vit-ap");
      assert.equal(params.facultyId, "fac-101");
      assert.equal(params.idempotencyKey, "idem-test-header-key");
      return {
        success: true,
        statusCode: 201,
        overall: 4.5,
        version: 1,
        updatedStats: { reviewCount: 1, avgRating: 4.5 },
      };
    }
  );

  const req = makeMockRequest({
    headers: {
      authorization: "Bearer valid-token",
      "idempotency-key": "idem-test-header-key",
    },
    body: {
      campusSlug: "vit-ap",
      facultyId: "fac-101",
      ratings: { attendance: 4, correction: 4, teaching: 5, approachability: 5 },
      comment: "Outstanding mentor with deep subject clarity.",
    },
  });

  const res = await reviewPost(req);
  assert.equal(res.status, 201);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.overall, 4.5);
  assert.equal(coordinatorMock.mock.callCount(), 1);
});

test("API Routes - POST /api/reviews propagates 429 with Retry-After header on rate limit", async (t) => {
  t.mock.method(adminAuth, "verifyIdToken", async () => ({
    uid: "user-rate-limited",
    email: "student@vitapstudent.ac.in",
    email_verified: true,
  }));

  t.mock.method(adminDb, "collection", () => ({
    doc: () => ({
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => ({}) }),
        }),
      }),
    }),
  }));

  t.mock.method(ReviewsTransactionCoordinator, "submitOrUpdateReview", async () => {
    const err = new Error("Rate limit exceeded: Maximum 5 reviews per 24 hours.");
    err.statusCode = 429;
    err.code = "RATE_LIMIT_EXCEEDED";
    err.retryAfterSeconds = 7200; // 2 hours
    throw err;
  });

  const req = makeMockRequest({
    headers: { authorization: "Bearer valid-token" },
    body: {
      campusSlug: "vit-ap",
      facultyId: "fac-101",
      ratings: { attendance: 4, correction: 4, teaching: 4, approachability: 4 },
      comment: "A valid experience comment text.",
    },
  });

  const res = await reviewPost(req);
  assert.equal(res.status, 429);
  assert.equal(res.headers.get("retry-after"), "7200");
  const data = await res.json();
  assert.equal(data.retryAfter, 7200);
});

test("API Routes - DELETE /api/reviews delegates to coordinator deleteReview", async (t) => {
  t.mock.method(adminAuth, "verifyIdToken", async () => ({
    uid: "user-deleter",
    email: "student@vitapstudent.ac.in",
    email_verified: true,
  }));

  t.mock.method(adminDb, "collection", () => ({
    doc: () => ({
      collection: () => ({
        doc: () => ({
          get: async () => ({ exists: true, data: () => ({}) }),
        }),
      }),
    }),
  }));

  t.mock.method(ReviewsTransactionCoordinator, "deleteReview", async (params) => {
    assert.equal(params.userId, "user-deleter");
    return { success: true, deleted: true };
  });

  const req = makeMockRequest({
    method: "DELETE",
    headers: { authorization: "Bearer valid-token" },
    body: { campusSlug: "vit-ap", facultyId: "fac-101" },
  });

  const res = await reviewDelete(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.deleted, true);
});

test("API Routes - POST /api/reviews/moderate rejects non-moderators with 403", async (t) => {
  t.mock.method(adminAuth, "verifyIdToken", async () => ({
    uid: "regular-user",
    email: "student@vitapstudent.ac.in",
    email_verified: true,
    // No admin or moderator claim
  }));

  const req = makeMockRequest({
    headers: { authorization: "Bearer student-token" },
    body: {
      campusSlug: "vit-ap",
      facultyId: "fac-1",
      targetUserId: "bad-actor",
      action: "FLAG",
    },
  });

  const res = await moderatePost(req);
  assert.equal(res.status, 403);
  const data = await res.json();
  assert.equal(data.code, "FORBIDDEN");
});

test("API Routes - POST /api/reviews/moderate allows verified moderator to flag review", async (t) => {
  t.mock.method(adminAuth, "verifyIdToken", async () => ({
    uid: "mod-uid-1",
    email: "moderator@vitor.org",
    email_verified: true,
    moderator: true, // privileged claim
  }));

  t.mock.method(ReviewsTransactionCoordinator, "moderateReview", async (params) => {
    assert.equal(params.targetUserId, "flagged-user");
    assert.equal(params.action, "FLAGGED");
    return { success: true, status: "FLAGGED" };
  });

  const req = makeMockRequest({
    headers: { authorization: "Bearer mod-token" },
    body: {
      campusSlug: "vit-ap",
      facultyId: "fac-1",
      targetUserId: "flagged-user",
      action: "FLAGGED",
      reason: "Inappropriate language",
    },
  });

  const res = await moderatePost(req);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.status, "FLAGGED");
});

test("API Routes - App Check enforcement in production mode", async (t) => {
  const origEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";

    // 1. Missing App Check token in production -> 401 APP_CHECK_MISSING
    t.mock.method(adminAuth, "verifyIdToken", async () => ({
      uid: "user-1",
      email: "student@vitstudent.ac.in",
      email_verified: true,
    }));

    const missingTokenReq = makeMockRequest({
      headers: { authorization: "Bearer valid-token" },
      body: { campusSlug: "vit-v", facultyId: "fac-1" },
    });

    const missingRes = await reviewPost(missingTokenReq);
    assert.equal(missingRes.status, 401);
    const missingData = await missingRes.json();
    assert.equal(missingData.code, "APP_CHECK_MISSING");

    // 2. Invalid App Check token in production -> 401 APP_CHECK_INVALID
    t.mock.method(adminAppCheck, "verifyToken", async () => {
      throw new Error("Token expired or forged");
    });

    const invalidTokenReq = makeMockRequest({
      headers: {
        authorization: "Bearer valid-token",
        "x-firebase-appcheck": "forged-app-check",
      },
      body: { campusSlug: "vit-v", facultyId: "fac-1" },
    });

    const invalidRes = await reviewPost(invalidTokenReq);
    assert.equal(invalidRes.status, 401);
    const invalidData = await invalidRes.json();
    assert.equal(invalidData.code, "APP_CHECK_INVALID");
  } finally {
    process.env.NODE_ENV = origEnv;
  }
});

test("API Routes - dual-campus vitstudent.ac.in authorized for both Vellore and Chennai", async (t) => {
  t.mock.method(adminAuth, "verifyIdToken", async () => ({
    uid: "dual-user-1",
    email: "student@vitstudent.ac.in",
    email_verified: true,
  }));

  // Mock faculty doc read in Firestore
  t.mock.method(adminDb, "collection", () => ({
    doc: () => ({
      collection: () => ({
        doc: (id) => ({
          get: async () => ({ exists: true, id, data: () => ({ name: "Prof" }) }),
        }),
      }),
    }),
  }));

  t.mock.method(ReviewsTransactionCoordinator, "submitOrUpdateReview", async (params) => {
    return { success: true, campusSlug: params.campusSlug, isNew: true };
  });

  // Post to Vellore (vit-v) -> 201 Success
  const velloreReq = makeMockRequest({
    headers: { authorization: "Bearer token" },
    body: {
      campusSlug: "vit-v",
      facultyId: "fac-v",
      ratings: { attendance: 4, correction: 4, teaching: 4, approachability: 4 },
      comment: "A great experience at Vellore.",
    },
  });
  const velloreRes = await reviewPost(velloreReq);
  assert.equal(velloreRes.status, 201);

  // Post to Chennai (vit-c) -> 201 Success
  const chennaiReq = makeMockRequest({
    headers: { authorization: "Bearer token" },
    body: {
      campusSlug: "vit-c",
      facultyId: "fac-c",
      ratings: { attendance: 4, correction: 4, teaching: 4, approachability: 4 },
      comment: "A great experience at Chennai.",
    },
  });
  const chennaiRes = await reviewPost(chennaiReq);
  assert.equal(chennaiRes.status, 201);

  // Post to AP (vit-ap) -> 403 Forbidden (cross-campus)
  const apReq = makeMockRequest({
    headers: { authorization: "Bearer token" },
    body: {
      campusSlug: "vit-ap",
      facultyId: "fac-ap",
      ratings: { attendance: 4, correction: 4, teaching: 4, approachability: 4 },
      comment: "Cross-campus attempt from dual user.",
    },
  });
  const apRes = await reviewPost(apReq);
  assert.equal(apRes.status, 403);
  const apData = await apRes.json();
  assert.equal(apData.code, "CROSS_CAMPUS_DENIED");
});
