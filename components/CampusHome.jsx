"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase-config";
import { isValidCampus, getCampusBySlug } from "@/lib/campus-config";
import { FEATURE_ITEMS, INFO_CARDS } from "@/lib/campus-home-content";
import FacultyCard from "@/components/FacultyCard";
import InfoCard from "@/components/InfoCard";
import FeatureItem from "@/components/FeatureItem";
import { Search, X } from "lucide-react";

const ITEMS_PER_PAGE = 8;

export default function CampusHome() {
  const params = useParams();
  const campusSlug = params?.campus;
  const searchParams = useSearchParams();
  const router = useRouter();

  const pageFromUrl = Number(searchParams.get("page")) || 1;
  const activeQuery = searchParams.get("q") || "";

  const [faculties, setFaculties] = useState([]);
  const [currentPage, setCurrentPage] = useState(pageFromUrl);
  const [draftQuery, setDraftQuery] = useState(activeQuery);
  const [loadError, setLoadError] = useState(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const pageBeforeSearch = useRef(1);
  const searchWrapRef = useRef(null);

  const campus = getCampusBySlug(campusSlug);
  const validCampus = isValidCampus(campusSlug);

  useEffect(() => {
    if (!validCampus || !campusSlug) return;
    setLoadError(null);
    const ref = collection(db, "campuses", campusSlug, "faculties");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setFaculties(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoadError(null);
      },
      (err) => {
        console.error("Firestore error (campuses/faculties):", err);
        setLoadError(err.message || "Failed to load faculty list.");
        setFaculties([]);
      }
    );
    return unsub;
  }, [campusSlug, validCampus]);

  useEffect(() => {
    setCurrentPage(pageFromUrl);
    setDraftQuery(activeQuery);
  }, [pageFromUrl, activeQuery]);

  useEffect(() => {
    if (!activeQuery.trim()) pageBeforeSearch.current = pageFromUrl;
  }, [activeQuery, pageFromUrl]);

  // Suggestions: unique names & departments that match draftQuery
  const q = (draftQuery || "").trim().toLowerCase();
  const suggestions = q.length > 0
    ? [
        ...new Set(
          faculties.flatMap((f) => {
            const name = (f.name || "").trim();
            const dept = (f.department || "").trim();
            const matchName = name && name.toLowerCase().includes(q);
            const matchDept = dept && dept.toLowerCase().includes(q);
            return [
              ...(matchName ? [name] : []),
              ...(matchDept ? [dept] : []),
            ];
          })
        ),
      ].slice(0, 8)
    : [];

  useEffect(() => {
    function close(e) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  function applySuggestion(text) {
    setDraftQuery(text);
    setShowSuggestions(false);
    const params = new URLSearchParams();
    params.set("page", 1);
    params.set("q", text);
    router.push(`/${campusSlug}?${params.toString()}`);
  }

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

  function goToPage(p) {
    const params = new URLSearchParams();
    params.set("page", p);
    if (activeQuery.trim()) params.set("q", activeQuery);
    router.push(`/${campusSlug}?${params.toString()}`);
  }

  function commitSearch() {
    setShowSuggestions(false);
    const q = draftQuery.trim();
    const params = new URLSearchParams();
    params.set("page", 1);
    if (q) params.set("q", q);
    router.push(`/${campusSlug}?${params.toString()}`);
  }

  function clearSearch() {
    setDraftQuery("");
    setShowSuggestions(false);
    const params = new URLSearchParams();
    const pageToRestore = pageBeforeSearch.current;
    if (pageToRestore > 1) params.set("page", pageToRestore);
    router.push(`/${campusSlug}${params.toString() ? `?${params.toString()}` : ""}`);
  }

  if (campusSlug && !validCampus) {
    return (
      <div className="p-10 text-center">
        <p className="text-red-500 dark:text-red-400">Campus not found.</p>
        <button
          onClick={() => router.push("/")}
          className="mt-4 text-slate-600 dark:text-slate-400 underline"
        >
          Choose campus
        </button>
      </div>
    );
  }

  const campusLabel = campus?.label ?? campusSlug;

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-900">
      <main className="max-w-7xl mx-auto px-6 py-8">
        {loadError && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 text-sm">
            {loadError}
            <p className="mt-2 text-xs opacity-90">
              Check Firestore rules allow read on <code className="bg-red-100 dark:bg-red-900/40 px-1 rounded">campuses/{campusSlug}/faculties</code>
            </p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-4xl mb-10">
          {FEATURE_ITEMS.map(({ icon, text }, i) => (
            <FeatureItem
              key={i}
              icon={icon}
              text={typeof text === "function" ? text(campusLabel) : text}
            />
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
          {INFO_CARDS.map((card) => (
            <InfoCard
              key={card.title}
              title={card.title}
              icon={card.icon}
              items={card.items}
            />
          ))}
        </div>

        <div className="mb-8 flex gap-2">
          <div className="flex-1 relative" ref={searchWrapRef}>
            <input
              type="text"
              placeholder="Search by faculty name or department..."
              value={draftQuery}
              onChange={(e) => {
                setDraftQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => draftQuery.trim() && setShowSuggestions(true)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitSearch();
              }}
              className="
                w-full rounded-xl border px-4 py-3 pr-10 text-sm shadow-sm
                bg-white dark:bg-gray-800
                border-gray-300 dark:border-gray-600
                text-gray-900 dark:text-gray-100
                focus:outline-none focus:ring-2
                focus:ring-slate-200 dark:focus:ring-gray-700
              "
            />
            {(draftQuery || activeQuery) && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                className="
                  absolute right-2 top-1/2 -translate-y-1/2
                  w-7 h-7 flex items-center justify-center rounded-lg
                  text-gray-500 dark:text-gray-400
                  hover:bg-gray-200 dark:hover:bg-gray-600 hover:text-gray-700 dark:hover:text-gray-200
                  transition
                "
              >
                <X className="w-4 h-4" />
              </button>
            )}
            {showSuggestions && suggestions.length > 0 && (
              <ul
                className="
                  absolute left-0 right-0 top-full mt-1 py-1 rounded-xl
                  border border-gray-200 dark:border-gray-600
                  bg-white dark:bg-gray-800 shadow-lg z-50
                  max-h-60 overflow-auto
                "
                role="listbox"
              >
                {suggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      role="option"
                      onClick={() => applySuggestion(s)}
                      className="
                        w-full text-left px-4 py-2.5 text-sm
                        text-gray-700 dark:text-gray-200
                        hover:bg-slate-100 dark:hover:bg-gray-700
                        transition
                      "
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
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

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {currentFaculties.map((f) => (
            <FacultyCard
              key={f.id}
              faculty={f}
              campusSlug={campusSlug}
              currentPage={currentPage}
              query={activeQuery}
            />
          ))}
        </div>

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
