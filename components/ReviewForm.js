"use client";

import { useState } from "react";
import {
  doc,
  setDoc,
  collection,
  getDocs,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/app/context/AuthContext";

/* ================= CONFIG ================= */

const metrics = [
  { key: "attendance", label: "Attendance" },
  { key: "correction", label: "Correction" },
  { key: "teaching", label: "Teaching" },
  { key: "approachability", label: "Approachability" },
];

/* ================= COMPONENT ================= */

export default function ReviewForm({ facultyId }) {
  const { user } = useAuth();

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
  const validComment = comment.trim().length >= 10;

  async function submitReview() {
    if (!user || !allRated || !validComment || submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      const overall =
        (ratings.attendance +
          ratings.correction +
          ratings.teaching +
          ratings.approachability) /
        4;

      // 1️⃣ Save / overwrite user review
      await setDoc(
        doc(db, "faculties", facultyId, "reviews", user.uid),
        {
          user: "Anonymous User",
          userId: user.uid,
          attendance: ratings.attendance,
          correction: ratings.correction,
          teaching: ratings.teaching,
          approachability: ratings.approachability,
          overall,
          text: comment,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 2️⃣ Recalculate faculty stats
      await updateFacultyStats(facultyId);

      // 3️⃣ CLEAR STATE *AFTER SUCCESS*
      setComment("");
      setRatings({
        attendance: 0,
        correction: 0,
        teaching: 0,
        approachability: 0,
      });
    } catch (err) {
      console.error(err);
      setError("Failed to submit review. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">

      {/* COMMENT */}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Write your honest experience (minimum 10 characters)"
        rows={4}
        className="w-full border rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200"
      />

      {/* STAR INPUTS */}
      {metrics.map((m) => (
        <div
          key={m.key}
          className="flex items-center justify-between"
        >
          <span className="text-sm font-medium">
            {m.label} *
          </span>

          <StarRow
            value={ratings[m.key]}
            hoverValue={hover[m.key]}
            onHover={(v) =>
              setHover((h) => ({ ...h, [m.key]: v }))
            }
            onLeave={() =>
              setHover((h) => ({ ...h, [m.key]: 0 }))
            }
            onSelect={(v) =>
              setRatings((r) => ({ ...r, [m.key]: v }))
            }
          />
        </div>
      ))}

      {/* ERROR */}
      {error && (
        <p className="text-sm text-red-500">{error}</p>
      )}

      {/* SUBMIT */}
      <button
        onClick={submitReview}
        disabled={!allRated || !validComment || submitting}
        className={`
          w-full
          py-2.5
          rounded-lg
          text-sm
          font-medium
          transition
          ${
            !allRated || !validComment || submitting
              ? "bg-gray-200 text-gray-500 cursor-not-allowed"
              : "bg-black text-white hover:bg-gray-900"
          }
        `}
      >
        {submitting ? "Submitting..." : "Submit Review"}
      </button>
    </div>
  );
}

/* ================= HELPERS ================= */

async function updateFacultyStats(facultyId) {
  const snap = await getDocs(
    collection(db, "faculties", facultyId, "reviews")
  );

  const total = snap.size;
  if (total === 0) return;

  let sum = {
    attendance: 0,
    correction: 0,
    teaching: 0,
    approachability: 0,
    overall: 0,
  };

  snap.forEach((d) => {
    const r = d.data();
    sum.attendance += r.attendance;
    sum.correction += r.correction;
    sum.teaching += r.teaching;
    sum.approachability += r.approachability;
    sum.overall += r.overall;
  });

  await updateDoc(doc(db, "faculties", facultyId), {
    avgAttendance: +(sum.attendance / total).toFixed(2),
    avgCorrection: +(sum.correction / total).toFixed(2),
    avgTeaching: +(sum.teaching / total).toFixed(2),
    avgApproachability: +(sum.approachability / total).toFixed(2),
    avgRating: +(sum.overall / total).toFixed(2),
    reviewCount: total,
  });
}

/* ================= STAR UI ================= */

function StarRow({
  value,
  hoverValue,
  onHover,
  onLeave,
  onSelect,
}) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }).map((_, i) => {
        const starValue = i + 1;
        const active = hoverValue
          ? starValue <= hoverValue
          : starValue <= value;

        return (
          <span
            key={i}
            className={`text-xl cursor-pointer transition ${
              active ? "text-yellow-400" : "text-gray-300"
            }`}
            onMouseEnter={() => onHover(starValue)}
            onMouseLeave={onLeave}
            onClick={() => onSelect(starValue)}
          >
            ★
          </span>
        );
      })}
    </div>
  );
}
