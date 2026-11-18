/**
 * Centralized Firebase Admin SDK singleton for trusted server-side operations.
 *
 * Enforces:
 * - Server-only execution (strictly prevents client bundle inclusion).
 * - Safe singleton initialization across HMR and module re-evaluations.
 * - Support for Firestore & Auth emulators in development/testing.
 * - Safe credential loading (Service Account / ADC / Emulator).
 */

import { initializeApp, getApps, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAppCheck } from "firebase-admin/app-check";
import { createLogger } from "../logger.js";

const log = createLogger("Firebase Admin");

if (typeof window !== "undefined") {
  throw new Error(
    "FATAL: Firebase Admin SDK module must never be imported in a client/browser environment."
  );
}

const ADMIN_APP_NAME = "vitor-admin-singleton";

function getServiceAccountCredentials() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
    try {
      return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
    } catch {
      // Do not log the parser error: SyntaxError messages can echo fragments of the secret.
      log.error("FIREBASE_SERVICE_ACCOUNT_KEY is not valid JSON; ignoring it.");
    }
  }

  if (process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY) {
    return {
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      projectId:
        process.env.FIREBASE_PROJECT_ID ||
        process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
        "vitor-app",
    };
  }

  return null;
}

export function initAdminApp() {
  const existingApp = getApps().find((a) => a.name === ADMIN_APP_NAME);
  if (existingApp) {
    return existingApp;
  }

  const projectId =
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
    "demo-vitor-test";

  const credentials = getServiceAccountCredentials();

  const options = { projectId };
  if (credentials) {
    options.credential = cert(credentials);
  }

  return initializeApp(options, ADMIN_APP_NAME);
}

export const adminApp = initAdminApp();
export const adminAuth = getAuth(adminApp);
export const adminDb = getFirestore(adminApp);
export const adminAppCheck = getAppCheck(adminApp);

export { FieldValue, Timestamp };

export function getAdminApp() {
  return adminApp;
}

export function getAdminAuth() {
  return adminAuth;
}

export function getAdminDb() {
  return adminDb;
}
