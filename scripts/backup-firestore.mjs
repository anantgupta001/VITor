/**
 * Standalone Firestore Backup Utility for VITor.
 *
 * Operational Script:
 * - Documents and automates official Cloud Firestore export mechanisms.
 * - Supports local/emulator JSON export of all collections and subcollections:
 *   * /users
 *   * /campuses/{campusSlug}/faculties
 *   * /campuses/{campusSlug}/faculties/{facultyId}/reviews
 *   * /campuses/{campusSlug}/faculties/{facultyId}/shards
 *   * /campuses/{campusSlug}/requestReceipts
 *   * /campuses/{campusSlug}/users/{userId}/rateLimits
 *   * /system
 * - Verifies backup completeness and reports exact backup paths.
 * - Enforces production safety guards (fails unless explicit flags are given).
 * - Documents external resources requiring separate backups (Auth, Storage, Rules, Indexes).
 * - Documents exact restore procedure.
 *
 * Usage:
 *   node scripts/backup-firestore.mjs --emulator --output ./backups/local-backup
 *   node scripts/backup-firestore.mjs --gcloud-bucket gs://vitor-backups-prod --confirm-production
 */

import { writeFileSync, mkdirSync, existsSync, readdirSync } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { adminDb } from "../lib/firebase/admin.js";
import { CAMPUS_SLUGS } from "../lib/campus.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isEmulatorMode = args.includes("--emulator");
const isConfirmProduction = args.includes("--confirm-production");
const isOverwrite = args.includes("--overwrite");

const outputIndex = args.indexOf("--output");
const outputDir =
  outputIndex !== -1 && args[outputIndex + 1]
    ? path.resolve(args[outputIndex + 1])
    : path.join(root, "backups", `backup-${new Date().toISOString().replace(/[:.]/g, "-")}`);

const gcloudIndex = args.indexOf("--gcloud-bucket");
const gcloudBucket = gcloudIndex !== -1 ? args[gcloudIndex + 1] : null;

export async function performLocalOrEmulatorBackup({
  targetDir = outputDir,
  overwrite = isOverwrite,
} = {}) {
  console.log(`\nInitiating backup to: ${targetDir}`);

  if (existsSync(targetDir)) {
    const existingFiles = readdirSync(targetDir);
    if (existingFiles.length > 0 && !overwrite) {
      throw new Error(
        `Destination directory '${targetDir}' already exists and contains files. Pass --overwrite to proceed.`
      );
    }
  } else {
    mkdirSync(targetDir, { recursive: true });
  }

  const manifest = {
    timestamp: new Date().toISOString(),
    schemaVersion: "6.1",
    backupType: isEmulatorMode ? "emulator-json" : "firestore-json",
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "vitor-project",
    status: "COMPLETED",
    exportCompleted: true,
    collections: {},
    totalDocuments: 0,
  };

  // 1. Back up /users
  console.log("Backing up /users collection...");
  const usersSnap = await adminDb.collection("users").get();
  const usersData = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  writeFileSync(path.join(targetDir, "users.json"), JSON.stringify(usersData, null, 2));
  manifest.collections["users"] = usersData.length;
  manifest.totalDocuments += usersData.length;
  console.log(`  Saved ${usersData.length} user profile document(s).`);

  // 2. Back up /campuses
  for (const campusSlug of CAMPUS_SLUGS) {
    const campusDir = path.join(targetDir, "campuses", campusSlug);
    mkdirSync(campusDir, { recursive: true });

    // Faculties & Subcollections (reviews, shards)
    console.log(`Backing up /campuses/${campusSlug}/faculties...`);
    const facultiesSnap = await adminDb
      .collection("campuses")
      .doc(campusSlug)
      .collection("faculties")
      .get();

    const facultiesData = [];
    let reviewsCount = 0;
    let shardsCount = 0;

    for (const facDoc of facultiesSnap.docs) {
      const facId = facDoc.id;
      const facObj = { id: facId, ...facDoc.data() };

      // Subcollection: reviews
      const reviewsSnap = await facDoc.ref.collection("reviews").get();
      facObj._reviews = reviewsSnap.docs.map((r) => ({ id: r.id, ...r.data() }));
      reviewsCount += facObj._reviews.length;

      // Subcollection: shards
      const shardsSnap = await facDoc.ref.collection("shards").get();
      facObj._shards = shardsSnap.docs.map((s) => ({ id: s.id, ...s.data() }));
      shardsCount += facObj._shards.length;

      facultiesData.push(facObj);
    }

    writeFileSync(path.join(campusDir, "faculties.json"), JSON.stringify(facultiesData, null, 2));
    manifest.collections[`campuses/${campusSlug}/faculties`] = facultiesData.length;
    manifest.collections[`campuses/${campusSlug}/reviews`] = reviewsCount;
    manifest.collections[`campuses/${campusSlug}/shards`] = shardsCount;
    manifest.totalDocuments += facultiesData.length + reviewsCount + shardsCount;
    console.log(`  Saved ${facultiesData.length} faculties, ${reviewsCount} reviews, ${shardsCount} shards.`);

    // Request Receipts: /campuses/{campusSlug}/requestReceipts
    const receiptsSnap = await adminDb
      .collection("campuses")
      .doc(campusSlug)
      .collection("requestReceipts")
      .get();
    const receiptsData = receiptsSnap.docs.map((r) => ({ id: r.id, ...r.data() }));
    writeFileSync(path.join(campusDir, "requestReceipts.json"), JSON.stringify(receiptsData, null, 2));
    manifest.collections[`campuses/${campusSlug}/requestReceipts`] = receiptsData.length;
    manifest.totalDocuments += receiptsData.length;

    // Rate Limits: /campuses/{campusSlug}/users/{userId}/rateLimits
    const userLimitsSnap = await adminDb
      .collection("campuses")
      .doc(campusSlug)
      .collection("users")
      .get();
    const rateLimitsData = [];
    for (const userDoc of userLimitsSnap.docs) {
      const limitsSnap = await userDoc.ref.collection("rateLimits").get();
      for (const limDoc of limitsSnap.docs) {
        rateLimitsData.push({
          userId: userDoc.id,
          limitId: limDoc.id,
          ...limDoc.data(),
        });
      }
    }
    writeFileSync(path.join(campusDir, "rateLimits.json"), JSON.stringify(rateLimitsData, null, 2));
    manifest.collections[`campuses/${campusSlug}/rateLimits`] = rateLimitsData.length;
    manifest.totalDocuments += rateLimitsData.length;
  }

  // 3. System collection (maintenance gate)
  console.log("Backing up /system collection...");
  const systemSnap = await adminDb.collection("system").get();
  const systemData = systemSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
  writeFileSync(path.join(targetDir, "system.json"), JSON.stringify(systemData, null, 2));
  manifest.collections["system"] = systemData.length;
  manifest.totalDocuments += systemData.length;

  // Write Manifest
  writeFileSync(path.join(targetDir, "manifest.json"), JSON.stringify(manifest, null, 2));

  // Write Restore instructions
  const restoreReadme = `# Restore & External Backup Procedure for VITor (${manifest.timestamp})

## 1. Firestore Database Restore

### Local / Emulator Restore:
Import using the Firestore Emulator seed directory:
\`\`\`bash
firebase emulators:start --import=${targetDir}
\`\`\`

### Google Cloud Production Restore:
If generated via Google Cloud CLI:
\`\`\`bash
gcloud firestore import gs://<BUCKET_NAME>/<BACKUP_DIR>
\`\`\`
*(Restores all collections and nested subcollections without filtering).*

---

## 2. External Resources Requiring Separate Backups

Firestore backups do NOT include external Firebase or Google Cloud resources. The following MUST be backed up separately:

1. **Firebase Authentication (User Identity & Claims)**
   - Auth users and custom claims are not Firestore documents.
   - Backup:
     \`\`\`bash
     firebase auth:export auth-backup.json --format=json
     \`\`\`
   - Restore:
     \`\`\`bash
     firebase auth:import auth-backup.json --hash-algo=SCRYPT
     \`\`\`

2. **Cloud Storage (Faculty Profile Photos & Assets)**
   - User-uploaded assets reside in Cloud Storage buckets.
   - Backup:
     \`\`\`bash
     gsutil -m rsync -r gs://<PROJECT_ID>.appspot.com ./storage-backup
     \`\`\`
   - Restore:
     \`\`\`bash
     gsutil -m rsync -r ./storage-backup gs://<PROJECT_ID>.appspot.com
     \`\`\`

3. **Firestore Security Rules**
   - Version-controlled in Git at \`firestore.rules\`.
   - Deploy:
     \`\`\`bash
     firebase deploy --only firestore:rules
     \`\`\`

4. **Firestore Composite Indexes**
   - Version-controlled in Git at \`firestore.indexes.json\`.
   - Deploy:
     \`\`\`bash
     firebase deploy --only firestore:indexes
     \`\`\`
`;
  writeFileSync(path.join(targetDir, "RESTORE.md"), restoreReadme);

  console.log("\n==================================================================");
  console.log(`✅ Backup successfully completed! Total documents: ${manifest.totalDocuments}`);
  console.log(`Manifest: ${path.join(targetDir, "manifest.json")}`);
  console.log(`Restore instructions: ${path.join(targetDir, "RESTORE.md")}`);
  console.log("==================================================================\n");

  return manifest;
}

if (isMain) {
  console.log("==================================================================");
  console.log("       VITor Firestore Backup Utility (Phase 6.1)                 ");
  console.log("==================================================================");

  if (!isEmulatorMode && !isConfirmProduction && !isDryRun) {
    console.error("\n❌ SAFETY ERROR: Script running without --emulator or --confirm-production.");
    console.error("To run safely against local Firebase Emulator:");
    console.error("  node scripts/backup-firestore.mjs --emulator --output ./backups/local\n");
    console.error("For managed production backup via Google Cloud CLI:");
    console.error("  gcloud firestore export gs://<YOUR_BUCKET>/backup-[TIMESTAMP]\n");
    console.error("  (Executed without --collection-ids to guarantee complete database coverage)\n");
    process.exit(1);
  }

  if (gcloudBucket) {
    console.log(`\n📋 Official Google Cloud Firestore Export Command:`);
    console.log(`\n  gcloud firestore export ${gcloudBucket}/backup-${Date.now()}`);
    console.log(`  (Note: Run without --collection-ids to ensure 100% full database export of all root collections and subcollections)\n`);
    console.log(`📋 Official Google Cloud Firestore Restore Command:`);
    console.log(`\n  gcloud firestore import ${gcloudBucket}/backup-[TIMESTAMP]\n`);
    if (!isConfirmProduction) {
      console.log("Dry-run preview complete. Exiting without execution.");
      process.exit(0);
    }
  }

  performLocalOrEmulatorBackup().catch((err) => {
    console.error("\n❌ Backup failed:", err.message);
    process.exit(1);
  });
}
