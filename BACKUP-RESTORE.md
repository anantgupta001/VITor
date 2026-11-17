# VITor — Backup & Restore Procedure

> [!IMPORTANT]
> **No production operations are authorized by this document alone.**
> Every production step requires an explicit human decision.
> This document describes the procedure, scripts, and evidence criteria —
> it does not authorize any execution.

---

## Table of Contents

1. [Backup Configuration](#1-backup-configuration)
2. [Full Firestore Export (gcloud)](#2-full-firestore-export-gcloud)
3. [Backup Verification](#3-backup-verification)
4. [Restore Procedure](#4-restore-procedure)
5. [Backup Scope Beyond Firestore](#5-backup-scope-beyond-firestore)
6. [Script Reference](#6-script-reference)
7. [Manifest Structure](#7-manifest-structure)

---

## 1. Backup Configuration

The production backup script **requires** two environment variables.
It **refuses** to run if either is missing, empty, or syntactically invalid.
**No default values are used. No production project is silently selected.**

| Variable | Required | Description |
|---|---|---|
| `VITOR_BACKUP_PROJECT_ID` | ✅ Yes | The exact GCP/Firebase project ID to export from |
| `VITOR_BACKUP_BUCKET` | ✅ Yes | GCS bucket URI — must start with `gs://` |
| `VITOR_BACKUP_DATABASE` | Optional | Firestore database ID (default: `(default)`) |
| `VITOR_BACKUP_PREFIX` | Optional | Path prefix within bucket (e.g. `prod-exports`) |

> [!CAUTION]
> Never hardcode these values in source files. Never commit them to the repository.
> Set them only in the shell session executing the backup, and clear them after use.

**Validation rules (enforced before any export):**
- `VITOR_BACKUP_PROJECT_ID` must be a non-empty, non-whitespace string.
- `VITOR_BACKUP_BUCKET` must start with `gs://` and must name a real bucket (not just `gs://`).
- `VITOR_BACKUP_DATABASE` must be non-empty if explicitly set.

**Dry-run validation (run this first):**
```bash
VITOR_BACKUP_PROJECT_ID=<your-project-id> \
VITOR_BACKUP_BUCKET=gs://<your-backup-bucket> \
  node scripts/gcloud-backup-firestore.mjs --dry-run
```

This prints the exact `gcloud` command that would be executed and writes a `NOT_VERIFIED` manifest.
No export is performed. This is safe to run at any time.

---

## 2. Full Firestore Export (gcloud)

### Why gcloud export, not the local backup script

- **Local Emulator JSON backup** (`scripts/backup-firestore.mjs --emulator`): Performs a local JSON export of all collections and subcollections using the Firebase Admin SDK. It is used for emulator-based testing.
- **Google Cloud managed export** (`scripts/gcloud-backup-firestore.mjs`): A separate cloud backup workflow using Google Cloud Managed Export:
  ```
  gcloud firestore export gs://<BACKUP_BUCKET>/<BACKUP_PREFIX> --project=<PROJECT_ID>
  ```
  This is reserved for real cloud-level exports prior to cloud-level operations.


### Key properties of the gcloud export

- **Complete** — exports ALL root collections and subcollections. The `--collection-ids` flag is intentionally **not used**, ensuring no collection is silently omitted.
- **Atomic** — the export is a single managed GCS operation with a GCP operation ID.
- **Verifiable** — the GCP operations API (`gcloud firestore operations describe`) is used to confirm the export completed without errors (exit code 0 alone is not sufficient).

### Export command (what the script executes)

```bash
gcloud firestore export \
  gs://<VITOR_BACKUP_BUCKET>/<VITOR_BACKUP_PREFIX>/backup-<TIMESTAMP> \
  --project=<VITOR_BACKUP_PROJECT_ID> \
  --database=<VITOR_BACKUP_DATABASE> \
  --format=json
```

> [!NOTE]
> `--format=json` is used to parse the returned operation ID for verification.
> No `--collection-ids` flag is passed — this guarantees a **complete** database export.

### Executing the backup

```bash
VITOR_BACKUP_PROJECT_ID=<your-project-id> \
VITOR_BACKUP_BUCKET=gs://<your-backup-bucket> \
  node scripts/gcloud-backup-firestore.mjs --confirm \
  --manifest-out ./backups/gcloud-backup-manifest-prod.json
```

The script will:
1. Validate configuration (fail fast if missing).
2. Build a timestamped GCS destination.
3. Run `gcloud firestore export`.
4. Call `gcloud firestore operations describe` on the returned operation ID.
5. Write a manifest JSON with status `COMPLETED`, `FAILED`, or `NOT_VERIFIED`.
6. Exit non-zero if status is not `COMPLETED`.

---

## 3. Backup Verification

> [!WARNING]
> A successful `gcloud` exit code (0) alone is **not sufficient proof** of a usable backup.
> The export operation status must be explicitly verified.

### Verification criteria

A backup is considered **VERIFIED** only when ALL of the following are true:

| Check | Criterion |
|---|---|
| `manifest_readable` | Manifest file exists and is valid JSON |
| `required_fields_present` | All required fields present in manifest |
| `status_completed` | `status === "COMPLETED"` |
| `export_completed_flag` | `exportCompleted === true` |
| `operation_done` | `operationDone === true` (export operation finished) |
| `no_verification_error` | `verificationError` is null/absent |
| `backup_destination_valid` | `backupDestination` starts with `gs://` and is non-empty |
| `project_id_present` | `projectId` is a non-empty string |

### Running verification

```bash
node scripts/verify-backup.mjs \
  --manifest ./backups/gcloud-backup-manifest-prod.json
```

To also re-query the live GCS operation:
```bash
node scripts/verify-backup.mjs \
  --manifest ./backups/gcloud-backup-manifest-prod.json \
  --re-verify-operation
```

The script exits `0` on VERIFIED, `1` on any failure. It appends a `lastVerification` block to the manifest with the timestamp and per-check results.

### Status meanings

| Status | Meaning | Action |
|---|---|---|
| `COMPLETED` | Export finished without errors, operation verified DONE | ✅ May proceed to restore verification |
| `FAILED` | Export returned an error | ❌ Do not proceed |
| `NOT_VERIFIED` | Operation status could not be confirmed | ❌ Treat as FAILED until manually confirmed |

---

## 4. Restore Procedure

> [!CAUTION]
> **Never restore into production.** The restore target must always be a **disposable, isolated test project**.
> A restore test demonstrates that the backup is usable — it does not authorize a production restore.

### 4.1 Prerequisites

Before a restore test:
- A `COMPLETED` backup manifest must exist and pass `verify-backup.mjs`.
- A disposable GCP project (or Firestore database) must be provisioned for the test.
- The restore operator must have `datastore.databases.import` IAM permission on the **test** project.

### 4.2 Restore into a test/staging project (gcloud export → import)

```bash
# Step 1: Import the GCS export into the test project
gcloud firestore import \
  gs://<BACKUP_BUCKET>/<BACKUP_PREFIX>/backup-<TIMESTAMP> \
  --project=<TEST_PROJECT_ID> \
  --database=(default)

# Step 2: Verify the operation completed
gcloud firestore operations list \
  --project=<TEST_PROJECT_ID>
```

Replace `<TEST_PROJECT_ID>` with your disposable test project — **never your production project ID**.

### 4.3 Restore into an emulator (from local JSON backup)

If using the local JSON backup produced by `backup-firestore.mjs`:

```bash
firebase emulators:start \
  --config firebase.test.json \
  --only firestore \
  --import ./backups/task2-verification-backup \
  --project demo-vitor-restore-test
```

### 4.4 Post-restore verification checklist

After import, verify the following **manually** in the test project:

| Check | How to verify |
|---|---|
| **Campus documents exist** | `gcloud firestore documents list projects/<TEST>/databases/(default)/documents/campuses` |
| **Faculty documents exist** | Query `/campuses/<slug>/faculties` — expect non-empty |
| **Review subcollections readable** | Query a known faculty's `/reviews` subcollection |
| **Shard documents present** | Query a known faculty's `/shards` subcollection |
| **System collection readable** | Query `/system/reviewMaintenance` |
| **User profiles readable** | Query `/users` collection |
| **Document counts match backup manifest** | Compare counts from manifest `collections` field |
| **Representative records match** | Spot-check 2–3 known faculty or review documents |
| **Request receipts present** | Query `/campuses/<slug>/requestReceipts` |
| **Rate limit documents present** | Query `/campuses/<slug>/users/<userId>/rateLimits` |

Record the results in a restore verification report. A restore test is **not complete** until all checks have been performed and documented.

### 4.5 Restore verification status

| Status | Meaning |
|---|---|
| `RESTORE_VERIFIED` | All post-restore checks passed and documented |
| `RESTORE_FAILED` | One or more checks failed |
| `RESTORE_NOT_PERFORMED` | No restore test has been executed yet |

> [!IMPORTANT]
> As of this document, the restore verification status is **`RESTORE_NOT_PERFORMED`**.
> No restore test has been executed. The backup scripts and procedure are prepared and tested.
> A restore test must be executed against a disposable test project before relying on a backup.

---

## 5. Backup Scope Beyond Firestore

The `gcloud firestore export` command exports **only Firestore data**.
The following Firebase/GCP resources require **separate backup procedures**.

### 5.1 Firebase Authentication Users

- **Status:** Manual backup required. No automation in this repository.
- **What is NOT backed up:** Auth user accounts, custom claims, password hashes, provider links.
- **Backup command:**
  ```bash
  firebase auth:export auth-backup.json \
    --format=json \
    --project=<FIREBASE_PROJECT_ID>
  ```
- **Restore command:**
  ```bash
  firebase auth:import auth-backup.json \
    --hash-algo=SCRYPT \
    --project=<FIREBASE_PROJECT_ID>
  ```
- **Frequency:** Before any user-data-impacting change or production deployment.
- **Automation:** ❌ Not automated. Manual step required.

### 5.2 Firebase Storage Files

- **Status:** Manual backup required. No automation in this repository.
- **What is NOT backed up:** Profile photos, faculty images, user-uploaded assets.
- **Backup command:**
  ```bash
  gsutil -m rsync -r \
    gs://<FIREBASE_PROJECT_ID>.appspot.com \
    ./storage-backup
  ```
- **Restore command:**
  ```bash
  gsutil -m rsync -r \
    ./storage-backup \
    gs://<FIREBASE_PROJECT_ID>.appspot.com
  ```
- **Note:** VITor currently uses Storage for faculty profile images. Assess whether storage content changes. If not, this backup can be deferred — but it must be documented.
- **Automation:** ❌ Not automated. Manual step required.

### 5.3 Firestore Security Rules

- **Status:** ✅ Version-controlled in Git (`firestore.rules`).
- **What is included:** All production security rules.
- **Recovery:** Restore from Git and redeploy:
  ```bash
  firebase deploy --only firestore:rules --project=<FIREBASE_PROJECT_ID>
  ```
- **Automation:** ✅ Covered by Git version control.

### 5.4 Firestore Indexes

- **Status:** ⚠️ Partially covered. `firebase.json` references rules, but no `firestore.indexes.json` was found in the repository at the time of this task.
- **What may be missing:** Composite indexes defined in the Firebase Console but not committed to `firestore.indexes.json`.
- **Action required:** Export current indexes before any risky change:
  ```bash
  firebase firestore:indexes --project=<FIREBASE_PROJECT_ID> > firestore.indexes.json
  git add firestore.indexes.json && git commit -m "chore: export production Firestore indexes before risky change"
  ```
- **Recovery:**
  ```bash
  firebase deploy --only firestore:indexes --project=<FIREBASE_PROJECT_ID>
  ```
- **Automation:** ⚠️ Manual export step required before any risky change.

### 5.5 Firebase Project Configuration

- **Status:** Partially covered via `.env.local` (not committed to Git).
- **What is NOT backed up:** Firebase console settings, billing configuration, IAM roles, API key restrictions.
- **Action required:** Document the current project configuration in a secure location before any risky change.
- **Automation:** ❌ Not automated.

### Backup Coverage Summary

| Resource | Automated Backup | Recovery Method |
|---|---|---|
| Firestore Database | ✅ `gcloud firestore export` | `gcloud firestore import` |
| Firestore Security Rules | ✅ Git (`firestore.rules`) | `firebase deploy --only firestore:rules` |
| Firestore Indexes | ⚠️ Needs manual export | `firebase deploy --only firestore:indexes` |
| Firebase Auth Users | ❌ Manual | `firebase auth:import` |
| Firebase Storage | ❌ Manual | `gsutil rsync` |
| Project Config / IAM | ❌ Manual | Firebase Console |

---
## 6. Script Reference

| Script | Purpose | Safety |
|---|---|---|
| `scripts/gcloud-backup-firestore.mjs` | Production gcloud export | Requires `--dry-run` or `--confirm`; rejects missing config |
| `scripts/verify-backup.mjs` | Verifies a gcloud backup manifest | Read-only; exits non-zero on any check failure |
| `scripts/backup-firestore.mjs` | Local/emulator JSON export | Requires `--emulator` or `--confirm-production` |

---

## 7. Manifest Structure

### gcloud backup manifest (`gcloud-backup-manifest-<timestamp>.json`)

```json
{
  "schemaVersion": "6.1-gcloud",
  "backupType": "gcloud-firestore-export",
  "timestamp": "<ISO 8601>",
  "projectId": "<GCP project ID — no credentials>",
  "database": "(default)",
  "backupDestination": "gs://<bucket>/<prefix>/backup-<timestamp>",
  "exportExitCode": 0,
  "operationId": "projects/<project>/databases/(default)/operations/<id>",
  "status": "COMPLETED | FAILED | NOT_VERIFIED",
  "exportCompleted": true,
  "verificationError": null,
  "operationDone": true,
  "outputUriPrefix": "gs://<bucket>/<prefix>/backup-<timestamp>",
  "operationMetadata": { ... },
  "notes": [ ... ],
  "lastVerification": {
    "verifiedAt": "<ISO 8601>",
    "passed": true,
    "checks": [
      { "name": "manifest_readable", "passed": true, "detail": "..." },
      { "name": "required_fields_present", "passed": true, "detail": "..." },
      { "name": "status_completed", "passed": true, "detail": "..." },
      { "name": "export_completed_flag", "passed": true, "detail": "..." },
      { "name": "operation_done", "passed": true, "detail": "..." },
      { "name": "no_verification_error", "passed": true, "detail": "..." },
      { "name": "backup_destination_valid", "passed": true, "detail": "..." },
      { "name": "project_id_present", "passed": true, "detail": "..." }
    ]
  }
}
```

> [!CAUTION]
> The manifest must never contain API keys, service account credentials, auth tokens,
> private keys, passwords, or secrets of any kind.
> The `projectId` and `backupDestination` fields are non-sensitive identifiers only.

