
/**
 * User Data Access Layer.
 * Interacts with the `users/{userId}` Firestore collection.
 */
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../lib/firebase/client.js";

export const UserRepository = {
  /**
   * Fetch a user profile document by user ID.
   */
  async getUserProfile(userId) {
    if (!userId) return null;

    const snap = await getDoc(doc(db, "users", userId));
    return snap.exists() ? snap.data() : null;
  },

  /**
   * Persist a user's selected campus preference.
   */
  async updateUserCampus(userId, campusSlug) {
    if (
      !userId ||
      typeof userId !== "string" ||
      !campusSlug ||
      typeof campusSlug !== "string"
    ) {
      return;
    }

    await setDoc(
      doc(db, "users", userId),
      { campusSlug },
      { merge: true }
    );
  },
};
