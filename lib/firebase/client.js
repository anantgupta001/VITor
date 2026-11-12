/**
 * Centralized Firebase Client App, Auth, and Firestore instance.
 */
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  connectAuthEmulator,
  signInWithEmailAndPassword,
} from "firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDummyKeyForBuildAndTesting00",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "vitor-app.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "vitor-app",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "vitor-app.appspot.com",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:123456789:web:abcdef",
};

// Singleton pattern to prevent duplicate initialization during HMR
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

// Explicit production guard: emulator mode can NEVER activate in production builds
const isProduction = process.env.NODE_ENV === "production";
const shouldConnectEmulator =
  !isProduction && process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";

// ── HMR-safe emulator connection ─────────────────────────────────────────────
// Under Next.js HMR, this module can be re-evaluated while the Firebase SDK
// singletons (app / auth / db) remain the same in-process objects.
// connectFirestoreEmulator / connectAuthEmulator each throw "already been
// called" if invoked a second time on the same instance.  Rather than relying
// on catching that error we track connection state ourselves so that:
//   • The first evaluation connects and may throw on genuine failures.
//   • Subsequent evaluations skip the connect calls entirely (no error at all).
//   • Genuine connection errors (non-idempotency) are still propagated.
//
// The flag is stored on the global object so it survives HMR module boundary
// resets while still being confined to the current Node/browser process.
const _g = typeof globalThis !== "undefined" ? globalThis : global;

if (shouldConnectEmulator) {
  if (!_g.__VIT_FIRESTORE_EMULATOR_CONNECTED__) {
    const firestoreHost =
      process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST || "127.0.0.1:8086";
    const [fHost, fPort] = firestoreHost.split(":");
    try {
      connectFirestoreEmulator(db, fHost, Number(fPort) || 8086);
      _g.__VIT_FIRESTORE_EMULATOR_CONNECTED__ = true;
    } catch (err) {
      // Treat the SDK's own idempotency guard as success (edge case where the
      // flag was not set but the SDK already connected, e.g. fast-refresh race).
      if (err?.message?.includes("already been called")) {
        _g.__VIT_FIRESTORE_EMULATOR_CONNECTED__ = true;
      } else {
        console.error("[Firebase Emulator] Failed to connect to Firestore Emulator:", err);
        throw err;
      }
    }
  }

  if (!_g.__VIT_AUTH_EMULATOR_CONNECTED__) {
    const authHost =
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9098";
    try {
      connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
      _g.__VIT_AUTH_EMULATOR_CONNECTED__ = true;
    } catch (err) {
      if (err?.message?.includes("already been called")) {
        _g.__VIT_AUTH_EMULATOR_CONNECTED__ = true;
      } else {
        console.error("[Firebase Emulator] Failed to connect to Auth Emulator:", err);
        throw err;
      }
    }
  }

  // Expose test authentication helper strictly outside production for E2E testing
  if (typeof window !== "undefined") {
    window.__VIT_TEST_AUTH__ = {
      signIn: (email, password = "e2e-test-password-123") =>
        signInWithEmailAndPassword(auth, email, password),
    };
  }
}
