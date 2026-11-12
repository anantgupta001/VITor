/**
 * ESM customization hook loader for Node.js native test runner.
 * Intercepts "firebase/firestore" imports and points them to mock-firestore.mjs.
 */

export async function resolve(specifier, context, nextResolve) {
  if (specifier === "firebase/firestore") {
    return {
      shortCircuit: true,
      url: new URL("./mock-firestore.mjs", import.meta.url).href,
    };
  }
  return nextResolve(specifier, context);
}
