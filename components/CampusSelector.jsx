"use client";

import Link from "next/link";
import { CAMPUSES } from "@/lib/campus-config";
import { GraduationCap, MapPin } from "lucide-react";

export default function CampusSelector() {
  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
        <div className="text-center mb-6 sm:mb-10">
          <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 mb-1 sm:mb-2">
            Choose your campus
          </h1>
          <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
            Select your VIT campus to view and rate faculty
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          {CAMPUSES.map((campus) => (
            <Link
              key={campus.slug}
              href={`/${campus.slug}`}
              className="
                flex items-center gap-3 sm:gap-4
                p-4 sm:p-6 rounded-xl sm:rounded-2xl
                bg-white dark:bg-gray-800
                border border-gray-200 dark:border-gray-700
                shadow-sm
                hover:shadow-md hover:border-slate-300 dark:hover:border-gray-600
                transition
              "
            >
              <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-lg sm:rounded-xl bg-slate-100 dark:bg-gray-700 flex items-center justify-center shrink-0">
                <MapPin className="w-4 h-4 sm:w-6 sm:h-6 text-slate-600 dark:text-gray-300" />
              </div>
              <div className="min-w-0 flex-1">
                <span className="font-semibold text-base sm:text-lg text-gray-900 dark:text-gray-100 block sm:inline">
                  <span className="md:hidden">{campus.shortLabel ?? campus.label}</span>
                  <span className="hidden md:inline">{campus.label}</span>
                </span>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 hidden sm:block">
                  View & rate faculty
                </p>
              </div>
              <GraduationCap className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 dark:text-gray-500 shrink-0 hidden sm:block" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
