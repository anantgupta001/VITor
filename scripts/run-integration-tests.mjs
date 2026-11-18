/**
 * Integration Test Runner for VITor.
 *
 * Workflow:
 *   1. Prepend a compatible Java 21+ runtime (IntelliJ JBR) to PATH on Windows.
 *   2. Set FIRESTORE_EMULATOR_HOST and demo project environment variables.
 *   3. Launch the Firestore Emulator via firebase-tools emulators:exec.
 *   4. Run Node.js --test on all files in tests/integration/*.test.js.
 *   5. Exit with the test process exit code.
 *
 * Requirements:
 *   - firebase-tools 15.5.1 installed (devDependency).
 *   - Firestore Emulator JAR (auto-downloaded to ~/.cache/firebase/emulators/).
 *   - Java 21+ in PATH. On this machine, the IntelliJ JBR (JDK 25) is used.
 *   - firebase.test.json and firestore.test.rules (permissive, NOT for production).
 */
import { spawnSync } from "child_process";
import { readdirSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// ── Java 21+ setup ──────────────────────────────────────────────────────────
// firebase-tools 15 requires Java 21+. The system default is Zulu 17.
// IntelliJ IDEA bundles JBR 25 — use it if available.
if (process.platform === "win32") {
  const jbrBin = "C:\\Program Files\\JetBrains\\IntelliJ IDEA 2025.3.1.1\\jbr\\bin";
  if (existsSync(jbrBin)) {
    process.env.PATH = `${jbrBin};${process.env.PATH}`;
    console.log("[run-integration-tests] Using IntelliJ JBR (Java 25) for Firebase Emulator.");
  } else {
    console.warn(
      "[run-integration-tests] WARNING: JBR not found. Ensure Java 21+ is in PATH for Firebase Emulator."
    );
  }
}

// ── Environment variables ────────────────────────────────────────────────────
// Use a demo project ID to prevent any real Firebase connection.
process.env.GCLOUD_PROJECT = "demo-vitor-test";
process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID = "demo-vitor-test";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8085";
process.env.CURSOR_SECRET = process.env.CURSOR_SECRET || "vitor_strong_cursor_secret_key_at_least_32_bytes_2026_test";

// ── Collect integration test files ───────────────────────────────────────────
const integrationDir = path.join(root, "tests", "integration");
const testFiles = readdirSync(integrationDir)
  .filter((f) => f.endsWith(".test.js"))
  .map((f) => path.join("tests", "integration", f));

if (testFiles.length === 0) {
  console.error("[run-integration-tests] No integration test files found.");
  process.exit(1);
}

console.log(`[run-integration-tests] Found ${testFiles.length} integration test file(s):`);
for (const f of testFiles) {
  console.log(`  - ${f}`);
}

// ── Build the test runner command ────────────────────────────────────────────
// node --test --test-concurrency=1 --test-force-exit <file1> <file2> ...
// --test-concurrency=1 ensures sequential execution within each file so
// each test can safely clear and re-seed Firestore collections.
// --test-force-exit forces the process to exit after all tests complete,
// since the Firebase SDK keeps HTTP/2 connections alive otherwise.
const testCmd = `node --test --test-concurrency=1 --test-force-exit ${testFiles.map((f) => `"${f}"`).join(" ")}`;

console.log(`\n[run-integration-tests] Launching Firestore Emulator on 127.0.0.1:8085...`);
console.log(`[run-integration-tests] Running: ${testCmd}\n`);

// ── Launch emulators:exec ────────────────────────────────────────────────────
const firebaseCli = path.join(root, "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
const result = spawnSync(
  process.execPath,
  [
    firebaseCli,
    "emulators:exec",
    "--config",
    "firebase.test.json",
    "--only",
    "firestore",
    "--project",
    "demo-vitor-test",
    testCmd,
  ],
  {
    stdio: "inherit",
    cwd: root,
    env: process.env,
  }
);

process.exit(result.status ?? 0);
