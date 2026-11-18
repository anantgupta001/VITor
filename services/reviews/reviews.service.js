
/**
 * Reviews Business Logic Service.
 * Handles review validation, rating computations, aggregate statistics, and trusted API interactions.
 */
import { ReviewsRepository } from "../../repositories/reviews.repository.js";
import { isCampusAuthorizedForEmail } from "../../lib/campus.js";
import { getToken } from "firebase/app-check";
import { appCheck } from "../../lib/firebase/client.js";
import {
  MIN_COMMENT_LENGTH,
  MAX_COMMENT_LENGTH,
  METRIC_KEYS,
} from "../../lib/constants/review.constants.js";

export const ReviewsService = {
  /**
   * Validate a review before submission.
   */
  validateReview({ ratings, comment, user, userCampus, campusSlug }) {
    if (!user) {
      return { valid: false, error: "Please sign in to submit a review." };
    }

    if (!campusSlug) {
      return {
        valid: false,
        error: "You can only rate faculty members from your own campus.",
      };
    }

    if (userCampus === null || userCampus === "") {
      return {
        valid: false,
        error: "You can only rate faculty members from your own campus.",
      };
    }

    const isAuthorized = user.email
      ? isCampusAuthorizedForEmail(user.email, campusSlug)
      : Boolean(userCampus && userCampus === campusSlug);

    if (!isAuthorized) {
      return {
        valid: false,
        error: "You can only rate faculty members from your own campus.",
      };
    }

    const hasAllRatings = METRIC_KEYS.every(
      (k) => ratings && typeof ratings[k] === "number" && ratings[k] >= 1 && ratings[k] <= 5
    );
    if (!hasAllRatings) {
      return { valid: false, error: "Please rate all criteria from 1 to 5 stars." };
    }

    const trimmedComment = typeof comment === "string" ? comment.trim() : "";
    if (trimmedComment.length < MIN_COMMENT_LENGTH) {
      return {
        valid: false,
        error: `Experience must be at least ${MIN_COMMENT_LENGTH} characters.`,
      };
    }
    if (trimmedComment.length > MAX_COMMENT_LENGTH) {
      return {
        valid: false,
        error: `Experience must not exceed ${MAX_COMMENT_LENGTH} characters.`,
      };
    }

    return { valid: true, error: null };
  },

  /**
   * Submits a review via the trusted backend API (Phase 6.1).
   * Enforces server-side ID token verification, App Check verification,
   * atomic transactions, sharding, idempotency, rolling-window rate limits,
   * and optimistic concurrency.
   */
  async submitReviewApi({
    campusSlug,
    facultyId,
    user,
    userCampus,
    ratings,
    comment,
    expectedVersion,
    idempotencyKey,
  }) {
    if (!facultyId || typeof facultyId !== "string" || !facultyId.trim()) {
      throw new Error("Invalid faculty ID specified.");
    }

    const validation = this.validateReview({
      ratings,
      comment,
      user,
      userCampus,
      campusSlug,
    });

    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Get fresh Firebase Authentication ID token
    const idToken =
      typeof user.getIdToken === "function"
        ? await user.getIdToken()
        : user.token || "";

    // Get Firebase App Check token
    const appCheckToken = appCheck
      ? (await getToken(appCheck, false)).token
      : "";

    const key =
      idempotencyKey ||
      (typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`);

    const headers = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
      "Idempotency-Key": key,
      ...(appCheckToken
        ? { "X-Firebase-AppCheck": appCheckToken }
        : {}),
    };

    const res = await fetch("/api/reviews", {
      method: "POST",
      headers,
      body: JSON.stringify({
        campusSlug,
        facultyId,
        ratings,
        comment: comment.trim(),
        expectedVersion,
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = new Error(data.error || "Failed to submit review.");
      err.code = data.code;
      err.statusCode = res.status;
      err.retryAfter = data.retryAfter;
      err.currentVersion = data.currentVersion;
      throw err;
    }

    // Re-fetch all reviews to ensure full fresh list
    let allReviews = [];
    try {
      allReviews = await ReviewsRepository.getPublicReviews(campusSlug, facultyId);
    } catch {
      // Fallback to returned review
      if (data.review) allReviews = [data.review];
    }

    return {
      success: true,
      overall: data.overall,
      updatedStats: data.updatedStats,
      review: data.review,
      reviews: allReviews,
    };
  },

  /**
   * Complete review submission pipeline.
   * Reviews are only ever written through the trusted backend API; direct client
   * Firestore writes are denied by production rules.
   */
  async submitReview(args) {
    return this.submitReviewApi(args);
  },
};
