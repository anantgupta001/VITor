"use client";

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const isDark = theme === "dark";

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark");
  };

  return (
    <>
      {/* ================= MOBILE: ICON BUTTON ================= */}
      <button
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="
          md:hidden
          flex items-center justify-center
          px-3 py-2 rounded-lg border shadow-sm
          bg-white dark:bg-gray-800
          border-gray-300 dark:border-gray-600
          hover:bg-gray-50 dark:hover:bg-gray-700
          transition
        "
      >
        {isDark ? (
          <Sun className="w-5 h-5 text-yellow-500" />
        ) : (
          <Moon className="w-5 h-5 text-gray-700 dark:text-gray-200" />
        )}
      </button>

      {/* ================= DESKTOP: TOGGLE SWITCH ================= */}
      <button
        onClick={toggleTheme}
        aria-label="Toggle theme"
        className="
          hidden md:flex
          items-center
          w-14 h-8
          rounded-full
          border
          bg-gray-200 dark:bg-gray-700
          border-gray-300 dark:border-gray-600
          px-1
          transition-colors
        "
      >
        <span
          className={`
            w-6 h-6
            rounded-full
            bg-white dark:bg-gray-900
            shadow-md
            flex items-center justify-center
            transform transition-transform duration-300
            ${isDark ? "translate-x-6" : "translate-x-0"}
          `}
        >
          {isDark ? (
            <Moon className="w-4 h-4 text-gray-700 dark:text-gray-200" />
          ) : (
            <Sun className="w-4 h-4 text-yellow-500" />
          )}
        </span>
      </button>
    </>
  );
}
