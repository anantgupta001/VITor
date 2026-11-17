
/**
 * Reviews Business Logic Service.
 * Handles review validation, rating computations, aggregate statistics, and trusted API interactions.
 */
import { ReviewsRepository } from "../../repositories/reviews.repository.js";
import { FacultyRepository } from "../../repositories/faculty.repository.js";
import { isCampusAuthorizedForEmail } from "../../lib/campus.js";
import { getToken } from "firebase/app-check";
import { appCheck } from "../../lib/firebase/client.js";

export const MIN_COMMENT_LENGTH = 10;
export const MAX_COMMENT_LENGTH = 1000;

export const METRIC_KEYS = ["attendance", "correction", "teaching", "approachability"];

export const ReviewsService = {
  /**
   * Calculate overall score for a single review (average of the 4 criteria).
   */
  calculateOverallRating(ratings) {
    if (!ratings) return 0;
    const sum =
      (Number(ratings.attendance) || 0) +
      (Number(ratings.correction) || 0) +
      (Number(ratings.teaching) || 0) +
      (Number(ratings.approachability) || 0);
    return sum / 4;
  },

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
   * Calculate aggregate statistics for a faculty member from their reviews.
   * Matches the exact formula and 2-decimal precision of the existing codebase.
   */
  calculateAggregateStats(reviews = []) {
    const total = reviews.length;
    if (total === 0) {
      return {
        avgAttendance: 0,
        avgCorrection: 0,
        avgTeaching: 0,
        avgApproachability: 0,
        avgRating: 0,
        reviewCount: 0,
      };
    }

    let sumAttendance = 0;
    let sumCorrection = 0;
    let sumTeaching = 0;
    let sumApproachability = 0;
    let sumOverall = 0;

    for (const r of reviews) {
      const attendance = r.ratings?.attendance ?? r.attendance;
      const correction = r.ratings?.correction ?? r.correction;
      const teaching = r.ratings?.teaching ?? r.teaching;
      const approachability = r.ratings?.approachability ?? r.approachability;
      const overall = r.ratings?.overall ?? r.overall;

      sumAttendance += Number(attendance) || 0;
      sumCorrection += Number(correction) || 0;
      sumTeaching += Number(teaching) || 0;
      sumApproachability += Number(approachability) || 0;
      sumOverall += Number(overall) || 0;
    }

    return {
      avgAttendance: +(sumAttendance / total).toFixed(2),
      avgCorrection: +(sumCorrection / total).toFixed(2),
      avgTeaching: +(sumTeaching / total).toFixed(2),
      avgApproachability: +(sumApproachability / total).toFixed(2),
      avgRating: +(sumOverall / total).toFixed(2),
      reviewCount: total,
    };
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
      allReviews = await ReviewsRepository.getReviewsByFaculty(campusSlug, facultyId);
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
   * If running in the browser and auth token is available, delegates to trusted backend API.
   * In local test runner, preserves direct repository call for test suite compatibility.
   */
  async submitReview({
    campusSlug,
    facultyId,
    user,
    userCampus,
    ratings,
    comment,
    expectedVersion,
    idempotencyKey,
    useApi,
  }) {
    if (useApi || (typeof window !== "undefined" && typeof fetch === "function")) {
      return this.submitReviewApi({
        campusSlug,
        facultyId,
        user,
        userCampus,
        ratings,
        comment,
        expectedVersion,
        idempotencyKey,
      });
    }

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

    const overall = this.calculateOverallRating(ratings);

    // Save review
    await ReviewsRepository.saveReview(campusSlug, facultyId, user.uid, {
      user: "Anonymous User",
      attendance: ratings.attendance,
      correction: ratings.correction,
      teaching: ratings.teaching,
      approachability: ratings.approachability,
      overall,
      text: comment.trim(),
    });

    // Recompute faculty stats
    const allReviews = await ReviewsRepository.getReviewsByFaculty(campusSlug, facultyId);
    const updatedStats = this.calculateAggregateStats(allReviews);
    await FacultyRepository.updateFacultyStats(campusSlug, facultyId, updatedStats);

    return { success: true, overall, updatedStats, reviews: allReviews };
  },
};
