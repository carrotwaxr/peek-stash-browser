// Replaces the hermetic E2E run directory (throwaway database and CONFIG_DIR)
// with an empty one. playwright.config.ts runs it before the server starts and
// passes the path in E2E_RUN_DIR (runDir in e2e/support/env.ts).
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";

const runDir = process.env.E2E_RUN_DIR;

// Only ever a directory env.ts named, never a path set by mistake
if (!runDir || !path.basename(runDir).startsWith("peek-e2e-")) {
  console.error(
    `reset-db: E2E_RUN_DIR must be a peek-e2e-<port> directory, got ${JSON.stringify(runDir)}`
  );
  process.exit(1);
}

rmSync(runDir, { recursive: true, force: true });
mkdirSync(runDir, { recursive: true });
console.log(`reset-db: fresh run directory ${runDir}`);
