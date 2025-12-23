"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "@/app/context/AuthContext";
import { db } from "@/lib/firebase";
import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
} from "firebase/firestore";

export default function FacultyPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [faculty, setFaculty] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [rating, setRating] = useState(5);
  const [text, setText] = useState("");

  // ✅ LOAD FACULTY
  useEffect(() => {
    fetch("/api/faculties")
      .then(res => res.json())
      .then(data => {
        const found = data.find(
          f => String(f.id) === String(id)
        );
        setFaculty(found || null);
      });
  }, [id]);

  // ✅ LOAD REVIEWS
  useEffect(() => {
    const loadReviews = async () => {
      const q = query(
        collection(db, "reviews"),
        where("facultyId", "==", Number(id))
      );
      const snap = await getDocs(q);
      setReviews(snap.docs.map(d => d.data()));
    };
    loadReviews();
  }, [id]);

  if (!faculty) {
    return (
      <div className="p-10 text-center text-xl">
        Faculty not found
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-10">
      <div className="grid md:grid-cols-[280px_1fr] gap-8">
        <img
          src={faculty.photo}
          className="w-64 h-64 object-cover rounded-xl shadow"
          alt={faculty.name}
        />

        <div>
          <h1 className="text-3xl font-bold">{faculty.name}</h1>
          <p className="text-lg">{faculty.designation}</p>
          <p className="text-gray-600">{faculty.department}</p>
          <p className="mt-4 text-sm">{faculty.researchArea}</p>
        </div>
      </div>

      <div className="mt-12">
        <h2 className="text-2xl font-semibold mb-4">Reviews</h2>

        {reviews.map((r, i) => (
          <div key={i} className="border p-4 mb-3 rounded">
            <p className="font-semibold">{r.user}</p>
            <p>⭐ {r.rating}</p>
            <p>{r.text}</p>
          </div>
        ))}
      </div>

      <div className="mt-10 max-w-md">
        <h2 className="text-xl font-semibold mb-3">Write Review</h2>

        {!user ? (
          <p className="text-red-500">
            Login required to write review
          </p>
        ) : (
          <>
            <select
              value={rating}
              onChange={e => setRating(Number(e.target.value))}
              className="border w-full mb-3 p-2"
            >
              {[5, 4, 3, 2, 1].map(n => (
                <option key={n}>{n}</option>
              ))}
            </select>

            <textarea
              className="border w-full p-2 mb-3"
              rows={4}
              value={text}
              onChange={e => setText(e.target.value)}
            />

            <button
              onClick={async () => {
                await addDoc(collection(db, "reviews"), {
                  facultyId: Number(id),
                  user: user.email,
                  rating,
                  text,
                  createdAt: serverTimestamp(),
                });
                location.reload();
              }}
              className="bg-black text-white px-6 py-2 rounded"
            >
              Submit
            </button>
          </>
        )}
      </div>
    </div>
  );
}
