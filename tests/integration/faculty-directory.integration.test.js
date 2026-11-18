/**
 * Integration: server-side faculty directory + GET /api/faculties against the Firestore Emulator (Admin SDK).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { adminDb } from "../../lib/firebase/admin.js";
import {
  fetchFacultiesFromFirestore,
  getCachedFaculties,
  invalidateFacultyDirectory,
} from "../../lib/server/faculty-directory.js";
import { GET } from "../../app/api/faculties/route.js";

const CAMPUS_A = "vit-ap";
const CAMPUS_B = "vit-b";
const col = (campus) => adminDb.collection("campuses").doc(campus).collection("faculties");

async function clear(campus) {
  const snap = await col(campus).get();
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

test.beforeEach(async () => {
  invalidateFacultyDirectory();
  await clear(CAMPUS_A);
  await clear(CAMPUS_B);
});

test.after(async () => {
  invalidateFacultyDirectory();
  await clear(CAMPUS_A);
  await clear(CAMPUS_B);
});

test("Faculty Directory [INT] - empty campus returns []", async () => {
  assert.deepEqual(await fetchFacultiesFromFirestore(CAMPUS_A), []);
});

test("Faculty Directory [INT] - returns seeded faculties with id merged, scoped per campus", async () => {
  await col(CAMPUS_A).doc("fac-1").set({ name: "Dr. Alpha", department: "CSE", avgRating: 4.2 });
  await col(CAMPUS_A).doc("fac-2").set({ name: "Prof. Beta", department: "ECE", avgRating: 3.9 });
  await col(CAMPUS_B).doc("fac-b").set({ name: "Other Campus" });

  const a = await fetchFacultiesFromFirestore(CAMPUS_A);
  assert.deepEqual(a.map((f) => f.id).sort(), ["fac-1", "fac-2"]);
  assert.equal(a.find((f) => f.id === "fac-1").avgRating, 4.2);

  const b = await fetchFacultiesFromFirestore(CAMPUS_B);
  assert.deepEqual(b.map((f) => f.id), ["fac-b"]);
});

test("Faculty Directory [INT] - GET route exposes only public fields", async () => {
  await col(CAMPUS_A).doc("fac-1").set({
    name: "Dr. Alpha",
    department: "CSE",
    avgRating: 4,
    reviewCount: 2,
    email: "alpha@vit.ac.in",
    phone: "123",
    internal: "x",
  });
  const res = await GET({ url: `http://localhost:3000/api/faculties?campusSlug=${CAMPUS_A}` });
  assert.deepEqual((await res.json()).faculties, [
    { id: "fac-1", name: "Dr. Alpha", department: "CSE", avgRating: 4, reviewCount: 2 },
  ]);
});

test("Faculty Directory [INT] - GET route serves data, caches, and refreshes after invalidation", async () => {
  await col(CAMPUS_A).doc("fac-1").set({ name: "Dr. Alpha", avgRating: 3 });
  const url = `http://localhost:3000/api/faculties?campusSlug=${CAMPUS_A}`;

  const res1 = await GET({ url });
  assert.equal(res1.status, 200);
  assert.equal((await res1.json()).faculties[0].avgRating, 3);

  await col(CAMPUS_A).doc("fac-1").update({ avgRating: 5 });
  const cached = await (await GET({ url })).json();
  assert.equal(cached.faculties[0].avgRating, 3, "served from TTL cache");

  invalidateFacultyDirectory(CAMPUS_A);
  const fresh = await (await GET({ url })).json();
  assert.equal(fresh.faculties[0].avgRating, 5);
  assert.equal((await getCachedFaculties(CAMPUS_A)).length, 1);
});
