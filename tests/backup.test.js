/**
 * Backup, Restore & Release Safety Tests — VITor Phase 6.1 Task 3.
 *
 * Tests for:
 *   - Missing backup configuration (VITOR_BACKUP_PROJECT_ID, VITOR_BACKUP_BUCKET).
 *   - Incorrect or ambiguous project configuration.
 *   - Export failure handling (non-zero exit code, spawn error).
 *   - Incomplete export detection (NOT_VERIFIED, operation not done).
 *   - Backup manifest creation and status (COMPLETED, FAILED, NOT_VERIFIED).
 *   - Verification failure handling.
 *   - Restore safety checks preventing production targets.
 *   - Recovery procedure validation.
 *
 * NOTE: These are unit tests only. No real gcloud commands are executed.
 * No real Firestore database is accessed. No production backup is performed.
 * See BACKUP-RESTORE.md for the manual restore verification procedure.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import os from "os";

import {
  resolveBackupConfig,
  buildBackupDestination,
  runGcloudExport,
  verifyGcloudOperation,
  writeBackupManifest,
  runGcloudBackup,
  BACKUP_STATUS,
  BackupConfigError,
  BackupExecutionError,
} from "../scripts/gcloud-backup-firestore.mjs";

import {
  verifyBackupManifest,
  appendVerificationToManifest,
} from "../scripts/verify-backup.mjs";

// ── Helpers ───────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

/** Saves and restores environment variables around a test body. */
function withEnv(overrides, fn) {
  return async (t) => {
    const saved = {};
    const toDelete = [];

    for (const [key, value] of Object.entries(overrides)) {
      saved[key] = process.env[key];
      if (value === undefined) {
        toDelete.push(key);
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }

    try {
      await fn(t);
    } finally {
      for (const [key, value] of Object.entries(saved)) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
      for (const key of toDelete) {
        delete process.env[key];
      }
    }
  };
}

/** Creates a temp directory for test artifacts. */
function makeTempDir(label) {
  const dir = path.join(os.tmpdir(), `vitor-backup-test-${label}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

/** Writes a minimal valid COMPLETED gcloud manifest to a temp file. */
function writeCompletedManifest(dir, overrides = {}) {
  const manifest = {
    schemaVersion: "6.1-gcloud",
    backupType: "gcloud-firestore-export",
    timestamp: new Date().toISOString(),
    projectId: "my-vitor-project",
    database: "(default)",
    backupDestination: "gs://my-vitor-backups/backup-2026",
    exportExitCode: 0,
    operationId: "projects/my-vitor-project/databases/(default)/operations/abc123",
    status: BACKUP_STATUS.COMPLETED,
    exportCompleted: true,
    verificationError: null,
    operationDone: true,
    outputUriPrefix: "gs://my-vitor-backups/backup-2026",
    ...overrides,
  };
  const p = path.join(dir, "manifest.json");
  writeFileSync(p, JSON.stringify(manifest, null, 2));
  return { manifest, path: p };
}

// =============================================================================
// 1. Missing Backup Configuration
// =============================================================================

test("BackupConfig — rejects when VITOR_BACKUP_PROJECT_ID is missing", withEnv(
  { VITOR_BACKUP_PROJECT_ID: undefined, VITOR_BACKUP_BUCKET: "gs://my-bucket" },
  () => {
    assert.throws(
      () => resolveBackupConfig(),
      (err) => {
        assert.ok(err instanceof BackupConfigError, "Should be BackupConfigError");
        assert.ok(
          err.message.includes("VITOR_BACKUP_PROJECT_ID is not set"),
          `Expected project ID error, got: ${err.message}`
        );
        return true;
      }
    );
  }
));

test("BackupConfig — rejects when VITOR_BACKUP_BUCKET is missing", withEnv(
  { VITOR_BACKUP_PROJECT_ID: "my-project", VITOR_BACKUP_BUCKET: undefined },
  () => {
    assert.throws(
      () => resolveBackupConfig(),
      (err) => {
        assert.ok(err instanceof BackupConfigError);
        assert.ok(err.message.includes("VITOR_BACKUP_BUCKET is not set"));
        return true;
      }
    );
  }
));

test("BackupConfig — rejects when both VITOR_BACKUP_PROJECT_ID and VITOR_BACKUP_BUCKET are missing", withEnv(
  { VITOR_BACKUP_PROJECT_ID: undefined, VITOR_BACKUP_BUCKET: undefined },
  () => {
    assert.throws(
      () => resolveBackupConfig(),
      (err) => {
        assert.ok(err instanceof BackupConfigError);
        assert.ok(err.message.includes("VITOR_BACKUP_PROJECT_ID is not set"));
        assert.ok(err.message.includes("VITOR_BACKUP_BUCKET is not set"));
        return true;
      }
    );
  }
));

test("BackupConfig — rejects when VITOR_BACKUP_PROJECT_ID is empty string", withEnv(
  { VITOR_BACKUP_PROJECT_ID: "   ", VITOR_BACKUP_BUCKET: "gs://my-bucket" },
  () => {
    assert.throws(
      () => resolveBackupConfig(),
      (err) => {
        assert.ok(err instanceof BackupConfigError);
        assert.ok(err.message.includes("VITOR_BACKUP_PROJECT_ID is not set"));
        return true;
      }
    );
  }
));

test("BackupConfig — rejects when VITOR_BACKUP_BUCKET does not start with gs://", withEnv(
  { VITOR_BACKUP_PROJECT_ID: "my-project", VITOR_BACKUP_BUCKET: "s3://wrong-bucket" },
  () => {
    assert.throws(
      () => resolveBackupConfig(),
      (err) => {
        assert.ok(err instanceof BackupConfigError);
        assert.ok(err.message.includes("must start with 'gs://'"));
        return true;
      }
    );
  }
));

test("BackupConfig — rejects when VITOR_BACKUP_BUCKET is just 'gs://'", withEnv(
  { VITOR_BACKUP_PROJECT_ID: "my-project", VITOR_BACKUP_BUCKET: "gs://" },
  () => {
    assert.throws(
      () => resolveBackupConfig(),
      (err) => {
        assert.ok(err instanceof BackupConfigError);
        assert.ok(err.message.includes("empty after 'gs://'"));
        return true;
      }
    );
  }
));

test("BackupConfig — rejects when VITOR_BACKUP_DATABASE is empty string (explicitly set)", withEnv(
  {
    VITOR_BACKUP_PROJECT_ID: "my-project",
    VITOR_BACKUP_BUCKET: "gs://my-bucket",
    VITOR_BACKUP_DATABASE: "",
  },
  () => {
    assert.throws(
      () => resolveBackupConfig(),
      (err) => {
        assert.ok(err instanceof BackupConfigError);
        assert.ok(err.message.includes("VITOR_BACKUP_DATABASE is set but empty"));
        return true;
      }
    );
  }
));

test("BackupConfig — succeeds with valid project ID and bucket", withEnv(
  {
    VITOR_BACKUP_PROJECT_ID: "vitor-staging-2026",
    VITOR_BACKUP_BUCKET: "gs://vitor-backups-staging",
    VITOR_BACKUP_DATABASE: undefined,
    VITOR_BACKUP_PREFIX: undefined,
  },
  () => {
    const config = resolveBackupConfig();
    assert.equal(config.projectId, "vitor-staging-2026");
    assert.equal(config.bucket, "gs://vitor-backups-staging");
    assert.equal(config.database, "(default)");
    assert.equal(config.prefix, "");
  }
));

test("BackupConfig — includes optional prefix when VITOR_BACKUP_PREFIX is set", withEnv(
  {
    VITOR_BACKUP_PROJECT_ID: "vitor-staging",
    VITOR_BACKUP_BUCKET: "gs://vitor-backups",
    VITOR_BACKUP_DATABASE: undefined,
    VITOR_BACKUP_PREFIX: "prod-exports",
  },
  () => {
    const config = resolveBackupConfig();
    assert.equal(config.prefix, "prod-exports");
  }
));

// =============================================================================
// 2. Incorrect / Ambiguous Project Configuration
// =============================================================================

test("BackupDestination — includes project timestamp in GCS path", () => {
  const dest = buildBackupDestination("gs://my-bucket", "", "2026-11-15T22-00-00-000Z");
  assert.ok(dest.startsWith("gs://my-bucket/backup-2026-11-15T22-00-00-000Z"), dest);
});

test("BackupDestination — includes prefix in GCS path", () => {
  const dest = buildBackupDestination("gs://my-bucket", "prod/exports", "2026-11-15T22-00-00-000Z");
  assert.ok(dest.startsWith("gs://my-bucket/prod/exports/backup-"), dest);
});

test("BackupDestination — strips trailing slash from bucket", () => {
  const dest = buildBackupDestination("gs://my-bucket/", "", "2026-11-15");
  assert.ok(dest.startsWith("gs://my-bucket/backup-"), `Got: ${dest}`);
  assert.ok(!dest.startsWith("gs://my-bucket//"), `Double-slash found in: ${dest}`);
});

const VALID_ENV = {
  VITOR_BACKUP_PROJECT_ID: "vitor-staging",
  VITOR_BACKUP_BUCKET: "gs://vitor-backups-staging",
  VITOR_BACKUP_DATABASE: undefined,
  VITOR_BACKUP_PREFIX: undefined,
};

/**
 * Builds a fake gcloud runner. `handlers.export` / `handlers.describe` return
 * { status, stdout, stderr, error }. All invocations are recorded in `calls`.
 * No real process is ever spawned.
 */
function fakeRunner(handlers) {
  const calls = [];
  const runner = (cmdArgs) => {
    calls.push(cmdArgs);
    const kind = cmdArgs[1] === "export" ? "export" : "describe";
    const handler = handlers[kind];
    if (!handler) throw new Error(`Unexpected gcloud call: ${cmdArgs.join(" ")}`);
    return handler(cmdArgs);
  };
  runner.calls = calls;
  return runner;
}

const OP_ID = "projects/vitor-staging/databases/(default)/operations/op-1";
const exportOk = () => ({ status: 0, stdout: JSON.stringify({ name: OP_ID }), stderr: "" });
const describeDone = (outputUriPrefix, extra = {}) => () => ({
  status: 0,
  stderr: "",
  stdout: JSON.stringify({
    done: true,
    metadata: outputUriPrefix === undefined ? {} : { outputUriPrefix },
    ...extra,
  }),
});

/** Runs runGcloudBackup with an injected runner and returns { error, manifest, runner, manifestOut }. */
async function runBackup(handlers, { describeUri } = {}) {
  const tmpDir = makeTempDir("run");
  const manifestOut = path.join(tmpDir, "m.json");
  const runner = fakeRunner(
    typeof handlers === "function" ? handlers(manifestOut) : handlers
  );
  let error = null;
  try {
    await runGcloudBackup({ confirm: true, manifestOut, runner });
  } catch (e) {
    error = e;
  }
  const manifest = existsSync(manifestOut) ? JSON.parse(readFileSync(manifestOut, "utf-8")) : null;
  return { error, manifest, runner, tmpDir, describeUri };
}

// =============================================================================
// 3. Export Failure Handling (injected runner — no real gcloud)
// =============================================================================

test("runGcloudBackup — non-zero export exit writes FAILED manifest and throws", withEnv(VALID_ENV, async () => {
  const { error, manifest, runner, tmpDir } = await runBackup({
    export: () => ({ status: 1, stdout: "", stderr: "ERROR: Permission denied." }),
  });
  assert.ok(error instanceof BackupExecutionError);
  assert.equal(manifest.status, BACKUP_STATUS.FAILED);
  assert.equal(manifest.exportCompleted, false);
  assert.ok(manifest.verificationError.includes("Permission denied"));
  assert.equal(runner.calls.length, 1, "describe must not run after a failed export");
  rmSync(tmpDir, { recursive: true, force: true });
}));

test("runGcloudBackup — gcloud spawn error writes FAILED manifest and throws", withEnv(VALID_ENV, async () => {
  const { error, manifest, tmpDir } = await runBackup({
    export: () => ({ status: null, stdout: "", stderr: "", error: new Error("spawn gcloud ENOENT") }),
  });
  assert.ok(error instanceof BackupExecutionError);
  assert.ok(error.message.includes("Failed to execute gcloud command"));
  assert.equal(manifest.status, BACKUP_STATUS.FAILED);
  rmSync(tmpDir, { recursive: true, force: true });
}));

test("runGcloudExport — never passes --collection-ids (full database export)", () => {
  const runner = fakeRunner({ export: exportOk });
  const res = runGcloudExport({
    projectId: "vitor-staging",
    destination: "gs://b/backup-1",
    database: "(default)",
    runner,
  });
  assert.equal(res.operationId, OP_ID);
  assert.ok(!runner.calls[0].some((a) => a.startsWith("--collection-ids")));
  assert.ok(runner.calls[0].includes("--project=vitor-staging"));
});

test("runGcloudBackup — refuses real export without confirm, spawns nothing", withEnv(VALID_ENV, async () => {
  const runner = fakeRunner({});
  await assert.rejects(
    () => runGcloudBackup({ runner }),
    (err) => err instanceof BackupConfigError && err.message.includes("explicit confirmation")
  );
  await assert.rejects(() => runGcloudBackup({ confirm: "yes", runner }), BackupConfigError);
  assert.equal(runner.calls.length, 0);
}));

test("runGcloudBackup — dry-run spawns nothing and writes no file without manifestOut", withEnv(VALID_ENV, async () => {
  const runner = fakeRunner({});
  const result = await runGcloudBackup({ dryRun: true, runner });
  assert.equal(runner.calls.length, 0);
  assert.equal(result.status, BACKUP_STATUS.NOT_VERIFIED);
  assert.equal(result.dryRun, true);
}));

// =============================================================================
// 4. Incomplete Export / Output Destination Detection
// =============================================================================

test("runGcloudBackup — operation not done yields NOT_VERIFIED, not COMPLETED", withEnv(VALID_ENV, async () => {
  const { error, manifest, tmpDir } = await runBackup({
    export: exportOk,
    describe: () => ({ status: 0, stderr: "", stdout: JSON.stringify({ done: false, metadata: {} }) }),
  });
  assert.ok(error instanceof BackupExecutionError);
  assert.equal(manifest.status, BACKUP_STATUS.NOT_VERIFIED);
  assert.equal(manifest.exportCompleted, false);
  rmSync(tmpDir, { recursive: true, force: true });
}));

test("runGcloudBackup — operation done with error yields FAILED", withEnv(VALID_ENV, async () => {
  const { manifest, tmpDir } = await runBackup({
    export: exportOk,
    describe: () => ({ status: 0, stderr: "", stdout: JSON.stringify({ done: true, error: { code: 13 } }) }),
  });
  assert.equal(manifest.status, BACKUP_STATUS.FAILED);
  rmSync(tmpDir, { recursive: true, force: true });
}));

test("runGcloudBackup — missing operation ID yields NOT_VERIFIED", withEnv(VALID_ENV, async () => {
  const { error, manifest, runner, tmpDir } = await runBackup({
    export: () => ({ status: 0, stdout: "not json", stderr: "" }),
  });
  assert.ok(error instanceof BackupExecutionError);
  assert.equal(manifest.status, BACKUP_STATUS.NOT_VERIFIED);
  assert.equal(manifest.operationId, null);
  assert.equal(runner.calls.length, 1);
  rmSync(tmpDir, { recursive: true, force: true });
}));

test("runGcloudBackup — missing outputUriPrefix yields NOT_VERIFIED, never COMPLETED", withEnv(VALID_ENV, async () => {
  const { error, manifest, tmpDir } = await runBackup({
    export: exportOk,
    describe: describeDone(undefined),
  });
  assert.ok(error instanceof BackupExecutionError);
  assert.equal(manifest.status, BACKUP_STATUS.NOT_VERIFIED);
  assert.equal(manifest.exportCompleted, false);
  rmSync(tmpDir, { recursive: true, force: true });
}));

test("runGcloudBackup — mismatched outputUriPrefix yields FAILED, never COMPLETED", withEnv(VALID_ENV, async () => {
  const { error, manifest, tmpDir } = await runBackup({
    export: exportOk,
    describe: describeDone("gs://some-other-bucket/backup-x"),
  });
  assert.ok(error instanceof BackupExecutionError);
  assert.equal(manifest.status, BACKUP_STATUS.FAILED);
  assert.equal(manifest.exportCompleted, false);
  assert.ok(manifest.verificationError.includes("does not match requested destination"));
  rmSync(tmpDir, { recursive: true, force: true });
}));

test("runGcloudBackup — matching outputUriPrefix yields COMPLETED manifest that the verifier accepts", withEnv(VALID_ENV, async () => {
  const tmpDir = makeTempDir("happy");
  const manifestOut = path.join(tmpDir, "m.json");
  const runner = fakeRunner({
    export: exportOk,
    describe: (cmdArgs) => {
      // Echo back the destination the export was actually requested with.
      const dest = runner.calls[0][2];
      assert.ok(cmdArgs.includes("--database=(default)"));
      return describeDone(dest)();
    },
  });
  const manifest = await runGcloudBackup({ confirm: true, manifestOut, runner });
  assert.equal(manifest.status, BACKUP_STATUS.COMPLETED);
  assert.equal(manifest.operationDone, true);
  assert.equal(manifest.operationId, OP_ID);
  const verified = verifyBackupManifest(manifestOut, {
    expected: {
      projectId: "vitor-staging",
      database: "(default)",
      backupDestination: manifest.backupDestination,
    },
  });
  assert.equal(verified.passed, true, verified.checks.filter((c) => !c.passed).map((c) => c.name).join(","));
  rmSync(tmpDir, { recursive: true, force: true });
}));

test("verifyGcloudOperation — returns NOT_VERIFIED when operationId is null or empty", () => {
  for (const operationId of [null, ""]) {
    const result = verifyGcloudOperation({
      operationId,
      projectId: "my-project",
      expectedDestination: "gs://b/x",
      runner: fakeRunner({}),
    });
    assert.equal(result.status, BACKUP_STATUS.NOT_VERIFIED);
    assert.ok(result.error.includes("Operation ID was not returned"));
  }
});

test("verifyGcloudOperation — NOT_VERIFIED when expectedDestination is not supplied", () => {
  const result = verifyGcloudOperation({
    operationId: OP_ID,
    projectId: "p",
    runner: fakeRunner({ describe: describeDone("gs://b/x") }),
  });
  assert.equal(result.status, BACKUP_STATUS.NOT_VERIFIED);
});

test("verifyGcloudOperation — trailing slash is the only tolerated URI difference", () => {
  const ok = verifyGcloudOperation({
    operationId: OP_ID,
    projectId: "p",
    expectedDestination: "gs://b/x",
    runner: fakeRunner({ describe: describeDone("gs://b/x/") }),
  });
  assert.equal(ok.status, BACKUP_STATUS.COMPLETED);
  const bad = verifyGcloudOperation({
    operationId: OP_ID,
    projectId: "p",
    expectedDestination: "gs://b/x",
    runner: fakeRunner({ describe: describeDone("gs://b/x2") }),
  });
  assert.equal(bad.status, BACKUP_STATUS.FAILED);
});

// =============================================================================
// 5. Backup Manifest Creation and Status
// =============================================================================

test("writeBackupManifest — writes COMPLETED manifest with all required fields", () => {
  const tmpDir = makeTempDir("manifest-completed");
  const manifestPath = path.join(tmpDir, "manifest.json");
  const timestamp = new Date().toISOString();

  const config = {
    projectId: "vitor-staging",
    database: "(default)",
    bucket: "gs://vitor-staging-backups",
    prefix: "",
  };

  const manifest = writeBackupManifest({
    config,
    destination: "gs://vitor-staging-backups/backup-2026",
    exportResult: { exitCode: 0, operationId: "projects/vitor-staging/databases/(default)/operations/op1" },
    verificationResult: {
      status: BACKUP_STATUS.COMPLETED,
      done: true,
      error: null,
      metadata: { outputUriPrefix: "gs://vitor-staging-backups/backup-2026" },
      outputUriPrefix: "gs://vitor-staging-backups/backup-2026",
    },
    manifestPath,
    timestamp,
  });

  assert.equal(manifest.status, BACKUP_STATUS.COMPLETED);
  assert.equal(manifest.exportCompleted, true);
  assert.equal(manifest.projectId, "vitor-staging");
  assert.equal(manifest.database, "(default)");
  assert.ok(manifest.backupDestination.startsWith("gs://"));
  assert.equal(manifest.verificationError, null);

  // Confirm it's on disk
  const written = JSON.parse(readFileSync(manifestPath, "utf-8"));
  assert.equal(written.status, BACKUP_STATUS.COMPLETED);
  assert.equal(written.exportCompleted, true);
  assert.equal(written.schemaVersion, "6.1-gcloud");
  assert.equal(written.backupType, "gcloud-firestore-export");
  assert.ok(Array.isArray(written.notes));

  rmSync(tmpDir, { recursive: true, force: true });
});

test("writeBackupManifest — writes FAILED manifest when export had error", () => {
  const tmpDir = makeTempDir("manifest-failed");
  const manifestPath = path.join(tmpDir, "manifest.json");

  const manifest = writeBackupManifest({
    config: { projectId: "vitor-staging", database: "(default)", bucket: "gs://my-bucket", prefix: "" },
    destination: "gs://my-bucket/backup-fail",
    exportResult: { exitCode: 1, operationId: null },
    verificationResult: {
      status: BACKUP_STATUS.FAILED,
      done: false,
      error: "Export failed: insufficient permissions.",
      metadata: null,
    },
    manifestPath,
    timestamp: new Date().toISOString(),
  });

  assert.equal(manifest.status, BACKUP_STATUS.FAILED);
  assert.equal(manifest.exportCompleted, false);
  assert.ok(manifest.verificationError.includes("insufficient permissions"));

  rmSync(tmpDir, { recursive: true, force: true });
});

test("writeBackupManifest — writes NOT_VERIFIED manifest when operation ID was absent", () => {
  const tmpDir = makeTempDir("manifest-not-verified");
  const manifestPath = path.join(tmpDir, "manifest.json");

  const manifest = writeBackupManifest({
    config: { projectId: "vitor-staging", database: "(default)", bucket: "gs://my-bucket", prefix: "" },
    destination: "gs://my-bucket/backup-no-op-id",
    exportResult: { exitCode: 0, operationId: null },
    verificationResult: {
      status: BACKUP_STATUS.NOT_VERIFIED,
      done: null,
      error: "Operation ID was not returned by the export command.",
      metadata: null,
    },
    manifestPath,
    timestamp: new Date().toISOString(),
  });

  assert.equal(manifest.status, BACKUP_STATUS.NOT_VERIFIED);
  assert.equal(manifest.exportCompleted, false);
  assert.ok(manifest.verificationError.includes("Operation ID was not returned"));

  rmSync(tmpDir, { recursive: true, force: true });
});

test("writeBackupManifest — does not include credentials or secrets", () => {
  const tmpDir = makeTempDir("manifest-no-secrets");
  const manifestPath = path.join(tmpDir, "manifest.json");

  const manifest = writeBackupManifest({
    config: { projectId: "vitor-staging", database: "(default)", bucket: "gs://my-bucket", prefix: "" },
    destination: "gs://my-bucket/backup-2026",
    exportResult: { exitCode: 0, operationId: "op/abc123" },
    verificationResult: {
      status: BACKUP_STATUS.COMPLETED,
      done: true,
      error: null,
      metadata: null,
    },
    manifestPath,
    timestamp: new Date().toISOString(),
  });

  const raw = JSON.stringify(manifest);
  // Should not contain API keys, tokens, passwords or private keys
  assert.ok(!raw.toLowerCase().includes("apikey"), "Should not contain apiKey");
  assert.ok(!raw.toLowerCase().includes("password"), "Should not contain password");
  assert.ok(!raw.toLowerCase().includes("private_key"), "Should not contain private_key");
  assert.ok(!raw.toLowerCase().includes("secret"), "Should not contain secret");
  assert.ok(!raw.toLowerCase().includes("token"), "Should not contain token");

  rmSync(tmpDir, { recursive: true, force: true });
});

// =============================================================================
// 6. Verification Failure Handling
// =============================================================================

test("verifyBackupManifest — passes on a valid COMPLETED manifest", () => {
  const tmpDir = makeTempDir("verify-pass");
  const { path: manifestPath } = writeCompletedManifest(tmpDir);

  const result = verifyBackupManifest(manifestPath);

  assert.equal(result.passed, true, `Expected all checks to pass. Failures: ${result.checks.filter(c => !c.passed).map(c => c.name).join(", ")}`);
  assert.ok(result.manifest.status === BACKUP_STATUS.COMPLETED);

  rmSync(tmpDir, { recursive: true, force: true });
});

test("verifyBackupManifest — fails on missing file", () => {
  const result = verifyBackupManifest("/tmp/definitely-does-not-exist-vitor-backup.json");

  assert.equal(result.passed, false);
  const readCheck = result.checks.find((c) => c.name === "manifest_readable");
  assert.ok(readCheck && !readCheck.passed);
});

test("verifyBackupManifest — fails on invalid JSON", () => {
  const tmpDir = makeTempDir("verify-invalid-json");
  const p = path.join(tmpDir, "manifest.json");
  writeFileSync(p, "{ not valid json }}}");

  const result = verifyBackupManifest(p);

  assert.equal(result.passed, false);
  const readCheck = result.checks.find((c) => c.name === "manifest_readable");
  assert.ok(readCheck && !readCheck.passed);

  rmSync(tmpDir, { recursive: true, force: true });
});

test("verifyBackupManifest — fails when status is FAILED", () => {
  const tmpDir = makeTempDir("verify-failed-status");
  const { path: p } = writeCompletedManifest(tmpDir, {
    status: BACKUP_STATUS.FAILED,
    exportCompleted: false,
    verificationError: "Export returned error code.",
  });

  const result = verifyBackupManifest(p);

  assert.equal(result.passed, false);
  const statusCheck = result.checks.find((c) => c.name === "status_completed");
  assert.ok(statusCheck && !statusCheck.passed);

  rmSync(tmpDir, { recursive: true, force: true });
});

test("verifyBackupManifest — fails when status is NOT_VERIFIED", () => {
  const tmpDir = makeTempDir("verify-not-verified-status");
  const { path: p } = writeCompletedManifest(tmpDir, {
    status: BACKUP_STATUS.NOT_VERIFIED,
    exportCompleted: false,
    verificationError: "Operation ID not returned.",
  });

  const result = verifyBackupManifest(p);

  assert.equal(result.passed, false);
  const statusCheck = result.checks.find((c) => c.name === "status_completed");
  assert.ok(statusCheck && !statusCheck.passed);

  rmSync(tmpDir, { recursive: true, force: true });
});

test("verifyBackupManifest — fails when exportCompleted is false", () => {
  const tmpDir = makeTempDir("verify-export-not-completed");
  const { path: p } = writeCompletedManifest(tmpDir, {
    exportCompleted: false,
  });

  const result = verifyBackupManifest(p);

  assert.equal(result.passed, false);
  const exportCheck = result.checks.find((c) => c.name === "export_completed_flag");
  assert.ok(exportCheck && !exportCheck.passed);

  rmSync(tmpDir, { recursive: true, force: true });
});

test("verifyBackupManifest — fails when operationDone is false", () => {
  const tmpDir = makeTempDir("verify-operation-not-done");
  const { path: p } = writeCompletedManifest(tmpDir, {
    operationDone: false,
  });

  const result = verifyBackupManifest(p);

  assert.equal(result.passed, false);
  const doneCheck = result.checks.find((c) => c.name === "operation_done");
  assert.ok(doneCheck && !doneCheck.passed);

  rmSync(tmpDir, { recursive: true, force: true });
});

test("verifyBackupManifest — fails when verificationError is recorded", () => {
  const tmpDir = makeTempDir("verify-recorded-error");
  const { path: p } = writeCompletedManifest(tmpDir, {
    verificationError: "Some error occurred during verification.",
  });

  const result = verifyBackupManifest(p);

  assert.equal(result.passed, false);
  const errCheck = result.checks.find((c) => c.name === "no_verification_error");
  assert.ok(errCheck && !errCheck.passed);

  rmSync(tmpDir, { recursive: true, force: true });
});

test("verifyBackupManifest — fails when backupDestination is missing gs:// prefix", () => {
  const tmpDir = makeTempDir("verify-invalid-dest");
  const { path: p } = writeCompletedManifest(tmpDir, {
    backupDestination: "s3://wrong-bucket/backup-2026",
  });

  const result = verifyBackupManifest(p);

  assert.equal(result.passed, false);
  const destCheck = result.checks.find((c) => c.name === "backup_destination_valid");
  assert.ok(destCheck && !destCheck.passed);

  rmSync(tmpDir, { recursive: true, force: true });
});

test("verifyBackupManifest — fails when required fields are missing", () => {
  const tmpDir = makeTempDir("verify-missing-fields");
  const p = path.join(tmpDir, "manifest.json");
  // Write an incomplete manifest
  writeFileSync(p, JSON.stringify({ schemaVersion: "6.1-gcloud", status: "COMPLETED" }, null, 2));

  const result = verifyBackupManifest(p);

  assert.equal(result.passed, false);
  const fieldsCheck = result.checks.find((c) => c.name === "required_fields_present");
  assert.ok(fieldsCheck && !fieldsCheck.passed);
  assert.ok(fieldsCheck.detail.includes("timestamp"));

  rmSync(tmpDir, { recursive: true, force: true });
});

test("verifyBackupManifest — fails when projectId is empty", () => {
  const tmpDir = makeTempDir("verify-empty-project");
  const { path: p } = writeCompletedManifest(tmpDir, {
    projectId: "",
  });

  const result = verifyBackupManifest(p);

  assert.equal(result.passed, false);
  const projCheck = result.checks.find((c) => c.name === "required_fields_present");
  assert.ok(projCheck && !projCheck.passed);

  rmSync(tmpDir, { recursive: true, force: true });
});

test("appendVerificationToManifest — appends lastVerification to manifest file", () => {
  const tmpDir = makeTempDir("verify-append");
  const { path: p } = writeCompletedManifest(tmpDir);

  const verificationResult = {
    passed: true,
    checks: [{ name: "status_completed", passed: true, detail: "Status is COMPLETED." }],
  };

  appendVerificationToManifest(p, verificationResult);

  const updated = JSON.parse(readFileSync(p, "utf-8"));
  assert.ok(updated.lastVerification);
  assert.equal(updated.lastVerification.passed, true);
  assert.ok(Array.isArray(updated.lastVerification.checks));
  assert.ok(typeof updated.lastVerification.verifiedAt === "string");

  rmSync(tmpDir, { recursive: true, force: true });
});

// =============================================================================
// 7. Restore Safety Checks — Production Target Prevention
// =============================================================================

test("RestoreSafety — verify-backup rejects FAILED manifest before restore", () => {
  const tmpDir = makeTempDir("restore-safety-failed");
  const { path: p } = writeCompletedManifest(tmpDir, {
    status: BACKUP_STATUS.FAILED,
    exportCompleted: false,
    verificationError: "gcloud export returned non-zero exit code.",
  });

  const result = verifyBackupManifest(p);

  // A FAILED manifest must never be used as restore evidence
  assert.equal(result.passed, false, "A FAILED manifest must NOT pass verification");
  assert.ok(
    result.checks.some((c) => c.name === "status_completed" && !c.passed),
    "status_completed check must fail for FAILED manifest"
  );

  rmSync(tmpDir, { recursive: true, force: true });
});

test("RestoreSafety — verify-backup rejects NOT_VERIFIED manifest before restore", () => {
  const tmpDir = makeTempDir("restore-safety-not-verified");
  const { path: p } = writeCompletedManifest(tmpDir, {
    status: BACKUP_STATUS.NOT_VERIFIED,
    exportCompleted: false,
    operationDone: null,
    verificationError: "Operation ID was not returned.",
  });

  const result = verifyBackupManifest(p);

  assert.equal(result.passed, false, "A NOT_VERIFIED manifest must NOT pass verification");

  rmSync(tmpDir, { recursive: true, force: true });
});

test("RestoreSafety — BACKUP_STATUS constants are frozen and cannot be mutated", () => {
  assert.ok(Object.isFrozen(BACKUP_STATUS));
  assert.throws(() => {
    BACKUP_STATUS.COMPLETED = "HACKED";
  }, "Should throw in strict mode when mutating frozen object");
});

test("RestoreSafety — BackupConfigError is thrown before any export is attempted", withEnv(
  { VITOR_BACKUP_PROJECT_ID: undefined, VITOR_BACKUP_BUCKET: undefined },
  async () => {
    // runGcloudBackup must throw BackupConfigError (from resolveBackupConfig)
    // before any gcloud command is executed
    await assert.rejects(
      () => runGcloudBackup({ confirm: true }),
      (err) => {
        assert.ok(
          err instanceof BackupConfigError,
          `Expected BackupConfigError, got: ${err.constructor.name}: ${err.message}`
        );
        return true;
      }
    );
  }
));

test("RestoreSafety — dry-run mode writes NOT_VERIFIED manifest (no export performed)", withEnv(
  {
    VITOR_BACKUP_PROJECT_ID: "vitor-staging",
    VITOR_BACKUP_BUCKET: "gs://vitor-backups-staging",
    VITOR_BACKUP_DATABASE: undefined,
    VITOR_BACKUP_PREFIX: undefined,
  },
  async () => {
    const tmpDir = makeTempDir("dry-run-manifest");
    const manifestOut = path.join(tmpDir, "dry-run-manifest.json");

    const result = await runGcloudBackup({ dryRun: true, manifestOut });

    assert.equal(result.status, BACKUP_STATUS.NOT_VERIFIED);
    assert.equal(result.exportCompleted, false);
    assert.equal(result.dryRun, true);
    assert.ok(existsSync(manifestOut), "Dry-run manifest should be written to disk");

    rmSync(tmpDir, { recursive: true, force: true });
  }
));

// =============================================================================
// 8. BACKUP_STATUS constant coverage
// =============================================================================

test("BACKUP_STATUS — has COMPLETED, FAILED and NOT_VERIFIED values", () => {
  assert.equal(BACKUP_STATUS.COMPLETED, "COMPLETED");
  assert.equal(BACKUP_STATUS.FAILED, "FAILED");
  assert.equal(BACKUP_STATUS.NOT_VERIFIED, "NOT_VERIFIED");
  assert.equal(Object.keys(BACKUP_STATUS).length, 3);
});

// =============================================================================
// 9. verifyBackupManifest — does not re-verify operation when option is false
// =============================================================================

test("verifyBackupManifest — skips live operation re-verify when reVerifyOperation is false", () => {
  const tmpDir = makeTempDir("no-reverify");
  const { path: p } = writeCompletedManifest(tmpDir);

  const result = verifyBackupManifest(p, { reVerifyOperation: false });

  // The live_operation_re_verified check should NOT be in the results
  const liveCheck = result.checks.find((c) => c.name === "live_operation_re_verified");
  assert.ok(!liveCheck, "live_operation_re_verified check should not run when reVerifyOperation is false");

  rmSync(tmpDir, { recursive: true, force: true });
});

test("verifyBackupManifest — missing operationId fails verification (even with re-verify requested)", () => {
  const tmpDir = makeTempDir("reverify-no-opid");
  const { path: p } = writeCompletedManifest(tmpDir, {
    operationId: null,
  });

  const result = verifyBackupManifest(p, { reVerifyOperation: true, runner: fakeRunner({}) });
  assert.equal(result.passed, false);
  const fieldsCheck = result.checks.find((c) => c.name === "required_fields_present");
  assert.ok(fieldsCheck && !fieldsCheck.passed && fieldsCheck.detail.includes("operationId"));

  rmSync(tmpDir, { recursive: true, force: true });
});

// =============================================================================
// 10. Error class shape
// =============================================================================

test("BackupConfigError — has correct name and extends Error", () => {
  const err = new BackupConfigError("test config error");
  assert.ok(err instanceof Error);
  assert.ok(err instanceof BackupConfigError);
  assert.equal(err.name, "BackupConfigError");
  assert.equal(err.message, "test config error");
});

test("BackupExecutionError — has correct name and extends Error", () => {
  const err = new BackupExecutionError("test execution error");
  assert.ok(err instanceof Error);
  assert.ok(err instanceof BackupExecutionError);
  assert.equal(err.name, "BackupExecutionError");
  assert.equal(err.message, "test execution error");
});

// =============================================================================
// 11. Verifier — required evidence and independent expectations
// =============================================================================

function verifyWith(overrides, opts = {}) {
  const tmpDir = makeTempDir("verify-x");
  const { path: p } = writeCompletedManifest(tmpDir, overrides);
  const result = verifyBackupManifest(p, opts);
  rmSync(tmpDir, { recursive: true, force: true });
  return result;
}

const failedNames = (r) => r.checks.filter((c) => !c.passed).map((c) => c.name);

test("verifyBackupManifest — missing operationDone fails", () => {
  const r = verifyWith({ operationDone: undefined });
  assert.equal(r.passed, false);
  assert.ok(failedNames(r).includes("required_fields_present"));
});

test("verifyBackupManifest — operationDone null fails", () => {
  assert.equal(verifyWith({ operationDone: null }).passed, false);
});

test("verifyBackupManifest — missing backupType fails; wrong backupType fails", () => {
  assert.equal(verifyWith({ backupType: undefined }).passed, false);
  const r = verifyWith({ backupType: "something-else" });
  assert.ok(failedNames(r).includes("backup_type_valid"));
});

test("verifyBackupManifest — unsupported schemaVersion fails", () => {
  const r = verifyWith({ schemaVersion: "9.9-future" });
  assert.ok(failedNames(r).includes("schema_version_supported"));
});

test("verifyBackupManifest — missing or mismatched outputUriPrefix fails", () => {
  assert.ok(failedNames(verifyWith({ outputUriPrefix: null })).includes("output_uri_matches_destination"));
  assert.ok(
    failedNames(verifyWith({ outputUriPrefix: "gs://other/backup" })).includes("output_uri_matches_destination")
  );
});

test("verifyBackupManifest — matching expected values pass", () => {
  const r = verifyWith({}, {
    expected: {
      projectId: "my-vitor-project",
      database: "(default)",
      backupDestination: "gs://my-vitor-backups/backup-2026",
    },
  });
  assert.equal(r.passed, true);
  assert.equal(r.independentlyChecked, true);
});

test("verifyBackupManifest — no expectations means not independently checked", () => {
  const r = verifyWith({});
  assert.equal(r.passed, true);
  assert.equal(r.independentlyChecked, false);
});

test("verifyBackupManifest — wrong expected project fails", () => {
  const r = verifyWith({}, { expected: { projectId: "another-project" } });
  assert.ok(failedNames(r).includes("expected_project_id"));
});

test("verifyBackupManifest — wrong expected database fails", () => {
  const r = verifyWith({}, { expected: { database: "other-db" } });
  assert.ok(failedNames(r).includes("expected_database"));
});

test("verifyBackupManifest — wrong expected destination fails", () => {
  const r = verifyWith({}, { expected: { backupDestination: "gs://my-vitor-backups/backup-OTHER" } });
  assert.ok(failedNames(r).includes("expected_destination"));
});

test("verifyBackupManifest — live re-verify passes when operation output matches manifest destination", () => {
  const runner = fakeRunner({ describe: describeDone("gs://my-vitor-backups/backup-2026") });
  const r = verifyWith({}, { reVerifyOperation: true, runner });
  assert.equal(r.passed, true);
  assert.equal(runner.calls.length, 1);
  assert.ok(runner.calls[0].includes("--project=my-vitor-project"));
});

test("verifyBackupManifest — live re-verify fails when operation output differs from manifest destination", () => {
  const runner = fakeRunner({ describe: describeDone("gs://attacker-or-wrong/backup") });
  const r = verifyWith({}, { reVerifyOperation: true, runner });
  assert.equal(r.passed, false);
  assert.ok(failedNames(r).includes("live_operation_re_verified"));
});

test("verifyBackupManifest — live re-verify fails when operation reports no output URI", () => {
  const runner = fakeRunner({ describe: describeDone(undefined) });
  const r = verifyWith({}, { reVerifyOperation: true, runner });
  assert.ok(failedNames(r).includes("live_operation_re_verified"));
});

test("verifyBackupManifest — live re-verify uses independent expected project, not the manifest's", () => {
  const runner = fakeRunner({ describe: describeDone("gs://my-vitor-backups/backup-2026") });
  verifyWith({}, { reVerifyOperation: true, runner, expected: { projectId: "independent-project" } });
  assert.ok(runner.calls[0].includes("--project=independent-project"));
});
