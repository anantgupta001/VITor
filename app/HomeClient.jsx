"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import FacultyCard from "@/components/FacultyCard";
import { useSearchParams, useRouter } from "next/navigation";

const ITEMS_PER_PAGE = 8;

export default function HomeClient() {
  const searchParams = useSearchParams();
  const router = useRouter();

  /* ================= URL STATE ================= */

  const pageFromUrl = Number(searchParams.get("page")) || 1;
  const activeQuery = searchParams.get("q") || "";

  /* ================= LOCAL STATE ================= */

  const [faculties, setFaculties] = useState([]);
  const [currentPage, setCurrentPage] = useState(pageFromUrl);
  const [draftQuery, setDraftQuery] = useState(activeQuery);

  /* ================= FIRESTORE ================= */

  useEffect(() => {
    const ref = collection(db, "faculties");
    return onSnapshot(ref, (snap) => {
      setFaculties(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  /* ================= SYNC PAGE ================= */

  useEffect(() => {
    setCurrentPage(pageFromUrl);
  }, [pageFromUrl]);

  /* ================= FILTER ================= */

  const filtered = faculties.filter((f) =>
    `${f.name} ${f.department}`
      .toLowerCase()
      .includes(activeQuery.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentFaculties = filtered.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  /* ================= PAGINATION ================= */

  function goToPage(p) {
    const params = new URLSearchParams();
    params.set("page", p);

    if (activeQuery.trim().length > 0) {
      params.set("q", activeQuery);
    }

    router.push(`/?${params.toString()}`);
  }

  /* ================= SEARCH ================= */

  function commitSearch() {
    const q = draftQuery.trim();

    if (!activeQuery && q === "") return;
    if (q === activeQuery) return;

    const params = new URLSearchParams();
    params.set("page", 1);

    if (q.length > 0) {
      params.set("q", q);
    }

    router.push(`/?${params.toString()}`);
  }

  /* ================= UI ================= */

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-900">
      <main className="max-w-7xl mx-auto px-6 py-8">

        <h2 className="text-3xl font-bold mb-6">All Faculty</h2>

        {/* SEARCH */}
        <input
          type="text"
          placeholder="Search by faculty name or department..."
          value={draftQuery}
          onChange={(e) => setDraftQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitSearch();
          }}
          className="
            w-full mb-6 rounded-xl border px-4 py-3 text-sm shadow-sm
            bg-white dark:bg-gray-800
            border-gray-300 dark:border-gray-600
            text-gray-900 dark:text-gray-100
            focus:outline-none focus:ring-2
            focus:ring-slate-200 dark:focus:ring-gray-700
          "
        />

        {/* GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {currentFaculties.map((f) => (
            <FacultyCard
              key={f.id}
              faculty={f}
              currentPage={currentPage}
              query={activeQuery}
            />
          ))}
        </div>

        {/* PAGINATION */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-4 mt-10">
            <button
              disabled={currentPage === 1}
              onClick={() => goToPage(currentPage - 1)}
            >
              ← Prev
            </button>

            <span>
              Page {currentPage} of {totalPages}
            </span>

            <button
              disabled={currentPage === totalPages}
              onClick={() => goToPage(currentPage + 1)}
            >
              Next →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
