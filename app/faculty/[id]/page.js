"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/app/context/AuthContext";
import ReviewForm from "@/components/ReviewForm";

export default function FacultyDetailPage() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();

  // ✅ read params SAFELY
  const page = searchParams.get("page") || 1;
  const q = searchParams.has("q") ? searchParams.get("q") : null;

  const [faculty, setFaculty] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ================= LOAD DATA ================= */

  useEffect(() => {
    if (!id) return;

    async function load() {
      try {
        const facultyRef = doc(db, "faculties", id);
        const reviewsRef = collection(db, "faculties", id, "reviews");

        const fSnap = await getDoc(facultyRef);
        const rSnap = await getDocs(reviewsRef);

        if (fSnap.exists()) {
          setFaculty(fSnap.data());
        } else {
          setFaculty(null);
        }

        setReviews(rSnap.docs.map((d) => d.data()));
      } catch (err) {
        console.error("Failed to load faculty:", err);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [id]);

  /* ================= BACK HANDLER ================= */

  function goBack() {
    const params = new URLSearchParams();
    params.set("page", page);

    // ✅ add q ONLY if it truly existed & non-empty
    if (q && q.trim().length > 0) {
      params.set("q", q);
    }

    router.push(`/?${params.toString()}`);
  }

  /* ================= STATES ================= */

  if (loading) {
    return (
      <div className="p-10 text-gray-700 dark:text-gray-300">
        Loading...
      </div>
    );
  }

  if (!faculty) {
    return (
      <div className="p-10 text-red-500 dark:text-red-400">
        Faculty not found
      </div>
    );
  }

  /* ================= UI ================= */

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* 🔙 BACK BUTTON */}
        <button
          onClick={goBack}
          className="mb-6 text-sm text-gray-600 dark:text-gray-300 hover:underline"
        >
          ← Back to results
        </button>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

          {/* ========== LEFT COLUMN ========== */}
          <div className="space-y-6">

            {/* PHOTO CARD */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow p-4">
              <img
                src={faculty.photo}
                alt={faculty.name}
                className="w-full h-80 object-cover rounded-xl"
              />
              <p className="mt-4 text-center font-semibold text-lg text-gray-900 dark:text-gray-100">
                {faculty.name}
              </p>
            </div>

            {/* WARNING IF NOT LOGGED IN */}
            {!user && (
              <div className="rounded-xl border border-amber-300 dark:border-amber-500 bg-amber-50 dark:bg-amber-900/30 px-4 py-3 flex items-start gap-3">
                <span className="text-amber-600 dark:text-amber-400 text-lg">
                  ⚠️
                </span>
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
              <Stat title="Attendance" value={faculty.avgAttendance} />
              <Stat title="Correction" value={faculty.avgCorrection} />
              <Stat title="Teaching" value={faculty.avgTeaching} />
              <Stat title="Approachability" value={faculty.avgApproachability} />
              <Stat title="Overall Rating" value={faculty.avgRating} />
              <Stat title="Total Reviews" value={faculty.reviewCount} isCount />
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
                    <p className="text-gray-800 dark:text-gray-200 mb-2">
                      {r.text}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      Attendance {r.attendance} ★ ·
                      Correction {r.correction} ★ ·
                      Teaching {r.teaching} ★ ·
                      Approachability {r.approachability} ★
                    </p>
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

/* ========== SMALL COMPONENT ========== */

function Stat({ title, value, isCount }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-4 text-center">
      <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
        {value !== undefined && value !== null
          ? isCount
            ? value
            : value.toFixed(2)
          : "—"}
        {!isCount && value != null && (
          <span className="text-sm"> /5</span>
        )}
      </div>
      <div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
        {title}
      </div>
    </div>
  );
}
