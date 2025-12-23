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

      {/* ================= HEADER ================= */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">VITor</h1>
          <LoginButton />
        </div>
      </header>

      {/* ================= MAIN ================= */}
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

          {/* STUDENT-FRIENDLY EVALUATION CRITERIA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <InfoCard
              title="📅 Attendance"
              items={[
                "Easy and flexible attendance policies",
                "Understands genuine student issues",
                "Focuses on learning over strict rules",
              ]}
            />
            <InfoCard
              title="📝 Correction"
              items={[
                "Fair and unbiased evaluation",
                "Timely correction of answer sheets",
                "Clear justification for marks",
              ]}
            />
            <InfoCard
              title="🎓 Teaching"
              items={[
                "Explains concepts clearly and simply",
                "Maintains a comfortable teaching pace",
                "Focuses on understanding, not memorization",
              ]}
            />
            <InfoCard
              title="🤝 Approachability"
              items={[
                "Easily approachable for doubts",
                "Friendly and respectful towards students",
                "Willing to help beyond class hours",
              ]}
            />
          </div>
        </div>

        {/* SEARCH */}
        <div className="mb-6">
          <div className="relative">
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

          {currentFaculties.length === 0 && (
            <div className="col-span-full text-center text-gray-500 py-12">
              No faculty found matching your search.
            </div>
          )}
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

      {/* ================= FOOTER ================= */}
      <footer className="mt-12 border-t bg-slate-50">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between text-sm text-gray-500">
          <p>© 2025 VITor · Built by students, for students</p>

          <div className="flex items-center gap-4">
            <a
              href="https://github.com/anantgupta001/vitor"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-700"
            >
              GitHub
            </a>

            <a
              href="https://www.linkedin.com/in/anantgupta7628/"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-gray-700"
            >
              LinkedIn
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ================= SMALL COMPONENT ================= */
function InfoCard({ title, items }) {
  return (
    <div className="bg-white rounded-xl border shadow-sm p-4">
      <p className="font-semibold mb-2">{title}</p>
      <ul className="text-sm text-gray-600 space-y-1">
        {items.map((i) => (
          <li key={i}>• {i}</li>
        ))}
      </ul>
    </div>
  );
}
