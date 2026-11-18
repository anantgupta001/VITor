/**
 * Reviews Data Access Layer.
 * Public review reads go through the trusted `GET /api/reviews` endpoint; all
 * review writes go through `POST /api/reviews` (see ReviewsService).
 */
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
};
