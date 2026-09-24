/**
 * Schema migrations, run by the server at startup.
 *
 * The server reads `_prisma_migrations` through Prisma and compares it with
 * the migration folders beside the schema. When nothing is pending it starts
 * no process; otherwise it runs `prisma migrate deploy` once. The image's
 * start script only starts Node.
 */
import type { PrismaClient } from "@prisma/client";
import { execFile } from "child_process";
import { existsSync, readdirSync } from "fs";
import { createRequire } from "module";
import path from "path";
import prisma from "../prisma/singleton.js";
import { getConfigDir } from "../utils/configDir.js";
import { logger } from "../utils/logger.js";

/** A row of `_prisma_migrations`, as Prisma reads it. */
export interface MigrationRow {
  migration_name: string;
  started_at: Date;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  logs: string | null;
}

/**
 * - `empty`: no tables, a new install.
 * - `dbPush`: `User` without `_prisma_migrations`, a database created with
 *   `prisma db push` (Peek before v2.0.1).
 * - `migrated`: anything else.
 */
export type DatabaseShape = "empty" | "dbPush" | "migrated";

/** A migration Prisma started and neither finished nor rolled back. */
export interface UnfinishedMigration {
  name: string;
  startedAt: Date;
  logs: string | null;
}

export interface MigrationPlan {
  shape: DatabaseShape;
  /** Folders the database has applied, in folder order. */
  applied: string[];
  /** Folders the database has not applied, in the order deploy runs them. */
  pending: string[];
  unfinished: UnfinishedMigration[];
  /** Applied migrations with no folder here: a newer Peek ran them. */
  unknownApplied: string[];
}

function shapeOf(tables: readonly string[]): DatabaseShape {
  if (tables.length === 0) return "empty";
  if (tables.includes("User") && !tables.includes("_prisma_migrations")) {
    return "dbPush";
  }
  return "migrated";
}

/**
 * What a database with these tables and `_prisma_migrations` rows needs from
 * these migration folders. A migration counts as applied when it finished
 * and was not rolled back afterwards.
 */
export function planMigrations(
  tables: readonly string[],
  rows: readonly MigrationRow[],
  folders: readonly string[]
): MigrationPlan {
  const done = new Set(
    rows
      .filter((row) => row.finished_at !== null && row.rolled_back_at === null)
      .map((row) => row.migration_name)
  );
  const known = new Set(folders);
  return {
    shape: shapeOf(tables),
    applied: folders.filter((folder) => done.has(folder)),
    pending: folders.filter((folder) => !done.has(folder)),
    unfinished: rows
      .filter((row) => row.finished_at === null && row.rolled_back_at === null)
      .map((row) => ({
        name: row.migration_name,
        startedAt: row.started_at,
        logs: row.logs,
      })),
    unknownApplied: [...done].filter((name) => !known.has(name)).sort(),
  };
}

/**
 * The directory holding `schema.prisma` and `migrations/`: `prisma` under the
 * working directory, where the CLI itself looks (`/app/prisma` in the image,
 * `server/prisma` in development and E2E).
 */
function defaultPrismaDir(): string {
  return path.resolve(process.cwd(), "prisma");
}

/** The migration folders (those holding a `migration.sql`), sorted by name. */
export function listMigrationFolders(prismaDir: string): string[] {
  const dir = path.join(prismaDir, "migrations");
  return readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isDirectory() &&
        existsSync(path.join(dir, entry.name, "migration.sql"))
    )
    .map((entry) => entry.name)
    .sort();
}

/** Reads the database's tables and migration history through `client`. */
export async function readMigrationPlan(
  client: PrismaClient,
  prismaDir = defaultPrismaDir()
): Promise<MigrationPlan> {
  const tables = (
    await client.$queryRaw<
      { name: string }[]
    >`SELECT name FROM sqlite_master WHERE type = 'table'`
  ).map((row) => row.name);
  const rows = tables.includes("_prisma_migrations")
    ? await client.$queryRaw<
        MigrationRow[]
      >`SELECT migration_name, started_at, finished_at, rolled_back_at, logs FROM _prisma_migrations`
    : [];
  return planMigrations(tables, rows, listMigrationFolders(prismaDir));
}

export interface PrismaCliOptions {
  /** Where `schema.prisma` and `migrations/` are; `./prisma` by default. */
  prismaDir?: string;
  /** The database the CLI acts on; the server's `DATABASE_URL` by default. */
  databaseUrl?: string;
}

/**
 * Runs the Prisma CLI from this install's `node_modules` with Node itself (no
 * `npx`: the image's `node_modules` is read-only). Resolves with its stdout;
 * rejects with its stderr in the message.
 */
export function runPrismaCli(
  args: readonly string[],
  opts: PrismaCliOptions = {}
): Promise<string> {
  const cli = createRequire(import.meta.url).resolve("prisma/build/index.js");
  const schema = path.join(
    opts.prismaDir ?? defaultPrismaDir(),
    "schema.prisma"
  );
  const env =
    opts.databaseUrl === undefined
      ? process.env
      : { ...process.env, DATABASE_URL: opts.databaseUrl };
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [cli, ...args, "--schema", schema],
      { env, maxBuffer: 16 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          const output = stderr.trim() || stdout.trim() || error.message;
          reject(new Error(`prisma ${args.join(" ")} failed: ${output}`));
          return;
        }
        resolve(stdout);
      }
    );
  });
}

export interface MigrateOptions extends PrismaCliOptions {
  /**
   * Reads the plan, and is disconnected before the CLI runs; the server's
   * client by default.
   */
  client?: PrismaClient;
  /** Where this install keeps its backups; `getConfigDir()` by default. */
  configDir?: string;
}

export interface MigrationResult {
  plan: MigrationPlan;
  /** The migrations this call applied, in the order they ran. */
  applied: string[];
}

function migrationCount(count: number): string {
  return `${count} migration${count === 1 ? "" : "s"}`;
}

/**
 * Brings the database up to this version's migrations with at most one
 * `prisma migrate deploy`, and none when nothing is pending.
 */
export async function migrateDatabase(
  opts: MigrateOptions = {}
): Promise<MigrationResult> {
  const client = opts.client ?? prisma;
  const prismaDir = opts.prismaDir ?? defaultPrismaDir();
  const plan = await readMigrationPlan(client, prismaDir);

  if (plan.unknownApplied.length > 0) {
    logger.warn(
      `A newer Peek migrated this database (migrations this version does not have: ${plan.unknownApplied.join(", ")}). Starting anyway; to go back, restore its pre-migration backup from ${opts.configDir ?? getConfigDir()}`
    );
  }

  if (plan.pending.length === 0) {
    logger.info(
      `Database schema is up to date (${migrationCount(plan.applied.length)})`
    );
    return { plan, applied: [] };
  }

  logger.info(
    `Applying ${plan.pending.length} pending ${plan.pending.length === 1 ? "migration" : "migrations"}: ${plan.pending.join(", ")}`
  );
  // No pooled connection stays open while the migrations' DDL runs; the
  // client reconnects at its next query
  await client.$disconnect();
  const started = performance.now();
  await runPrismaCli(["migrate", "deploy"], {
    prismaDir,
    databaseUrl: opts.databaseUrl,
  });
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  logger.info(`Applied ${migrationCount(plan.pending.length)} in ${seconds} s`);
  return { plan, applied: plan.pending };
}
