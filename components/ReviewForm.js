"use client";

import { useState } from "react";
import { db } from "@/lib/firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { useAuth } from "@/app/context/AuthContext";

export default function ReviewForm({ facultyId }) {
  const { user } = useAuth();
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");

  if (!user) {
    return (
      <div className="mt-6 p-4 border rounded bg-gray-50">
        🔒 <b>Login required</b> to submit a review.
      </div>
    );
  }

  async function submit(e) {
    e.preventDefault();

    await setDoc(
      doc(db, "faculties", facultyId, "reviews", user.uid),
      {
        rating,
        comment,
        createdAt: serverTimestamp(),
      }
    );

    setComment("");
    alert("Review submitted");
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-3">
      <h3 className="font-semibold">Write a review</h3>

      <select
        value={rating}
        onChange={e => setRating(Number(e.target.value))}
        className="border rounded px-2 py-1"
      >
        {[5, 4, 3, 2, 1].map(n => (
          <option key={n} value={n}>
            {n}
          </option>
        ))}
      </select>

      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        required
        placeholder="Write your experience..."
        className="w-full border rounded p-2"
      />

      <button className="bg-black text-white px-4 py-2 rounded">
        Submit Review
      </button>
    </form>
  );
}
