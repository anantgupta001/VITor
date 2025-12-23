import admin from "firebase-admin";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ES module __dirname fix
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 🔑 SAME FOLDER PATH
const serviceAccountPath = path.join(
  __dirname,
  "serviceAccountKey.json"
);

// 📄 faculties.json location
const facultiesPath = path.join(
  __dirname,
  "../../data/faculties.json"
);

// Load service account
const serviceAccount = JSON.parse(
  fs.readFileSync(serviceAccountPath, "utf8")
);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

// Load faculties
const faculties = JSON.parse(
  fs.readFileSync(facultiesPath, "utf8")
);

(async () => {
  console.log("🚀 Starting faculty import...");

  const batchSize = 400;
  let batch = db.batch();
  let count = 0;

  for (const f of faculties) {
    const ref = db.collection("faculties").doc(String(f.id));

    batch.set(ref, {
      ...f,
      avgRating: 0,
      totalRatings: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    count++;

    if (count % batchSize === 0) {
      await batch.commit();
      batch = db.batch();
      console.log(`✅ Inserted ${count}`);
    }
  }

  if (count % batchSize !== 0) {
    await batch.commit();
  }

  console.log("🎉 Faculty import completed:", count);
})();
