import { createHash } from "crypto";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * The server port defaults to 26000 plus this checkout's slot, a number from
 * 0 to 1999 hashed from the checkout's path (as e2e/support/env.ts derives the
 * E2E ports, 20000-25999), so the suite runs in two worktrees at once without
 * configuration. INTEGRATION_SERVER_PORT overrides it. The Stash replay needs
 * no port of its own: it listens on free ports the system picks.
 */
const checkoutRoot = path.resolve(__dirname, "../../..");
const checkoutSlot =
  createHash("sha256").update(checkoutRoot).digest().readUInt32BE(0) % 2000;

function serverPort(): number {
  const value = process.env.INTEGRATION_SERVER_PORT;
  if (!value) return 26000 + checkoutSlot;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(
      `INTEGRATION_SERVER_PORT must be a port number, got ${JSON.stringify(value)}`
    );
  }
  return port;
}

export const TEST_CONFIG = {
  serverPort: serverPort(),
  get baseUrl() {
    return `http://localhost:${this.serverPort}`;
  },
  /**
   * test.db, or test-replay.db for a replay run (STASH_REPLAY=1), which
   * starts from its own, fresh database. They live in this checkout's
   * integration/ unless INTEGRATION_DB_DIR names another directory.
   */
  get databasePath() {
    const file =
      process.env.STASH_REPLAY === "1" ? "test-replay.db" : "test.db";
    const dir = process.env.INTEGRATION_DB_DIR;
    if (dir) return path.resolve(dir, file);
    return path.resolve(__dirname, "..", file);
  },
  get databaseUrl() {
    return `file:${this.databasePath}`;
  },
};
