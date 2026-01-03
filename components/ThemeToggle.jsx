"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const { theme, setTheme, systemTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const currentTheme = theme === "system" ? systemTheme : theme;

  return (
    <button
      onClick={() =>
        setTheme(currentTheme === "dark" ? "light" : "dark")
      }
      className="
        p-2 rounded-lg border
        bg-white dark:bg-gray-800
        border-gray-300 dark:border-gray-600
        hover:bg-gray-100 dark:hover:bg-gray-700
        transition
      "
      aria-label="Toggle Theme"
    >
      {currentTheme === "dark" ? (
        <span className="text-xl">🌞</span>
      ) : (
        <span className="text-xl">🌙</span>
      )}
    </button>
  );
}
