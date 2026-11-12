/**
 * Dedicated Security Test Runner for VITor.
 *
 * Workflow:
 *   1. Prepend compatible Java 21+ runtime (IntelliJ JBR) to PATH on Windows.
 *   2. Configure dedicated security emulator project and port (127.0.0.1:8087).
 *   3. Launch Firestore Emulator loaded with the production firestore.rules file via firebase.security.json.
 *   4. Run node --test on tests/security/firestore-rules.security.test.js.
 *   5. Propagate exit code.
 */
import { spawnSync } from "child_process";
import { existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// ── Java 21+ setup ──────────────────────────────────────────────────────────
if (process.platform === "win32") {
  const jbrBin = "C:\\Program Files\\JetBrains\\IntelliJ IDEA 2025.3.1.1\\jbr\\bin";
  if (existsSync(jbrBin)) {
    process.env.PATH = `${jbrBin};${process.env.PATH}`;
    console.log("[run-security-tests] Using IntelliJ JBR (Java 25) for Firebase Emulator.");
  } else {
    console.warn(
      "[run-security-tests] WARNING: JBR not found. Ensure Java 21+ is in PATH for Firebase Emulator."
    );
  }
}

// ── Dedicated Security Environment Variables ────────────────────────────────
process.env.GCLOUD_PROJECT = "demo-vitor-security";
process.env.FIRESTORE_EMULATOR_HOST = "127.0.0.1:8087";

const testFile = path.join("tests", "security", "firestore-rules.security.test.js");
const testCmd = `node --test --test-concurrency=1 --test-force-exit "${testFile}"`;

console.log(`[run-security-tests] Launching Firestore Emulator on 127.0.0.1:8087 using production firestore.rules...`);
console.log(`[run-security-tests] Running: ${testCmd}\n`);

const firebaseCli = path.join(root, "node_modules", "firebase-tools", "lib", "bin", "firebase.js");
const result = spawnSync(
  process.execPath,
  [
    firebaseCli,
    "emulators:exec",
    "--config",
    "firebase.security.json",
    "--only",
    "firestore",
    "--project",
    "demo-vitor-security",
    testCmd,
  ],
  {
    stdio: "inherit",
    cwd: root,
    env: process.env,
  }
);

process.exit(result.status ?? 0);
