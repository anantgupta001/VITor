"use client";

import { useRouter } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle";
import LoginButton from "@/components/LoginButton";

export default function Navbar() {
  const router = useRouter();

  function goHome() {
    router.push("/");
  }

  return (
    <header className="border-b bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">

        {/* 🔥 LOGO / BRAND */}
        <button
          onClick={goHome}
          className="text-xl font-bold text-gray-900 dark:text-gray-100"
        >
          VITor
        </button>

        {/* RIGHT SIDE */}
        <div className="flex items-center gap-4">
          <ThemeToggle />
          <LoginButton />
        </div>

      </div>
    </header>
  );
}
