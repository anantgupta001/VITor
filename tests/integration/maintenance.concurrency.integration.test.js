/**
 * Firestore Emulator Integration Tests for Maintenance Gate Concurrency.
 *
 * Verifies the 7 mandatory concurrency scenarios under live Firestore Admin SDK:
 * 1. A writer starting before CLOSING.
 * 2. A writer attempting to commit during the CLOSING transition (OCC contention).
 * 3. A new writer arriving after CLOSING.
 * 4. Multiple concurrent writers across independent client/process instances.
 * 5. CLOSED being requested while writers are still active (drain timeout prevents CLOSED).
 * 6. A failed transaction and proper writer cleanup.
 * 7. Reopening after successful maintenance.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { fork } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { adminDb, Timestamp } from "../../lib/firebase/admin.js";
import {
  checkMaintenanceGate,
  setMaintenanceGateState,
  getMaintenanceGateState,
  assertMaintenanceGateClosed,
  drainAndCloseMaintenanceGate,
  enterWriter,
  exitWriter,
  getActiveWriters,
  waitForWritersDrain,
  MAINTENANCE_STATES,
  MaintenanceError,
} from "../../lib/server/maintenance.js";
import { ReviewsTransactionCoordinator } from "../../lib/server/reviews-transaction.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TEST_CAMPUS = "vit-v";
const TEST_FACULTY_ID = "fac-maint-concurrency";

async function resetGate(status = MAINTENANCE_STATES.OPEN) {
  const gateRef = adminDb.collection("system").doc("reviewMaintenance");
  await gateRef.set({
    status,
    updatedAt: Timestamp.now(),
  });

  // Clean up any remaining active writer docs
  const activeSnap = await gateRef.collection("activeWriters").get();
  if (!activeSnap.empty) {
    await Promise.all(activeSnap.docs.map((d) => d.ref.delete()));
  }
}

async function ensureFacultyExists(facultyId = TEST_FACULTY_ID) {
  const facultyRef = adminDb
    .collection("campuses")
    .doc(TEST_CAMPUS)
    .collection("faculties")
    .doc(facultyId);

  await facultyRef.set({
    name: "Dr. Concurrency Verification",
    designation: "Professor",
    department: "Computer Science",
    avgRating: 4.0,
    reviewCount: 0,
    updatedAt: Timestamp.now(),
  });
}

test.before(async () => {
  await ensureFacultyExists();
  await resetGate(MAINTENANCE_STATES.OPEN);
});

test.afterEach(async () => {
  await resetGate(MAINTENANCE_STATES.OPEN);
});

// ============================================================================
// Scenario 1: A writer starting before CLOSING
// ============================================================================
test("Scenario 1: Writer starting and completing while gate is OPEN commits successfully", async () => {
  await resetGate(MAINTENANCE_STATES.OPEN);

  const userId = `student-s1-${Date.now()}`;
  const result = await ReviewsTransactionCoordinator.submitOrUpdateReview({
    campusSlug: TEST_CAMPUS,
    facultyId: TEST_FACULTY_ID,
    userId,
    ratings: { attendance: 5, correction: 5, teaching: 5, approachability: 5 },
    comment: "Excellent professor, very clear lectures.",
  });

  assert.equal(result.success, true);
  assert.equal(result.version, 1);

  // Verify review exists in Firestore
  const reviewSnap = await adminDb
    .collection("campuses")
    .doc(TEST_CAMPUS)
    .collection("faculties")
    .doc(TEST_FACULTY_ID)
    .collection("reviews")
    .doc(userId)
    .get();

  assert.ok(reviewSnap.exists, "Review document must be committed to Firestore");

  // Verify active writers collection is completely drained
  const activeWriters = await getActiveWriters(adminDb);
  assert.equal(activeWriters.length, 0, "Active writers must be drained after completion");
});

// ============================================================================
// Scenario 2: A writer attempting to commit during the CLOSING transition
// ============================================================================
test("Scenario 2: Writer registered before CLOSING is aborted when attempting to commit after gate transitions to CLOSING", async () => {
  await resetGate(MAINTENANCE_STATES.OPEN);

  const userId = `student-s2-${Date.now()}`;
  const reviewRef = adminDb
    .collection("campuses")
    .doc(TEST_CAMPUS)
    .collection("faculties")
    .doc(TEST_FACULTY_ID)
    .collection("reviews")
    .doc(userId);

  // 1. Writer enters while gate is OPEN and registers in activeWriters
  const writerId = await enterWriter(adminDb);
  assert.ok(writerId, "Writer must register successfully while OPEN");

  // Verify writer is registered in Firestore
  let active = await getActiveWriters(adminDb);
  assert.equal(active.length, 1, "Writer must be tracked in activeWriters");

  // 2. Coordinator transitions gate to CLOSING
  await setMaintenanceGateState(adminDb, MAINTENANCE_STATES.CLOSING);

  // 3. Writer attempts to execute its mutation transaction during the CLOSING transition
  await assert.rejects(
    async () => {
      try {
        await adminDb.runTransaction(async (transaction) => {
          const gateRef = adminDb.collection("system").doc("reviewMaintenance");
          const gateSnap = await transaction.get(gateRef);

          // Gate check throws 503 MaintenanceError because status is now CLOSING
          checkMaintenanceGate(gateSnap);

          // Write should never be reached
          transaction.set(reviewRef, {
            userId,
            comment: "This review must never be committed",
            status: "ACTIVE",
          });
        });
      } finally {
        await exitWriter(adminDb, writerId);
      }
    },
    (err) => {
      assert.ok(err instanceof MaintenanceError, "Must throw MaintenanceError");
      assert.equal(err.statusCode, 503);
      assert.equal(err.code, "SERVICE_MAINTENANCE");
      assert.equal(err.state, MAINTENANCE_STATES.CLOSING);
      return true;
    }
  );

  // 4. Verify review was NEVER committed to Firestore
  const reviewSnap = await reviewRef.get();
  assert.ok(!reviewSnap.exists, "Review must NOT be committed to Firestore");

  // 5. Verify writer was cleanly drained from activeWriters
  active = await getActiveWriters(adminDb);
  assert.equal(active.length, 0, "Writer must be cleanly drained from activeWriters");
});

// ============================================================================
// Scenario 3: A new writer arriving after CLOSING
// ============================================================================
test("Scenario 3: A new writer arriving after CLOSING is immediately rejected with 503", async () => {
  await resetGate(MAINTENANCE_STATES.CLOSING);

  const userId = `student-s3-${Date.now()}`;

  await assert.rejects(
    () =>
      ReviewsTransactionCoordinator.submitOrUpdateReview({
        campusSlug: TEST_CAMPUS,
        facultyId: TEST_FACULTY_ID,
        userId,
        ratings: { attendance: 5, correction: 5, teaching: 5, approachability: 5 },
        comment: "This submission should be rejected immediately.",
      }),
    (err) => {
      assert.ok(err instanceof MaintenanceError, "Error must be MaintenanceError");
      assert.equal(err.statusCode, 503);
      assert.equal(err.code, "SERVICE_MAINTENANCE");
      assert.equal(err.state, MAINTENANCE_STATES.CLOSING);
      return true;
    }
  );

  // Verify no review written and no active writer document left
  const active = await getActiveWriters(adminDb);
  assert.equal(active.length, 0, "No active writer should be registered");
});

// ============================================================================
// Scenario 4: Multiple concurrent writers across independent client/process instances
// ============================================================================
test("Scenario 4: Concurrent writers across independent processes are tracked in Firestore activeWriters", async () => {
  await resetGate(MAINTENANCE_STATES.OPEN);

  const workerScript = path.join(__dirname, "helpers", "maintenance-child-worker.js");

  // 1. Spawn a genuinely separate Node.js OS child process
  const child = fork(workerScript, [], {
    env: { ...process.env },
    stdio: ["ignore", "inherit", "inherit", "ipc"],
  });

  const cleanupChild = () => {
    if (!child.killed) {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    }
  };

  try {
    // 2. Wait for child process to be READY
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for child process READY")), 5000);
      child.once("message", (msg) => {
        clearTimeout(timeout);
        if (msg?.status === "READY") resolve();
        else reject(new Error(`Unexpected message from child: ${JSON.stringify(msg)}`));
      });
    });

    // 3. Command child to ENTER writer registry
    const childEnteredPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for child ENTERED")), 5000);
      child.once("message", (msg) => {
        clearTimeout(timeout);
        if (msg?.status === "ENTERED") resolve(msg);
        else reject(new Error(`Failed to enter in child: ${JSON.stringify(msg)}`));
      });
    });
    child.send({ action: "ENTER" });
    const childWriterData = await childEnteredPromise;

    assert.ok(childWriterData.writerId, "Child must receive a writerId");
    assert.notEqual(childWriterData.pid, process.pid, "Child PID must be distinct from parent process PID");

    // 4. Enter writer in parent process concurrently
    const parentWriterId = await enterWriter(adminDb, { forceDistributed: true });
    assert.ok(parentWriterId, "Parent must receive a writerId");

    // 5. Verify both writers from independent processes are registered in Firestore
    let active = await getActiveWriters(adminDb);
    assert.equal(active.length, 2, "Both concurrent writers across processes must be registered in Firestore");

    const pids = active.map((w) => w.pid);
    assert.ok(pids.includes(childWriterData.pid), "Firestore must contain child process PID");
    assert.ok(pids.includes(process.pid), "Firestore must contain parent process PID");

    // 6. Coordinator in parent process begins drainAndCloseMaintenanceGate
    let drainComplete = false;
    const drainPromise = drainAndCloseMaintenanceGate(adminDb, { timeoutMs: 8000, pollIntervalMs: 50 }).then(() => {
      drainComplete = true;
    });

    // Short wait to ensure coordinator transitioned gate to CLOSING and is polling
    await new Promise((r) => setTimeout(r, 150));
    assert.equal(drainComplete, false, "Drain must wait while child and parent writers are active");

    const gateWhileDraining = await getMaintenanceGateState(adminDb);
    assert.equal(gateWhileDraining.status, MAINTENANCE_STATES.CLOSING, "Gate must be in CLOSING state during drain");

    // 7. Parent exits its writer
    await exitWriter(adminDb, parentWriterId);
    active = await getActiveWriters(adminDb);
    assert.equal(active.length, 1, "Child process writer must still be registered in Firestore");
    assert.equal(drainComplete, false, "Drain must still not be complete because child is active");

    // 8. Command child to EXIT
    const childExitedPromise = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timeout waiting for child EXITED")), 5000);
      child.once("message", (msg) => {
        clearTimeout(timeout);
        if (msg?.status === "EXITED") resolve(msg);
        else reject(new Error(`Failed to exit in child: ${JSON.stringify(msg)}`));
      });
    });
    child.send({ action: "EXIT" });
    await childExitedPromise;

    // 9. Coordinator drain completes now that all writers across all processes have exited
    await drainPromise;
    assert.equal(drainComplete, true, "Coordinator in parent process successfully drained child process writer");

    // 10. Gate is now strictly CLOSED and activeWriters is 0
    const finalGate = await getMaintenanceGateState(adminDb);
    assert.equal(finalGate.status, MAINTENANCE_STATES.CLOSED, "Gate must reach CLOSED after all processes drain");

    active = await getActiveWriters(adminDb);
    assert.equal(active.length, 0, "activeWriters subcollection must be completely empty");
  } finally {
    cleanupChild();
  }
});

// ============================================================================
// Scenario 5: CLOSED being requested while writers are still active
// ============================================================================
test("Scenario 5: CLOSED cannot be reached while a protected writer remains active (drain timeout)", async () => {
  await resetGate(MAINTENANCE_STATES.OPEN);

  // Writer enters and stays in-flight
  const writerId = await enterWriter(adminDb);

  // Coordinator attempts to drain and close with a short 200ms timeout
  await assert.rejects(
    () => drainAndCloseMaintenanceGate(adminDb, { timeoutMs: 200, pollIntervalMs: 50 }),
    /Timeout after 200ms waiting for in-flight writers to drain/
  );

  // CRITICAL: Gate state in Firestore MUST NOT be CLOSED! It must remain in CLOSING.
  const currentGate = await getMaintenanceGateState(adminDb);
  assert.equal(currentGate.status, MAINTENANCE_STATES.CLOSING, "Gate must remain in CLOSING after drain timeout");
  assert.notEqual(currentGate.status, MAINTENANCE_STATES.CLOSED, "Gate must NOT transition to CLOSED while writer is active");

  // Reconciliation/migration assert must fail
  await assert.rejects(
    () => assertMaintenanceGateClosed(adminDb),
    /Gate must be strictly CLOSED before proceeding/
  );

  // Now writer finishes and exits
  await exitWriter(adminDb, writerId);

  // Coordinator re-attempts drain and close -> now succeeds
  const closedGate = await drainAndCloseMaintenanceGate(adminDb, { timeoutMs: 1000, pollIntervalMs: 50 });
  assert.equal(closedGate.status, MAINTENANCE_STATES.CLOSED);

  // Gate is now provably CLOSED
  const finalGate = await assertMaintenanceGateClosed(adminDb);
  assert.equal(finalGate.status, MAINTENANCE_STATES.CLOSED);
});

// ============================================================================
// Scenario 6: A failed transaction and proper writer cleanup
// ============================================================================
test("Scenario 6: Failed transaction cleans up active writer registration properly", async () => {
  await resetGate(MAINTENANCE_STATES.OPEN);

  const writerId = await enterWriter(adminDb);

  // Simulate unexpected transaction failure inside try/finally
  try {
    await adminDb.runTransaction(async () => {
      throw new Error("Simulated unexpected database failure inside transaction");
    });
  } catch (err) {
    assert.equal(err.message, "Simulated unexpected database failure inside transaction");
  } finally {
    await exitWriter(adminDb, writerId);
  }

  // Active writer document MUST be cleaned up from Firestore
  const active = await getActiveWriters(adminDb);
  assert.equal(active.length, 0, "Active writer must be cleaned up even if transaction failed");
});

// ============================================================================
// Scenario 7: Reopening after successful maintenance
// ============================================================================
test("Scenario 7: Reopening gate to OPEN restores normal write mutations", async () => {
  // 1. Gate is CLOSED
  await resetGate(MAINTENANCE_STATES.CLOSED);

  const userId = `student-s7-${Date.now()}`;

  // Writes are rejected
  await assert.rejects(
    () =>
      ReviewsTransactionCoordinator.submitOrUpdateReview({
        campusSlug: TEST_CAMPUS,
        facultyId: TEST_FACULTY_ID,
        userId,
        ratings: { attendance: 4, correction: 4, teaching: 4, approachability: 4 },
        comment: "This write should fail while CLOSED.",
      }),
    /Review operations are currently paused for maintenance/
  );

  // 2. Maintenance finishes, Coordinator reopens gate
  await setMaintenanceGateState(adminDb, MAINTENANCE_STATES.OPEN);
  const gateState = await getMaintenanceGateState(adminDb);
  assert.equal(gateState.status, MAINTENANCE_STATES.OPEN);

  // 3. New writes now succeed
  const result = await ReviewsTransactionCoordinator.submitOrUpdateReview({
    campusSlug: TEST_CAMPUS,
    facultyId: TEST_FACULTY_ID,
    userId,
    ratings: { attendance: 5, correction: 4, teaching: 5, approachability: 4 },
    comment: "This write must succeed after gate is reopened.",
  });

  assert.equal(result.success, true);

  const reviewSnap = await adminDb
    .collection("campuses")
    .doc(TEST_CAMPUS)
    .collection("faculties")
    .doc(TEST_FACULTY_ID)
    .collection("reviews")
    .doc(userId)
    .get();

  assert.ok(reviewSnap.exists, "Review must be committed after gate reopened");
});

// ============================================================================
// Scenario 8: Heartbeat vs Expired-Lease Cleanup Race Safety
// ============================================================================
test("Scenario 8: Atomic cleanup never deletes a lease that was renewed by a heartbeat", async () => {
  await resetGate(MAINTENANCE_STATES.OPEN);

  const gateRef = adminDb.collection("system").doc("reviewMaintenance");
  const writerId = `w_heartbeat_race_${Date.now()}`;
  const writerRef = gateRef.collection("activeWriters").doc(writerId);

  // 1. Seed a writer document that initially appears expired (past timestamp)
  const pastExpiry = Timestamp.fromMillis(Date.now() - 500);
  await writerRef.set({
    writerId,
    status: "ACTIVE",
    startedAt: Timestamp.now(),
    expiresAt: pastExpiry,
    pid: process.pid,
  });

  // 2. Simulate heartbeat renewing the lease right as cleanup begins
  const futureExpiry = Timestamp.fromMillis(Date.now() + 25000);
  await writerRef.update({
    expiresAt: futureExpiry,
    lastHeartbeatAt: Timestamp.now(),
  });

  // 3. Coordinator runs getActiveWriters()
  const active = await getActiveWriters(adminDb);

  // 4. Assert: The renewed document MUST NOT be deleted!
  const writerInActive = active.find((w) => w.writerId === writerId || w.id === writerId);
  assert.ok(writerInActive, "Renewed writer must be recognized as active");

  const docSnap = await writerRef.get();
  assert.ok(docSnap.exists, "Renewed writer document must NOT be deleted by stale cleanup");

  // 5. Test the converse: Truly expired writer (no renewal) IS cleaned up
  const deadWriterId = `w_dead_${Date.now()}`;
  const deadWriterRef = gateRef.collection("activeWriters").doc(deadWriterId);
  await deadWriterRef.set({
    writerId: deadWriterId,
    status: "ACTIVE",
    startedAt: Timestamp.now(),
    expiresAt: Timestamp.fromMillis(Date.now() - 1000),
    pid: 999999,
  });

  await getActiveWriters(adminDb);
  const deadSnap = await deadWriterRef.get();
  assert.ok(!deadSnap.exists, "Un-renewed expired writer document must be safely pruned");

  // Cleanup active test writer
  await exitWriter(adminDb, writerId);
});

// ============================================================================
// Scenario 9: CLOSED Gate Guarantee Under Active Transaction
// ============================================================================
test("Scenario 9: Coordinator cannot reach CLOSED while an in-flight writer can still commit", async () => {
  await resetGate(MAINTENANCE_STATES.OPEN);

  const userId = `student-s9-${Date.now()}`;
  const reviewRef = adminDb
    .collection("campuses")
    .doc(TEST_CAMPUS)
    .collection("faculties")
    .doc(TEST_FACULTY_ID)
    .collection("reviews")
    .doc(userId);

  // 1. Writer registers while gate is OPEN
  const writerId = await enterWriter(adminDb);

  let writerReadOpenResolve;
  const writerReadOpenPromise = new Promise((resolve) => {
    writerReadOpenResolve = resolve;
  });

  let resumeWriterResolve;
  const resumeWriterPromise = new Promise((resolve) => {
    resumeWriterResolve = resolve;
  });

  let writerFinished = false;

  // 2. Writer starts transaction, reads OPEN, and pauses before commit
  const writerTransactionPromise = (async () => {
    try {
      await adminDb.runTransaction(async (transaction) => {
        const gateRef = adminDb.collection("system").doc("reviewMaintenance");
        const gateSnap = await transaction.get(gateRef);

        // Check maintenance gate: strictly OPEN
        checkMaintenanceGate(gateSnap);

        // 3. Signal that writer read OPEN and is now paused before commit
        writerReadOpenResolve();

        // Pause writer until coordinator attempts to close the gate
        await resumeWriterPromise;

        // Attempt write after resume
        transaction.set(reviewRef, {
          userId,
          comment: "Review commit attempt after resume",
          status: "ACTIVE",
        });
      });
    } catch {
      // Transaction may conflict or be aborted if coordinator set CLOSING first
    } finally {
      writerFinished = true;
      // 7. Writer registration cleanup
      await exitWriter(adminDb, writerId);
    }
  })();

  // Wait for writer to reach paused state inside transaction with gate OPEN
  await writerReadOpenPromise;

  // 4. Coordinator attempts to close the gate
  let coordinatorClosed = false;
  const drainPromise = drainAndCloseMaintenanceGate(adminDb, {
    timeoutMs: 5000,
    pollIntervalMs: 50,
  }).then(() => {
    coordinatorClosed = true;
  });

  // 5. Verify the coordinator CANNOT reach CLOSED while that writer remains capable of committing
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(coordinatorClosed, false, "Coordinator must NOT reach CLOSED while writer is in flight");

  // 6. Allow the writer to finish or abort
  resumeWriterResolve();
  await writerTransactionPromise;
  assert.equal(writerFinished, true, "Writer has completed execution");

  // 7. Verify writer registration is cleaned up
  const activeWriters = await getActiveWriters(adminDb);
  assert.equal(activeWriters.length, 0, "Writer registration must be cleaned up in finally block");

  // 8. Coordinator can now reach CLOSED
  await drainPromise;
  assert.equal(coordinatorClosed, true, "Coordinator must successfully reach CLOSED now");

  const finalGate = await getMaintenanceGateState(adminDb);
  assert.equal(finalGate.status, MAINTENANCE_STATES.CLOSED, "Gate state must be strictly CLOSED");
});
