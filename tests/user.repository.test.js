import { register } from "node:module";
import test from "node:test";
import assert from "node:assert/strict";

// Register mock loader to intercept "firebase/firestore"
register("./mocks/mock-loader.mjs", import.meta.url);

import { firestoreMockState } from "./mocks/mock-firestore.mjs";
const { UserRepository } = await import("../repositories/user.repository.js");

test("UserRepository.getUserProfile - returns null when userId is missing", async () => {
  firestoreMockState.reset();

  assert.equal(await UserRepository.getUserProfile(null), null);
  assert.equal(await UserRepository.getUserProfile(undefined), null);
  assert.equal(await UserRepository.getUserProfile(""), null);

  assert.equal(firestoreMockState.docCalls.length, 0);
  assert.equal(firestoreMockState.getDocCalls.length, 0);
});

test("UserRepository.getUserProfile - returns profile data when document exists", async () => {
  firestoreMockState.reset();

  const mockProfile = { campusSlug: "vit-v", email: "student@vitstudent.ac.in" };

  firestoreMockState.getDocHandler = async (ref) => {
    assert.deepEqual(ref.args, ["users", "user-456"]);
    return {
      exists: () => true,
      data: () => mockProfile,
    };
  };

  const profile = await UserRepository.getUserProfile("user-456");

  assert.notEqual(profile, null);
  assert.deepEqual(profile, mockProfile);
  assert.equal(firestoreMockState.docCalls.length, 1);
  assert.deepEqual(firestoreMockState.docCalls[0].args, ["users", "user-456"]);
  assert.equal(firestoreMockState.getDocCalls.length, 1);
});

test("UserRepository.getUserProfile - returns null when profile document does not exist", async () => {
  firestoreMockState.reset();

  firestoreMockState.getDocHandler = async () => ({
    exists: () => false,
    data: () => null,
  });

  const profile = await UserRepository.getUserProfile("user-nonexistent");

  assert.equal(profile, null);
  assert.equal(firestoreMockState.getDocCalls.length, 1);
});

test("UserRepository.getUserProfile - propagates Firestore read errors", async () => {
  firestoreMockState.reset();

  firestoreMockState.getDocHandler = async () => {
    throw new Error("Firestore read failure: PERMISSION_DENIED");
  };

  await assert.rejects(
    async () => {
      await UserRepository.getUserProfile("user-err");
    },
    {
      name: "Error",
      message: "Firestore read failure: PERMISSION_DENIED",
    }
  );
});

test("UserRepository.updateUserCampus - guards against missing parameters", async () => {
  firestoreMockState.reset();

  await UserRepository.updateUserCampus(null, "vit-ap");
  await UserRepository.updateUserCampus(undefined, "vit-ap");
  await UserRepository.updateUserCampus("", "vit-ap");
  await UserRepository.updateUserCampus("user-1", null);
  await UserRepository.updateUserCampus("user-1", undefined);
  await UserRepository.updateUserCampus("user-1", "");

  assert.equal(firestoreMockState.docCalls.length, 0);
  assert.equal(firestoreMockState.setDocCalls.length, 0);
});

test("UserRepository.updateUserCampus - successfully updates campus with merge option", async () => {
  firestoreMockState.reset();

  let capturedRef = null;
  let capturedData = null;
  let capturedOpts = null;

  firestoreMockState.setDocHandler = async (ref, data, opts) => {
    capturedRef = ref;
    capturedData = data;
    capturedOpts = opts;
  };

  await UserRepository.updateUserCampus("user-789", "vit-c");

  assert.equal(firestoreMockState.docCalls.length, 1);
  assert.deepEqual(firestoreMockState.docCalls[0].args, ["users", "user-789"]);
  assert.equal(firestoreMockState.setDocCalls.length, 1);
  assert.deepEqual(capturedRef.args, ["users", "user-789"]);
  assert.deepEqual(capturedData, { campusSlug: "vit-c" });
  assert.deepEqual(capturedOpts, { merge: true });
});

test("UserRepository.updateUserCampus - propagates Firestore write errors", async () => {
  firestoreMockState.reset();

  firestoreMockState.setDocHandler = async () => {
    throw new Error("Firestore write failure: UNAVAILABLE");
  };

  await assert.rejects(
    async () => {
      await UserRepository.updateUserCampus("user-1", "vit-v");
    },
    {
      name: "Error",
      message: "Firestore write failure: UNAVAILABLE",
    }
  );
});
