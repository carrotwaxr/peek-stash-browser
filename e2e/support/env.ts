import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Where an E2E run points, and as whom.
 *
 * Hermetic mode (the default, locally and in CI): Playwright starts the Stash
 * replay, its own Peek server and Vite client on their own ports, beside the
 * dev stack, with a throwaway database in `runDir`. The run admin is
 * HERMETIC_ADMIN, the throwaway database's only admin.
 *
 * Dev-stack mode (`E2E_BASE_URL` set in the shell, for manual runs on real
 * data): the run uses the Peek at that URL. `.env.e2e` names a bootstrap admin
 * of that stack (E2E_USERNAME, E2E_PASSWORD), which global setup uses only to
 * create this run's throwaway admin and global teardown to delete it.
 */

export const devStack = !!process.env.E2E_BASE_URL;

// .env.e2e (gitignored) holds the dev stack's bootstrap admin: simple
// key=value lines, never overriding a variable the shell set. Hermetic runs
// ignore it, so no test there can sign in as a real account.
const envFile = ".env.e2e";
if (devStack && existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx);
        const value = trimmed.slice(eqIdx + 1);
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  }
}

/**
 * Hermetic mode's ports. Each defaults to a base plus this checkout's slot, a
 * number from 0 to 1999 hashed from the checkout's path, so the suite runs in
 * two worktrees at once without configuration, and a checkout keeps its ports
 * from run to run. The ranges stay clear of the dev stack (6969, 8000), of
 * each other and of the integration server (26000-27999, from the same slot in
 * server/integration/helpers/config.ts), and below the ephemeral ports (32768
 * up on Linux) that port 0 and outgoing connections take. The variables
 * override them.
 */
const checkoutRoot = path.resolve(__dirname, "../..");
const checkoutSlot =
  createHash("sha256").update(checkoutRoot).digest().readUInt32BE(0) % 2000;

const port = (name: string, base: number): number => {
  const value = process.env[name];
  if (!value) return base + checkoutSlot;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(
      `${name} must be a port number, got ${JSON.stringify(value)}`
    );
  }
  return parsed;
};

export const ports = {
  server: port("E2E_SERVER_PORT", 20000),
  client: port("E2E_CLIENT_PORT", 22000),
  stash: port("E2E_STASH_PORT", 24000),
};

export const baseURL =
  process.env.E2E_BASE_URL || `http://localhost:${ports.client}`;

/**
 * Hermetic mode's Stash: item 83's replay server (server/integration/
 * stash-replay), serving its derived second library, which Peek syncs through
 * the real sync path. It refuses writes; /__replay/stats (no key) lists any it
 * saw, the requests it could not answer, and the library's entity counts.
 */
export const REPLAY_API_KEY = "e2e-dummy-key";
export const replayUrl = `http://localhost:${ports.stash}/graphql`;
export const replayStatsUrl = `http://localhost:${ports.stash}/__replay/stats`;

// The throwaway database belongs on tmpfs: a fresh `prisma migrate deploy`
// takes about 1 s on /dev/shm and over 30 s on a slow disk (it is all fsync)
const tmpRoot =
  process.env.E2E_TMP_DIR ||
  (existsSync("/dev/shm") ? "/dev/shm" : os.tmpdir());

/**
 * Hermetic mode's database and CONFIG_DIR, replaced at every run. Named after
 * the server port, so each checkout has its own.
 */
export const runDir = path.join(tmpRoot, `peek-e2e-${ports.server}`);
export const dbFile = path.join(runDir, "peek-e2e.db");

/**
 * The throwaway database's only admin, and the hermetic run's admin. Never
 * used against a real stack.
 */
export const HERMETIC_ADMIN = {
  username: "e2e-admin",
  password: "e2e-Admin-1",
};
