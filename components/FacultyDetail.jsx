"use client";

import { useEffect, useState } from "react";
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

const REVIEWS_INITIAL = 3;
const REVIEWS_PER_PAGE = 3;

export default function FacultyDetail() {
  const { campus: campusSlug, id } = useParams();
  const searchParams = useSearchParams();
  const { user, userCampus, setUserCampus } = useAuth();
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
  const [visibleCount, setVisibleCount] = useState(REVIEWS_INITIAL);
  const [refreshingReviews, setRefreshingReviews] = useState(false);

  const validCampus = isValidCampus(campusSlug);

  useEffect(() => {
    if (!id || !campusSlug || !validCampus) return;
    let cancelled = false;

    async function loadFacultyAndReviews() {
      try {
        const [facultyData, reviewsData] = await Promise.all([
          FacultyRepository.getFacultyById(campusSlug, id),
          ReviewsRepository.getPublicReviews(campusSlug, id),
        ]);

        if (!cancelled) {
          setFaculty(facultyData);
          setReviews(reviewsData);
        }
      } catch (err) {
        console.error("Failed to load faculty details:", err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadFacultyAndReviews();

    return () => {
      cancelled = true;
    };
  }, [id, campusSlug, validCampus]);

  useEffect(() => {
    setVisibleCount(REVIEWS_INITIAL);
  }, [id]);

  /**
   * Called by ReviewForm after a successful submission.
   * - Merges updated aggregate stats into faculty state immediately (no refetch needed).
   * - Uses already fetched review list from submitReview to avoid duplicate fetches,
   *   or falls back to fetching fresh reviews if not provided.
   * - Resets visibleCount so the user sees the list from the top (consistent UX).
   */
  function handleReviewSubmitted({ updatedStats, reviews: freshReviews } = {}) {
    // Update faculty score stats immediately from the already-computed result
    if (updatedStats) {
      setFaculty((prev) => ({ ...prev, ...updatedStats }));
    }

    if (freshReviews) {
      setReviews(freshReviews);
      setVisibleCount(REVIEWS_INITIAL);
      return;
    }

    // Fallback: Re-fetch reviews so the new entry is visible and ordering is authoritative
    setRefreshingReviews(true);
    ReviewsRepository.getPublicReviews(campusSlug, id)
      .then((fresh) => {
        setReviews(fresh);
        setVisibleCount(REVIEWS_INITIAL);
      })
      .catch((err) => {
        console.error("Failed to refresh reviews after submission:", err);
      })
      .finally(() => {
        setRefreshingReviews(false);
      });
  }

  const activeReviews = reviews.filter((r) => r.status === "ACTIVE" || r.status === undefined);
  const visibleReviews = activeReviews.slice(0, visibleCount);
  const hasMore = visibleCount < activeReviews.length;
  const showSeeMore = activeReviews.length > REVIEWS_INITIAL && hasMore;

  function loadMoreReviews() {
    setVisibleCount((prev) => Math.min(prev + REVIEWS_PER_PAGE, activeReviews.length));
  }
  const remainingCount = activeReviews.length - visibleCount;

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
        Faculty not found
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
                <button
                  type="button"
                  onClick={loadMoreReviews}
                  className="
                    mt-4 w-full py-3 rounded-xl
                    border border-gray-200 dark:border-gray-600
                    bg-white dark:bg-gray-800
                    text-gray-700 dark:text-gray-300 text-sm font-medium
                    hover:bg-gray-50 dark:hover:bg-gray-700
                    transition flex items-center justify-center gap-2
                  "
                >
                  Show more
                  <span className="text-gray-500 dark:text-gray-400">
                    ({remainingCount} left)
                  </span>
                  <ChevronDown className="w-4 h-4" />
                </button>
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
