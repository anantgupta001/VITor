"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";
import ReviewForm from "@/components/ReviewForm";

import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export default function FacultyDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();

  const [faculty, setFaculty] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);

  /* ================= FACULTY (LIVE) ================= */
  useEffect(() => {
    if (!id) return;

    const facultyId = String(id);
    const facultyRef = doc(db, "faculties", facultyId);

    const unsubscribe = onSnapshot(facultyRef, (snap) => {
      if (snap.exists()) {
        setFaculty(snap.data());
        setLoading(false);
      }
    });

    return () => unsubscribe();
  }, [id]);

  /* ================= REVIEWS (LIVE) ================= */
  useEffect(() => {
    if (!id) return;

    const facultyId = String(id);

    const q = query(
      collection(db, "faculties", facultyId, "reviews"),
      orderBy("createdAt", "desc")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setReviews(list);
    });

    return () => unsubscribe();
  }, [id]);

  /* ================= STATES ================= */
  if (loading) {
    return <div className="p-10 text-gray-600">Loading faculty details...</div>;
  }

  if (!faculty) {
    return <div className="p-10 text-red-600">Faculty not found</div>;
  }

  /* ================= UI ================= */
  return (
    <div className="faculty-page">
      <div className="faculty-container">

        {/* BACK */}
        <button
          onClick={() => router.back()}
          className="text-sm text-muted mb-6 hover:underline"
        >
          ← Back
        </button>

        {/* TOP LAYOUT */}
        <div className="faculty-layout">

          {/* LEFT: PHOTO + REVIEW */}
          <div>
            <div className="card faculty-photo p-4">
              <img src={faculty.photo} alt={faculty.name} />
              <div className="photo-name">{faculty.name}</div>
            </div>

            <div className="mt-6">
              {user ? (
                <div className="card-muted p-4">
                  <p className="font-semibold mb-2">Write a Review</p>
                  <ReviewForm facultyId={id} />
                </div>
              ) : (
                <div className="card-muted p-4 text-sm text-muted">
                  🔒 Login required to write a review
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: INFO + STATS */}
          <div className="space-y-6">

            {/* INFO */}
            <div className="card p-7">
              <h1 className="text-2xl font-bold mb-1">
                {faculty.name}
              </h1>
              <p className="font-medium">{faculty.designation}</p>
              <p className="text-muted">{faculty.department}</p>

              <div className="soft-divider" />

              <p className="section-title">Specialization</p>
              <p className="text-muted leading-relaxed">
                {faculty.researchArea}
              </p>
            </div>

            {/* STATS */}
            <div className="stats-grid">
              <Stat title="Attendance" value={faculty.avgAttendance} />
              <Stat title="Correction" value={faculty.avgCorrection} />
              <Stat title="Teaching" value={faculty.avgTeaching} />
              <Stat
                title="Approachability"
                value={faculty.avgApproachability}
              />
              <Stat
                title="Overall Rating"
                value={faculty.avgRating}
                suffix="★"
              />
              <Stat
                title="Total Reviews"
                value={faculty.reviewCount}
                isCount
              />
            </div>
          </div>
        </div>

        {/* REVIEWS LIST */}
        <div className="mt-12">
          <h2 className="section-title mb-4">Student Reviews</h2>

          {reviews.length === 0 && (
            <p className="text-muted">No reviews yet.</p>
          )}

          {reviews.map((r) => (
            <div key={r.id} className="review-card">
              <p className="leading-relaxed mb-2">
                {r.comment || "No comment provided."}
              </p>

              <div className="text-sm text-muted">
                ⭐ Overall: {r.overall?.toFixed(1)} / 5
              </div>

              <div className="text-xs text-muted mt-1">
                Attendance: {r.attendance} ★ | Correction: {r.correction} ★ |
                Teaching: {r.teaching} ★ | Approachability:{" "}
                {r.approachability} ★
              </div>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}

/* ================= STAT CARD ================= */
function Stat({ title, value, suffix = "", isCount = false }) {
  return (
    <div className="card stat-card">
      <div className="stat-value">
        {value
          ? isCount
            ? value
            : value.toFixed(1)
          : "—"}
        {suffix}
      </div>
      <div className="text-sm text-muted mt-1">
        {title}
      </div>
    </div>
  );
}
