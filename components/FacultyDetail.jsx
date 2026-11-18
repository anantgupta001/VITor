"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useAuth } from "@/context/auth-context";
import { FacultyRepository } from "@/repositories/faculty.repository";
import { ReviewsRepository } from "@/repositories/reviews.repository";
import { isValidCampus, getDualCampusOptions, getCampusBySlug, isDualCampusEmail } from "@/lib/campus";
import { getFacultyPhoto } from "@/lib/utils/faculty";
import { getScoreColorClass } from "@/lib/utils/styling";
import { formatCount } from "@/lib/utils/formatters";
import ReviewForm from "@/components/ReviewForm";
import { createLogger } from "@/lib/logger";

import {
  CalendarCheck,
  PenLine,
  GraduationCap,
  Handshake,
  Star,
  Users,
  ArrowLeft,
  ChevronDown,
} from "lucide-react";

const log = createLogger("FacultyDetail");

const REVIEWS_INITIAL = 3;
const REVIEWS_PER_PAGE = 3;

export default function FacultyDetail() {
  const { campus: campusSlug, id } = useParams();
  const searchParams = useSearchParams();
  const { user, userCampus, setUserCampus, campusError } = useAuth();
  const canRateThisCampus = Boolean(user && userCampus && userCampus === campusSlug);

  const page = searchParams.get("page");
  const q = searchParams.get("q");
  const backHref = `/${campusSlug}${
    page || q
      ? `?${new URLSearchParams({ ...(page && { page }), ...(q && { q }) }).toString()}`
      : ""
  }`;

  const [faculty, setFaculty] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [refreshError, setRefreshError] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [unpaginatedReviews, setUnpaginatedReviews] = useState([]);
  const [refreshingReviews, setRefreshingReviews] = useState(false);

  const validCampus = isValidCampus(campusSlug);
  const facultyKey = `${campusSlug || ""}:${id || ""}`;
  const [previousFacultyKey, setPreviousFacultyKey] = useState(facultyKey);
  const requestVersionRef = useRef(0);

  // Invalidate pending requests whenever the selected faculty changes.
  useEffect(() => {
    requestVersionRef.current += 1;

    return () => {
      requestVersionRef.current += 1;
    };
  }, [facultyKey]);

  // Reset faculty and review state when the selected faculty changes.
  if (facultyKey !== previousFacultyKey) {
    setPreviousFacultyKey(facultyKey);
    setFaculty(null);
    setReviews([]);
    setNextCursor(null);
    setHasMore(false);
    setLoadMoreError(null);
    setLoadError(null);
    setRefreshError(null);
    setUnpaginatedReviews([]);
    setLoading(true);
    setLoadingMore(false);
    setRefreshingReviews(false);
  }

  useEffect(() => {
    if (!id || !campusSlug || !validCampus) return;
    let cancelled = false;

    async function loadFacultyAndReviews() {
      try {
        const [facultyData, reviewsData] = await Promise.all([
          FacultyRepository.getFacultyById(campusSlug, id),
          ReviewsRepository.getPublicReviews(campusSlug, id, { limit: REVIEWS_PER_PAGE }),
        ]);

        if (!cancelled) {
          setFaculty(facultyData);
          if (Array.isArray(reviewsData)) {
            // Backward-compatibility fallback if a caller or mock returns an unpaginated array
            const active = reviewsData.filter((r) => r.status === "ACTIVE" || r.status === undefined);
            setUnpaginatedReviews(active);
            setReviews(active.slice(0, REVIEWS_INITIAL));
            setNextCursor(null);
            setHasMore(active.length > REVIEWS_INITIAL);
          } else {
            setUnpaginatedReviews([]);
            setReviews(Array.isArray(reviewsData?.reviews) ? reviewsData.reviews : []);
            setNextCursor(reviewsData?.nextCursor || null);
            setHasMore(Boolean(reviewsData?.hasMore));
          }
        }
      } catch (err) {
        log.error("Failed to load faculty details:", err);
        if (!cancelled) setLoadError("Failed to load faculty details. Please try again later.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadFacultyAndReviews();

    return () => {
      cancelled = true;
    };
  }, [id, campusSlug, validCampus]);


  /**
   * Called by ReviewForm after a successful submission.
   * - Merges updated aggregate stats into faculty state immediately (no refetch needed).
   * - Re-fetches the initial page of reviews to reset cursor and ensure consistent pagination.
   */
  function handleReviewSubmitted({ updatedStats, reviews: freshReviews } = {}) {
    // Update faculty score stats immediately from the already-computed result
    if (updatedStats) {
      setFaculty((prev) => ({ ...prev, ...updatedStats }));
    }

    if (freshReviews) {
      if (Array.isArray(freshReviews)) {
        const active = freshReviews.filter((r) => r.status === "ACTIVE" || r.status === undefined);
        setUnpaginatedReviews(active);
        setReviews(active.slice(0, REVIEWS_INITIAL));
        setNextCursor(null);
        setHasMore(active.length > REVIEWS_INITIAL);
      } else {
        setUnpaginatedReviews([]);
        setReviews(Array.isArray(freshReviews?.reviews) ? freshReviews.reviews : []);
        setNextCursor(freshReviews?.nextCursor || null);
        setHasMore(Boolean(freshReviews?.hasMore));
      }
      return;
    }

    // Fallback: Re-fetch first page so the new entry is visible and pagination is reset
    setRefreshingReviews(true);
    setRefreshError(null);
    const requestVersion = requestVersionRef.current;

    ReviewsRepository.getPublicReviews(campusSlug, id, { limit: REVIEWS_PER_PAGE })
      .then((fresh) => {
        if (requestVersion !== requestVersionRef.current) return;

        if (Array.isArray(fresh)) {
          const active = fresh.filter((r) => r.status === "ACTIVE" || r.status === undefined);
          setUnpaginatedReviews(active);
          setReviews(active.slice(0, REVIEWS_INITIAL));
          setNextCursor(null);
          setHasMore(active.length > REVIEWS_INITIAL);
        } else {
          setUnpaginatedReviews([]);
          setReviews(Array.isArray(fresh?.reviews) ? fresh.reviews : []);
          setNextCursor(fresh?.nextCursor || null);
          setHasMore(Boolean(fresh?.hasMore));
        }
      })
      .catch((err) => {
        if (requestVersion !== requestVersionRef.current) return;

        log.error("Failed to refresh reviews after submission:", err);
        setRefreshError("Your review was saved, but the list could not be refreshed. Please reload the page.");
      })
      .finally(() => {
        if (requestVersion === requestVersionRef.current) {
          setRefreshingReviews(false);
        }
      });
  }

  const activeReviews = reviews.filter((r) => r.status === "ACTIVE" || r.status === undefined);
  const visibleReviews = activeReviews;
  const showSeeMore = hasMore;

  async function loadMoreReviews() {
    if (loadingMore || !hasMore) return;

    // If an unpaginated array was supplied by mock or legacy caller
    if (!nextCursor && unpaginatedReviews.length > visibleReviews.length) {
      const nextBatch = unpaginatedReviews.slice(
        visibleReviews.length,
        visibleReviews.length + REVIEWS_PER_PAGE
      );
      setReviews((prev) => [...prev, ...nextBatch]);
      setHasMore(unpaginatedReviews.length > visibleReviews.length + nextBatch.length);
      return;
    }

    if (!nextCursor) {
      setHasMore(false);
      return;
    }

    setLoadingMore(true);
    setLoadMoreError(null);
    const requestVersion = requestVersionRef.current;

    try {
      const res = await ReviewsRepository.getPublicReviews(campusSlug, id, {
        cursor: nextCursor,
        limit: REVIEWS_PER_PAGE,
      });

      if (requestVersion !== requestVersionRef.current) return;

      const incomingReviews = Array.isArray(res)
        ? res
        : Array.isArray(res?.reviews)
        ? res.reviews
        : [];

      setReviews((prev) => {
        const existingIds = new Set(prev.map((r) => r.id));
        const unique = incomingReviews.filter((r) => !existingIds.has(r.id));
        return [...prev, ...unique];
      });

      setNextCursor(res?.nextCursor || null);
      setHasMore(Boolean(res?.hasMore));
    } catch (err) {
      if (requestVersion !== requestVersionRef.current) return;

      log.error("Failed to load more reviews:", err);
      setLoadMoreError("Failed to load more reviews. Please try again.");
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setLoadingMore(false);
      }
    }
  }

  const remainingCount =
    unpaginatedReviews.length > visibleReviews.length
      ? unpaginatedReviews.length - visibleReviews.length
      : faculty?.reviewCount != null
      ? Math.max(0, faculty.reviewCount - visibleReviews.length)
      : null;

  if (!validCampus) {
    return (
      <div role="alert" className="p-10 text-red-500 dark:text-red-400">
        Campus not found.
      </div>
    );
  }

  if (loading) {
    return (
      <div role="status" aria-live="polite" className="p-10 text-gray-700 dark:text-gray-300">
        Loading...
      </div>
    );
  }

  if (!faculty) {
    return (
      <div role="alert" className="p-10 text-red-500 dark:text-red-400">
        {loadError || "Faculty not found"}
      </div>
    );
  }

  const dualCampusOptions = getDualCampusOptions();

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <Link
          href={backHref}
          className="
            mb-6
            inline-flex items-center gap-2
            text-sm font-medium
            text-gray-600 dark:text-gray-400
            hover:text-gray-900 dark:hover:text-gray-200
            transition
          "
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="space-y-6">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-4">
              {/* Dynamic faculty photos from external CDNs/S3 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={getFacultyPhoto(faculty)}
                alt={faculty.name || "Faculty"}
                className="w-full h-80 object-cover object-top rounded-xl"
              />
              <p className="mt-4 text-center font-semibold text-lg text-gray-900 dark:text-gray-100">
                {faculty.name}
              </p>
            </div>

            {!user && (
              <div className="rounded-xl border border-amber-300 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/30 px-4 py-3 flex gap-3">
                <span className="text-amber-600 dark:text-amber-400">⚠️</span>
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Please sign in using your official college ID to submit a review.
                </p>
              </div>
            )}

            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-5">
              <h3 className="font-semibold mb-3 text-gray-900 dark:text-gray-100">
                Write a Review
              </h3>
              {!user ? (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Sign in to submit a review.
                </p>
              ) : userCampus == null && isDualCampusEmail(user.email) ? (
                <div className="rounded-xl border border-sky-300 dark:border-sky-600 bg-sky-50 dark:bg-sky-900/30 px-4 py-3 space-y-3">
                  <p className="text-sm text-sky-800 dark:text-sky-300">
                    Your email is used for both Vellore and Chennai. Select your campus to rate faculty:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {dualCampusOptions.map((slug) => {
                      const campus = getCampusBySlug(slug);
                      return (
                        <button
                          key={slug}
                          type="button"
                          onClick={() => setUserCampus(slug)}
                          className="px-4 py-2 rounded-lg text-sm font-medium bg-white dark:bg-gray-800 border border-sky-400 dark:border-sky-500 text-sky-800 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-800/50 transition"
                        >
                          {campus?.label ?? slug}
                        </button>
                      );
                    })}
                  </div>
                  {campusError && (
                    <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                      {campusError}
                    </p>
                  )}
                </div>
              ) : !canRateThisCampus ? (
                <div className="rounded-xl border border-sky-300 dark:border-sky-600 bg-sky-50 dark:bg-sky-900/30 px-4 py-3 flex gap-3">
                  <span className="text-sky-600 dark:text-sky-400">ℹ️</span>
                  <p className="text-sm text-sky-800 dark:text-sky-300">
                    You can only rate faculty from your own campus
                    {userCampus && getCampusBySlug(userCampus) && (
                      <> ({getCampusBySlug(userCampus).label})</>
                    )}
                    . This page is for another campus.
                  </p>
                </div>
              ) : (
                <ReviewForm
                  campusSlug={campusSlug}
                  facultyId={id}
                  onReviewSubmitted={handleReviewSubmitted}
                />
              )}
            </div>
          </div>

          <div className="lg:col-span-2 space-y-8">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                {faculty.name}
              </h1>
              <p className="text-gray-700 dark:text-gray-300">
                {faculty.designation}
              </p>
              <p className="text-gray-600 dark:text-gray-400 text-sm">
                {faculty.department}
              </p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Stat icon={CalendarCheck} title="Attendance" value={faculty.avgAttendance} />
              <Stat icon={PenLine} title="Correction" value={faculty.avgCorrection} />
              <Stat icon={GraduationCap} title="Teaching" value={faculty.avgTeaching} />
              <Stat icon={Handshake} title="Approachability" value={faculty.avgApproachability} />
              <Stat icon={Star} title="Overall Rating" value={faculty.avgRating} />
              <Stat icon={Users} title="Total Reviews" value={faculty.reviewCount} isCount />
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-4 text-gray-900 dark:text-gray-100">
                Student Reviews
              </h3>

              {refreshingReviews && (
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
                  Updating reviews…
                </p>
              )}

              {refreshError && (
                <p role="alert" className="text-sm text-red-500 dark:text-red-400 mb-3">
                  {refreshError}
                </p>
              )}

              {!refreshingReviews && reviews.length === 0 && (
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  No reviews yet.
                </p>
              )}

              <div className="space-y-4">
                {visibleReviews.map((r, i) => (
                  <div
                    key={r.id || i}
                    className="bg-white dark:bg-gray-800 rounded-xl shadow p-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">
                        Anonymous
                      </p>
                      <Star className="w-4 h-4 text-yellow-400" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {r.ratings?.overall ?? r.overall}
                      </span>
                    </div>
                    <p className="text-gray-800 dark:text-gray-200 mb-3">
                      {r.comment || r.text}
                    </p>
                    <div className="flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-400">
                      <Metric icon={CalendarCheck} value={r.ratings?.attendance ?? r.attendance} />
                      <Metric icon={PenLine} value={r.ratings?.correction ?? r.correction} />
                      <Metric icon={GraduationCap} value={r.ratings?.teaching ?? r.teaching} />
                      <Metric icon={Handshake} value={r.ratings?.approachability ?? r.approachability} />
                    </div>
                  </div>
                ))}
              </div>

              {showSeeMore && (
                <div className="mt-4">
                  <button
                    type="button"
                    onClick={loadMoreReviews}
                    disabled={loadingMore}
                    className="
                      w-full py-3 rounded-xl
                      border border-gray-200 dark:border-gray-600
                      bg-white dark:bg-gray-800
                      text-gray-700 dark:text-gray-300 text-sm font-medium
                      hover:bg-gray-50 dark:hover:bg-gray-700
                      disabled:opacity-50 disabled:cursor-not-allowed
                      transition flex items-center justify-center gap-2
                    "
                  >
                    {loadingMore ? (
                      "Loading..."
                    ) : (
                      <>
                        Show more
                        {remainingCount != null && remainingCount > 0 && (
                          <span className="text-gray-500 dark:text-gray-400">
                            ({remainingCount} left)
                          </span>
                        )}
                        <ChevronDown className="w-4 h-4" />
                      </>
                    )}
                  </button>
                  {loadMoreError && (
                    <p role="alert" className="mt-2 text-center text-sm text-red-500 dark:text-red-400">
                      {loadMoreError}
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, title, value, isCount }) {
  const scoreClass = isCount ? "text-gray-900 dark:text-gray-100" : getScoreColorClass(value);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 text-center">
      <Icon className="w-5 h-5 mx-auto mb-2 text-gray-500 dark:text-gray-400" />
      <div className={`text-2xl font-bold ${scoreClass}`}>
        {value !== undefined && value !== null
          ? isCount
            ? formatCount(value)
            : value.toFixed(2)
          : "—"}
        {!isCount && value != null && <span className="text-sm opacity-80"> /5</span>}
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
        {title}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, value }) {
  const scoreClass = getScoreColorClass(value);
  return (
    <span className={`flex items-center gap-1 ${scoreClass}`}>
      <Icon className="w-3.5 h-3.5" />
      {value}
    </span>
  );
}
