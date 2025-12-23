"use client";

import { signInWithPopup } from "firebase/auth";
import { auth, googleProvider } from "@/lib/firebase";
import { useAuth } from "@/app/context/AuthContext";

export default function LoginButton() {
  const { user } = useAuth();

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = async () => {
    await auth.signOut();
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
    <button
      onClick={handleLogin}
      className="flex items-center gap-3 px-4 py-2 bg-white border rounded-lg shadow-sm hover:bg-gray-50 transition"
    >
      {/* Google Logo Image */}
      <img
        src="https://developers.google.com/identity/images/g-logo.png"
        alt="Google"
        className="w-5 h-5"
      />

      <span className="text-sm font-medium text-gray-700">
        Sign in with Google
      </span>
    </button>
  );
}
