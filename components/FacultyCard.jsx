import Link from "next/link";
import {
  CalendarCheck,
  PenLine,
  GraduationCap,
  Handshake,
  Users,
  Star,
} from "lucide-react";

import { getFacultyPhoto, getScoreColorClass } from "@/lib/faculty-helpers";

function formatNumber(num) {
  if (!num || num === 0) return "0";
  if (num >= 1_000_000)
    return (num / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (num >= 1_000)
    return (num / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  return num.toString();
}

function StatRow({ icon: Icon, label, value }) {
  const scoreClass = getScoreColorClass(value);
  return (
    <div className="flex items-center justify-between text-sm text-gray-700 dark:text-gray-300">
      <span className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        {label}
      </span>
      <span className={`font-medium ${scoreClass}`}>
        {value !== null && value !== undefined ? value.toFixed(1) : "—"}
      </span>
    </div>
  );
}

export default function FacultyCard({ faculty, campusSlug, currentPage, query }) {
  const params = new URLSearchParams();
  if (currentPage) params.set("page", currentPage);
  if (query?.trim()) params.set("q", query);
  const qs = params.toString();
  const href = `/${campusSlug}/${faculty.id}${qs ? `?${qs}` : ""}`;

  return (
    <Link
      href={href}
      className="block h-full"
    >
      <div
        className="
          h-full rounded-2xl border shadow-sm
          bg-white dark:bg-gray-800
          border-gray-200 dark:border-gray-700
          hover:shadow-md transition
          flex flex-col overflow-hidden
        "
      >
        {/* IMAGE */}
        <div className="p-3">
          <div className="h-44 w-full rounded-xl bg-gray-100 dark:bg-gray-700 overflow-hidden">
            <img
              src={getFacultyPhoto(faculty)}
              alt={faculty.name || "Faculty"}
              className="w-full h-full object-cover object-top"
            />
          </div>
        </div>

        {/* CONTENT */}
        <div className="p-4 flex flex-col flex-1">
          {/* NAME */}
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            {faculty.name}
          </h2>

          {/* DESIGNATION */}
          <p className="text-sm text-gray-600 dark:text-gray-300">
            {faculty.designation}
          </p>

          {/* DEPARTMENT */}
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">
            {faculty.department}
          </p>

          {/* STATS */}
          <div className="space-y-2 mt-auto">
            <StatRow
              icon={CalendarCheck}
              label="Attendance"
              value={faculty.avgAttendance}
            />
            <StatRow
              icon={PenLine}
              label="Correction"
              value={faculty.avgCorrection}
            />
            <StatRow
              icon={GraduationCap}
              label="Teaching"
              value={faculty.avgTeaching}
            />
            <StatRow
              icon={Handshake}
              label="Approachability"
              value={faculty.avgApproachability}
            />
          </div>

          {/* FOOTER */}
          <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-700 flex items-center justify-between text-sm">
            {/* OVERALL */}
            <div className={`flex items-center gap-2 font-semibold ${getScoreColorClass(faculty.avgRating)}`}>
              <Star className="w-4 h-4 text-yellow-400" />
              {faculty.avgRating ? faculty.avgRating.toFixed(1) : "—"}
            </div>

            {/* REVIEW COUNT */}
            <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <Users className="w-4 h-4" />
              {formatNumber(faculty.reviewCount || 0)}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}
