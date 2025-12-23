"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import FacultyCard from "@/components/FacultyCard";
import LoginButton from "@/components/LoginButton";

const ITEMS_PER_PAGE = 8;

export default function HomePage() {
  const [faculties, setFaculties] = useState([]);
  const [query, setQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    const ref = collection(db, "faculties");
    return onSnapshot(ref, (snap) => {
      setFaculties(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
  }, []);

  const filtered = faculties.filter((f) =>
    `${f.name} ${f.department}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  const totalPages = Math.ceil(filtered.length / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const currentFaculties = filtered.slice(
    startIndex,
    startIndex + ITEMS_PER_PAGE
  );

  // reset page on search
  useEffect(() => {
    setCurrentPage(1);
  }, [query]);

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">

      {/* HEADER */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">VITor</h1>
          <LoginButton />
        </div>
      </header>

      {/* MAIN */}
      <main className="flex-1 max-w-7xl mx-auto px-6 py-6">

        {/* TITLE + DESCRIPTION */}
        <div className="mb-8">
          <h2 className="text-3xl font-bold mb-3">All Faculty</h2>

          <ul className="text-gray-600 text-sm space-y-2 max-w-4xl mb-6">
            <li>🎓 Exclusive faculty rating platform for <b>VIT-AP University students</b></li>
            <li>⭐ Rate faculty and explore reviews from fellow students</li>
            <li>🔒 <b>All reviews are anonymous</b> — your identity remains hidden</li>
            <li>🤝 Your feedback helps others make informed academic decisions</li>
            <li>🙏 Please take a moment to share your experience</li>
          </ul>

          {/* DESCRIPTIVE BOXES */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <InfoCard
              title="📅 Attendance"
              items={["Regularity", "Time discipline", "Class consistency"]}
            />
            <InfoCard
              title="📝 Correction"
              items={["Fair checking", "Timely evaluation", "Marks justification"]}
            />
            <InfoCard
              title="🎓 Teaching"
              items={["Concept clarity", "Explanation quality", "Pace"]}
            />
            <InfoCard
              title="🤝 Approachability"
              items={["Doubt support", "Student friendly", "Extra guidance"]}
            />
          </div>
        </div>

        {/* SEARCH */}
        <div className="mb-6">
          <div className="relative">
            {/* Search Icon */}
            <span className="absolute inset-y-0 left-4 flex items-center text-gray-400">
              🔍
            </span>

            <input
              type="text"
              placeholder="Search by faculty name or department..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border pl-11 pr-4 py-3 text-sm shadow-sm
                        focus:outline-none focus:ring-2 focus:ring-slate-200"
            />
          </div>
        </div>


        {/* GRID */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {currentFaculties.map((f) => (
            <FacultyCard key={f.id} faculty={f} />
          ))}
        </div>

        {/* PAGINATION */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-4 mt-10">
            <button
              onClick={() => setCurrentPage((p) => Math.max(p - 1, 1))}
              disabled={currentPage === 1}
              className={`px-4 py-2 rounded-lg border text-sm ${
                currentPage === 1
                  ? "text-gray-400 border-gray-200 cursor-not-allowed"
                  : "hover:bg-gray-100"
              }`}
            >
              ← Prev
            </button>

            <span className="text-sm text-gray-600">
              Page <b>{currentPage}</b> of <b>{totalPages}</b>
            </span>

            <button
              onClick={() =>
                setCurrentPage((p) => Math.min(p + 1, totalPages))
              }
              disabled={currentPage === totalPages}
              className={`px-4 py-2 rounded-lg border text-sm ${
                currentPage === totalPages
                  ? "text-gray-400 border-gray-200 cursor-not-allowed"
                  : "hover:bg-gray-100"
              }`}
            >
              Next →
            </button>
          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="mt-12 border-t bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between text-sm text-gray-500">
          
          {/* LEFT TEXT */}
          <p>© 2025 VITor · Built by students, for students</p>

          {/* RIGHT ICONS */}
          <div className="flex items-center gap-4">
            <a
              href="https://github.com/"
              target="_blank"
              className="hover:text-gray-700"
            >
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 .5C5.73.5.5 5.74.5 12.02c0 5.1 3.29 9.42 7.86 10.95.57.1.78-.25.78-.55v-2.02c-3.2.7-3.87-1.38-3.87-1.38-.53-1.35-1.3-1.71-1.3-1.71-1.06-.73.08-.72.08-.72 1.17.08 1.79 1.21 1.79 1.21 1.04 1.78 2.73 1.27 3.4.97.1-.75.4-1.27.73-1.56-2.55-.29-5.23-1.28-5.23-5.7 0-1.26.45-2.29 1.19-3.1-.12-.3-.52-1.52.11-3.17 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.65.23 2.87.11 3.17.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.68.41.35.78 1.04.78 2.1v3.12c0 .3.2.65.79.54 4.56-1.53 7.85-5.85 7.85-10.94C23.5 5.74 18.27.5 12 .5z" />
              </svg>
            </a>

            <a
              href="https://linkedin.com/"
              target="_blank"
              className="hover:text-gray-700"
            >
              <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3zM9 9h3.8v1.64h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.44c0-1.3-.03-2.97-1.81-2.97-1.82 0-2.1 1.42-2.1 2.88V21H9z" />
              </svg>
            </a>
          </div>
        </div>
      </footer>

    </div>
  );
}

/* ===== SMALL COMPONENT ===== */
function InfoCard({ title, items }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-4">
      <p className="font-semibold mb-1">{title}</p>
      <ul className="text-sm text-gray-600 space-y-0.5">
        {items.map((i) => (
          <li key={i}>• {i}</li>
        ))}
      </ul>
    </div>
  );
}
