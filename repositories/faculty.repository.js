/**
 * Faculty Data Access Layer.
 * Interacts with `campuses/{campusSlug}/faculties` in Firestore.
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
} from "firebase/firestore";
import { db } from "../lib/firebase/client.js";

export const FacultyRepository = {
  /**
   * Fetch all faculties for a campus (one-time read).
   */
  async getFaculties(campusSlug) {
    if (!campusSlug) return [];
    const ref = collection(db, "campuses", campusSlug, "faculties");
    const snap = await getDocs(ref);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  },

  /**
   * Fetch a single faculty member by ID.
   */
  async getFacultyById(campusSlug, facultyId) {
    if (!campusSlug || !facultyId) return null;
    const ref = doc(db, "campuses", campusSlug, "faculties", facultyId);
    const snap = await getDoc(ref);
    return snap.exists() ? { id: snap.id, ...snap.data() } : null;
  },

};
