/**
 * Throwaway databases for migration tests.
 *
 * `createDatabaseAt(name)` copies `schema.prisma` and the migrations up to
 * `name` into a temp directory and deploys them into a new SQLite file there;
 * `createEmptyDatabase()` makes a file with no tables, for a test to shape.
 * The sandbox has its own Prisma client and URL, so a test migrates it and
 * never the suite's database, which the worker's Prisma singleton points at.
 */
import { PrismaClient } from "@prisma/client";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
} from "fs";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import {
  listMigrationFolders,
  runPrismaCli,
} from "../../initializers/migrations.js";

/** The server's `prisma` directory: the schema and every migration. */
export const PRISMA_DIR = fileURLToPath(
  new URL("../../prisma/", import.meta.url)
);

// On tmpfs where there is one: a fresh deploy is all fsync, about 1 s on
// /dev/shm and over 30 s on a slow disk
const SANDBOX_ROOT = existsSync("/dev/shm") ? "/dev/shm" : os.tmpdir();

export interface MigrationSandbox {
  url: string;
  client: PrismaClient;
  /** The sandbox's schema and the migrations it was built from. */
  prismaDir: string;
  /** Disconnects the client and deletes the sandbox. */
  remove: () => Promise<void>;
}

function sandboxDir(): string {
  return mkdtempSync(path.join(SANDBOX_ROOT, "peek-migration-sandbox-"));
}

function sandboxIn(dir: string, prismaDir: string): MigrationSandbox {
  const url = `file:${path.join(dir, "peek.db")}`;
  const client = new PrismaClient({ datasourceUrl: url });
  return {
    url,
    client,
    prismaDir,
    remove: async () => {
      await client.$disconnect();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

/**
 * A database with no tables, which SQLite creates at the client's first
 * query. Its `prismaDir` is the server's own.
 */
export function createEmptyDatabase(): MigrationSandbox {
  return sandboxIn(sandboxDir(), PRISMA_DIR);
}

/** A database with every migration up to and including `name` applied. */
export async function createDatabaseAt(
  name: string
): Promise<MigrationSandbox> {
  const folders = listMigrationFolders(PRISMA_DIR);
  const last = folders.indexOf(name);
  if (last === -1) throw new Error(`No migration folder named ${name}`);

  const dir = sandboxDir();
  const prismaDir = path.join(dir, "prisma");
  const migrationsDir = path.join(prismaDir, "migrations");
  mkdirSync(migrationsDir, { recursive: true });
  copyFileSync(
    path.join(PRISMA_DIR, "schema.prisma"),
    path.join(prismaDir, "schema.prisma")
  );
  copyFileSync(
    path.join(PRISMA_DIR, "migrations", "migration_lock.toml"),
    path.join(migrationsDir, "migration_lock.toml")
  );
  for (const folder of folders.slice(0, last + 1)) {
    cpSync(
      path.join(PRISMA_DIR, "migrations", folder),
      path.join(migrationsDir, folder),
      { recursive: true }
    );
  }

  const sandbox = sandboxIn(dir, prismaDir);
  try {
    await runPrismaCli(["migrate", "deploy"], {
      prismaDir,
      databaseUrl: sandbox.url,
    });
  } catch (error) {
    await sandbox.remove();
    throw error;
  }
  return sandbox;
}
