/**
 * Integration Tests: FacultyRepository + Firestore Emulator
 *
 * Tests the actual FacultyRepository implementation against a live Firestore Emulator.
 * No mocks are used. Data is seeded and cleaned up per test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { doc, setDoc } from "firebase/firestore";
import { ensureEmulatorConnection, db } from "./helpers/setup.js";
import { clearCollection, facultiesRef } from "./helpers/firestore-helpers.js";
import { FacultyRepository } from "../../repositories/faculty.repository.js";

const CAMPUS = "vit-vellore-int";

// Seed a faculty document
async function seedFaculty(id, data) {
  await setDoc(doc(db, "campuses", CAMPUS, "faculties", id), data);
}

test.before(() => {
  ensureEmulatorConnection();
});

test.after(async () => {
  await clearCollection(facultiesRef(CAMPUS));
  await clearCollection(facultiesRef("vit-chennai-int"));
});

// ───────────────────────────────────────────────────────────────────────────────
// getFaculties
// ───────────────────────────────────────────────────────────────────────────────

test("FacultyRepository [INT] - returns empty array for empty collection", async () => {
  await clearCollection(facultiesRef(CAMPUS));
  const result = await FacultyRepository.getFaculties(CAMPUS);
  assert.deepEqual(result, []);
});

test("FacultyRepository [INT] - returns empty array when campusSlug is null", async () => {
  const result = await FacultyRepository.getFaculties(null);
  assert.deepEqual(result, []);
});

test("FacultyRepository [INT] - fetches seeded faculties from campus collection", async () => {
  // Start fully isolated
  await clearCollection(facultiesRef(CAMPUS));
  await clearCollection(facultiesRef("vit-chennai-int"));
  await seedFaculty("fac-001", { name: "Dr. Test Alpha", department: "CSE", avgRating: 4.2 });
  await seedFaculty("fac-002", { name: "Prof. Test Beta", department: "ECE", avgRating: 3.9 });

  const result = await FacultyRepository.getFaculties(CAMPUS);
  assert.equal(result.length, 2);

  const ids = result.map((f) => f.id).sort();
  assert.deepEqual(ids, ["fac-001", "fac-002"]);

  const alpha = result.find((f) => f.id === "fac-001");
  assert.equal(alpha.name, "Dr. Test Alpha");
  assert.equal(alpha.department, "CSE");
  assert.equal(alpha.avgRating, 4.2);
});

test("FacultyRepository [INT] - each returned faculty has id merged from document ID", async () => {
  await clearCollection(facultiesRef(CAMPUS));
  await seedFaculty("fac-id-check", { name: "Prof. ID Check", department: "MECH" });

  const result = await FacultyRepository.getFaculties(CAMPUS);
  const faculty = result.find((f) => f.id === "fac-id-check");
  assert.ok(faculty, "faculty should be found");
  assert.equal(faculty.id, "fac-id-check");
  assert.equal(faculty.name, "Prof. ID Check");
});

test("FacultyRepository [INT] - campus-specific collection paths are isolated", async () => {
  const campusA = CAMPUS;
  const campusB = "vit-chennai-int";

  await clearCollection(facultiesRef(campusA));
  await clearCollection(facultiesRef(campusB));

  await seedFaculty("fac-a", { name: "Alpha Campus A" });
  await setDoc(doc(db, "campuses", campusB, "faculties", "fac-b"), { name: "Beta Campus B" });

  const resA = await FacultyRepository.getFaculties(campusA);
  const resB = await FacultyRepository.getFaculties(campusB);

  assert.equal(resA.length, 1);
  assert.equal(resA[0].id, "fac-a");
  assert.equal(resB.length, 1);
  assert.equal(resB[0].id, "fac-b");
});

// ───────────────────────────────────────────────────────────────────────────────
// getFacultyById
// ───────────────────────────────────────────────────────────────────────────────

test("FacultyRepository [INT] - getFacultyById returns seeded faculty by ID", async () => {
  await clearCollection(facultiesRef(CAMPUS));
  await seedFaculty("fac-byid-1", { name: "Dr. ByID Test", avgRating: 3.5, reviewCount: 10 });

  const result = await FacultyRepository.getFacultyById(CAMPUS, "fac-byid-1");
  assert.ok(result !== null);
  assert.equal(result.id, "fac-byid-1");
  assert.equal(result.name, "Dr. ByID Test");
  assert.equal(result.avgRating, 3.5);
  assert.equal(result.reviewCount, 10);
});

test("FacultyRepository [INT] - getFacultyById returns null for non-existent faculty", async () => {
  const result = await FacultyRepository.getFacultyById(CAMPUS, "this-does-not-exist-xyz");
  assert.equal(result, null);
});

test("FacultyRepository [INT] - getFacultyById returns null when params are missing", async () => {
  assert.equal(await FacultyRepository.getFacultyById(null, "fac-1"), null);
  assert.equal(await FacultyRepository.getFacultyById(CAMPUS, null), null);
  assert.equal(await FacultyRepository.getFacultyById(null, null), null);
});
