/**
 * Server-side faculty directory read model with a short in-process TTL cache.
 *
 * Why this exists: the directory page loads every faculty document of a campus
 * (~2-3k docs in total). Reading them with the client SDK costs one Firestore read
 * per document per page view. Serving them from one cached server read bounds
 * Firestore reads to roughly one collection scan per campus per TTL per server
 * instance, regardless of traffic.
 *
 * Properties:
 * - Platform independent: a module-level Map, no Vercel/Redis/Next-specific cache API.
 *   On serverless hosts each warm instance keeps its own copy (best effort); on a
 *   long-running Node server the cache is shared by all requests.
 * - Public data only: faculty documents are already world-readable by the Firestore
 *   rules. Nothing user-specific is ever cached or keyed.
 * - Concurrent cache misses share one in-flight Firestore read.
 * - Failed reads are never cached.
 * - Rating aggregates in faculty docs change when reviews change; routes call
 *   invalidateFacultyDirectory() after a successful write so the same instance
 *   serves fresh data immediately. Other instances may lag by at most the TTL.
 */

import { adminDb } from "../firebase/admin.js";

export const FACULTY_DIRECTORY_TTL_MS = 60 * 1000;

// campusSlug -> { data, expiresAt }
const cache = new Map();
// campusSlug -> Promise (in-flight read)
const inflight = new Map();
// campusSlug -> generation counter, bumped on invalidation so a read that started
// before a write cannot repopulate the cache with pre-write data.
const generations = new Map();

/**
 * Converts Firestore values into plain JSON-safe values (Timestamps -> epoch ms).
 */
function toPlain(value) {
  if (value === null || typeof value !== "object") return value;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (Array.isArray(value)) return value.map(toPlain);
  const out = {};
  for (const [k, v] of Object.entries(value)) out[k] = toPlain(v);
  return out;
}

// Explicit public contract: only these faculty fields are ever returned.
export const PUBLIC_FACULTY_FIELDS = [
  "name",
  "designation",
  "department",
  "photo",
  "avgRating",
  "avgAttendance",
  "avgCorrection",
  "avgTeaching",
  "avgApproachability",
  "reviewCount",
];

function toPublicFaculty(id, data) {
  const out = { id };
  for (const field of PUBLIC_FACULTY_FIELDS) {
    if (Object.hasOwn(data, field)) out[field] = toPlain(data[field]);
  }
  return out;
}

/**
 * Reads all faculties for a campus straight from Firestore (no cache).
 * Callers must validate `campusSlug` first.
 */
export async function fetchFacultiesFromFirestore(campusSlug) {
  const snap = await adminDb
    .collection("campuses")
    .doc(campusSlug)
    .collection("faculties")
    .get();
  return snap.docs.map((d) => toPublicFaculty(d.id, d.data()));
}

/**
 * Returns the faculty list for a campus, served from the TTL cache when fresh.
 * @param {string} campusSlug validated campus slug
 * @param {{ now?: number }} [options]
 */
export async function getCachedFaculties(campusSlug, { now = Date.now() } = {}) {
  const hit = cache.get(campusSlug);
  if (hit && hit.expiresAt > now) return hit.data;

  const pending = inflight.get(campusSlug);
  if (pending) return pending;

  const generation = generations.get(campusSlug) || 0;
  const promise = fetchFacultiesFromFirestore(campusSlug)
    .then((data) => {
      if ((generations.get(campusSlug) || 0) === generation) {
        cache.set(campusSlug, { data, expiresAt: Date.now() + FACULTY_DIRECTORY_TTL_MS });
      }
      return data;
    })
    .finally(() => {
      if (inflight.get(campusSlug) === promise) inflight.delete(campusSlug);
    });

  inflight.set(campusSlug, promise);
  return promise;
}

/**
 * Drops cached data for a campus (or all campuses). Call after review writes.
 */
export function invalidateFacultyDirectory(campusSlug) {
  if (campusSlug === undefined) {
    for (const key of new Set([...cache.keys(), ...inflight.keys()])) {
      generations.set(key, (generations.get(key) || 0) + 1);
    }
    cache.clear();
    inflight.clear();
    return;
  }
  generations.set(campusSlug, (generations.get(campusSlug) || 0) + 1);
  cache.delete(campusSlug);
  inflight.delete(campusSlug);
}
