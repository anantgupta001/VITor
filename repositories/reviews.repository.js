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
   * Fetch all reviews for a faculty member.
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
