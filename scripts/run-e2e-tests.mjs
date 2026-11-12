/**
 * E2E Test Runner for VITor.
 *
 * Workflow:
 *   1. Set up Java runtime (IntelliJ JBR on Windows).
 *   2. Load .env.e2e environment variables.
 *   3. Start Firebase Emulators (Auth + Firestore) on dedicated E2E ports.
 *   4. Clear and seed deterministic test data into Firestore Emulator.
 *   5. Create/authenticate the test user.
 *   6. Start Next.js dev server on port 3099 with E2E environment.
 *   7. Wait for the dev server to be ready.
 *   8. Run Playwright tests.
 *   9. Shut everything down reliably and exit with the test exit code.
 */
import { spawn, spawnSync, execSync } from "child_process";
import { existsSync, readFileSync } from "fs";
import net from "net";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// ── Java 21+ setup ──────────────────────────────────────────────────────────
if (process.platform === "win32") {
  const jbrBin =
    "C:\\Program Files\\JetBrains\\IntelliJ IDEA 2025.3.1.1\\jbr\\bin";
  if (existsSync(jbrBin)) {
    process.env.PATH = `${jbrBin};${process.env.PATH}`;
    console.log(
      "[run-e2e-tests] Using IntelliJ JBR (Java 25) for Firebase Emulator."
    );
  } else {
    console.warn(
      "[run-e2e-tests] WARNING: JBR not found. Ensure Java 21+ is in PATH."
    );
  }
}

// ── Load .env.e2e into process.env ───────────────────────────────────────────
const envFile = path.join(root, ".env.e2e");
if (existsSync(envFile)) {
  const lines = readFileSync(envFile, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx);
      const val = trimmed.slice(eqIdx + 1);
      process.env[key] = val;
    }
  }
  console.log("[run-e2e-tests] Loaded .env.e2e");
}

// ── Env vars for demo project & emulators ────────────────────────────────────
process.env.GCLOUD_PROJECT = "demo-vitor-e2e";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-vitor-e2e";
process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR = "true";
process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST = "127.0.0.1:8086";
process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9098";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8086";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "127.0.0.1:9098";
process.env.PORT = "3099";

// ── Process Tracking & Cleanup ───────────────────────────────────────────────
let emulatorProc = null;
let nextProc = null;
let cleanedUp = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function killProcessTree(pid) {
  if (!pid) return;
  if (process.platform === "win32") {
    try {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: "ignore" });
    } catch {
      // Process already terminated or invalid PID
    }
  } else {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        // ignore
      }
    }
  }
}

function cleanup() {
  if (cleanedUp) return;
  cleanedUp = true;
  console.log("\n[run-e2e-tests] Cleaning up child processes...");

  if (nextProc && nextProc.pid) {
    killProcessTree(nextProc.pid);
    nextProc = null;
  }
  if (emulatorProc && emulatorProc.pid) {
    killProcessTree(emulatorProc.pid);
    emulatorProc = null;
  }
}

// Graceful signal handlers
process.on("SIGINT", () => {
  console.error("\n[run-e2e-tests] Received SIGINT. Terminating runner and child processes...");
  cleanup();
  process.exit(130);
});

process.on("SIGTERM", () => {
  console.error("\n[run-e2e-tests] Received SIGTERM. Terminating runner and child processes...");
  cleanup();
  process.exit(143);
});

process.on("exit", () => {
  cleanup();
});

// ── Port Conflict Preflight ───────────────────────────────────────────────────
// Before starting any child processes, verify that required ports are free.
// Uses a raw TCP connect: if it succeeds, something is already listening.
// This prevents waitForPort() from falsely succeeding against an unrelated service.
//
// Error semantics:
//   connect  → port occupied (resolve true)
//   timeout  → nothing listening within window (resolve false = free)
//   ECONNREFUSED → nothing listening (resolve false = free)
//   any other error (ECONNRESET, EHOSTUNREACH, …) → unexpected; reject so the
//   caller can surface it rather than silently treating the port as available.
function isPortOccupied(host, port, timeoutMs = 2000) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;

    function done(occupied) {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(occupied);
    }

    function fail(err) {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    }

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true));
    socket.once("timeout", () => done(false));
    socket.once("error", (err) => {
      // ECONNREFUSED = nothing is listening on that port → available
      if (err.code === "ECONNREFUSED") {
        done(false);
      } else {
        fail(err);
      }
    });
    socket.connect(port, host);
  });
}

const REQUIRED_PORTS = [
  { port: 8086, host: "127.0.0.1", service: "Firebase Firestore Emulator" },
  { port: 9098, host: "127.0.0.1", service: "Firebase Auth Emulator" },
  { port: 3099, host: "127.0.0.1", service: "Next.js dev server" },
];

async function checkPortsAreFree() {
  for (const { port, host, service } of REQUIRED_PORTS) {
    const occupied = await isPortOccupied(host, port);
    if (occupied) {
      throw new Error(
        `Port ${port} is already in use by another process.\n` +
        `This port is required for: ${service}.\n` +
        `Please stop the process occupying port ${port} and retry.`
      );
    }
  }
  console.log("[run-e2e-tests] Preflight: all required ports are free (8086, 9098, 3099).");
}

// ── Port Waiting & Liveness Check ────────────────────────────────────────────
async function waitForPort(host, port, timeoutMs = 60_000, isAliveFn = () => true) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!isAliveFn()) {
      return false;
    }
    try {
      await fetch(`http://${host}:${port}`, {
        signal: AbortSignal.timeout(2000),
      });
      return true;
    } catch {
      await sleep(1000);
    }
  }
  return false;
}

// ── Firestore Seeding ────────────────────────────────────────────────────────
async function clearEmulatorData() {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = "demo-vitor-e2e";
  try {
    const res = await fetch(
      `http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errText}`);
    }
    console.log("[run-e2e-tests] Cleared Firestore emulator data.");
  } catch (err) {
    throw new Error(`Failed to clear Firestore emulator data: ${err.message}`);
  }
}

async function seedFirestoreData() {
  console.log("[run-e2e-tests] Seeding test data into Firestore Emulator...");

  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = "demo-vitor-e2e";

  async function writeDoc(collectionPath, docId, fields) {
    const firestoreFields = {};
    for (const [k, v] of Object.entries(fields)) {
      if (typeof v === "number") {
        if (Number.isInteger(v)) {
          firestoreFields[k] = { integerValue: String(v) };
        } else {
          firestoreFields[k] = { doubleValue: v };
        }
      } else if (typeof v === "string") {
        firestoreFields[k] = { stringValue: v };
      }
    }

    const url = `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents/${collectionPath}/${docId}`;
    const resp = await fetch(url, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: firestoreFields }),
    });
    if (!resp.ok) {
      const text = await resp.text();
      throw new Error(
        `Failed to write Firestore seed document ${collectionPath}/${docId} (HTTP ${resp.status}): ${text}`
      );
    }
  }

  // Seed faculty for vit-v campus
  await writeDoc("campuses/vit-v/faculties", "fac-e2e-001", {
    name: "Dr. Alice Sharma",
    designation: "Associate Professor",
    department: "Computer Science and Engineering",
    avgRating: 4.25,
    avgAttendance: 4.1,
    avgCorrection: 4.3,
    avgTeaching: 4.5,
    avgApproachability: 4.1,
    reviewCount: 2,
  });

  await writeDoc("campuses/vit-v/faculties", "fac-e2e-002", {
    name: "Prof. Rajesh Kumar",
    designation: "Professor",
    department: "Electronics and Communication",
    avgRating: 3.5,
    avgAttendance: 3.2,
    avgCorrection: 3.8,
    avgTeaching: 3.6,
    avgApproachability: 3.4,
    reviewCount: 1,
  });

  await writeDoc("campuses/vit-v/faculties", "fac-e2e-003", {
    name: "Dr. Meena Patel",
    designation: "Assistant Professor",
    department: "Mechanical Engineering",
    avgRating: 4.8,
    avgAttendance: 4.9,
    avgCorrection: 4.7,
    avgTeaching: 4.8,
    avgApproachability: 4.7,
    reviewCount: 3,
  });

  // Seed reviews for fac-e2e-001
  await writeDoc(
    "campuses/vit-v/faculties/fac-e2e-001/reviews",
    "review-user-1",
    {
      user: "Anonymous User",
      attendance: 4,
      correction: 5,
      teaching: 4,
      approachability: 4,
      overall: 4.25,
      text: "Great teacher, very approachable and explains well.",
      userId: "review-user-1",
    }
  );

  await writeDoc(
    "campuses/vit-v/faculties/fac-e2e-001/reviews",
    "review-user-2",
    {
      user: "Anonymous User",
      attendance: 4,
      correction: 4,
      teaching: 5,
      approachability: 4,
      overall: 4.25,
      text: "One of the best professors in the department.",
      userId: "review-user-2",
    }
  );

  // Seed faculty for vit-c campus
  await writeDoc("campuses/vit-c/faculties", "fac-e2e-c01", {
    name: "Dr. Priya Nair",
    designation: "Professor",
    department: "Information Technology",
    avgRating: 4.0,
    avgAttendance: 4.0,
    avgCorrection: 4.0,
    avgTeaching: 4.0,
    avgApproachability: 4.0,
    reviewCount: 0,
  });

  // Seed user profile for test user (Vellore campus)
  await writeDoc("users", "e2e-test-user-uid", {
    campusSlug: "vit-v",
  });

  console.log("[run-e2e-tests] Test data seeded successfully.");
}

async function createTestAuthUser() {
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  const signUpUrl = `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key-for-e2e`;

  let uid = null;
  const resp = await fetch(signUpUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "e2etest@vitstudent.ac.in",
      password: "e2e-test-password-123",
      returnSecureToken: true,
    }),
  });

  if (resp.ok) {
    const data = await resp.json();
    uid = data.localId;
    console.log(`[run-e2e-tests] Created test Auth user: e2etest@vitstudent.ac.in (uid: ${uid})`);
  } else {
    // If account already exists in emulator, sign in to retrieve UID
    const signInUrl = `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key-for-e2e`;
    const signInRes = await fetch(signInUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "e2etest@vitstudent.ac.in",
        password: "e2e-test-password-123",
        returnSecureToken: true,
      }),
    });
    if (signInRes.ok) {
      const data = await signInRes.json();
      uid = data.localId;
      console.log(`[run-e2e-tests] Existing test Auth user: e2etest@vitstudent.ac.in (uid: ${uid})`);
    } else {
      const errText = await signInRes.text();
      throw new Error(`Failed to create or sign in test auth user: HTTP ${signInRes.status}: ${errText}`);
    }
  }

  if (!uid) {
    throw new Error("Failed to resolve UID for test auth user.");
  }

  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = "demo-vitor-e2e";
  const userDocUrl = `http://${emulatorHost}/v1/projects/${projectId}/databases/(default)/documents/users/${uid}`;
  const profileRes = await fetch(userDocUrl, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fields: { campusSlug: { stringValue: "vit-v" } },
    }),
  });

  if (!profileRes.ok) {
    const errText = await profileRes.text();
    throw new Error(`Failed to seed user profile for uid ${uid}: HTTP ${profileRes.status}: ${errText}`);
  }

  console.log(`[run-e2e-tests] Seeded user profile for uid: ${uid}`);
}

// ── Main Runner ──────────────────────────────────────────────────────────────
async function main() {
  const firebaseCli = path.join(
    root,
    "node_modules",
    "firebase-tools",
    "lib",
    "bin",
    "firebase.js"
  );
  const nextCli = path.join(
    root,
    "node_modules",
    "next",
    "dist",
    "bin",
    "next"
  );

  let emulatorExited = false;
  let emulatorExitInfo = null;
  let emulatorOutput = "";

  let nextExited = false;
  let nextExitInfo = null;
  let nextOutput = "";

  let exitCode = 1;

  try {
    // 0. Preflight: ensure required ports are free before spawning anything
    await checkPortsAreFree();

    // 1. Start Firebase Emulators in background
    console.log("\n[run-e2e-tests] Starting Firebase Emulators (Auth + Firestore)...");
    emulatorProc = spawn(
      process.execPath,
      [
        firebaseCli,
        "emulators:start",
        "--config",
        "firebase.e2e.json",
        "--project",
        "demo-vitor-e2e",
      ],
      {
        cwd: root,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    emulatorProc.stdout.on("data", (d) => {
      emulatorOutput += d.toString();
    });
    emulatorProc.stderr.on("data", (d) => {
      emulatorOutput += d.toString();
    });
    emulatorProc.on("exit", (code, signal) => {
      emulatorExited = true;
      emulatorExitInfo = code !== null ? `exit code ${code}` : `signal ${signal}`;
    });
    emulatorProc.on("error", (err) => {
      emulatorExited = true;
      emulatorExitInfo = `spawn error: ${err.message}`;
    });

    console.log("[run-e2e-tests] Waiting for Firestore Emulator on port 8086...");
    const firestoreReady = await waitForPort("127.0.0.1", 8086, 60_000, () => !emulatorExited);
    if (!firestoreReady) {
      throw new Error(
        `Firestore Emulator did not start in time${emulatorExited ? ` (${emulatorExitInfo})` : ""}.\n${emulatorOutput}`
      );
    }
    console.log("[run-e2e-tests] Firestore Emulator is ready.");

    console.log("[run-e2e-tests] Waiting for Auth Emulator on port 9098...");
    const authReady = await waitForPort("127.0.0.1", 9098, 30_000, () => !emulatorExited);
    if (!authReady) {
      throw new Error(
        `Auth Emulator did not start in time${emulatorExited ? ` (${emulatorExitInfo})` : ""}.\n${emulatorOutput}`
      );
    }
    console.log("[run-e2e-tests] Auth Emulator is ready.");

    // 2. Clear and seed data
    await clearEmulatorData();
    await seedFirestoreData();
    await createTestAuthUser();

    // Verify emulator is still healthy after seeding
    if (emulatorExited) {
      throw new Error(`Firebase Emulator exited after data seeding: ${emulatorExitInfo}.\n${emulatorOutput}`);
    }

    // 3. Start Next.js dev server on port 3099
    console.log("\n[run-e2e-tests] Starting Next.js dev server on port 3099...");
    nextProc = spawn(
      process.execPath,
      [nextCli, "dev", "--port", "3099"],
      {
        cwd: root,
        env: {
          ...process.env,
          PORT: "3099",
          NODE_ENV: "development",
        },
        stdio: ["ignore", "pipe", "pipe"],
      }
    );

    nextProc.stdout.on("data", (d) => {
      nextOutput += d.toString();
    });
    nextProc.stderr.on("data", (d) => {
      nextOutput += d.toString();
    });
    nextProc.on("exit", (code, signal) => {
      nextExited = true;
      nextExitInfo = code !== null ? `exit code ${code}` : `signal ${signal}`;
    });
    nextProc.on("error", (err) => {
      nextExited = true;
      nextExitInfo = `spawn error: ${err.message}`;
    });

    console.log("[run-e2e-tests] Waiting for Next.js on port 3099...");
    const nextReady = await waitForPort(
      "127.0.0.1",
      3099,
      60_000,
      () => !nextExited && !emulatorExited
    );

    if (!nextReady) {
      if (nextExited) {
        throw new Error(`Next.js server exited prematurely (${nextExitInfo}).\n${nextOutput}`);
      }
      if (emulatorExited) {
        throw new Error(`Firebase Emulator exited while waiting for Next.js (${emulatorExitInfo}).\n${emulatorOutput}`);
      }
      throw new Error(`Next.js dev server did not start in time on port 3099.\n${nextOutput}`);
    }

    await sleep(3000);
    console.log("[run-e2e-tests] Next.js dev server is ready.\n");

    // 4. Run Playwright
    console.log("[run-e2e-tests] Running Playwright tests...\n");
    const playwrightResult = spawnSync(
      process.execPath,
      [
        path.join(root, "node_modules", "@playwright", "test", "cli.js"),
        "test",
        "--config",
        "playwright.config.mjs",
      ],
      {
        cwd: root,
        env: process.env,
        stdio: "inherit",
      }
    );

    if (playwrightResult.error) {
      throw playwrightResult.error;
    }

    exitCode = playwrightResult.status ?? 1;
  } catch (err) {
    console.error("\n[run-e2e-tests] Fatal runner error:", err.message || err);
    exitCode = 1;
  } finally {
    cleanup();
  }

  await sleep(1000);
  console.log(`[run-e2e-tests] Completed with exit code: ${exitCode}`);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error("[run-e2e-tests] Unexpected fatal error in runner:", err);
  cleanup();
  process.exit(1);
});
