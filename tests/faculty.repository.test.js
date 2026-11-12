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

test("FacultyRepository.getFaculties - successfully fetches and maps faculty list", async () => {
  firestoreMockState.reset();

  const mockDocs = [
    { id: "fac-1", data: () => ({ name: "Dr. A. Sharma", department: "CSE", avgRating: 4.5 }) },
    { id: "fac-2", data: () => ({ name: "Prof. B. Patel", department: "ECE", avgRating: 3.8 }) },
  ];

  firestoreMockState.getDocsHandler = async (ref) => {
    assert.deepEqual(ref.args, ["campuses", "vit-ap", "faculties"]);
    return { docs: mockDocs };
  };

  const faculties = await FacultyRepository.getFaculties("vit-ap");

  assert.equal(faculties.length, 2);
  assert.deepEqual(faculties[0], { id: "fac-1", name: "Dr. A. Sharma", department: "CSE", avgRating: 4.5 });
  assert.deepEqual(faculties[1], { id: "fac-2", name: "Prof. B. Patel", department: "ECE", avgRating: 3.8 });

  assert.equal(firestoreMockState.collectionCalls.length, 1);
  assert.deepEqual(firestoreMockState.collectionCalls[0].args, ["campuses", "vit-ap", "faculties"]);
  assert.equal(firestoreMockState.getDocsCalls.length, 1);
});

test("FacultyRepository.getFaculties - handles empty collection gracefully", async () => {
  firestoreMockState.reset();

  firestoreMockState.getDocsHandler = async () => ({ docs: [] });

  const faculties = await FacultyRepository.getFaculties("vit-c");

  assert.equal(Array.isArray(faculties), true);
  assert.equal(faculties.length, 0);
  assert.equal(firestoreMockState.getDocsCalls.length, 1);
});

test("FacultyRepository.getFaculties - propagates Firestore errors", async () => {
  firestoreMockState.reset();

  firestoreMockState.getDocsHandler = async () => {
    throw new Error("Firestore read failure: UNAVAILABLE");
  };

  await assert.rejects(
    async () => {
      await FacultyRepository.getFaculties("vit-b");
    },
    {
      name: "Error",
      message: "Firestore read failure: UNAVAILABLE",
    }
  );
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

test("FacultyRepository.updateFacultyStats - guards against missing parameters", async () => {
  firestoreMockState.reset();

  const stats = { avgRating: 4.2, reviewCount: 5 };

  await FacultyRepository.updateFacultyStats(null, "fac-1", stats);
  await FacultyRepository.updateFacultyStats("vit-ap", null, stats);
  await FacultyRepository.updateFacultyStats("vit-ap", "fac-1", null);
  await FacultyRepository.updateFacultyStats("", "fac-1", stats);
  await FacultyRepository.updateFacultyStats("vit-ap", "", stats);

  assert.equal(firestoreMockState.docCalls.length, 0);
  assert.equal(firestoreMockState.updateDocCalls.length, 0);
});

test("FacultyRepository.updateFacultyStats - successfully updates document with new stats", async () => {
  firestoreMockState.reset();

  const stats = {
    avgAttendance: 4.0,
    avgCorrection: 4.5,
    avgTeaching: 4.2,
    avgApproachability: 4.8,
    avgRating: 4.38,
    reviewCount: 10,
  };

  let capturedRef = null;
  let capturedStats = null;

  firestoreMockState.updateDocHandler = async (ref, data) => {
    capturedRef = ref;
    capturedStats = data;
  };

  await FacultyRepository.updateFacultyStats("vit-ap", "fac-50", stats);

  assert.equal(firestoreMockState.docCalls.length, 1);
  assert.deepEqual(firestoreMockState.docCalls[0].args, ["campuses", "vit-ap", "faculties", "fac-50"]);
  assert.equal(firestoreMockState.updateDocCalls.length, 1);
  assert.deepEqual(capturedRef.args, ["campuses", "vit-ap", "faculties", "fac-50"]);
  assert.deepEqual(capturedStats, stats);
});

test("FacultyRepository.updateFacultyStats - propagates Firestore update errors", async () => {
  firestoreMockState.reset();

  firestoreMockState.updateDocHandler = async () => {
    throw new Error("Firestore write failed: DEADLINE_EXCEEDED");
  };

  await assert.rejects(
    async () => {
      await FacultyRepository.updateFacultyStats("vit-ap", "fac-1", { avgRating: 3.5 });
    },
    {
      name: "Error",
      message: "Firestore write failed: DEADLINE_EXCEEDED",
    }
  );
});
