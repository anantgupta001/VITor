/**
 * Standalone Backup Verification Script for VITor — Phase 6.1 Task 3.
 *
 * Verifies an existing gcloud-firestore-export backup manifest and
 * optionally polls the GCS export operation for final confirmation.
 *
 * Rules:
 *   - Reads and validates a manifest written by gcloud-backup-firestore.mjs.
 *   - Confirms backup status is COMPLETED (not FAILED or NOT_VERIFIED).
 *   - Confirms project ID and backup destination match the requested values.
 *   - Confirms the operation is marked DONE without errors.
 *   - Re-runs gcloud operations describe if an operationId is present.
 *   - Updates the manifest with the final verification result.
 *   - Exits non-zero on any failure.
 *
 * Usage:
 *   node scripts/verify-backup.mjs --manifest ./backups/gcloud-backup-manifest-<ts>.json
 *
 *   # Also re-verify the live GCS operation (requires gcloud access):
 *   node scripts/verify-backup.mjs --manifest ./backups/gcloud-backup-manifest-<ts>.json \
 *     --re-verify-operation
 *
 * DO NOT use this script to verify a backup before restoring to production.
 * See BACKUP-RESTORE.md § Restore Procedure for the full sequence.
 */

import { readFileSync, writeFileSync } from "fs";
import path from "path";
import { pathToFileURL } from "url";
import {
  BACKUP_STATUS,
  verifyGcloudOperation,
  normalizeGsUri,
} from "./gcloud-backup-firestore.mjs";

export const SUPPORTED_SCHEMA_VERSIONS = Object.freeze(["6.1-gcloud"]);
export const EXPECTED_BACKUP_TYPE = "gcloud-firestore-export";

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

const args = process.argv.slice(2);
const manifestIndex = args.indexOf("--manifest");
const manifestArg =
  manifestIndex !== -1 && args[manifestIndex + 1]
    ? path.resolve(args[manifestIndex + 1])
    : null;
const shouldReVerifyOperation = args.includes("--re-verify-operation");
const shouldRequireExpected = args.includes("--require-expected");
const argValue = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : undefined;
};
const cliExpected = {
  projectId: argValue("--expect-project"),
  database: argValue("--expect-database"),
  backupDestination: argValue("--expect-destination"),
};

// ── Verification logic ────────────────────────────────────────────────────────

/**
 * Verifies a backup manifest file against the documented criteria.
 *
 * Checks performed (in order):
 *   1. Manifest file exists and is valid JSON.
 *   2. Required fields are present (schemaVersion, timestamp, projectId, database,
 *      backupDestination, status, exportCompleted).
 *   3. Status is COMPLETED (not FAILED or NOT_VERIFIED).
 *   4. exportCompleted is true.
 *   5. operationDone is true (if present and not a dry-run).
 *   6. No verificationError is recorded.
 *   7. backupDestination is a valid gs:// URI.
 *   8. projectId is a non-empty string.
 *   9. Optionally re-runs gcloud operations describe if operationId is present.
 *
 * @param {string} manifestPath — Absolute path to the manifest JSON file.
 * @param {{ reVerifyOperation?: boolean }} opts
 * @returns {{ passed: boolean, checks: Array<{name: string, passed: boolean, detail: string}>, manifest: object }}
 */
export function verifyBackupManifest(
  manifestPath,
  {
    reVerifyOperation = false,
    expected = {},
    requireExpected = false,
    requireIndependentVerification = false,
    runner,
  } = {}
) {
  const checks = [];

  // ── Check 1: File exists and is valid JSON ───────────────────────────────
  let manifest;
  try {
    const raw = readFileSync(manifestPath, "utf-8");
    manifest = JSON.parse(raw);
    checks.push({
      name: "manifest_readable",
      passed: true,
      detail: `Manifest read and parsed from: ${manifestPath}`,
    });
  } catch (err) {
    checks.push({
      name: "manifest_readable",
      passed: false,
      detail: `Cannot read or parse manifest: ${err.message}`,
    });
    return { passed: false, checks, manifest: null };
  }

  // ── Check 2: Required fields present ────────────────────────────────────
  const requiredFields = [
    "schemaVersion",
    "backupType",
    "timestamp",
    "projectId",
    "database",
    "backupDestination",
    "operationId",
    "operationDone",
    "status",
    "exportCompleted",
  ];
  const missingFields = requiredFields.filter(
    (f) => manifest[f] === undefined || manifest[f] === null || manifest[f] === ""
  );
  checks.push({
    name: "required_fields_present",
    passed: missingFields.length === 0,
    detail:
      missingFields.length === 0
        ? "All required fields present."
        : `Missing fields: ${missingFields.join(", ")}`,
  });

  if (missingFields.length > 0) {
    return { passed: false, checks, manifest };
  }

  // ── Check 2b: schema version and backup type ────────────────────────────
  const schemaOk = SUPPORTED_SCHEMA_VERSIONS.includes(manifest.schemaVersion);
  checks.push({
    name: "schema_version_supported",
    passed: schemaOk,
    detail: schemaOk
      ? `Schema version ${manifest.schemaVersion} is supported.`
      : `Unsupported schemaVersion '${manifest.schemaVersion}'. Supported: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}`,
  });
  const typeOk = manifest.backupType === EXPECTED_BACKUP_TYPE;
  checks.push({
    name: "backup_type_valid",
    passed: typeOk,
    detail: typeOk
      ? `Backup type is ${EXPECTED_BACKUP_TYPE}.`
      : `Unexpected backupType '${manifest.backupType}' — expected ${EXPECTED_BACKUP_TYPE}.`,
  });

  // ── Check 2c: independent expectations (NOT the manifest's own claims) ──
  const expectations = [
    ["expected_project_id", "projectId", expected.projectId, (v) => v],
    ["expected_database", "database", expected.database, (v) => v],
    ["expected_destination", "backupDestination", expected.backupDestination, normalizeGsUri],
  ];
  for (const [name, field, want, norm] of expectations) {
    if (want === undefined || want === null || want === "") continue;
    const ok = norm(manifest[field]) === norm(want);
    checks.push({
      name,
      passed: ok,
      detail: ok
        ? `Manifest ${field} matches the expected value '${want}'.`
        : `Manifest ${field} is '${manifest[field]}' but expected '${want}'.`,
    });
  }

  // ── Check 2d: require independent expectations when requested ─────────
  if (requireExpected || requireIndependentVerification) {
    const requiredKeys = Array.isArray(requireExpected)
      ? requireExpected
      : ["projectId", "database", "backupDestination"];
    const missingExpected = requiredKeys.filter(
      (k) => expected[k] === undefined || expected[k] === null || expected[k] === ""
    );
    if (missingExpected.length > 0) {
      checks.push({
        name: "independent_expectations_provided",
        passed: false,
        detail: `Missing independent expected values: ${missingExpected.join(", ")}. Cannot verify manifest without independent values.`,
      });
    }
  }

  // ── Check 3: Status is COMPLETED ────────────────────────────────────────
  checks.push({
    name: "status_completed",
    passed: manifest.status === BACKUP_STATUS.COMPLETED,
    detail:
      manifest.status === BACKUP_STATUS.COMPLETED
        ? "Status is COMPLETED."
        : `Status is '${manifest.status}' — expected COMPLETED. ${manifest.verificationError || ""}`,
  });

  // ── Check 4: exportCompleted is true ────────────────────────────────────
  checks.push({
    name: "export_completed_flag",
    passed: manifest.exportCompleted === true,
    detail:
      manifest.exportCompleted === true
        ? "exportCompleted flag is true."
        : `exportCompleted is '${manifest.exportCompleted}' — expected true.`,
  });

  // ── Check 5: operationDone is true (if present, non-dry-run) ────────────
  checks.push({
    name: "operation_done",
    passed: manifest.operationDone === true,
    detail:
      manifest.operationDone === true
        ? "operationDone is true."
        : "operationDone is not true — the export operation did not complete.",
  });

  // ── Check 5b: recorded output URI matches the backup destination ────────
  const uriOk =
    !!manifest.outputUriPrefix &&
    normalizeGsUri(manifest.outputUriPrefix) === normalizeGsUri(manifest.backupDestination);
  checks.push({
    name: "output_uri_matches_destination",
    passed: uriOk,
    detail: uriOk
      ? "Recorded outputUriPrefix matches backupDestination."
      : `outputUriPrefix '${manifest.outputUriPrefix}' is missing or differs from backupDestination '${manifest.backupDestination}'.`,
  });

  // ── Check 6: No recorded verification error ──────────────────────────────
  checks.push({
    name: "no_verification_error",
    passed: !manifest.verificationError,
    detail: manifest.verificationError
      ? `Recorded verificationError: ${manifest.verificationError}`
      : "No verificationError recorded.",
  });

  // ── Check 7: backupDestination is a valid gs:// URI ──────────────────────
  const destOk =
    typeof manifest.backupDestination === "string" &&
    manifest.backupDestination.startsWith("gs://") &&
    manifest.backupDestination.length > 5;
  checks.push({
    name: "backup_destination_valid",
    passed: destOk,
    detail: destOk
      ? `Backup destination: ${manifest.backupDestination}`
      : `Invalid backup destination: '${manifest.backupDestination}'`,
  });

  // ── Check 8: projectId is non-empty ─────────────────────────────────────
  const projOk =
    typeof manifest.projectId === "string" && manifest.projectId.trim().length > 0;
  checks.push({
    name: "project_id_present",
    passed: projOk,
    detail: projOk
      ? `Project ID: ${manifest.projectId}`
      : "projectId is missing or empty.",
  });

  // ── Check 9: (Optional) Re-run gcloud operations describe ───────────────
  // Independent expected values take precedence over manifest self-reports,
  // and the live output destination must equal the manifest's backupDestination.
  if (reVerifyOperation) {
    const liveResult = verifyGcloudOperation({
      operationId: manifest.operationId,
      projectId: expected.projectId || manifest.projectId,
      database: expected.database || manifest.database,
      expectedDestination: expected.backupDestination || manifest.backupDestination,
      ...(runner ? { runner } : {}),
    });
    const sameAsManifest =
      !!liveResult.outputUriPrefix &&
      normalizeGsUri(liveResult.outputUriPrefix) === normalizeGsUri(manifest.backupDestination);
    const livePassed = liveResult.status === BACKUP_STATUS.COMPLETED && sameAsManifest;
    checks.push({
      name: "live_operation_re_verified",
      passed: livePassed,
      detail: livePassed
        ? `Live operation re-verified: COMPLETED. outputUriPrefix: ${liveResult.outputUriPrefix}`
        : `Live operation re-verify result: ${liveResult.status}. ${liveResult.error || "Live output destination differs from manifest backupDestination."}`,
    });
  }

  const allPassed = checks.every((c) => c.passed);
  const independentlyChecked =
    reVerifyOperation ||
    Boolean(expected.projectId || expected.database || expected.backupDestination);
  return { passed: allPassed, checks, manifest, independentlyChecked };
}

/**
 * Writes an updated manifest with verification results appended.
 */
export function appendVerificationToManifest(manifestPath, verificationResult) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
  } catch {
    return; // Cannot update if unreadable
  }

  manifest.lastVerification = {
    verifiedAt: new Date().toISOString(),
    passed: verificationResult.passed,
    checks: verificationResult.checks,
  };

  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

// ── CLI entry point ───────────────────────────────────────────────────────────

if (isMain) {
  if (!manifestArg) {
    console.error("\n❌ Usage: node scripts/verify-backup.mjs --manifest <path-to-manifest.json>");
    console.error("\n  Options:");
    console.error("    --manifest <path>           Path to the gcloud backup manifest JSON.");
    console.error("    --re-verify-operation       Also re-run gcloud operations describe for live confirmation.");
    console.error("    --expect-project <id>       Independently expected project ID.");
    console.error("    --expect-database <id>      Independently expected database ID.");
    console.error("    --expect-destination <uri>  Independently expected gs:// backup destination.");
    process.exit(1);
  }

  console.log("\n==================================================================");
  console.log("       VITor Backup Verification — Phase 6.1 Task 3              ");
  console.log("==================================================================");
  console.log(`  Manifest: ${manifestArg}`);
  console.log(`  Re-verify live operation: ${shouldReVerifyOperation ? "YES" : "NO"}`);
  console.log("==================================================================\n");

  const result = verifyBackupManifest(manifestArg, {
    reVerifyOperation: shouldReVerifyOperation,
    expected: cliExpected,
    requireExpected: shouldRequireExpected,
  });

  console.log("\n── Verification Checks ──────────────────────────────────────────");
  for (const check of result.checks) {
    const symbol = check.passed ? "✅" : "❌";
    console.log(`  ${symbol} [${check.name}] ${check.detail}`);
  }

  // Update manifest with verification results
  appendVerificationToManifest(manifestArg, result);

  console.log("\n──────────────────────────────────────────────────────────────────");
  if (result.passed && !result.independentlyChecked) {
    console.warn("⚠️  Checks passed against the manifest's OWN claims only. Re-run with");
    console.warn("   --expect-project/--expect-database/--expect-destination and --re-verify-operation");
    console.warn("   before treating this as independent evidence.");
  }
  if (result.passed) {
    console.log("✅ BACKUP VERIFIED — All checks passed.");
    console.log("   This backup is a verified COMPLETED export.");
    console.log("   See BACKUP-RESTORE.md for the restore procedure.");
  } else {
    console.error("❌ BACKUP VERIFICATION FAILED — One or more checks failed.");
    console.error("   Do NOT rely on this backup until a COMPLETED export is verified.");
    console.error("   See BACKUP-RESTORE.md for next steps.");
  }
  console.log("==================================================================\n");

  process.exit(result.passed ? 0 : 1);
}
