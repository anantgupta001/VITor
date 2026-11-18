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
