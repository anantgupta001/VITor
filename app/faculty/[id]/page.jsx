"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/app/context/AuthContext";
import ReviewForm from "@/components/ReviewForm";

import {
  CalendarCheck,
  PenLine,
  GraduationCap,
  Handshake,
  Star,
  Users,
  ArrowLeft,
} from "lucide-react";

export default function FacultyDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const [faculty, setFaculty] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    async function load() {
      try {
        const facultyRef = doc(db, "faculties", id);
        const reviewsRef = collection(db, "faculties", id, "reviews");

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
  }, [id]);

  if (loading)
    return (
      <div className="p-10 text-gray-700 dark:text-gray-300">
        Loading...
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

        {/* BACK BUTTON */}
        <button
          onClick={() => router.back()}
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
        </button>

        {/* MAIN GRID */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ========== LEFT COLUMN ========== */}
          <div className="space-y-6">

            {/* PHOTO CARD */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-4">
              <img
                src={faculty.photo}
                alt={faculty.name}
                className="w-full h-80 object-cover object-top rounded-xl"
              />
              <p className="mt-4 text-center font-semibold text-lg text-gray-900 dark:text-gray-100">
                {faculty.name}
              </p>
            </div>

            {/* WARNING */}
            {!user && (
              <div className="rounded-xl border border-amber-300 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/30 px-4 py-3 flex gap-3">
                <span className="text-amber-600 dark:text-amber-400">⚠️</span>
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  Please sign in using your official college ID to submit a review.
                </p>
              </div>
            )}

            {/* WRITE REVIEW */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-5">
              <h3 className="font-semibold mb-3 text-gray-900 dark:text-gray-100">
                Write a Review
              </h3>
              {user ? (
                <ReviewForm facultyId={id} />
              ) : (
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Sign in to submit a review.
                </p>
              )}
            </div>
          </div>

          {/* ========== RIGHT COLUMN ========== */}
          <div className="lg:col-span-2 space-y-8">

            {/* BASIC INFO */}
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

            {/* STATS */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Stat icon={CalendarCheck} title="Attendance" value={faculty.avgAttendance} />
              <Stat icon={PenLine} title="Correction" value={faculty.avgCorrection} />
              <Stat icon={GraduationCap} title="Teaching" value={faculty.avgTeaching} />
              <Stat icon={Handshake} title="Approachability" value={faculty.avgApproachability} />
              <Stat icon={Star} title="Overall Rating" value={faculty.avgRating} />
              <Stat icon={Users} title="Total Reviews" value={faculty.reviewCount} isCount />
            </div>

            {/* REVIEWS */}
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
                {reviews.map((r, i) => (
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
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

/* ========== SMALL COMPONENTS ========== */

function Stat({ icon: Icon, title, value, isCount }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 text-center">
      <Icon className="w-5 h-5 mx-auto mb-2 text-gray-500 dark:text-gray-400" />
      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {value !== undefined && value !== null
          ? isCount
            ? formatCount(value)
            : value.toFixed(2)
          : "—"}
        {!isCount && value != null && <span className="text-sm"> /5</span>}
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
        {title}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, value }) {
  return (
    <span className="flex items-center gap-1">
      <Icon className="w-3.5 h-3.5" />
      {value}
    </span>
  );
}

function formatCount(num) {
  if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
  return num;
}
