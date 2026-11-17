
/**
 * Centralized Firebase Client App, Auth, Firestore, and App Check instance.
 */
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  connectAuthEmulator,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
} from "firebase/firestore";
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check";

const firebaseConfig = {
  apiKey:
    process.env.NEXT_PUBLIC_FIREBASE_API_KEY ||
    "AIzaSyDummyKeyForBuildAndTesting00",
  authDomain:
    process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ||
    "vitor-app.firebaseapp.com",
  projectId:
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "vitor-app",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    "vitor-app.appspot.com",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "123456789",
  appId:
    process.env.NEXT_PUBLIC_FIREBASE_APP_ID ||
    "1:123456789:web:abcdef",
};

// Singleton pattern to prevent duplicate initialization during HMR.
export const app =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

const isProduction = process.env.NODE_ENV === "production";

// Shared global state survives Next.js HMR module re-evaluation.
const _g = globalThis;

// ── Firebase App Check ────────────────────────────────────────────────────────

const appCheckSiteKey =
  process.env.NEXT_PUBLIC_RECAPTCHA_ENTERPRISE_SITE_KEY;

// Use Firebase App Check Debug Token on localhost only.
const isLocalhost =
  typeof window !== "undefined" &&
  !isProduction &&
  window.location.hostname === "localhost";

if (isLocalhost) {
  globalThis.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
}

export const appCheck =
  typeof window !== "undefined" && appCheckSiteKey
    ? (_g.__VITOR_APP_CHECK__ ||= initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(appCheckSiteKey),
        isTokenAutoRefreshEnabled: true,
      }))
    : null;

// ── Firebase Auth and Firestore ───────────────────────────────────────────────

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);

// Explicit production guard: emulator mode can NEVER activate in production.
const shouldConnectEmulator =
  !isProduction &&
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";

// ── HMR-safe emulator connection ─────────────────────────────────────────────

if (shouldConnectEmulator) {
  if (!_g.__VIT_FIRESTORE_EMULATOR_CONNECTED__) {
    const firestoreHost =
      process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST ||
      "127.0.0.1:8086";

    const [fHost, fPort] = firestoreHost.split(":");

    try {
      connectFirestoreEmulator(db, fHost, Number(fPort) || 8086);
      _g.__VIT_FIRESTORE_EMULATOR_CONNECTED__ = true;
    } catch (err) {
      if (err?.message?.includes("already been called")) {
        _g.__VIT_FIRESTORE_EMULATOR_CONNECTED__ = true;
      } else {
        console.error(
          "[Firebase Emulator] Failed to connect to Firestore Emulator:",
          err
        );
        throw err;
      }
    }
  }

  if (!_g.__VIT_AUTH_EMULATOR_CONNECTED__) {
    const authHost =
      process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST ||
      "127.0.0.1:9098";

    try {
      connectAuthEmulator(auth, `http://${authHost}`, {
        disableWarnings: true,
      });

      _g.__VIT_AUTH_EMULATOR_CONNECTED__ = true;
    } catch (err) {
      if (err?.message?.includes("already been called")) {
        _g.__VIT_AUTH_EMULATOR_CONNECTED__ = true;
      } else {
        console.error(
          "[Firebase Emulator] Failed to connect to Auth Emulator:",
          err
        );
        throw err;
      }
    }
  }

  // Expose test authentication helper strictly outside production.
  if (typeof window !== "undefined") {
    window.__VIT_TEST_AUTH__ = {
      signIn: (email, password = "e2e-test-password-123") =>
        signInWithEmailAndPassword(auth, email, password),
    };
  }
}
