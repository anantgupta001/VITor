/**
 * Firestore Emulator helper: delete an entire collection and its subcollections.
 */
import { collection, getDocs, deleteDoc } from "firebase/firestore";
import { db } from "./setup.js";

/**
 * Delete all documents in a Firestore collection reference.
 */
export async function clearCollection(collRef) {
  const snap = await getDocs(collRef);
  for (const docSnap of snap.docs) {
    await deleteDoc(docSnap.ref);
  }
}

/**
 * Shorthand for campuses/{campus}/faculties
 */
export function facultiesRef(campusSlug) {
  return collection(db, "campuses", campusSlug, "faculties");
}

/**
 * Shorthand for campuses/{campus}/faculties/{faculty}/reviews
 */
export function reviewsRef(campusSlug, facultyId) {
  return collection(db, "campuses", campusSlug, "faculties", facultyId, "reviews");
}

/**
 * Shorthand for users
 */
export function usersRef() {
  return collection(db, "users");
}
