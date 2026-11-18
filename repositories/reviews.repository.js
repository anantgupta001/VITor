/**
 * Reviews Data Access Layer.
 * Public review reads go through the trusted `GET /api/reviews` endpoint; all
 * review writes go through `POST /api/reviews` (see ReviewsService).
 */
export const ReviewsRepository = {
  /**
   * Fetch a page of publicly visible reviews for a faculty member (what the UI must use).
   *
   * Reads go through the trusted `GET /api/reviews` endpoint, which returns only
   * ACTIVE reviews and strips author identifiers. Production Firestore rules deny
   * direct client reads of the `reviews` collection.
   *
   * @param {string} campusSlug
   * @param {string} facultyId
   * @param {object} [options]
   * @param {string|null} [options.cursor]
   * @param {number|string} [options.limit]
   * @returns {Promise<{ reviews: Array, nextCursor: string|null, hasMore: boolean }>}
   */
  async getPublicReviews(campusSlug, facultyId, { cursor, limit } = {}) {
    if (!campusSlug || !facultyId) {
      return { reviews: [], nextCursor: null, hasMore: false };
    }
    const params = new URLSearchParams({ campusSlug, facultyId });
    if (cursor) params.set("cursor", cursor);
    if (limit) params.set("limit", String(limit));

    const res = await fetch(`/api/reviews?${params.toString()}`, { cache: "no-store" });
    if (!res.ok) {
      const err = new Error("Failed to load reviews.");
      err.statusCode = res.status;
      throw err;
    }
    const data = await res.json();
    return {
      reviews: Array.isArray(data?.reviews) ? data.reviews : [],
      nextCursor: typeof data?.nextCursor === "string" ? data.nextCursor : null,
      hasMore: Boolean(data?.hasMore),
    };
  },
};
