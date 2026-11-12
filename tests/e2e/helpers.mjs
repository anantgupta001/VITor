/**
 * E2E Test Helpers — Auth Emulator utilities for Playwright tests.
 */

const AUTH_EMULATOR_HOST = "127.0.0.1:9098";
const FIRESTORE_EMULATOR_HOST = "127.0.0.1:8086";
const PROJECT_ID = "demo-vitor-e2e";

/**
 * Sign in as the pre-seeded test user using the test auth boundary.
 */
export async function signInAsTestUser(
  page,
  email = "e2etest@vitstudent.ac.in",
  password = "e2e-test-password-123"
) {
  // Ensure account exists and user profile is seeded
  try {
    let uid = null;
    const signUpRes = await fetch(
      `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key-for-e2e`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          returnSecureToken: true,
        }),
      }
    );

    if (signUpRes.ok) {
      const data = await signUpRes.json();
      uid = data.localId;
    } else {
      const signInRes = await fetch(
        `http://${AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=fake-api-key-for-e2e`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email,
            password,
            returnSecureToken: true,
          }),
        }
      );
      if (signInRes.ok) {
        const data = await signInRes.json();
        uid = data.localId;
      }
    }

    if (uid) {
      await seedDocument("users", uid, { campusSlug: "vit-v" });
    }
  } catch (err) {
    console.warn("Notice in signInAsTestUser helper:", err.message);
  }

  // Invoke the test auth helper inside the browser
  await page.evaluate(
    async ({ email, password }) => {
      if (!window.__VIT_TEST_AUTH__) {
        throw new Error("window.__VIT_TEST_AUTH__ is not available");
      }
      await window.__VIT_TEST_AUTH__.signIn(email, password);
    },
    { email, password }
  );

  // Wait for the UI to reflect authenticated state (Logout button appears in navbar)
  await page.waitForSelector("button:has-text('Logout')", { timeout: 10_000 });
}

/**
 * Clear Firestore data via emulator REST endpoint.
 */
export async function clearFirestoreData() {
  await fetch(
    `http://${FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" }
  );
}

/**
 * Seed a single document via Firestore Emulator REST API.
 */
export async function seedDocument(collectionPath, docId, fields) {
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

  const url = `http://${FIRESTORE_EMULATOR_HOST}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collectionPath}/${docId}`;
  const resp = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fields: firestoreFields }),
  });
  if (!resp.ok) {
    console.error(`Failed to seed ${collectionPath}/${docId}: ${await resp.text()}`);
  }
}
