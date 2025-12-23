"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import ReviewForm from "@/components/ReviewForm";

export default function FacultyDetailPage() {
  const { id } = useParams(); // ✅ THIS IS THE FIX
  const [faculty, setFaculty] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;

    async function load() {
      const fSnap = await getDoc(doc(db, "faculties", id));
      const rSnap = await getDocs(
        collection(db, "faculties", id, "reviews")
      );

      setFaculty(fSnap.data());
      setReviews(rSnap.docs.map((d) => d.data()));
      setLoading(false);
    }

    load();
  }, [id]);

  if (loading) return <div className="p-10">Loading...</div>;
  if (!faculty)
    return <div className="p-10 text-red-500">Faculty not found</div>;

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* ========== LEFT COLUMN ========== */}
        <div className="space-y-6">
          {/* PHOTO CARD */}
          <div className="bg-white rounded-2xl shadow p-4">
            <img
              src={faculty.photo}
              alt={faculty.name}
              className="w-full h-80 object-cover rounded-xl"
            />
            <p className="mt-4 text-center font-semibold text-lg">
              {faculty.name}
            </p>
          </div>

          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 flex items-start gap-3">
            <span className="text-amber-600 text-lg">⚠️</span>
            <p className="text-sm text-amber-800 leading-snug">
              Please sign in using your official college ID to submit a review. This helps us prevent spam and maintain authenticity.
            </p>
          </div>

          {/* WRITE REVIEW */}
          <div className="bg-white rounded-2xl shadow p-5">
            <h3 className="font-semibold mb-3">Write a Review</h3>
            <ReviewForm facultyId={id} />
          </div>
        </div>

        {/* ========== RIGHT COLUMN ========== */}
        <div className="lg:col-span-2 space-y-8">
          {/* BASIC INFO */}
          <div>
            <h1 className="text-2xl font-bold">{faculty.name}</h1>
            <p className="text-gray-700">{faculty.designation}</p>
            <p className="text-gray-600 text-sm">
              {faculty.department}
            </p>
          </div>

          {/* SPECIALIZATION */}
          {faculty.researchArea && (
            <div>
              <h3 className="font-semibold mb-1">Specialization</h3>
              <p className="text-gray-700">
                {faculty.researchArea}
              </p>
            </div>
          )}

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
            <h3 className="font-semibold text-lg mb-4">
              Student Reviews
            </h3>

            {reviews.length === 0 && (
              <p className="text-gray-500 text-sm">
                No reviews yet.
              </p>
            )}

            <div className="space-y-4">
              {reviews.map((r, i) => (
                <div
                  key={i}
                  className="bg-white rounded-xl shadow p-4"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <p className="font-semibold">
                      {r.user || "Anonymous"}
                    </p>
                    <Stars rating={r.overall} />
                    <span className="text-sm text-gray-600">
                      {r.overall}
                    </span>
                  </div>

                  <p className="text-gray-800 mb-2">
                    {r.text}
                  </p>

                  <p className="text-xs text-gray-600">
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
  );
}

/* ========== SMALL COMPONENTS ========== */

function Stat({ title, value, isCount }) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-4 text-center">
      <div className="text-2xl font-bold">
        {value !== undefined && value !== null
          ? value.toFixed?.(2) ?? value
          : "—"}
        {!isCount && value && (
          <span className="text-sm"> /5</span>
        )}
      </div>
      <div className="text-sm text-gray-600 mt-1">
        {title}
      </div>
    </div>
  );
}

function Stars({ rating }) {
  return (
    <div className="flex text-yellow-400 text-sm">
      {Array.from({ length: 5 }).map((_, i) => (
        <span key={i}>
          {i < Math.round(rating) ? "★" : "☆"}
        </span>
      ))}
    </div>
  );
}
