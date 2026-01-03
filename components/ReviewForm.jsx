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

import {
  CalendarCheck,
  PenLine,
  BookOpen,
  Handshake,
  MessageSquare,
  Star,
} from "lucide-react";

/* ================= CONFIG ================= */

const metrics = [
  { key: "attendance", label: "Attendance", icon: CalendarCheck },
  { key: "correction", label: "Correction", icon: PenLine },
  { key: "teaching", label: "Teaching", icon: BookOpen },
  { key: "approachability", label: "Approachability", icon: Handshake },
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

      await setDoc(
        doc(db, "faculties", facultyId, "reviews", user.uid),
        {
          user: "Anonymous User",
          userId: user.uid,
          ...ratings,
          overall,
          text: comment,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      await updateFacultyStats(facultyId);

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
    <div className="space-y-6">

      {/* COMMENT */}
      <div>
        <div className="flex items-center gap-2 mb-2 text-gray-700 dark:text-gray-300">
          <MessageSquare className="w-4 h-4" />
          <span className="text-sm font-medium">Your Experience</span>
        </div>

        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Share your honest experience (minimum 10 characters)"
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

            transition
          "
        />
      </div>

      {/* METRICS */}
      <div className="space-y-4">
        {metrics.map((m) => {
          const Icon = m.icon;
          return (
            <div
              key={m.key}
              className="flex items-center justify-between"
            >
              <div className="flex items-center gap-2 text-sm font-medium text-gray-800 dark:text-gray-200">
                <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
                {m.label}
              </div>

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
          );
        })}
      </div>

      {/* ERROR */}
      {error && (
        <p className="text-sm text-red-500 dark:text-red-400">
          {error}
        </p>
      )}

      {/* SUBMIT */}
      <button
        onClick={submitReview}
        disabled={!allRated || !validComment || submitting}
        className={`
          w-full py-2.5 rounded-lg text-sm font-medium transition
          ${
            !allRated || !validComment || submitting
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
            className="p-0.5"
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
