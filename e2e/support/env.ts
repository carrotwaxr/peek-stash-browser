import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Where an E2E run points, and as whom.
 *
 * Hermetic mode (the default, locally and in CI): Playwright starts its own
 * Peek server and Vite client on their own ports, beside the dev stack, with
 * a throwaway database in `runDir`. The run admin is HERMETIC_ADMIN, the
 * throwaway database's only admin.
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

const port = (name: string, fallback: number) =>
  Number(process.env[name]) || fallback;

export const ports = {
  server: port("E2E_SERVER_PORT", 8100),
  client: port("E2E_CLIENT_PORT", 5180),
  stash: port("E2E_STASH_PORT", 9100),
};

export const baseURL =
  process.env.E2E_BASE_URL || `http://localhost:${ports.client}`;

// The throwaway database belongs on tmpfs: a fresh `prisma migrate deploy`
// takes about 1 s on /dev/shm and over 30 s on a slow disk (it is all fsync)
const tmpRoot =
  process.env.E2E_TMP_DIR ||
  (existsSync("/dev/shm") ? "/dev/shm" : os.tmpdir());

/** Hermetic mode's database and CONFIG_DIR, replaced at every run */
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
