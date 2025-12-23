"use client";

import { useAuth } from "@/app/context/AuthContext";

export default function LoginButton() {
  const auth = useAuth();

  if (!auth) return null;

  const { user, loading, login, logout } = auth;

  if (loading) return null;

  if (!user) {
    return (
      <button
        onClick={login}
        className="bg-black text-white px-4 py-2 rounded flex items-center gap-2"
      >
        🔒 Sign in with VIT Email
      </button>
    );
  }

  return (
    <div className="flex items-center gap-3 bg-gray-100 px-4 py-2 rounded">
      <span className="text-sm">👤 {user.email}</span>
      <button
        onClick={logout}
        className="text-red-600 text-sm hover:underline"
      >
        Logout
      </button>
    </div>
  );
}
