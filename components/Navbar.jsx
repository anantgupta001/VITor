"use client";

import Link from "next/link";
import LoginButton from "@/components/LoginButton";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/app/context/AuthContext";
import { LogOut } from "lucide-react";

export default function Navbar() {
  const { user } = useAuth();

  return (
    <header className="w-full border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* LEFT: LOGO */}
        <Link
          href="/"
          className="text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100"
        >
          VITor
        </Link>

        {/* RIGHT ACTIONS */}
        <div className="flex items-center gap-3">

          {/* THEME TOGGLE */}
          <ThemeToggle />

          {/* AUTH */}
          {user ? (
            <button
              onClick={() => import("firebase/auth").then(({ signOut }) =>
                signOut(require("@/lib/firebase").auth)
              )}
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
