"use client";

import { useState } from "react";
import {
  doc,
  serverTimestamp,
  runTransaction,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/app/context/AuthContext";

const fields = [
  { key: "attendance", label: "Attendance" },
  { key: "correction", label: "Correction" },
  { key: "teaching", label: "Teaching" },
  { key: "approachability", label: "Approachability" },
];

export default function ReviewForm({ facultyId }) {
  const { user } = useAuth();

  const [ratings, setRatings] = useState({
    attendance: 0,
    correction: 0,
    teaching: 0,
    approachability: 0,
  });
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleChange = (key, value) => {
    setRatings((prev) => ({ ...prev, [key]: value }));
    setError("");
  };

  /* 🔒 STRICT VALIDATION */
  const allRated = Object.values(ratings).every((v) => v > 0);
  const commentValid = comment.trim().length >= 10; // minimum 10 chars

  const submit = async () => {
    if (!user) {
      setError("Login required to submit review");
      return;
    }

    if (!allRated) {
      setError("Please rate all sections");
      return;
    }

    if (!commentValid) {
      setError("Please write at least 10 characters in review");
      return;
    }

    try {
      setLoading(true);

      const facultyDocId = String(facultyId);
      const facultyRef = doc(db, "faculties", facultyDocId);
      const reviewRef = doc(
        db,
        "faculties",
        facultyDocId,
        "reviews",
        user.uid
      );

      await runTransaction(db, async (tx) => {
        const facultySnap = await tx.get(facultyRef);
        const prev = facultySnap.exists() ? facultySnap.data() : {};

        const count = prev.reviewCount || 0;
        const newCount = count + 1;

        const avg = (oldAvg = 0, val) =>
          (oldAvg * count + val) / newCount;

        const overall =
          (ratings.attendance +
            ratings.correction +
            ratings.teaching +
            ratings.approachability) /
          4;

        /* Review document */
        tx.set(reviewRef, {
          ...ratings,
          overall,
          comment: comment.trim(),
          userId: user.uid,
          createdAt: serverTimestamp(),
        });

        /* Faculty aggregates */
        tx.set(
          facultyRef,
          {
            reviewCount: newCount,
            avgAttendance: avg(prev.avgAttendance, ratings.attendance),
            avgCorrection: avg(prev.avgCorrection, ratings.correction),
            avgTeaching: avg(prev.avgTeaching, ratings.teaching),
            avgApproachability: avg(
              prev.avgApproachability,
              ratings.approachability
            ),
            avgRating: avg(prev.avgRating, overall),
          },
          { merge: true }
        );
      });

      /* Reset form */
      setRatings({
        attendance: 0,
        correction: 0,
        teaching: 0,
        approachability: 0,
      });
      setComment("");
      setError("");
    } catch (e) {
      console.error(e);
      setError("Failed to submit review. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">

      {fields.map((f) => (
        <div key={f.key}>
          <label className="text-sm font-medium block mb-1">
            {f.label} <span className="text-red-500">*</span>
          </label>
          <select
            value={ratings[f.key]}
            onChange={(e) =>
              handleChange(f.key, Number(e.target.value))
            }
            className="w-full border rounded-lg px-3 py-2 text-sm"
          >
            <option value={0}>Select</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n} ★
              </option>
            ))}
          </select>
        </div>
      ))}

      {/* COMMENT (COMPULSORY) */}
      <div>
        <label className="text-sm font-medium block mb-1">
          Review <span className="text-red-500">*</span>
        </label>
        <textarea
          value={comment}
          onChange={(e) => {
            setComment(e.target.value);
            setError("");
          }}
          placeholder="Write your honest experience (min 10 characters)"
          rows={4}
          className="w-full border rounded-lg p-2 text-sm resize-none"
        />
      </div>

      {/* ERROR */}
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* SUBMIT */}
      <button
        onClick={submit}
        disabled={!allRated || !commentValid || loading}
        className={`w-full py-2 rounded-lg text-sm font-medium
          ${
            !allRated || !commentValid || loading
              ? "bg-gray-300 cursor-not-allowed"
              : "bg-black text-white hover:bg-gray-900"
          }`}
      >
        {loading ? "Submitting..." : "Submit Review"}
      </button>
    </div>
  );
}
