"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useAuth } from "@/context/auth-context";
import { AuthService } from "@/services/auth/auth.service";

const ERROR_DURATION_MS = 4000;

export default function LoginButton() {
  const { user, logout } = useAuth();
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    if (!loginError) return;
    const timer = setTimeout(() => setLoginError(""), ERROR_DURATION_MS);
    return () => clearTimeout(timer);
  }, [loginError]);

  const handleLogin = async () => {
    setLoginError("");
    try {
      const result = await AuthService.signInWithGoogle();
      if (!result.success && result.error) {
        setLoginError(result.error);
      }
    } catch (err) {
      console.error("Login failure:", err);
      setLoginError("Login failed. Please try again.");
    }
  };

  if (user) {
    return (
      <button
        onClick={logout}
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

  return (
    <div className="relative flex flex-col items-end">
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
        <Image src="/google.svg" alt="Google" width={20} height={20} className="w-5 h-5" />
        <span className="hidden sm:inline text-sm font-medium text-gray-700 dark:text-gray-200">
          Sign in with Google
        </span>
      </button>

      {loginError && (
        <div
          className="absolute top-full right-0 mt-2 z-50 min-w-[240px] max-w-[320px] sm:max-w-sm px-3 py-2.5 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/80 text-red-700 dark:text-red-300 text-sm font-medium shadow-lg"
          role="alert"
        >
          {loginError}
        </div>
      )}
    </div>
  );
}
