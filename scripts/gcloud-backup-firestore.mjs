/**
 * Production Firestore Export Script for VITor — Phase 6.1 Task 3.
 *
 * Uses Google Cloud's managed Firestore export mechanism:
 *   gcloud firestore export gs://<BUCKET>/<PREFIX> --project=<PROJECT_ID>
 *
 * Guarantees:
 *   - Requires explicit VITOR_BACKUP_PROJECT_ID and VITOR_BACKUP_BUCKET env vars.
 *   - Refuses to run if configuration is missing, empty or ambiguous.
 *   - Never silently selects a production project.
 *   - Runs WITHOUT --collection-ids to export ALL collections and subcollections.
 *   - Performs post-export verification via `gcloud firestore operations describe`.
 *   - Records timestamp, project ID, database, backup location, operation ID, and
 *     completion status in a JSON manifest.
 *   - Clearly distinguishes COMPLETED, FAILED, and NOT_VERIFIED states.
 *   - Fails with a non-zero exit code if export fails or remains incomplete.
 *   - Never initiates a production backup silently; always requires --confirm flag.
 *
 * Usage:
 *   # Dry-run: validate config and print command without executing
 *   node scripts/gcloud-backup-firestore.mjs --dry-run
 *
 *   # Execute production export (requires env vars + explicit confirmation)
 *   VITOR_BACKUP_PROJECT_ID=my-project VITOR_BACKUP_BUCKET=gs://my-bucket \
 *     node scripts/gcloud-backup-firestore.mjs --confirm
 *
 *   # Custom manifest output path
 *   VITOR_BACKUP_PROJECT_ID=my-project VITOR_BACKUP_BUCKET=gs://my-bucket \
 *     node scripts/gcloud-backup-firestore.mjs --confirm \
 *     --manifest-out ./backups/gcloud-manifest.json
 *
 * Environment Variables (REQUIRED for --confirm):
 *   VITOR_BACKUP_PROJECT_ID   — The GCP/Firebase project ID to export from.
 *   VITOR_BACKUP_BUCKET       — The GCS bucket URI (must start with gs://).
 *
 * Optional:
 *   VITOR_BACKUP_DATABASE     — Firestore database ID (default: "(default)").
 *   VITOR_BACKUP_PREFIX       — Optional prefix within bucket (e.g. "backups/prod").
 *
 * DO NOT hardcode real project IDs, bucket names, or credentials here.
 * DO NOT run this script against production without a confirmed backup plan and
 * human authorization. See BACKUP-RESTORE.md for the full procedure.
 */

import { spawnSync } from "child_process";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

// ── Argument parsing ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run");
const isConfirm = args.includes("--confirm");

const manifestOutIndex = args.indexOf("--manifest-out");
const manifestOutArg =
  manifestOutIndex !== -1 && args[manifestOutIndex + 1]
    ? path.resolve(args[manifestOutIndex + 1])
    : null;

// ── Constants ─────────────────────────────────────────────────────────────────
export const BACKUP_STATUS = Object.freeze({
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
  NOT_VERIFIED: "NOT_VERIFIED",
});

export const BACKUP_SCHEMA_VERSION = "6.1-gcloud";
export const BACKUP_TYPE_GCLOUD = "gcloud-firestore-export";

/**
 * Default command runner. Tests inject a fake runner instead, so no real gcloud
 * process is ever spawned from the test suite.
 *
 * @param {string[]} cmdArgs  Arguments passed to `gcloud`.
 * @param {{ maxBuffer?: number }} [opts]
 * @returns {{ status: number|null, stdout: string, stderr: string, error?: Error }}
 */
export function defaultGcloudRunner(cmdArgs, { maxBuffer = 10 * 1024 * 1024 } = {}) {
  return spawnSync("gcloud", cmdArgs, { encoding: "utf-8", maxBuffer });
}

/** Normalizes a gs:// URI for exact comparison (only trailing slashes are ignored). */
export function normalizeGsUri(uri) {
  return typeof uri === "string" ? uri.trim().replace(/\/+$/, "") : null;
}

/**
 * Validates configuration from environment variables.
 * Throws a descriptive error if any required value is missing or ambiguous.
 *
 * @returns {{ projectId: string, bucket: string, database: string, prefix: string }}
 */
export function resolveBackupConfig() {
  const projectId = (process.env.VITOR_BACKUP_PROJECT_ID || "").trim();
  const bucket = (process.env.VITOR_BACKUP_BUCKET || "").trim();
  const database = (process.env.VITOR_BACKUP_DATABASE ?? "(default)").trim();
  const prefix = (process.env.VITOR_BACKUP_PREFIX || "").trim();

  const errors = [];

  if (!projectId) {
    errors.push(
      "VITOR_BACKUP_PROJECT_ID is not set. Set it to the exact GCP project ID to export from."
    );
  }

  if (!bucket) {
    errors.push(
      "VITOR_BACKUP_BUCKET is not set. Set it to the GCS bucket URI (e.g. gs://my-vitor-backups)."
    );
  } else if (!bucket.startsWith("gs://")) {
    errors.push(
      `VITOR_BACKUP_BUCKET '${bucket}' is invalid. It must start with 'gs://' (e.g. gs://my-vitor-backups).`
    );
  } else if (bucket === "gs://") {
    errors.push("VITOR_BACKUP_BUCKET is empty after 'gs://'. Provide a valid bucket name.");
  }

  if (!database) {
    errors.push("VITOR_BACKUP_DATABASE is set but empty. Omit it or set it to '(default)'.");
  }

  if (errors.length > 0) {
    throw new BackupConfigError(
      `Backup configuration is missing or invalid:\n${errors.map((e) => `  • ${e}`).join("\n")}\n\n` +
        `Set the required environment variables before running this script.\n` +
        `See BACKUP-RESTORE.md § Backup Configuration for details.`
    );
  }

  return { projectId, bucket, database, prefix };
}

/**
 * Builds the GCS backup destination URI.
 *   gs://<bucket>/<prefix>/backup-<timestamp>
 * or if prefix is empty:
 *   gs://<bucket>/backup-<timestamp>
 */
export function buildBackupDestination(bucket, prefix, timestamp) {
  const cleanBucket = bucket.replace(/\/$/, "");
  const ts = timestamp || new Date().toISOString().replace(/[:.]/g, "-");
  if (prefix) {
    const cleanPrefix = prefix.replace(/^\//, "").replace(/\/$/, "");
    return `${cleanBucket}/${cleanPrefix}/backup-${ts}`;
  }
  return `${cleanBucket}/backup-${ts}`;
}

/**
 * Runs the gcloud firestore export command.
 *
 * Uses --async flag to initiate and retrieve the operation ID, then polls
 * operations describe until the export is DONE.
 *
 * Returns the raw stdout/stderr and exit code for verification.
 *
 * @param {{ projectId: string, destination: string, database: string }} opts
 * @returns {{ exitCode: number, stdout: string, stderr: string, operationId: string|null }}
 */
export function runGcloudExport({ projectId, destination, database, runner = defaultGcloudRunner }) {
  // Build export command. Never pass --collection-ids to guarantee full export.
  const exportArgs = [
    "firestore",
    "export",
    destination,
    `--project=${projectId}`,
    `--database=${database}`,
    "--format=json", // machine-readable output for operation ID parsing
  ];

  console.log("\n──────────────────────────────────────────────────────────────");
  console.log("Executing: gcloud " + exportArgs.join(" "));
  console.log("──────────────────────────────────────────────────────────────");

  const result = runner(exportArgs, { maxBuffer: 10 * 1024 * 1024 });

  const stdout = result.stdout || "";
  const stderr = result.stderr || "";
  const exitCode = result.status ?? 1;

  if (result.error) {
    // gcloud not found or spawn failed
    throw new BackupExecutionError(
      `Failed to execute gcloud command: ${result.error.message}\n` +
        `Ensure the Google Cloud SDK is installed and 'gcloud' is in PATH.\n` +
        `See: https://cloud.google.com/sdk/docs/install`
    );
  }

  // Attempt to parse operation ID from JSON output
  let operationId = null;
  try {
    const parsed = JSON.parse(stdout);
    // gcloud export returns an operation name like:
    // projects/<project>/databases/<database>/operations/<operationId>
    if (parsed && parsed.name) {
      operationId = parsed.name;
    }
  } catch {
    // Non-JSON output — operation ID unavailable; will be noted in manifest
  }

  return { exitCode, stdout, stderr, operationId };
}

/**
 * Verifies the completed export by calling `gcloud firestore operations describe`.
 *
 * Returns a verification result object with status COMPLETED, FAILED, or NOT_VERIFIED.
 *
 * The completed operation's outputUriPrefix must exactly equal `expectedDestination`.
 * A missing outputUriPrefix is NOT_VERIFIED; a mismatch is FAILED. An operation that
 * is done without error is never reported COMPLETED unless the destination matches.
 *
 * @param {{ operationId: string, projectId: string, database?: string, expectedDestination: string, runner?: Function }} opts
 * @returns {{ status: string, done: boolean|null, error: string|null, metadata: object|null, outputUriPrefix?: string|null }}
 */
export function verifyGcloudOperation({
  operationId,
  projectId,
  database = "(default)",
  expectedDestination,
  runner = defaultGcloudRunner,
}) {
  if (!expectedDestination) {
    return {
      status: BACKUP_STATUS.NOT_VERIFIED,
      done: null,
      error: "No expected backup destination supplied; cannot verify the operation output destination.",
      metadata: null,
    };
  }

  if (!operationId) {
    return {
      status: BACKUP_STATUS.NOT_VERIFIED,
      done: null,
      error: "Operation ID was not returned by the export command. Cannot verify via operations API.",
      metadata: null,
    };
  }

  const describeArgs = [
    "firestore",
    "operations",
    "describe",
    operationId,
    `--project=${projectId}`,
    `--database=${database}`,
    "--format=json",
  ];

  console.log("\nVerifying export operation: gcloud " + describeArgs.join(" "));

  const result = runner(describeArgs, { maxBuffer: 2 * 1024 * 1024 });

  if (result.error || result.status !== 0) {
    return {
      status: BACKUP_STATUS.NOT_VERIFIED,
      done: null,
      error: `gcloud operations describe failed (exit ${result.status}): ${result.stderr || result.error?.message || "unknown error"}`,
      metadata: null,
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(result.stdout || "{}");
  } catch {
    return {
      status: BACKUP_STATUS.NOT_VERIFIED,
      done: null,
      error: "Could not parse operations describe JSON response.",
      metadata: null,
    };
  }

  const done = parsed.done === true;
  const hasError = parsed.error != null;

  if (!done) {
    return {
      status: BACKUP_STATUS.NOT_VERIFIED,
      done: false,
      error: "Export operation is not yet DONE. Wait and re-verify.",
      metadata: parsed.metadata || null,
    };
  }

  if (hasError) {
    return {
      status: BACKUP_STATUS.FAILED,
      done: true,
      error: `Export operation completed with error: ${JSON.stringify(parsed.error)}`,
      metadata: parsed.metadata || null,
    };
  }

  // Verify the destination in metadata matches what was requested
  const outputUriPrefix = parsed.metadata?.outputUriPrefix || parsed.metadata?.common?.outputUriPrefix || null;

  if (!outputUriPrefix) {
    return {
      status: BACKUP_STATUS.NOT_VERIFIED,
      done: true,
      error: "Completed operation did not report an outputUriPrefix; cannot confirm where the export was written.",
      metadata: parsed.metadata || null,
      outputUriPrefix: null,
    };
  }

  if (normalizeGsUri(outputUriPrefix) !== normalizeGsUri(expectedDestination)) {
    return {
      status: BACKUP_STATUS.FAILED,
      done: true,
      error: `Operation outputUriPrefix '${outputUriPrefix}' does not match requested destination '${expectedDestination}'.`,
      metadata: parsed.metadata || null,
      outputUriPrefix,
    };
  }

  return {
    status: BACKUP_STATUS.COMPLETED,
    done: true,
    error: null,
    metadata: parsed.metadata || null,
    outputUriPrefix,
  };
}

/**
 * Builds and writes the backup manifest to the specified path.
 *
 * @param {{ config, destination, exportResult, verificationResult, manifestPath, timestamp }} opts
 * @returns {object} The manifest object
 */
export function writeBackupManifest({
  config,
  destination,
  exportResult,
  verificationResult,
  manifestPath,
  timestamp,
}) {
  const manifest = {
    schemaVersion: "6.1-gcloud",
    backupType: "gcloud-firestore-export",
    timestamp,
    projectId: config.projectId,
    database: config.database,
    backupDestination: destination,
    exportExitCode: exportResult.exitCode,
    operationId: exportResult.operationId,
    status: verificationResult.status,
    exportCompleted: verificationResult.status === BACKUP_STATUS.COMPLETED,
    verificationError: verificationResult.error || null,
    operationDone: verificationResult.done,
    outputUriPrefix: verificationResult.outputUriPrefix || null,
    operationMetadata: verificationResult.metadata || null,
    // Reminder: DO NOT include credentials, auth tokens or secrets here.
    notes: [
      "This manifest was generated by scripts/gcloud-backup-firestore.mjs.",
      "A COMPLETED status means the GCS export operation finished without errors.",
      "A FAILED status means the export completed with an error.",
      "A NOT_VERIFIED status means the operation metadata could not be retrieved — treat as FAILED.",
      "Restore procedure: see BACKUP-RESTORE.md § Restore Procedure.",
    ],
  };

  const manifestDir = path.dirname(manifestPath);
  if (!existsSync(manifestDir)) {
    mkdirSync(manifestDir, { recursive: true });
  }

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  return manifest;
}

/**
 * Main backup routine.
 * Validates config, runs the export, verifies the operation, and writes the manifest.
 *
 * @param {object} [opts]
 * @param {boolean} [opts.dryRun=false]  — Validate only; spawns nothing.
 * @param {boolean} [opts.confirm=false] — REQUIRED for a real export (enforced here, not just in the CLI).
 * @param {string} [opts.manifestOut]    — Path to write the manifest JSON.
 * @param {Function} [opts.runner]       — Injectable gcloud runner (tests).
 * @returns {object} The manifest object
 */
export async function runGcloudBackup({
  dryRun = false,
  confirm = false,
  manifestOut = null,
  runner = defaultGcloudRunner,
} = {}) {
  if (!dryRun && confirm !== true) {
    throw new BackupConfigError(
      "Refusing to execute a Firestore export without explicit confirmation (confirm: true / --confirm). " +
        "Use dryRun / --dry-run to validate configuration without exporting."
    );
  }

  const timestamp = new Date().toISOString();

  // 1. Resolve and validate configuration
  const config = resolveBackupConfig();
  const destination = buildBackupDestination(config.bucket, config.prefix, timestamp.replace(/[:.]/g, "-"));

  const defaultManifestPath = path.join(
    root,
    "backups",
    `gcloud-backup-manifest-${timestamp.replace(/[:.]/g, "-")}.json`
  );
  const manifestPath = manifestOut || defaultManifestPath;

  console.log("\n==================================================================");
  console.log("       VITor Firestore GCloud Export — Phase 6.1 Task 3          ");
  console.log("==================================================================");
  console.log(`  Timestamp      : ${timestamp}`);
  console.log(`  Project ID     : ${config.projectId}`);
  console.log(`  Database       : ${config.database}`);
  console.log(`  Bucket         : ${config.bucket}`);
  console.log(`  Destination    : ${destination}`);
  console.log(`  Manifest       : ${manifestPath}`);
  console.log(`  Mode           : ${dryRun ? "DRY-RUN (no export will be executed)" : "EXECUTE"}`);
  console.log("==================================================================\n");

  if (dryRun) {
    console.log("DRY-RUN: The following command would be executed:");
    console.log(`  gcloud firestore export ${destination} --project=${config.projectId} --database=${config.database} --format=json`);
    console.log("\nDRY-RUN: No export performed. Exiting.");

    const dryRunManifest = {
      schemaVersion: "6.1-gcloud",
      backupType: "gcloud-firestore-export",
      timestamp,
      projectId: config.projectId,
      database: config.database,
      backupDestination: destination,
      status: BACKUP_STATUS.NOT_VERIFIED,
      exportCompleted: false,
      verificationError: "Dry-run mode — no export was executed.",
      dryRun: true,
    };
    // Dry-run is non-mutating: a manifest file is only written when the caller
    // explicitly supplied an output path.
    if (manifestOut) {
      writeBackupManifest({
        config,
        destination,
        exportResult: { exitCode: null, operationId: null },
        verificationResult: {
          status: BACKUP_STATUS.NOT_VERIFIED,
          done: null,
          error: "Dry-run mode — no export was executed.",
          metadata: null,
        },
        manifestPath,
        timestamp,
      });
    }
    return dryRunManifest;
  }

  // 2. Execute export
  let exportResult;
  try {
    exportResult = runGcloudExport({
      projectId: config.projectId,
      destination,
      database: config.database,
      runner,
    });
  } catch (err) {
    // Write a FAILED manifest before rethrowing
    writeBackupManifest({
      config,
      destination,
      exportResult: { exitCode: null, operationId: null },
      verificationResult: {
        status: BACKUP_STATUS.FAILED,
        done: null,
        error: err.message,
        metadata: null,
      },
      manifestPath,
      timestamp,
    });
    throw err;
  }

  if (exportResult.exitCode !== 0) {
    writeBackupManifest({
      config,
      destination,
      exportResult,
      verificationResult: {
        status: BACKUP_STATUS.FAILED,
        done: false,
        error: `gcloud export exited with code ${exportResult.exitCode}: ${exportResult.stderr}`,
        metadata: null,
      },
      manifestPath,
      timestamp,
    });

    console.error(`\n❌ Export FAILED (exit code ${exportResult.exitCode}).`);
    console.error(`  stderr: ${exportResult.stderr}`);
    console.error(`  Manifest written to: ${manifestPath}`);
    throw new BackupExecutionError(
      `Firestore export failed with exit code ${exportResult.exitCode}.\n` +
        `Review the error above and the manifest at: ${manifestPath}\n` +
        `Do NOT rely on this backup until a COMPLETED export is verified.`
    );
  }

  // 3. Verify operation
  const verificationResult = verifyGcloudOperation({
    operationId: exportResult.operationId,
    projectId: config.projectId,
    database: config.database,
    expectedDestination: destination,
    runner,
  });

  // 4. Write manifest
  const manifest = writeBackupManifest({
    config,
    destination,
    exportResult,
    verificationResult,
    manifestPath,
    timestamp,
  });

  // 5. Report result
  console.log("\n==================================================================");
  if (verificationResult.status === BACKUP_STATUS.COMPLETED) {
    console.log(`✅ Backup COMPLETED successfully.`);
    console.log(`   Output URI    : ${verificationResult.outputUriPrefix || destination}`);
  } else if (verificationResult.status === BACKUP_STATUS.FAILED) {
    console.error(`❌ Backup FAILED.`);
    console.error(`   Error: ${verificationResult.error}`);
  } else {
    console.warn(`⚠️  Backup status: NOT_VERIFIED.`);
    console.warn(`   ${verificationResult.error}`);
    console.warn(`   Treat this as FAILED until manually confirmed.`);
  }
  console.log(`   Manifest      : ${manifestPath}`);
  console.log("==================================================================\n");

  if (verificationResult.status !== BACKUP_STATUS.COMPLETED) {
    throw new BackupExecutionError(
      `Backup status is '${verificationResult.status}' — not COMPLETED.\n` +
        `Reason: ${verificationResult.error}\n` +
        `Manifest: ${manifestPath}\n` +
        `Do NOT rely on this backup until a COMPLETED export is verified.`
    );
  }

  return manifest;
}

// ── Error classes ─────────────────────────────────────────────────────────────

export class BackupConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "BackupConfigError";
  }
}

export class BackupExecutionError extends Error {
  constructor(message) {
    super(message);
    this.name = "BackupExecutionError";
  }
}

// ── CLI entry point ───────────────────────────────────────────────────────────

if (isMain) {
  if (!isDryRun && !isConfirm) {
    console.error("\n❌ SAFETY ERROR: This script requires an explicit flag to run.");
    console.error("");
    console.error("  --dry-run   Validate configuration and print the gcloud command without executing.");
    console.error("  --confirm   Execute the actual Firestore export (requires VITOR_BACKUP_PROJECT_ID");
    console.error("              and VITOR_BACKUP_BUCKET to be set in the environment).");
    console.error("");
    console.error("Example (dry-run):");
    console.error("  VITOR_BACKUP_PROJECT_ID=my-project VITOR_BACKUP_BUCKET=gs://my-bucket \\");
    console.error("    node scripts/gcloud-backup-firestore.mjs --dry-run");
    console.error("");
    console.error("Example (execute):");
    console.error("  VITOR_BACKUP_PROJECT_ID=my-project VITOR_BACKUP_BUCKET=gs://my-bucket \\");
    console.error("    node scripts/gcloud-backup-firestore.mjs --confirm");
    console.error("");
    console.error("See BACKUP-RESTORE.md for the complete procedure before running.");
    process.exit(1);
  }

  runGcloudBackup({ dryRun: isDryRun, confirm: isConfirm, manifestOut: manifestOutArg }).catch((err) => {
    console.error(`\n❌ ${err.name || "Error"}: ${err.message}`);
    process.exit(1);
  });
}
