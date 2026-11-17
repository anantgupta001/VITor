/**
 * Firestore-Native Maintenance Gate Protocol for VITor.
 *
 * Implements:
 * - Maintenance gate document: `system/reviewMaintenance`.
 * - State machine: OPEN -> CLOSING -> CLOSED -> OPEN.
 * - Enforces zero-race transactional coordination for all review-writing operations.
 * - Provides rejection of new writes when status is not OPEN.
 */

import { Timestamp } from "../firebase/admin.js";

export const MAINTENANCE_STATES = {
  OPEN: "OPEN",
  CLOSING: "CLOSING",
  CLOSED: "CLOSED",
};

export class MaintenanceError extends Error {
  constructor(message = "Review mutations are currently paused for maintenance.", state = "CLOSED") {
    super(message);
    this.name = "MaintenanceError";
    this.statusCode = 503;
    this.code = "SERVICE_MAINTENANCE";
    this.state = state;
  }
}

/**
 * Validates the maintenance gate inside a transaction read.
 * Throws MaintenanceError if the gate is not strictly OPEN.
 */
export function checkMaintenanceGate(gateSnap) {
  if (!gateSnap || !gateSnap.exists) {
    // If maintenance document does not exist, gate is considered OPEN by default.
    return { status: MAINTENANCE_STATES.OPEN };
  }

  const data = gateSnap.data();
  const status = data?.status || MAINTENANCE_STATES.OPEN;

  if (status !== MAINTENANCE_STATES.OPEN) {
    throw new MaintenanceError(
      `Review operations are currently paused for maintenance (status: ${status}).`,
      status
    );
  }

  return { status };
}

/**
 * Transitions the maintenance gate state.
 */
export async function setMaintenanceGateState(adminDb, nextState, metadata = {}) {
  if (!Object.values(MAINTENANCE_STATES).includes(nextState)) {
    throw new Error(`Invalid maintenance state: '${nextState}'`);
  }

  const gateRef = adminDb.collection("system").doc("reviewMaintenance");
  const payload = {
    status: nextState,
    updatedAt: Timestamp.now(),
    ...metadata,
  };

  await gateRef.set(payload, { merge: true });
  return payload;
}

/**
 * Reads the current maintenance gate state from Firestore.
 */
export async function getMaintenanceGateState(adminDb) {
  const gateRef = adminDb.collection("system").doc("reviewMaintenance");
  const snap = await gateRef.get();
  if (!snap.exists) {
    return { status: MAINTENANCE_STATES.OPEN };
  }
  return { status: snap.data()?.status || MAINTENANCE_STATES.OPEN, ...snap.data() };
}

/**
 * Asserts that the maintenance gate is strictly CLOSED.
 * Throws MaintenanceError unless the gate is CLOSED.
 */
export async function assertMaintenanceGateClosed(adminDb) {
  const gate = await getMaintenanceGateState(adminDb);
  if (gate.status !== MAINTENANCE_STATES.CLOSED) {
    throw new MaintenanceError(
      `Operation aborted: Maintenance gate is in '${gate.status}' state. Gate must be strictly CLOSED before proceeding.`,
      gate.status
    );
  }
  return gate;
}

let inFlightWritersCount = 0;
const drainWaiters = new Set();
const activeHeartbeats = new Map();

/**
 * Tracks an active writer entering the protected mutation pipeline.
 * - In-process: increments `inFlightWritersCount`.
 * - Distributed (when adminDb provided): registers active writer in Firestore
 *   subcollection `system/reviewMaintenance/activeWriters/{writerId}` inside a transaction
 *   that strictly asserts gate is OPEN.
 * - Heartbeat: continuously renews `expiresAt` every (leaseMs / 3) until exitWriter is called.
 *
 * If gate is CLOSING or CLOSED, throws MaintenanceError immediately without registering.
 */
export function enterWriter(adminDb, { leaseMs = 30000, forceDistributed = false } = {}) {
  inFlightWritersCount++;

  const isDistributed = Boolean(
    adminDb &&
    (process.env.FIRESTORE_EMULATOR_HOST ||
     process.env.NODE_ENV === "production" ||
     process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
     process.env.FIREBASE_CLIENT_EMAIL ||
     forceDistributed)
  );

  if (!isDistributed) {
    const localId = `local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    return localId;
  }

  return (async () => {
    const gateRef = adminDb.collection("system").doc("reviewMaintenance");
    const writerId = `w_${Date.now()}_${Math.random().toString(36).slice(2, 9)}_${process.pid}`;
    const writerRef = gateRef.collection("activeWriters").doc(writerId);

    try {
      const gateSnap = await gateRef.get();
      checkMaintenanceGate(gateSnap); // Throws MaintenanceError if not OPEN

      const now = Timestamp.now();
      const expiresAt = Timestamp.fromMillis(Date.now() + leaseMs);

      await writerRef.set({
        writerId,
        status: "ACTIVE",
        startedAt: now,
        expiresAt,
        pid: process.pid,
      });

      // Heartbeat lease renewal: advance expiresAt while the writer is active
      const heartbeatIntervalMs = Math.min(10000, Math.max(1000, Math.floor(leaseMs / 3)));
      const timer = setInterval(async () => {
        try {
          if (typeof writerRef.update === "function") {
            await writerRef.update({
              expiresAt: Timestamp.fromMillis(Date.now() + leaseMs),
              lastHeartbeatAt: Timestamp.now(),
            });
          }
        } catch {
          // Document was cleaned up on exit or connection closed; suppress
        }
      }, heartbeatIntervalMs);

      if (typeof timer.unref === "function") {
        timer.unref();
      }
      activeHeartbeats.set(writerId, timer);

      return writerId;
    } catch (err) {
      inFlightWritersCount = Math.max(0, inFlightWritersCount - 1);
      throw err;
    }
  })();
}

/**
 * Tracks an active writer exiting the protected mutation pipeline.
 * - Clears heartbeat renewal timer.
 * - In-process: decrements `inFlightWritersCount` and notifies any drain waiters.
 * - Distributed (when adminDb provided): removes active writer document from Firestore.
 */
export function exitWriter(adminDb, writerId) {
  inFlightWritersCount = Math.max(0, inFlightWritersCount - 1);
  if (inFlightWritersCount === 0) {
    for (const resolve of drainWaiters) {
      resolve();
    }
    drainWaiters.clear();
  }

  if (writerId && activeHeartbeats.has(writerId)) {
    clearInterval(activeHeartbeats.get(writerId));
    activeHeartbeats.delete(writerId);
  }

  if (!adminDb || !writerId || (typeof writerId === "string" && writerId.startsWith("local_"))) {
    return Promise.resolve();
  }

  return (async () => {
    try {
      const writerRef = adminDb
        .collection("system")
        .doc("reviewMaintenance")
        .collection("activeWriters")
        .doc(writerId);
      await writerRef.delete();
    } catch (err) {
      console.warn(`[Maintenance] Failed to remove active writer ${writerId}:`, err.message);
    }
  })();
}

/**
 * Returns the current number of active in-flight writers (in-process).
 */
export function getInFlightWritersCount() {
  return inFlightWritersCount;
}

/**
 * Queries active in-flight writers from Firestore.
 * Automatically cleans up expired leases left behind by crashed processes using
 * an atomic transactional check to prevent races against active heartbeat renewals.
 */
export async function getActiveWriters(adminDb) {
  if (!adminDb) {
    return [];
  }

  const gateRef = adminDb.collection("system").doc("reviewMaintenance");
  if (typeof gateRef?.collection !== "function") {
    return [];
  }
  const snap = await gateRef.collection("activeWriters").get();
  const now = Date.now();
  const active = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const expiresAtMillis = data.expiresAt?.toMillis?.() || 0;

    if (expiresAtMillis > 0 && expiresAtMillis < now) {
      // Potentially expired. Perform atomic transactional verification and cleanup.
      // A heartbeat may have renewed expiresAt between snap.docs and now.
      let wasDeleted = false;
      let renewedData = null;

      try {
        await adminDb.runTransaction(async (t) => {
          const freshSnap = await t.get(doc.ref);
          if (!freshSnap.exists) {
            wasDeleted = true;
            return;
          }
          const freshData = freshSnap.data();
          const freshExpiry = freshData?.expiresAt?.toMillis?.() || 0;
          if (freshExpiry >= Date.now()) {
            // Heartbeat renewed the lease! Never delete a renewed active lease.
            renewedData = { id: doc.id, ...freshData };
            return;
          }
          t.delete(doc.ref);
          wasDeleted = true;
        });
      } catch (err) {
        // Cleanup failure must NOT be silently treated as successful cleanup.
        // Treat writer as active to avoid premature gate closure.
        console.warn(`[Maintenance] Failed atomic cleanup for writer ${doc.id}:`, err.message);
        active.push({ id: doc.id, ...data });
        continue;
      }

      if (renewedData) {
        active.push(renewedData);
      } else if (!wasDeleted) {
        active.push({ id: doc.id, ...data });
      }
    } else {
      active.push({ id: doc.id, ...data });
    }
  }

  return active;
}

/**
 * Test helper to reset in-flight writer state between tests.
 */
export function resetInFlightWritersCountForTesting() {
  inFlightWritersCount = 0;
  drainWaiters.clear();
  for (const timer of activeHeartbeats.values()) {
    clearInterval(timer);
  }
  activeHeartbeats.clear();
}

/**
 * Provably awaits until all in-flight writers have completed or aborted.
 * When adminDb is provided, coordinates across all distributed instances via Firestore.
 * Also checks local in-process writers.
 * Does NOT rely on a fixed sleep or grace period.
 */
export async function waitForWritersDrain(options = {}) {
  let adminDb = null;
  let timeoutMs = 15000;
  let pollIntervalMs = 50;

  if (options && typeof options.collection === "function") {
    adminDb = options;
  } else if (options && typeof options === "object") {
    adminDb = options.adminDb || null;
    if (options.timeoutMs !== undefined) timeoutMs = options.timeoutMs;
    if (options.pollIntervalMs !== undefined) pollIntervalMs = options.pollIntervalMs;
  }

  const startTime = Date.now();

  // Distributed coordination across multiple instances via Firestore
  if (adminDb) {
    while (Date.now() - startTime < timeoutMs) {
      const active = await getActiveWriters(adminDb);
      if (active.length === 0 && inFlightWritersCount === 0) {
        return true;
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }

    const remaining = await getActiveWriters(adminDb);
    if (remaining.length === 0 && inFlightWritersCount === 0) {
      return true;
    }

    throw new Error(
      `Timeout after ${timeoutMs}ms waiting for in-flight writers to drain. Distributed remaining: ${remaining.length}, local remaining: ${inFlightWritersCount}.`
    );
  }

  // Local fallback (in-process)
  if (inFlightWritersCount === 0) {
    return true;
  }

  return new Promise((resolve, reject) => {
    let timer;
    const onDrain = () => {
      clearTimeout(timer);
      resolve(true);
    };
    timer = setTimeout(() => {
      drainWaiters.delete(onDrain);
      reject(new Error(`Timeout waiting for ${inFlightWritersCount} in-flight writers to drain.`));
    }, timeoutMs);

    drainWaiters.add(onDrain);
  });
}

/**
 * Safely drains writers across all instances and transitions the gate to CLOSED:
 * 1. Sets gate state to CLOSING in Firestore (rejects all new writers, causes in-flight writers to conflict or terminate on retry).
 * 2. Provably awaits until all in-flight writers across all instances have drained (activeWriters count === 0).
 * 3. Sets gate state to CLOSED.
 *
 * If writers fail to drain within timeoutMs, throws an Error and the gate remains in CLOSING (never reaches CLOSED).
 */
export async function drainAndCloseMaintenanceGate(
  adminDb,
  { timeoutMs = 15000, pollIntervalMs = 50, metadata = {} } = {}
) {
  // Step 1: Set to CLOSING
  await setMaintenanceGateState(adminDb, MAINTENANCE_STATES.CLOSING, {
    initiatedAt: Timestamp.now(),
    ...metadata,
  });

  // Step 2: Provably wait for all in-flight writers across all instances to drain
  await waitForWritersDrain({ adminDb, timeoutMs, pollIntervalMs });

  // Step 3: Transition to CLOSED
  const gateRef = adminDb.collection("system").doc("reviewMaintenance");
  const closedPayload = {
    status: MAINTENANCE_STATES.CLOSED,
    closedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    ...metadata,
  };

  await gateRef.set(closedPayload, { merge: true });
  return closedPayload;
}
