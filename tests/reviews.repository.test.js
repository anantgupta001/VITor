import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

// Register mock loader to intercept "firebase/firestore"
register("./mocks/mock-loader.mjs", import.meta.url);

import { firestoreMockState } from "./mocks/mock-firestore.mjs";
const { ReviewsRepository } = await import("../repositories/reviews.repository.js");

test("ReviewsRepository.getReviewsByFaculty - returns empty array when parameters are missing", async () => {
  firestoreMockState.reset();

  assert.deepEqual(await ReviewsRepository.getReviewsByFaculty(null, "fac-1"), []);
  assert.deepEqual(await ReviewsRepository.getReviewsByFaculty("vit-ap", null), []);
  assert.deepEqual(await ReviewsRepository.getReviewsByFaculty("", "fac-1"), []);
  assert.deepEqual(await ReviewsRepository.getReviewsByFaculty("vit-ap", ""), []);
  assert.deepEqual(await ReviewsRepository.getReviewsByFaculty(undefined, undefined), []);

  assert.equal(firestoreMockState.collectionCalls.length, 0);
  assert.equal(firestoreMockState.getDocsCalls.length, 0);
});

test("ReviewsRepository.getReviewsByFaculty - fetches and maps faculty reviews with correct path", async () => {
  firestoreMockState.reset();

  const mockReviewDocs = [
    {
      id: "rev-1",
      data: () => ({
        user: "Anonymous User",
        attendance: 4,
        correction: 5,
        teaching: 5,
        approachability: 4,
        overall: 4.5,
        text: "Very engaging lectures.",
      }),
    },
    {
      id: "rev-2",
      data: () => ({
        user: "Anonymous User",
        attendance: 3,
        correction: 4,
        teaching: 4,
        approachability: 3,
        overall: 3.5,
        text: "Strict grader but fair.",
      }),
    },
  ];

  firestoreMockState.getDocsHandler = async (ref) => {
    assert.deepEqual(ref.args, ["campuses", "vit-ap", "faculties", "fac-99", "reviews"]);
    return { docs: mockReviewDocs };
  };

  const reviews = await ReviewsRepository.getReviewsByFaculty("vit-ap", "fac-99");

  assert.equal(reviews.length, 2);
  assert.equal(reviews[0].id, "rev-1");
  assert.equal(reviews[0].overall, 4.5);
  assert.equal(reviews[1].id, "rev-2");
  assert.equal(reviews[1].overall, 3.5);

  assert.equal(firestoreMockState.collectionCalls.length, 1);
  assert.deepEqual(firestoreMockState.collectionCalls[0].args, [
    "campuses",
    "vit-ap",
    "faculties",
    "fac-99",
    "reviews",
  ]);
  assert.equal(firestoreMockState.getDocsCalls.length, 1);
});

test("ReviewsRepository.getReviewsByFaculty - handles empty reviews collection", async () => {
  firestoreMockState.reset();

  firestoreMockState.getDocsHandler = async () => ({ docs: [] });

  const reviews = await ReviewsRepository.getReviewsByFaculty("vit-v", "fac-empty");

  assert.equal(Array.isArray(reviews), true);
  assert.equal(reviews.length, 0);
  assert.equal(firestoreMockState.getDocsCalls.length, 1);
});

test("ReviewsRepository.getReviewsByFaculty - propagates Firestore query errors", async () => {
  firestoreMockState.reset();

  firestoreMockState.getDocsHandler = async () => {
    throw new Error("Firestore read failure: PERMISSION_DENIED");
  };

  await assert.rejects(
    async () => {
      await ReviewsRepository.getReviewsByFaculty("vit-ap", "fac-1");
    },
    {
      name: "Error",
      message: "Firestore read failure: PERMISSION_DENIED",
    }
  );
});

test("ReviewsRepository.getUserReview - returns null when parameters are missing", async () => {
  firestoreMockState.reset();

  assert.equal(await ReviewsRepository.getUserReview(null, "fac-1", "user-1"), null);
  assert.equal(await ReviewsRepository.getUserReview("vit-ap", null, "user-1"), null);
  assert.equal(await ReviewsRepository.getUserReview("vit-ap", "fac-1", null), null);
  assert.equal(await ReviewsRepository.getUserReview("", "fac-1", "user-1"), null);
  assert.equal(await ReviewsRepository.getUserReview("vit-ap", "", "user-1"), null);
  assert.equal(await ReviewsRepository.getUserReview("vit-ap", "fac-1", ""), null);

  assert.equal(firestoreMockState.docCalls.length, 0);
  assert.equal(firestoreMockState.getDocCalls.length, 0);
});

test("ReviewsRepository.getUserReview - returns user review data when document exists", async () => {
  firestoreMockState.reset();

  firestoreMockState.getDocHandler = async (ref) => {
    assert.deepEqual(ref.args, ["campuses", "vit-ap", "faculties", "fac-1", "reviews", "user-100"]);
    return {
      id: "user-100",
      exists: () => true,
      data: () => ({
        attendance: 5,
        correction: 5,
        teaching: 5,
        approachability: 5,
        overall: 5.0,
        text: "The best professor in the department.",
      }),
    };
  };

  const review = await ReviewsRepository.getUserReview("vit-ap", "fac-1", "user-100");

  assert.notEqual(review, null);
  assert.equal(review.id, "user-100");
  assert.equal(review.overall, 5.0);
  assert.equal(review.text, "The best professor in the department.");

  assert.equal(firestoreMockState.docCalls.length, 1);
  assert.deepEqual(firestoreMockState.docCalls[0].args, [
    "campuses",
    "vit-ap",
    "faculties",
    "fac-1",
    "reviews",
    "user-100",
  ]);
  assert.equal(firestoreMockState.getDocCalls.length, 1);
});

test("ReviewsRepository.getUserReview - returns null when user review does not exist", async () => {
  firestoreMockState.reset();

  firestoreMockState.getDocHandler = async () => ({
    id: "user-missing",
    exists: () => false,
    data: () => null,
  });

  const review = await ReviewsRepository.getUserReview("vit-ap", "fac-1", "user-missing");

  assert.equal(review, null);
  assert.equal(firestoreMockState.getDocCalls.length, 1);
});

test("ReviewsRepository.getUserReview - propagates Firestore getDoc errors", async () => {
  firestoreMockState.reset();

  firestoreMockState.getDocHandler = async () => {
    throw new Error("Firestore read failure: NETWORK_TIMEOUT");
  };

  await assert.rejects(
    async () => {
      await ReviewsRepository.getUserReview("vit-ap", "fac-1", "user-1");
    },
    {
      name: "Error",
      message: "Firestore read failure: NETWORK_TIMEOUT",
    }
  );
});

test("ReviewsRepository.saveReview - throws error when required parameters are missing", async () => {
  firestoreMockState.reset();

  const data = { attendance: 4, text: "Good class" };

  await assert.rejects(
    async () => {
      await ReviewsRepository.saveReview(null, "fac-1", "user-1", data);
    },
    {
      name: "Error",
      message: "Missing parameters to save review",
    }
  );

  await assert.rejects(
    async () => {
      await ReviewsRepository.saveReview("vit-ap", null, "user-1", data);
    },
    {
      name: "Error",
      message: "Missing parameters to save review",
    }
  );

  await assert.rejects(
    async () => {
      await ReviewsRepository.saveReview("vit-ap", "fac-1", null, data);
    },
    {
      name: "Error",
      message: "Missing parameters to save review",
    }
  );

  assert.equal(firestoreMockState.docCalls.length, 0);
  assert.equal(firestoreMockState.setDocCalls.length, 0);
});

test("ReviewsRepository.saveReview - saves review with correct payload, userId, merge option, and timestamp", async () => {
  firestoreMockState.reset();

  let capturedRef = null;
  let capturedPayload = null;
  let capturedOpts = null;

  firestoreMockState.setDocHandler = async (ref, payload, opts) => {
    capturedRef = ref;
    capturedPayload = payload;
    capturedOpts = opts;
  };

  const reviewInput = {
    user: "Anonymous User",
    attendance: 4,
    correction: 4,
    teaching: 5,
    approachability: 5,
    overall: 4.5,
    text: "Clear concepts and fair evaluations.",
  };

  const savedResult = await ReviewsRepository.saveReview("vit-ap", "fac-20", "student-abc", reviewInput);

  assert.equal(firestoreMockState.docCalls.length, 1);
  assert.deepEqual(firestoreMockState.docCalls[0].args, [
    "campuses",
    "vit-ap",
    "faculties",
    "fac-20",
    "reviews",
    "student-abc",
  ]);

  assert.equal(firestoreMockState.setDocCalls.length, 1);
  assert.deepEqual(capturedOpts, { merge: true });
  assert.equal(capturedPayload.userId, "student-abc");
  assert.equal(capturedPayload.user, "Anonymous User");
  assert.equal(capturedPayload.overall, 4.5);
  assert.equal(capturedPayload.updatedAt, "MOCK_SERVER_TIMESTAMP");

  // Verify the returned payload from saveReview
  assert.deepEqual(savedResult, capturedPayload);
});

test("ReviewsRepository.saveReview - propagates Firestore setDoc errors", async () => {
  firestoreMockState.reset();

  firestoreMockState.setDocHandler = async () => {
    throw new Error("Firestore write failure: UNAVAILABLE");
  };

  await assert.rejects(
    async () => {
      await ReviewsRepository.saveReview("vit-ap", "fac-1", "user-1", { text: "Review text" });
    },
    {
      name: "Error",
      message: "Firestore write failure: UNAVAILABLE",
    }
  );
});

// ──────────────────────────────────────────────────────────────────────────────
// getPublicReviews — server-backed public read (audit F-02)
// ──────────────────────────────────────────────────────────────────────────────

test("ReviewsRepository.getPublicReviews - returns empty array when parameters are missing without calling the network", async (t) => {
  const fetchMock = t.mock.method(globalThis, "fetch", async () => {
    throw new Error("fetch must not be called");
  });
  assert.deepEqual(await ReviewsRepository.getPublicReviews(null, "fac-1"), []);
  assert.deepEqual(await ReviewsRepository.getPublicReviews("vit-ap", ""), []);
  assert.equal(fetchMock.mock.callCount(), 0);
});

test("ReviewsRepository.getPublicReviews - requests the trusted endpoint with encoded params and returns reviews", async (t) => {
  const reviews = [{ id: "abc", ratings: { overall: 4 }, comment: "Great" }];
  const fetchMock = t.mock.method(globalThis, "fetch", async () => ({
    ok: true,
    json: async () => ({ reviews }),
  }));

  const result = await ReviewsRepository.getPublicReviews("vit-ap", "fac 1/x");
  assert.deepEqual(result, reviews);

  const [url, options] = fetchMock.mock.calls[0].arguments;
  assert.equal(url, "/api/reviews?campusSlug=vit-ap&facultyId=fac+1%2Fx");
  assert.equal(options.cache, "no-store");
});

test("ReviewsRepository.getPublicReviews - throws with statusCode on non-OK response", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: false, status: 503, json: async () => ({}) }));
  await assert.rejects(
    () => ReviewsRepository.getPublicReviews("vit-ap", "fac-1"),
    (err) => err.statusCode === 503
  );
});

test("ReviewsRepository.getPublicReviews - tolerates a malformed payload by returning an empty list", async (t) => {
  t.mock.method(globalThis, "fetch", async () => ({ ok: true, json: async () => ({ reviews: "nope" }) }));
  assert.deepEqual(await ReviewsRepository.getPublicReviews("vit-ap", "fac-1"), []);
});
