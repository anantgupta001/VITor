/**
 * Integration Test Environment Setup.
 * Connects the centralized Firebase Firestore client SDK to the local emulator.
 */
import { connectFirestoreEmulator, terminate } from "firebase/firestore";
import { db } from "../../../lib/firebase/client.js";

let emulatorConnected = false;

export function ensureEmulatorConnection() {
  if (emulatorConnected) return;

  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085";
  const [host, portStr] = emulatorHost.split(":");
  const port = Number(portStr) || 8085;

  try {
    connectFirestoreEmulator(db, host, port);
    emulatorConnected = true;
  } catch (err) {
    // If already connected, ignore
    if (!err.message?.includes("already been called")) {
      throw err;
    }
    emulatorConnected = true;
  }
}

export async function closeFirestoreConnection() {
  try {
    await terminate(db);
  } catch {
    // ignore
  }
}

export { db };
