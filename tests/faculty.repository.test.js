import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

// Register mock loader to intercept "firebase/firestore"
register("./mocks/mock-loader.mjs", import.meta.url);

import { firestoreMockState } from "./mocks/mock-firestore.mjs";
const { FacultyRepository } = await import("../repositories/faculty.repository.js");

test("FacultyRepository.getFaculties - returns empty array when campusSlug is missing", async () => {
  firestoreMockState.reset();

  assert.deepEqual(await FacultyRepository.getFaculties(null), []);
  assert.deepEqual(await FacultyRepository.getFaculties(undefined), []);
  assert.deepEqual(await FacultyRepository.getFaculties(""), []);

  // Verify no Firestore interactions occurred
  assert.equal(firestoreMockState.collectionCalls.length, 0);
  assert.equal(firestoreMockState.getDocsCalls.length, 0);
});

function mockFetch(t, impl) {
  const calls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    calls.push(args);
    return impl(...args);
  };
  t.after(() => {
    globalThis.fetch = original;
  });
  return calls;
}

const jsonResponse = (body, ok = true, status = 200) => ({
  ok,
  status,
  json: async () => body,
});

test("FacultyRepository.getFaculties - fetches the faculty list from /api/faculties (no Firestore client read)", async (t) => {
  firestoreMockState.reset();
  const faculties = [
    { id: "fac-1", name: "Dr. A. Sharma", department: "CSE", avgRating: 4.5 },
    { id: "fac-2", name: "Prof. B. Patel", department: "ECE", avgRating: 3.8 },
  ];
  const calls = mockFetch(t, async () => jsonResponse({ faculties }));

  const result = await FacultyRepository.getFaculties("vit-ap");

  assert.deepEqual(result, faculties);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "/api/faculties?campusSlug=vit-ap");
  assert.equal(firestoreMockState.getDocsCalls.length, 0);
});

test("FacultyRepository.getFaculties - handles empty or malformed payload gracefully", async (t) => {
  mockFetch(t, async () => jsonResponse({ faculties: [] }));
  assert.deepEqual(await FacultyRepository.getFaculties("vit-c"), []);

  mockFetch(t, async () => jsonResponse({}));
  assert.deepEqual(await FacultyRepository.getFaculties("vit-c"), []);
});

test("FacultyRepository.getFaculties - throws the API error message on failure", async (t) => {
  mockFetch(t, async () => jsonResponse({ error: "An unexpected error occurred." }, false, 500));
  await assert.rejects(() => FacultyRepository.getFaculties("vit-b"), {
    name: "Error",
    message: "An unexpected error occurred.",
  });
});

test("FacultyRepository.getFaculties - falls back to a generic message when error body is not JSON", async (t) => {
  mockFetch(t, async () => ({ ok: false, status: 502, json: async () => { throw new Error("bad json"); } }));
  await assert.rejects(() => FacultyRepository.getFaculties("vit-b"), {
    message: "Failed to load faculty list.",
  });
});

test("FacultyRepository.getFacultyById - returns null when parameters are missing", async () => {
  firestoreMockState.reset();

  assert.equal(await FacultyRepository.getFacultyById(null, "fac-1"), null);
  assert.equal(await FacultyRepository.getFacultyById("vit-ap", null), null);
  assert.equal(await FacultyRepository.getFacultyById("", "fac-1"), null);
  assert.equal(await FacultyRepository.getFacultyById("vit-ap", ""), null);
  assert.equal(await FacultyRepository.getFacultyById(undefined, undefined), null);

  assert.equal(firestoreMockState.docCalls.length, 0);
  assert.equal(firestoreMockState.getDocCalls.length, 0);
});

test("FacultyRepository.getFacultyById - returns mapped faculty data when document exists", async () => {
  firestoreMockState.reset();

  firestoreMockState.getDocHandler = async (ref) => {
    assert.deepEqual(ref.args, ["campuses", "vit-ap", "faculties", "fac-101"]);
    return {
      id: "fac-101",
      exists: () => true,
      data: () => ({ name: "Dr. Vikram", department: "Mechanical" }),
    };
  };

  const faculty = await FacultyRepository.getFacultyById("vit-ap", "fac-101");

  assert.notEqual(faculty, null);
  assert.deepEqual(faculty, {
    id: "fac-101",
    name: "Dr. Vikram",
    department: "Mechanical",
  });

  assert.equal(firestoreMockState.docCalls.length, 1);
  assert.deepEqual(firestoreMockState.docCalls[0].args, ["campuses", "vit-ap", "faculties", "fac-101"]);
  assert.equal(firestoreMockState.getDocCalls.length, 1);
});

test("FacultyRepository.getFacultyById - returns null when document does not exist", async () => {
  firestoreMockState.reset();

  firestoreMockState.getDocHandler = async () => ({
    id: "fac-missing",
    exists: () => false,
    data: () => null,
  });

  const faculty = await FacultyRepository.getFacultyById("vit-v", "fac-missing");

  assert.equal(faculty, null);
  assert.equal(firestoreMockState.getDocCalls.length, 1);
});

test("FacultyRepository.getFacultyById - propagates Firestore errors", async () => {
  firestoreMockState.reset();

  firestoreMockState.getDocHandler = async () => {
    throw new Error("Firestore permission denied");
  };

  await assert.rejects(
    async () => {
      await FacultyRepository.getFacultyById("vit-ap", "fac-1");
    },
    {
      name: "Error",
      message: "Firestore permission denied",
    }
  );
});
