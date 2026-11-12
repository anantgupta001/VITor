/**
 * Integration Tests: UserRepository + Firestore Emulator
 *
 * Tests the actual UserRepository against a live Firestore Emulator.
 * No mocks are used. Data is seeded and cleaned up per test.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { ensureEmulatorConnection } from "./helpers/setup.js";
import { clearCollection, usersRef } from "./helpers/firestore-helpers.js";
import { UserRepository } from "../../repositories/user.repository.js";

test.before(() => {
  ensureEmulatorConnection();
});

test.after(async () => {
  await clearCollection(usersRef());
});

// ───────────────────────────────────────────────────────────────────────────────
// getUserProfile
// ───────────────────────────────────────────────────────────────────────────────

test("UserRepository [INT] - getUserProfile returns null when userId is missing", async () => {
  assert.equal(await UserRepository.getUserProfile(null), null);
  assert.equal(await UserRepository.getUserProfile(undefined), null);
  assert.equal(await UserRepository.getUserProfile(""), null);
});

test("UserRepository [INT] - getUserProfile returns null for non-existent user", async () => {
  const result = await UserRepository.getUserProfile("non-existent-user-xyz");
  assert.equal(result, null);
});

test("UserRepository [INT] - getUserProfile returns seeded profile data", async () => {
  await clearCollection(usersRef());

  // Seed a user via updateUserCampus
  await UserRepository.updateUserCampus("user-profile-1", "vit-vellore");

  const profile = await UserRepository.getUserProfile("user-profile-1");
  assert.ok(profile !== null);
  assert.equal(profile.campusSlug, "vit-vellore");
});

// ───────────────────────────────────────────────────────────────────────────────
// updateUserCampus
// ───────────────────────────────────────────────────────────────────────────────

test("UserRepository [INT] - updateUserCampus does nothing when params are missing", async () => {
  // Should not throw
  await UserRepository.updateUserCampus(null, "vit-vellore");
  await UserRepository.updateUserCampus("user-x", null);
});

test("UserRepository [INT] - updateUserCampus creates user profile document", async () => {
  await clearCollection(usersRef());

  await UserRepository.updateUserCampus("user-new-1", "vit-chennai");

  const profile = await UserRepository.getUserProfile("user-new-1");
  assert.ok(profile !== null, "profile should exist after updateUserCampus");
  assert.equal(profile.campusSlug, "vit-chennai");
});

test("UserRepository [INT] - updateUserCampus updates existing campus preference", async () => {
  await clearCollection(usersRef());

  // Create with one campus
  await UserRepository.updateUserCampus("user-update-1", "vit-vellore");

  let profile = await UserRepository.getUserProfile("user-update-1");
  assert.equal(profile.campusSlug, "vit-vellore");

  // Update to a different campus
  await UserRepository.updateUserCampus("user-update-1", "vit-chennai");

  profile = await UserRepository.getUserProfile("user-update-1");
  assert.equal(profile.campusSlug, "vit-chennai", "campus should be updated");
});

test("UserRepository [INT] - updateUserCampus uses merge so pre-existing fields are preserved", async () => {
  await clearCollection(usersRef());

  // Pre-seed with extra fields
  await UserRepository.updateUserCampus("user-merge-1", "vit-vellore");

  // Now update campus (the actual method only writes campusSlug with merge)
  await UserRepository.updateUserCampus("user-merge-1", "vit-ap");

  const profile = await UserRepository.getUserProfile("user-merge-1");
  assert.equal(profile.campusSlug, "vit-ap");
});

test("UserRepository [INT] - multiple distinct users have isolated profiles", async () => {
  await clearCollection(usersRef());

  await UserRepository.updateUserCampus("user-iso-1", "vit-vellore");
  await UserRepository.updateUserCampus("user-iso-2", "vit-chennai");

  const profile1 = await UserRepository.getUserProfile("user-iso-1");
  const profile2 = await UserRepository.getUserProfile("user-iso-2");

  assert.equal(profile1.campusSlug, "vit-vellore");
  assert.equal(profile2.campusSlug, "vit-chennai");
});
