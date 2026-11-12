"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";
import { AuthService } from "@/services/auth/auth.service";
import { UserRepository } from "@/repositories/user.repository";
import { getCampusSlugFromEmail } from "@/lib/campus";

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Listen to authentication state
  useEffect(() => {
    const unsubscribe = AuthService.subscribeAuthState((authUser) => {
      setUser(authUser);
      setUserProfile(null);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Fetch user profile whenever user ID changes
  const userId = user?.uid ?? null;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    UserRepository.getUserProfile(userId)
      .then((profile) => {
        if (!cancelled) setUserProfile(profile);
      })
      .catch((err) => {
        console.error("Failed to load user profile:", err);
        if (!cancelled) setUserProfile(null);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const userEmail = user?.email ?? null;
  const profileCampusSlug = userProfile?.campusSlug ?? null;

  // Resolve user's campus from either profile or verified email domain
  const userCampus = useMemo(() => {
    const fromProfile = profileCampusSlug;
    const fromEmail = userEmail ? getCampusSlugFromEmail(userEmail) : null;
    return fromProfile ?? fromEmail ?? null;
  }, [userEmail, profileCampusSlug]);

  const setUserCampus = useCallback(
    async (campusSlug) => {
      if (!userId) return;
      try {
        await UserRepository.updateUserCampus(userId, campusSlug);
        setUserProfile((prev) => ({ ...prev, campusSlug }));
      } catch (err) {
        console.error("Failed to save campus preference:", err);
      }
    },
    [userId]
  );

  const logout = useCallback(async () => {
    await AuthService.logout();
  }, []);

  const value = useMemo(
    () => ({
      user,
      userCampus,
      setUserCampus,
      logout,
      loading,
    }),
    [user, userCampus, setUserCampus, logout, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
