"use client";

import { useId, useState } from "react";
import { useAuth } from "@/context/auth-context";
import { ReviewsService } from "@/services/reviews/reviews.service";
import { MIN_COMMENT_LENGTH } from "@/lib/constants/review.constants";
import { createLogger } from "@/lib/logger";

const log = createLogger("ReviewForm");

import {
  CalendarCheck,
  PenLine,
  BookOpen,
  Handshake,
  MessageSquare,
  Star,
} from "lucide-react";

const METRIC_CONFIGS = [
  { key: "attendance", label: "Attendance", icon: CalendarCheck },
  { key: "correction", label: "Correction", icon: PenLine },
  { key: "teaching", label: "Teaching", icon: BookOpen },
  { key: "approachability", label: "Approachability", icon: Handshake },
];

export default function ReviewForm({ campusSlug, facultyId, onReviewSubmitted }) {
  const { user, userCampus } = useAuth();
  const canSubmit = Boolean(user && userCampus === campusSlug);
  const formId = useId();
  const commentId = `${formId}-comment`;

  const [ratings, setRatings] = useState({
    attendance: 0,
    correction: 0,
    teaching: 0,
    approachability: 0,
  });

  const [comment, setComment] = useState("");
  const [hover, setHover] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const allRated = Object.values(ratings).every((v) => v > 0);
  const validComment = comment.trim().length >= MIN_COMMENT_LENGTH;
  const isFormValid = canSubmit && allRated && validComment && !submitting;

  async function handleSubmitReview() {
    if (!isFormValid) return;

    setSubmitting(true);
    setError(null);

    try {
      const result = await ReviewsService.submitReview({
        campusSlug,
        facultyId,
        user,
        userCampus,
        ratings,
        comment,
      });

      // Reset form state on successful submission
      setComment("");
      setRatings({
        attendance: 0,
        correction: 0,
        teaching: 0,
        approachability: 0,
      });

      if (typeof onReviewSubmitted === "function") {
        onReviewSubmitted(result);
      }
    } catch (err) {
      log.error("Failed to submit review:", err);
      let userMsg = err?.message || "Failed to submit review. Try again.";
      if (err?.statusCode === 429 || err?.code === "RATE_LIMIT_EXCEEDED") {
        userMsg = err.message || "Rate limit reached: Maximum 5 reviews per 24 hours.";
      } else if (err?.statusCode === 409 || err?.code === "VERSION_CONFLICT") {
        userMsg = "This review was modified in another window. Please refresh the page.";
      } else if (err?.statusCode === 503 || err?.code === "SERVICE_MAINTENANCE") {
        userMsg = "Review submission is temporarily paused for system maintenance. Please try again soon.";
      }
      setError(userMsg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* COMMENT */}
      <div>
        <div className="flex items-center gap-2 mb-2 text-gray-700 dark:text-gray-300">
          <MessageSquare className="w-4 h-4" />
          <label htmlFor={commentId} className="text-sm font-medium">
            Your Experience
          </label>
        </div>

        <textarea
          id={commentId}
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={`Share your honest experience (minimum ${MIN_COMMENT_LENGTH} characters)`}
          rows={4}
          className="
            w-full
            resize-none
            overflow-y-auto
            hide-scrollbar
            rounded-xl px-4 py-3 text-sm
            bg-white dark:bg-gray-800
            text-gray-900 dark:text-gray-100
            placeholder:text-gray-400 dark:placeholder:text-gray-500
            border border-gray-200 dark:border-gray-700
            focus:border-gray-400 dark:focus:border-gray-500
            focus:ring-0
            focus-visible:ring-2 focus-visible:ring-gray-400 dark:focus-visible:ring-gray-500
            transition
          "
        />
      </div>

      {/* METRICS */}
      <div className="space-y-4">
        {METRIC_CONFIGS.map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.key}
              role="group"
              aria-labelledby={`${formId}-${m.key}`}
              className="flex items-center justify-between"
            >
              <div
                id={`${formId}-${m.key}`}
                className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200"
              >
                <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                {m.label}
              </div>

              <StarRow
                value={ratings[m.key]}
                hoverValue={hover[m.key]}
                onHover={(v) => setHover((h) => ({ ...h, [m.key]: v }))}
                onLeave={() => setHover((h) => ({ ...h, [m.key]: 0 }))}
                onSelect={(v) => setRatings((r) => ({ ...r, [m.key]: v }))}
              />
            </div>
          );
        })}
      </div>

      {/* ERROR */}
      {error && (
        <p role="alert" className="text-sm text-red-500 dark:text-red-400">
          {error}
        </p>
      )}

      {/* SUBMIT */}
      <button
        onClick={handleSubmitReview}
        disabled={!isFormValid}
        className={`
          w-full py-2.5 rounded-lg text-sm font-medium transition
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-gray-500
          ${
            !isFormValid
              ? "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-not-allowed"
              : "bg-black dark:bg-white text-white dark:text-black hover:bg-gray-900 dark:hover:bg-gray-200"
          }
        `}
      >
        {submitting ? "Submitting..." : "Submit Review"}
      </button>
    </div>
  );
}

function StarRow({ value, hoverValue, onHover, onLeave, onSelect }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const starValue = i + 1;
        const active = hoverValue
          ? starValue <= hoverValue
          : starValue <= value;

        return (
          <button
            key={i}
            type="button"
            onMouseEnter={() => onHover(starValue)}
            onMouseLeave={onLeave}
            onClick={() => onSelect(starValue)}
            className="p-0.5 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-500"
            aria-label={`${starValue} star`}
          >
            <Star
              className={`
                w-5 h-5 transition
                ${
                  active
                    ? "fill-yellow-400 text-yellow-400"
                    : "text-gray-300 dark:text-gray-500"
                }
              `}
            />
          </button>
        );
      })}
    </div>
  );
}
