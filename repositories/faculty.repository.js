/**
 * Faculty Data Access Layer.
 * Interacts with `campuses/{campusSlug}/faculties` in Firestore.
 */
import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase/client.js";

export const FacultyRepository = {
  /**
   * Fetch all faculties for a campus via the server-side cached directory API
   * (GET /api/faculties). Search, filtering and pagination remain client-side.
   */
  async getFaculties(campusSlug) {
    if (!campusSlug) return [];
    const res = await fetch(
      `/api/faculties?campusSlug=${encodeURIComponent(campusSlug)}`
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || "Failed to load faculty list.");
    }
    return Array.isArray(data.faculties) ? data.faculties : [];
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
