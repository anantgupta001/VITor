import test from "node:test";
import assert from "node:assert/strict";
import {
  checkMaintenanceGate,
  setMaintenanceGateState,
  getMaintenanceGateState,
  assertMaintenanceGateClosed,
  drainAndCloseMaintenanceGate,
  enterWriter,
  exitWriter,
  getInFlightWritersCount,
  waitForWritersDrain,
  resetInFlightWritersCountForTesting,
  MAINTENANCE_STATES,
  MaintenanceError,
} from "../lib/server/maintenance.js";
import { adminDb } from "../lib/firebase/admin.js";

test("Maintenance Gate - allows operations when gate is OPEN or missing", () => {
  // Non-existent gate doc -> treated as OPEN
  const missingSnap = { exists: false };
  assert.equal(checkMaintenanceGate(missingSnap).status, MAINTENANCE_STATES.OPEN);

  // Explicit OPEN doc
  const openSnap = {
    exists: true,
    data: () => ({ status: MAINTENANCE_STATES.OPEN }),
  };
  assert.equal(checkMaintenanceGate(openSnap).status, MAINTENANCE_STATES.OPEN);
});

test("Maintenance Gate - rejects operations when gate is CLOSING with 503 MaintenanceError", () => {
  const closingSnap = {
    exists: true,
    data: () => ({ status: MAINTENANCE_STATES.CLOSING }),
  };

  assert.throws(
    () => checkMaintenanceGate(closingSnap),
    (err) => {
      assert.ok(err instanceof MaintenanceError);
      assert.equal(err.statusCode, 503);
      assert.equal(err.code, "SERVICE_MAINTENANCE");
      assert.equal(err.state, MAINTENANCE_STATES.CLOSING);
      return true;
    }
  );
});

test("Maintenance Gate - rejects operations when gate is CLOSED with 503 MaintenanceError", () => {
  const closedSnap = {
    exists: true,
    data: () => ({ status: MAINTENANCE_STATES.CLOSED }),
  };

  assert.throws(
    () => checkMaintenanceGate(closedSnap),
    (err) => {
      assert.ok(err instanceof MaintenanceError);
      assert.equal(err.statusCode, 503);
      assert.equal(err.code, "SERVICE_MAINTENANCE");
      assert.equal(err.state, MAINTENANCE_STATES.CLOSED);
      return true;
    }
  );
});

test("Maintenance Gate - assertMaintenanceGateClosed succeeds only on CLOSED", async (t) => {
  let mockStatus = MAINTENANCE_STATES.OPEN;
  t.mock.method(adminDb, "collection", (col) => {
    assert.equal(col, "system");
    return {
      doc: (id) => ({
        get: async () => ({
          exists: true,
          data: () => ({ status: mockStatus }),
        }),
      }),
    };
  });

  // Fails when OPEN
  await assert.rejects(
    () => assertMaintenanceGateClosed(adminDb),
    /Gate must be strictly CLOSED/
  );

  // Fails when CLOSING
  mockStatus = MAINTENANCE_STATES.CLOSING;
  await assert.rejects(
    () => assertMaintenanceGateClosed(adminDb),
    /Gate must be strictly CLOSED/
  );

  // Succeeds when CLOSED
  mockStatus = MAINTENANCE_STATES.CLOSED;
  const gate = await assertMaintenanceGateClosed(adminDb);
  assert.equal(gate.status, MAINTENANCE_STATES.CLOSED);
});

test("Maintenance Gate - simulated concurrent writers during state transitions (OPEN -> CLOSING -> CLOSED)", async (t) => {
  let currentGateState = MAINTENANCE_STATES.OPEN;
  const gateDocRef = {
    set: async (payload) => {
      currentGateState = payload.status;
    },
    get: async () => ({
      exists: true,
      data: () => ({ status: currentGateState }),
    }),
  };

  t.mock.method(adminDb, "collection", () => ({
    doc: () => gateDocRef,
  }));

  // Writer 1 begins while gate is OPEN
  const writer1ReadGate = checkMaintenanceGate(await gateDocRef.get());
  assert.equal(writer1ReadGate.status, MAINTENANCE_STATES.OPEN);

  // Coordinator transitions gate to CLOSING to drain writes
  await setMaintenanceGateState(adminDb, MAINTENANCE_STATES.CLOSING);
  assert.equal(currentGateState, MAINTENANCE_STATES.CLOSING);

  // Writer 2 attempts to start write while gate is CLOSING -> immediately rejected
  const writer2Snap = await gateDocRef.get();
  assert.throws(
    () => checkMaintenanceGate(writer2Snap),
    (err) => {
      assert.ok(err instanceof MaintenanceError);
      assert.equal(err.state, MAINTENANCE_STATES.CLOSING);
      return true;
    }
  );

  // Drain writers and close gate
  await drainAndCloseMaintenanceGate(adminDb, { drainGracePeriodMs: 10 });
  assert.equal(currentGateState, MAINTENANCE_STATES.CLOSED);

  // Writer 3 attempts to start write while gate is CLOSED -> rejected
  const writer3Snap = await gateDocRef.get();
  assert.throws(
    () => checkMaintenanceGate(writer3Snap),
    (err) => {
      assert.ok(err instanceof MaintenanceError);
      assert.equal(err.state, MAINTENANCE_STATES.CLOSED);
      return true;
    }
  );
});

test("Maintenance Gate - provable writer draining mechanism (not a blind grace period)", async () => {
  resetInFlightWritersCountForTesting();
  assert.equal(getInFlightWritersCount(), 0);

  // Writer 1 enters
  enterWriter();
  assert.equal(getInFlightWritersCount(), 1);

  // Writer 2 enters
  enterWriter();
  assert.equal(getInFlightWritersCount(), 2);

  let drained = false;
  const drainPromise = waitForWritersDrain({ timeoutMs: 1000 }).then(() => {
    drained = true;
  });

  assert.equal(drained, false, "Drain promise should not resolve while writers are in-flight");

  // Writer 1 completes
  exitWriter();
  assert.equal(getInFlightWritersCount(), 1);
  assert.equal(drained, false);

  // Writer 2 completes
  exitWriter();
  assert.equal(getInFlightWritersCount(), 0);

  await drainPromise;
  assert.equal(drained, true, "Drain promise must resolve when in-flight count reaches 0");
});
