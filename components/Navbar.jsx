"use client";

import Link from "next/link";
import ThemeToggle from "@/components/ThemeToggle";
import LoginButton from "@/components/LoginButton";

export default function Navbar() {
  return (
    <header className="w-full bg-white 
                        dark:bg-gray-900 border-b border-gray-200 
                        dark:border-gray-700"
    >

      <div className="max-w-7xl mx-auto px-6 py-4
                      flex items-center justify-between">

        {/* LEFT: LOGO */}
        <Link href="/" className="text-2xl font-bold">
          VITor
        </Link>

        {/* RIGHT: ACTIONS */}
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <LoginButton />
        </div>
      </div>
    </header>
  );
}
