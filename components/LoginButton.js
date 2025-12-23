"use client";

import { signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { useAuth } from "@/app/context/AuthContext";
import { useState } from "react";

/* ================= CONFIG ================= */

// ✅ Allowed college domains (future-proof)
const ALLOWED_DOMAINS = [
  "vitapstudent.ac.in",
  // "vitap.ac.in",        // uncomment later if needed
  // "vitstudent.ac.in",   // future campuses
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

      // ❌ Domain not allowed
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

  if (user) {
    return (
      <button
        onClick={handleLogout}
        className="px-4 py-2 rounded-lg border text-sm bg-white hover:bg-gray-100"
      >
        Logout
      </button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleLogin}
        className="flex items-center gap-3 px-4 py-2 bg-white border rounded-lg shadow-sm hover:bg-gray-50 transition"
      >
        {/* Google Logo */}
        <img
          src="https://developers.google.com/identity/images/g-logo.png"
          alt="Google"
          className="w-5 h-5"
        />

        <span className="text-sm font-medium text-gray-700">
          Sign in with Google
        </span>
      </button>

      {/* ERROR */}
      {error && (
        <p className="text-xs text-red-500">
          {error}
        </p>
      )}
    </div>
  );
}
