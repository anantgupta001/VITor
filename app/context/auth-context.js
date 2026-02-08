"use client";

import { createContext, useContext, useEffect, useState, useMemo, useCallback } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase-config";
import { getCampusSlugFromEmail } from "@/lib/campus-config";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loginError, setLoginError] = useState("");

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setUserProfile(null);
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    getDoc(doc(db, "users", user.uid))
      .then((snap) => {
        if (!cancelled) setUserProfile(snap.exists() ? snap.data() : null);
      })
      .catch(() => {
        if (!cancelled) setUserProfile(null);
      });
    return () => { cancelled = true; };
  }, [user?.uid]);

  const userCampus = useMemo(() => {
    const fromProfile = userProfile?.campusSlug ?? null;
    const fromEmail = user?.email ? getCampusSlugFromEmail(user.email) : null;
    return fromProfile ?? fromEmail ?? null;
  }, [user?.email, userProfile?.campusSlug]);

  const setUserCampus = useCallback(
    async (campusSlug) => {
      if (!user?.uid) return;
      try {
        await setDoc(doc(db, "users", user.uid), { campusSlug }, { merge: true });
        setUserProfile((prev) => ({ ...prev, campusSlug }));
      } catch (err) {
        console.error("Failed to save campus:", err);
      }
    },
    [user?.uid]
  );

  const logout = async () => {
    setLoginError("");
    await signOut(auth);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userCampus,
        setUserCampus,
        logout,
        loading,
        loginError,
        setLoginError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
