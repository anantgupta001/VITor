/**
 * Controllable Firestore SDK mock for repository unit tests.
 * Exports Firestore mock state and mock implementations of all methods
 * used by FacultyRepository, ReviewsRepository, and UserRepository.
 */

export const firestoreMockState = {
  getDocHandler: null,
  getDocsHandler: null,
  setDocHandler: null,
  updateDocHandler: null,

  collectionCalls: [],
  docCalls: [],
  getDocCalls: [],
  getDocsCalls: [],
  setDocCalls: [],
  updateDocCalls: [],

  reset() {
    this.getDocHandler = null;
    this.getDocsHandler = null;
    this.setDocHandler = null;
    this.updateDocHandler = null;
    this.collectionCalls = [];
    this.docCalls = [];
    this.getDocCalls = [];
    this.getDocsCalls = [];
    this.setDocCalls = [];
    this.updateDocCalls = [];
  },
};

export const getFirestore = (app) => ({
  type: "mock-firestore-db",
  app,
});

export const collection = (db, ...args) => {
  const ref = { type: "collectionRef", db, args, path: args.join("/") };
  firestoreMockState.collectionCalls.push(ref);
  return ref;
};

export const doc = (db, ...args) => {
  const ref = { type: "docRef", db, args, path: args.join("/") };
  firestoreMockState.docCalls.push(ref);
  return ref;
};

export const getDoc = async (ref) => {
  firestoreMockState.getDocCalls.push(ref);
  if (firestoreMockState.getDocHandler) {
    return firestoreMockState.getDocHandler(ref);
  }
  return {
    id: ref?.args?.[ref.args.length - 1] || "mock-id",
    exists: () => false,
    data: () => null,
  };
};

export const getDocs = async (ref) => {
  firestoreMockState.getDocsCalls.push(ref);
  if (firestoreMockState.getDocsHandler) {
    return firestoreMockState.getDocsHandler(ref);
  }
  return { docs: [] };
};

export const setDoc = async (ref, data, opts) => {
  firestoreMockState.setDocCalls.push({ ref, data, opts });
  if (firestoreMockState.setDocHandler) {
    return firestoreMockState.setDocHandler(ref, data, opts);
  }
  return Promise.resolve();
};

export const updateDoc = async (ref, data) => {
  firestoreMockState.updateDocCalls.push({ ref, data });
  if (firestoreMockState.updateDocHandler) {
    return firestoreMockState.updateDocHandler(ref, data);
  }
  return Promise.resolve();
};

export const serverTimestamp = () => "MOCK_SERVER_TIMESTAMP";

export const connectFirestoreEmulator = (db, host, port) => ({
  db,
  host,
  port,
});
