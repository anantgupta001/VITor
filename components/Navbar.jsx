"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import LoginButton from "@/components/LoginButton";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/app/context/auth-context";
import { getCampusBySlug, CAMPUSES, isValidCampus } from "@/lib/campus-config";
import { LogOut, ChevronDown, MapPin } from "lucide-react";

export default function Navbar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [campusOpen, setCampusOpen] = useState(false);
  const dropdownRef = useRef(null);

  const segment = pathname?.split("/")[1];
  const currentCampus = segment && isValidCampus(segment) ? getCampusBySlug(segment) : null;

  useEffect(() => {
    function close(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setCampusOpen(false);
    }
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  return (
    <header className="w-full border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-visible">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* LEFT: LOGO + CAMPUS */}
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100"
          >
            VITor
          </Link>

          {currentCampus ? (
            <div className="relative" ref={dropdownRef}>
              <button
                onClick={() => setCampusOpen((o) => !o)}
                className="
                  flex items-center gap-1.5
                  px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-sm font-medium
                  bg-slate-100 dark:bg-gray-800
                  text-gray-700 dark:text-gray-300
                  hover:bg-slate-200 dark:hover:bg-gray-700
                  transition
                "
              >
                <MapPin className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span className="max-sm:hidden">{currentCampus.label}</span>
                <span className="sm:hidden">{currentCampus.shortLabel ?? currentCampus.label}</span>
                <ChevronDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              </button>
              {campusOpen && (
                <div className="absolute top-full left-0 mt-1 py-1 min-w-[140px] rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-lg z-50">
                  <Link
                    href="/"
                    className="block px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-slate-100 dark:hover:bg-gray-700 rounded-t-lg"
                    onClick={() => setCampusOpen(false)}
                  >
                    Choose campus
                  </Link>
                  {CAMPUSES.map((c) => (
                    <Link
                      key={c.slug}
                      href={`/${c.slug}`}
                      className={`block px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-gray-700 ${c.slug === segment ? "font-medium text-slate-900 dark:text-gray-100" : "text-gray-600 dark:text-gray-400"}`}
                      onClick={() => setCampusOpen(false)}
                    >
                      <span className="sm:hidden">{c.shortLabel ?? c.label}</span>
                      <span className="hidden sm:inline">{c.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Link
              href="/"
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-slate-100 dark:hover:bg-gray-800 transition"
            >
              <MapPin className="w-4 h-4" />
              Choose campus
            </Link>
          )}
        </div>

        {/* RIGHT ACTIONS */}
        <div className="flex items-center gap-3 overflow-visible">

          {/* THEME TOGGLE */}
          <ThemeToggle />

          {/* AUTH */}
          {user ? (
            <button
              onClick={logout}
              className="
                flex items-center gap-2
                px-3 py-2 rounded-lg text-sm font-medium
                text-red-600 dark:text-red-400
                border border-red-200 dark:border-red-500/30
                hover:bg-red-50 dark:hover:bg-red-500/10
                transition
              "
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          ) : (
            <LoginButton />
          )}
        </div>
      </div>
    </header>
  );
}
