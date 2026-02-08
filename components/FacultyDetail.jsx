"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { useAuth } from "@/app/context/auth-context";
import { isValidCampus, getCampusBySlug, isDualCampusEmail, DUAL_CAMPUS_SLUGS } from "@/lib/campus-config";
import { getFacultyPhoto, getScoreColorClass } from "@/lib/faculty-helpers";
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
  const canRateThisCampus = user && userCampus && userCampus === campusSlug;

  const page = searchParams.get("page");
  const q = searchParams.get("q");
  const backHref = `/${campusSlug}${page || q ? `?${new URLSearchParams({ ...(page && { page }), ...(q && { q }) }).toString()}` : ""}`;

  const [faculty, setFaculty] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(REVIEWS_INITIAL);

  const validCampus = isValidCampus(campusSlug);

  useEffect(() => {
    if (!id || !campusSlug || !validCampus) return;

    async function load() {
      try {
        const facultyRef = doc(db, "campuses", campusSlug, "faculties", id);
        const reviewsRef = collection(
          db,
          "campuses",
          campusSlug,
          "faculties",
          id,
          "reviews"
        );

        const fSnap = await getDoc(facultyRef);
        const rSnap = await getDocs(reviewsRef);

        if (fSnap.exists()) setFaculty(fSnap.data());
        else setFaculty(null);

        setReviews(rSnap.docs.map((d) => d.data()));
      } catch (err) {
        console.error("Failed to load faculty:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id, campusSlug, validCampus]);

  useEffect(() => {
    setVisibleCount(REVIEWS_INITIAL);
  }, [id]);

  const visibleReviews = reviews.slice(0, visibleCount);
  const hasMore = visibleCount < reviews.length;
  const showSeeMore = reviews.length > REVIEWS_INITIAL && hasMore;

  function loadMoreReviews() {
    setVisibleCount((prev) => Math.min(prev + REVIEWS_PER_PAGE, reviews.length));
  }
  const remainingCount = reviews.length - visibleCount;
  const nextBatch = Math.min(REVIEWS_PER_PAGE, remainingCount);

  if (loading)
    return (
      <div className="p-10 text-gray-700 dark:text-gray-300">
        Loading...
      </div>
    );

  if (!validCampus)
    return (
      <div className="p-10 text-red-500 dark:text-red-400">
        Campus not found.
      </div>
    );

  if (!faculty)
    return (
      <div className="p-10 text-red-500 dark:text-red-400">
        Faculty not found
      </div>
    );

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
                    {DUAL_CAMPUS_SLUGS.map((slug) => {
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
                <ReviewForm campusSlug={campusSlug} facultyId={id} />
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

              {reviews.length === 0 && (
                <p className="text-gray-500 dark:text-gray-400 text-sm">
                  No reviews yet.
                </p>
              )}

              <div className="space-y-4">
                {visibleReviews.map((r, i) => (
                  <div
                    key={i}
                    className="bg-white dark:bg-gray-800 rounded-xl shadow p-4"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <p className="font-semibold text-gray-900 dark:text-gray-100">
                        Anonymous
                      </p>
                      <Star className="w-4 h-4 text-yellow-400" />
                      <span className="text-sm text-gray-600 dark:text-gray-400">
                        {r.overall}
                      </span>
                    </div>
                    <p className="text-gray-800 dark:text-gray-200 mb-3">
                      {r.text}
                    </p>
                    <div className="flex flex-wrap gap-4 text-xs text-gray-600 dark:text-gray-400">
                      <Metric icon={CalendarCheck} value={r.attendance} />
                      <Metric icon={PenLine} value={r.correction} />
                      <Metric icon={GraduationCap} value={r.teaching} />
                      <Metric icon={Handshake} value={r.approachability} />
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

function formatCount(num) {
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num;
}
