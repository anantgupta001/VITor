/**
 * Faculty directory cache + GET /api/faculties unit tests (Phase 6C.1).
 * Firestore is mocked at the adminDb.collection boundary; no emulator needed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { adminDb } from "../lib/firebase/admin.js";
import {
  getCachedFaculties,
  invalidateFacultyDirectory,
  FACULTY_DIRECTORY_TTL_MS,
} from "../lib/server/faculty-directory.js";
import { GET } from "../app/api/faculties/route.js";

function mockFirestore(t, handler) {
  const reads = [];
  t.mock.method(adminDb, "collection", (name) => ({
    doc: (campus) => ({
      collection: (sub) => ({
        get: async () => {
          reads.push([name, campus, sub]);
          return handler(campus, reads.length);
        },
      }),
    }),
  }));
  t.after(() => invalidateFacultyDirectory());
  invalidateFacultyDirectory();
  return reads;
}

const snapOf = (docs) => ({
  docs: docs.map(([id, data]) => ({ id, data: () => data })),
});

test("faculty directory - second call within TTL is served from cache", async (t) => {
  const reads = mockFirestore(t, () => snapOf([["f1", { name: "A", avgRating: 4 }]]));
  const first = await getCachedFaculties("vit-ap");
  const second = await getCachedFaculties("vit-ap");
  assert.deepEqual(first, [{ id: "f1", name: "A", avgRating: 4 }]);
  assert.equal(second, first);
  assert.equal(reads.length, 1);
  assert.deepEqual(reads[0], ["campuses", "vit-ap", "faculties"]);
});

test("faculty directory - refetches after the TTL expires", async (t) => {
  const reads = mockFirestore(t, () => snapOf([["f1", { name: "A" }]]));
  await getCachedFaculties("vit-ap");
  await getCachedFaculties("vit-ap", { now: Date.now() + FACULTY_DIRECTORY_TTL_MS + 1000 });
  assert.equal(reads.length, 2);
});

test("faculty directory - campuses are cached independently", async (t) => {
  const reads = mockFirestore(t, (campus) => snapOf([[`f-${campus}`, {}]]));
  const ap = await getCachedFaculties("vit-ap");
  const b = await getCachedFaculties("vit-b");
  assert.equal(ap[0].id, "f-vit-ap");
  assert.equal(b[0].id, "f-vit-b");
  assert.equal(reads.length, 2);
});

test("faculty directory - concurrent misses share one Firestore read", async (t) => {
  const reads = mockFirestore(t, async () => {
    await new Promise((r) => setTimeout(r, 20));
    return snapOf([["f1", {}]]);
  });
  const results = await Promise.all([1, 2, 3, 4, 5].map(() => getCachedFaculties("vit-c")));
  assert.equal(reads.length, 1);
  assert.ok(results.every((r) => r === results[0]));
});

test("faculty directory - failures are not cached", async (t) => {
  const reads = mockFirestore(t, (_c, n) => {
    if (n === 1) throw new Error("UNAVAILABLE");
    return snapOf([["f1", {}]]);
  });
  await assert.rejects(() => getCachedFaculties("vit-v"), /UNAVAILABLE/);
  const data = await getCachedFaculties("vit-v");
  assert.equal(data.length, 1);
  assert.equal(reads.length, 2);
});

test("faculty directory - invalidation forces a fresh read with updated aggregates", async (t) => {
  let rating = 3;
  const reads = mockFirestore(t, () => snapOf([["f1", { avgRating: rating }]]));
  assert.equal((await getCachedFaculties("vit-ap"))[0].avgRating, 3);
  rating = 4.5;
  assert.equal((await getCachedFaculties("vit-ap"))[0].avgRating, 3); // still cached
  invalidateFacultyDirectory("vit-ap");
  assert.equal((await getCachedFaculties("vit-ap"))[0].avgRating, 4.5);
  assert.equal(reads.length, 2);
});

test("faculty directory - a read started before invalidation does not repopulate the cache", async (t) => {
  let rating = 3;
  let release;
  const gate = new Promise((r) => (release = r));
  const reads = mockFirestore(t, async (_c, n) => {
    const snapshotRating = rating;
    if (n === 1) await gate;
    return snapOf([["f1", { avgRating: snapshotRating }]]);
  });
  const stale = getCachedFaculties("vit-ap");
  await new Promise((r) => setTimeout(r, 5));
  rating = 5;
  invalidateFacultyDirectory("vit-ap"); // a review write happens mid-read
  release();
  assert.equal((await stale)[0].avgRating, 3);
  const fresh = await getCachedFaculties("vit-ap");
  assert.equal(fresh[0].avgRating, 5);
  assert.equal(reads.length, 2);
});

test("faculty directory - Firestore timestamps in allowed fields are converted to plain numbers", async (t) => {
  mockFirestore(t, () =>
    snapOf([["f1", { name: "A", photo: { toMillis: () => 1700000000000 } }]])
  );
  const [f] = await getCachedFaculties("vit-ap");
  assert.equal(f.photo, 1700000000000);
});

const FULL_DOC = {
  name: "Dr. A",
  designation: "Professor",
  department: "CSE",
  photo: "https://example.com/a.jpg",
  avgRating: 4.2,
  avgAttendance: 3.5,
  avgCorrection: 4,
  avgTeaching: 4.5,
  avgApproachability: 3,
  reviewCount: 12,
};

test("faculty directory - returns exactly the public fields with id and original values", async (t) => {
  mockFirestore(t, () =>
    snapOf([
      [
        "fac-9",
        {
          ...FULL_DOC,
          email: "a@vit.ac.in",
          phone: "123",
          internalNotes: "secret",
          updatedAt: { toMillis: () => 1 },
        },
      ],
    ])
  );
  const [f] = await getCachedFaculties("vit-ap");
  assert.deepEqual(f, { id: "fac-9", ...FULL_DOC });
  for (const k of ["email", "phone", "internalNotes", "updatedAt"]) {
    assert.ok(!(k in f), `${k} must not be exposed`);
  }
});

test("faculty directory - missing optional fields do not throw or get defaults", async (t) => {
  mockFirestore(t, () => snapOf([["f1", { name: "A" }], ["f2", {}]]));
  const list = await getCachedFaculties("vit-ap");
  assert.deepEqual(list, [{ id: "f1", name: "A" }, { id: "f2" }]);
});

test("GET /api/faculties - rejects missing or invalid campusSlug without touching Firestore", async (t) => {
  const reads = mockFirestore(t, () => snapOf([]));
  for (const qs of ["", "?campusSlug=nope", "?campusSlug=../x", "?campusSlug=vit-ap/../vit-b"]) {
    const res = await GET({ url: `http://localhost/api/faculties${qs}` });
    assert.equal(res.status, 400);
    assert.equal((await res.json()).code, "VALIDATION_ERROR");
  }
  assert.equal(reads.length, 0);
});

test("GET /api/faculties - returns faculties with public cache headers and no cookies", async (t) => {
  mockFirestore(t, () => snapOf([["f1", { name: "A" }]]));
  const res = await GET({ url: "http://localhost/api/faculties?campusSlug=vit-ap" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { faculties: [{ id: "f1", name: "A" }] });
  assert.equal(res.headers.get("cache-control"), "public, max-age=0, s-maxage=60");
  assert.equal(res.headers.get("set-cookie"), null);
});

test("GET /api/faculties - response matches the restricted public-field contract", async (t) => {
  mockFirestore(t, () =>
    snapOf([["f1", { ...FULL_DOC, email: "a@vit.ac.in", phone: "123", extra: true }]])
  );
  const res = await GET({ url: "http://localhost/api/faculties?campusSlug=vit-ap" });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { faculties: [{ id: "f1", ...FULL_DOC }] });
});

test("GET /api/faculties - Firestore failure returns a generic 500", async (t) => {
  t.mock.method(console, "error", () => {});
  mockFirestore(t, () => {
    throw new Error("internal firestore detail");
  });
  const res = await GET({ url: "http://localhost/api/faculties?campusSlug=vit-ap" });
  assert.equal(res.status, 500);
  const body = await res.json();
  assert.equal(body.code, "INTERNAL_SERVER_ERROR");
  assert.ok(!JSON.stringify(body).includes("internal firestore detail"));
});
