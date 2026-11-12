/**
 * Authentication Business Logic Service.
 */
import {
  signInWithPopup,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";
import { auth, googleProvider } from "../../lib/firebase/client.js";
import {
  ALLOWED_EMAIL_DOMAINS,
  COLLEGE_ID_REQUIRED_MESSAGE,
} from "../../lib/campus.js";

export const AuthService = {
  /**
   * Extract domain from email string.
   */
  extractDomain(email) {
    if (!email || typeof email !== "string") return "";
    const parts = email.split("@");
    if (parts.length !== 2) return "";
    return (parts[1] || "").toLowerCase();
  },

  /**
   * Check whether an email domain belongs to an allowed VIT college domain.
   */
  isAllowedDomain(email) {
    const domain = this.extractDomain(email);
    return ALLOWED_EMAIL_DOMAINS.includes(domain);
  },

  /**
   * Listen to Firebase auth state changes.
   */
  subscribeAuthState(callback) {
    return onAuthStateChanged(auth, callback);
  },

  /**
   * Sign in with Google popup and enforce student domain validation.
   */
  async signInWithGoogle() {
    const result = await signInWithPopup(auth, googleProvider);
    const email = result.user?.email || "";

    if (!this.isAllowedDomain(email)) {
      await signOut(auth);
      return {
        success: false,
        user: null,
        error: COLLEGE_ID_REQUIRED_MESSAGE,
      };
    }

    return {
      success: true,
      user: result.user,
      error: null,
    };
  },

  /**
   * Sign out the current user.
   */
  async logout() {
    await signOut(auth);
  },
};
