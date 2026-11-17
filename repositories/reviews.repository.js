/**
 * Reviews Data Access Layer.
 * Interacts with `campuses/{campusSlug}/faculties/{facultyId}/reviews` in Firestore.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "../lib/firebase/client.js";

export const ReviewsRepository = {
  /**
   * Fetch the publicly visible reviews for a faculty member (what the UI must use).
   *
   * Reads go through the trusted `GET /api/reviews` endpoint, which returns only
   * ACTIVE reviews and strips author identifiers. Production Firestore rules deny
   * direct client reads of the `reviews` collection.
   */
  async getPublicReviews(campusSlug, facultyId) {
    if (!campusSlug || !facultyId) return [];
    const params = new URLSearchParams({ campusSlug, facultyId });
    const res = await fetch(`/api/reviews?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      const err = new Error("Failed to load reviews.");
      err.statusCode = res.status;
      throw err;
    }
    const data = await res.json();
    return Array.isArray(data?.reviews) ? data.reviews : [];
  },

  /**
   * Fetch all reviews for a faculty member directly from Firestore, in every status.
   *
   * NOT for UI use: production rules deny this read. Retained only for the
   * non-browser fallback path in ReviewsService and the emulator integration tests
   * (which run with permissive test rules). Use `getPublicReviews` in the app.
   */
  async getReviewsByFaculty(campusSlug, facultyId) {
    if (!campusSlug || !facultyId) return [];
    const ref = collection(
      db,
      "campuses",
      campusSlug,
      "faculties",
      facultyId,
      "reviews"
    );
    const snap = await getDocs(ref);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  /**
   * Fetch a specific user's review for a faculty member.
   */
  async getUserReview(campusSlug, facultyId, userId) {
    if (!campusSlug || !facultyId || !userId) return null;
    const ref = doc(
      db,
      "campuses",
      campusSlug,
      "faculties",
      facultyId,
      "reviews",
      userId
    );
    const snap = await getDoc(ref);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

  /**
   * Create or update a review document.
   */
  async saveReview(campusSlug, facultyId, userId, reviewData) {
    if (!campusSlug || !facultyId || !userId) {
      throw new Error("Missing parameters to save review");
    }
    const ref = doc(
      db,
      "campuses",
      campusSlug,
      "faculties",
      facultyId,
      "reviews",
      userId
    );

    const payload = {
      ...reviewData,
      userId,
      updatedAt: serverTimestamp(),
    };

    await setDoc(ref, payload, { merge: true });
    return payload;
  },
};
