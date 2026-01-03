"use client";

import { signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { useAuth } from "@/app/context/AuthContext";
import { useState } from "react";

/* ================= CONFIG ================= */

const ALLOWED_DOMAINS = [
  "vitapstudent.ac.in",
  // "vitap.ac.in",
  // "vitstudent.ac.in",
];

/* ================= COMPONENT ================= */

export default function LoginButton() {
  const { user } = useAuth();
  const [error, setError] = useState("");

  const handleLogin = async () => {
    setError("");
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email || "";
      const domain = email.split("@")[1];

      if (!ALLOWED_DOMAINS.includes(domain)) {
        await signOut(auth);
        setError("Please sign in using your official VIT student email ID.");
      }
    } catch (err) {
      console.error(err);
      setError("Login failed. Please try again.");
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  /* ================= LOGGED IN ================= */

  if (user) {
    return (
      <button
        onClick={handleLogout}
        className="
          px-4 py-2 rounded-lg border text-sm
          bg-white dark:bg-gray-800
          border-gray-300 dark:border-gray-600
          text-gray-700 dark:text-gray-200
          hover:bg-gray-100 dark:hover:bg-gray-700
          transition
        "
      >
        Logout
      </button>
    );
  }

  /* ================= LOGGED OUT ================= */

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleLogin}
        aria-label="Sign in with Google"
        className="
          flex items-center gap-2
          px-3 sm:px-4 py-2 rounded-lg border shadow-sm
          bg-white dark:bg-gray-800
          border-gray-300 dark:border-gray-600
          hover:bg-gray-50 dark:hover:bg-gray-700
          transition
        "
      >
        {/* GOOGLE SVG (NO WHITE BOX ✅) */}
        <img
          src="/google.svg"
          alt="Google"
          className="w-5 h-5"
        />

        {/* TEXT ONLY ON DESKTOP */}
        <span className="hidden sm:inline text-sm font-medium text-gray-700 dark:text-gray-200">
          Sign in with Google
        </span>
      </button>

      {error && (
        <p className="text-xs text-red-500 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
