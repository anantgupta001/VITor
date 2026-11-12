/**
 * Reviews Business Logic Service.
 * Handles review validation, rating computations, aggregate statistics, and submission flow.
 */
import { ReviewsRepository } from "../../repositories/reviews.repository.js";
import { FacultyRepository } from "../../repositories/faculty.repository.js";

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

    if (!userCampus || userCampus !== campusSlug) {
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
      sumAttendance += Number(r.attendance) || 0;
      sumCorrection += Number(r.correction) || 0;
      sumTeaching += Number(r.teaching) || 0;
      sumApproachability += Number(r.approachability) || 0;
      sumOverall += Number(r.overall) || 0;
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
   * Complete review submission pipeline:
   * 1. Validate inputs
   * 2. Calculate individual overall score
   * 3. Persist anonymous review
   * 4. Recalculate faculty aggregate stats and update faculty document
   */
  async submitReview({ campusSlug, facultyId, user, userCampus, ratings, comment }) {
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
