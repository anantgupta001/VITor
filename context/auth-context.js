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
import { getCampusSlugFromEmail, getAuthGroupForEmail } from "@/lib/campus";
import { createLogger } from "@/lib/logger";

const log = createLogger("Auth");

const AuthContext = createContext();

// The user closing or re-triggering the popup is not a failure worth reporting.
const SILENT_SIGN_IN_ERROR_CODES = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
]);

const SIGN_IN_FAILED_MESSAGE = "Login failed. Please try again.";
const CAMPUS_SAVE_FAILED_MESSAGE =
  "Could not save your campus selection. Please try again.";

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  // Lives in the provider (not LoginButton) so it survives the Navbar swapping
  // LoginButton out while the auth state changes during sign-in.
  const [authError, setAuthError] = useState("");
  const [campusError, setCampusError] = useState("");

  // Listen to authentication state
  useEffect(() => {
    const unsubscribe = AuthService.subscribeAuthState((authUser) => {
      // A signed-in account outside the college domains is never treated as a user:
      // AuthService signs it out right after the popup, and exposing it for that brief
      // moment would flip the Navbar and trigger a pointless profile fetch.
      const isCollegeUser = Boolean(authUser && getAuthGroupForEmail(authUser.email));
      setUser(isCollegeUser ? authUser : null);
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
        log.error("Failed to load user profile:", err);
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
      setCampusError("");
      try {
        await UserRepository.updateUserCampus(userId, campusSlug);
        setUserProfile((prev) => ({ ...prev, campusSlug }));
      } catch (err) {
        log.error("Failed to save campus preference:", err);
        setCampusError(CAMPUS_SAVE_FAILED_MESSAGE);
      }
    },
    [userId]
  );

  const signIn = useCallback(async () => {
    setAuthError("");
    try {
      const result = await AuthService.signInWithGoogle();
      if (!result.success && result.error) {
        setAuthError(result.error);
      }
    } catch (err) {
      if (SILENT_SIGN_IN_ERROR_CODES.has(err?.code)) return;
      log.error("Login failure:", err);
      setAuthError(SIGN_IN_FAILED_MESSAGE);
    }
  }, []);

  const clearAuthError = useCallback(() => setAuthError(""), []);

  const logout = useCallback(async () => {
    await AuthService.logout();
  }, []);

  const value = useMemo(
    () => ({
      user,
      userCampus,
      setUserCampus,
      campusError,
      signIn,
      authError,
      clearAuthError,
      logout,
      loading,
    }),
    [user, userCampus, setUserCampus, campusError, signIn, authError, clearAuthError, logout, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
