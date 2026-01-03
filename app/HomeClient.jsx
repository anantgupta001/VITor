"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import FacultyCard from "@/components/FacultyCard";
import InfoCard from "@/components/InfoCard";
import { useSearchParams, useRouter } from "next/navigation";

import {
  CalendarCheck,
  PenLine,
  BookOpen,
  Handshake,
  Search,
  GraduationCap,
  Star,
  ShieldCheck,
  Users,
} from "lucide-react";

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

  /* ================= SYNC URL → STATE ================= */
  useEffect(() => {
    setCurrentPage(pageFromUrl);
    setDraftQuery(activeQuery);
  }, [pageFromUrl, activeQuery]);

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

    if (activeQuery.trim()) {
      params.set("q", activeQuery);
    }

    router.push(`/?${params.toString()}`);
  }

  /* ================= SEARCH ================= */
  function commitSearch() {
    const q = draftQuery.trim();

    const params = new URLSearchParams();
    params.set("page", 1);

    if (q) {
      params.set("q", q);
    }

    router.push(`/?${params.toString()}`);
  }

  /* ================= UI ================= */
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-900">
      <main className="max-w-7xl mx-auto px-6 py-8">

        {/* ================= HEADER ================= */}
        <h2 className="text-3xl font-bold mb-4 text-gray-900 dark:text-gray-100">
          All Faculty
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl mb-10">
          <FeatureItem
            icon={GraduationCap}
            text="Exclusive faculty rating platform for VIT-AP students"
          />
          <FeatureItem
            icon={Star}
            text="Rate faculty and explore anonymous reviews"
          />
          <FeatureItem
            icon={ShieldCheck}
            text="Your identity is never revealed"
          />
          <FeatureItem
            icon={Users}
            text="Help others make better academic decisions"
          />
        </div>

        {/* ================= INFO CARDS ================= */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          <InfoCard
            title="Attendance"
            icon={CalendarCheck}
            items={[
              "Flexible attendance policies",
              "Understands genuine student issues",
              "Learning over strict rules",
            ]}
          />

          <InfoCard
            title="Correction"
            icon={PenLine}
            items={[
              "Fair and unbiased evaluation",
              "Timely correction of answer sheets",
              "Clear justification of marks",
            ]}
          />

          <InfoCard
            title="Teaching"
            icon={BookOpen}
            items={[
              "Clear explanation of concepts",
              "Comfortable teaching pace",
              "Focus on understanding",
            ]}
          />

          <InfoCard
            title="Approachability"
            icon={Handshake}
            items={[
              "Easy to approach for doubts",
              "Friendly with students",
              "Helps beyond class hours",
            ]}
          />
        </div>

        {/* ================= SEARCH ================= */}
        <div className="mb-8 flex gap-2">
          <input
            type="text"
            placeholder="Search by faculty name or department..."
            value={draftQuery}
            onChange={(e) => setDraftQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitSearch();
            }}
            className="
              flex-1 rounded-xl border px-4 py-3 text-sm shadow-sm
              bg-white dark:bg-gray-800
              border-gray-300 dark:border-gray-600
              text-gray-900 dark:text-gray-100
              focus:outline-none focus:ring-2
              focus:ring-slate-200 dark:focus:ring-gray-700
            "
          />

          <button
            onClick={commitSearch}
            aria-label="Search"
            className="
              w-11 h-11 flex items-center justify-center
              rounded-xl border
              bg-white dark:bg-gray-800
              border-gray-300 dark:border-gray-600
              text-gray-600 dark:text-gray-300
              hover:bg-gray-100 dark:hover:bg-gray-700
              transition
            "
          >
            <Search className="w-5 h-5" />
          </button>
        </div>

        {/* ================= FACULTY GRID ================= */}
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

        {/* ================= PAGINATION ================= */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-4 mt-12">
            <button
              disabled={currentPage === 1}
              onClick={() => goToPage(currentPage - 1)}
              className="px-4 py-2 rounded-lg border text-sm"
            >
              ← Prev
            </button>

            <span className="text-sm text-gray-600 dark:text-gray-300">
              Page {currentPage} of {totalPages}
            </span>

            <button
              disabled={currentPage === totalPages}
              onClick={() => goToPage(currentPage + 1)}
              className="px-4 py-2 rounded-lg border text-sm"
            >
              Next →
            </button>
          </div>
        )}
      </main>
    </div>
  );
}

/* ================= SMALL COMPONENT ================= */

function FeatureItem({ icon: Icon, text }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="w-5 h-5 mt-0.5 text-gray-500 dark:text-gray-400" />
      <p className="text-sm text-gray-600 dark:text-gray-300">
        {text}
      </p>
    </div>
  );
}
