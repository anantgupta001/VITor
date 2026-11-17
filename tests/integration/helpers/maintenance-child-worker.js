/**
 * Dedicated Child Process Worker for Maintenance Concurrency Integration Tests.
 *
 * Runs as a completely independent OS process to prove cross-process
 * coordination via Firestore activeWriters subcollection.
 */
import { adminDb } from "../../../lib/firebase/admin.js";
import { enterWriter, exitWriter } from "../../../lib/server/maintenance.js";

let currentWriterId = null;

process.on("message", async (msg) => {
  if (msg?.action === "ENTER") {
    try {
      currentWriterId = await enterWriter(adminDb, { forceDistributed: true });
      process.send({
        status: "ENTERED",
        writerId: currentWriterId,
        pid: process.pid,
      });
    } catch (err) {
      process.send({ status: "ERROR", error: err.message, code: err.code });
    }
  } else if (msg?.action === "EXIT") {
    try {
      if (currentWriterId) {
        await exitWriter(adminDb, currentWriterId);
      }
      process.send({
        status: "EXITED",
        writerId: currentWriterId,
        pid: process.pid,
      });
      setTimeout(() => process.exit(0), 50);
    } catch (err) {
      process.send({ status: "ERROR", error: err.message });
      process.exit(1);
    }
  }
});

// Notify parent process that child process is initialized and ready
if (typeof process.send === "function") {
  process.send({ status: "READY", pid: process.pid });
}
