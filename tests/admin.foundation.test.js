import test from "node:test";
import assert from "node:assert/strict";
import {
  adminApp,
  adminAuth,
  adminDb,
  getAdminApp,
  getAdminAuth,
  getAdminDb,
  initAdminApp,
} from "../lib/firebase/admin.js";

test("Admin SDK Foundation - safe singleton initialization and exports", () => {
  assert.ok(adminApp, "adminApp should be initialized");
  assert.ok(adminAuth, "adminAuth should be initialized");
  assert.ok(adminDb, "adminDb should be initialized");

  // Singleton instance verification
  assert.equal(getAdminApp(), adminApp);
  assert.equal(getAdminAuth(), adminAuth);
  assert.equal(getAdminDb(), adminDb);

  // Calling initAdminApp again returns the existing singleton
  const secondCallApp = initAdminApp();
  assert.equal(secondCallApp.name, adminApp.name);
});

test("Admin SDK Foundation - correct server-side environment configuration", () => {
  assert.ok(adminApp.options.projectId, "projectId should be present");
});
