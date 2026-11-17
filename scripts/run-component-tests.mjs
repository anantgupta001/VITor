/**
 * Component Test Runner for VITor (Vitest + jsdom).
 *
 * Why this wrapper exists:
 *   On Windows, shells such as Git Bash (and some IDE terminals) start Node with a
 *   lowercase drive letter in the working directory (`c:\...`). Vitest then resolves
 *   its own CLI/runner from `c:\...` while test files resolve `vitest` from `C:\...`,
 *   so two copies of the `vitest` module are loaded and every test file fails with
 *   "Vitest failed to find the current suite" before any test runs.
 *
 *   This script launches Vitest with the canonical (filesystem-cased) project path
 *   as both the working directory and the CLI path, which works from any shell.
 *
 * Usage: npm run test:components [-- <vitest args>]
 */
import { spawnSync } from "child_process";
import { realpathSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = realpathSync.native(path.resolve(here, ".."));
const vitestCli = path.join(root, "node_modules", "vitest", "vitest.mjs");

const result = spawnSync(
  process.execPath,
  [vitestCli, "run", ...process.argv.slice(2)],
  { stdio: "inherit", cwd: root, env: process.env }
);

process.exit(result.status ?? 1);
