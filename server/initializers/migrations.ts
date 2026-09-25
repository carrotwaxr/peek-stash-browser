/**
 * Schema migrations, run by the server at startup.
 *
 * The server reads `_prisma_migrations` through Prisma and compares it with
 * the migration folders beside the schema. When nothing is pending it starts
 * no process; otherwise it runs `prisma migrate deploy` once. The image's
 * start script only starts Node.
 *
 * Before the first write to a database that has data, the server copies it
 * into the config directory (`createPreMigrationBackup`): the way back to the
 * version that ran before.
 *
 * Databases from before Peek kept migration history (`prisma db push`, up to
 * v2.0.0) upgrade only from v2.0.0, whose tables are `0_baseline`'s; older
 * ones stop at startup with an error naming the release to run first.
 *
 * Migrations from 20260925000000 on run in one transaction
 * (`isAtomicMigration`), so one that fails changes nothing. When a start finds
 * such a migration unfinished, it marks it rolled back and deploys once more;
 * any other unfinished migration stops startup with `MigrationFailedError`,
 * which names the ways out.
 */
import type { PrismaClient } from "@prisma/client";
import { execFile } from "child_process";
import { existsSync, readFileSync, readdirSync } from "fs";
import { createRequire } from "module";
import path from "path";
import prisma from "../prisma/singleton.js";
import { databaseBackupService } from "../services/DatabaseBackupService.js";
import { getConfigDir } from "../utils/configDir.js";
import { logger } from "../utils/logger.js";
import { getServerVersion } from "../utils/serverVersion.js";

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

/** The first migration: the v2.0.0 schema, which `db push` databases share. */
const BASELINE_MIGRATION = "0_baseline";

/**
 * The tables `0_baseline` creates, in its order: a `db push` database with all
 * of them is a v2.0.0 database. Later migrations rebuild some of them and drop
 * none, so every migrated database has them too.
 */
export const LEGACY_BASELINE_TABLES: readonly string[] = [
  "User",
  "WatchHistory",
  "Playlist",
  "PlaylistItem",
  "CustomTheme",
  "SceneRating",
  "PerformerRating",
  "StudioRating",
  "TagRating",
  "GalleryRating",
  "GroupRating",
  "ImageRating",
  "UserContentRestriction",
  "UserPerformerStats",
  "UserStudioStats",
  "UserTagStats",
  "UserHiddenEntity",
  "DataMigration",
  "StashInstance",
];

/** The release a database this version cannot upgrade must run once first. */
export type LegacyRepairRelease = "2.0.0" | "3.2.2";

function legacyDatabaseMessage(
  runFirst: LegacyRepairRelease,
  missingTables: readonly string[]
): string {
  const missing = `missing tables: ${missingTables.join(", ")}`;
  const problem =
    runFirst === "2.0.0"
      ? `This database was created by Peek before v2.0.0 (${missing}). This version cannot upgrade it.`
      : `This database's migration history says it has Peek v2.0.0's tables, but some are missing (${missing}). This version cannot repair it.`;
  const why =
    runFirst === "3.2.2"
      ? " (its schema repair creates the missing tables)"
      : "";
  return `${problem} Start carrotwaxr/peek-stash-browser:${runFirst} on the same data directory once${why}, stop it, then start this version. See Upgrading → Databases from before v2.0.0.`;
}

/**
 * Thrown before anything touches a database this version cannot upgrade: a
 * `db push` database from before v2.0.0, or a migrated one whose baseline is
 * marked applied without all its tables (v2.0.1 marked it on any `db push`
 * database). The message names the release to start once first.
 */
export class LegacyDatabaseError extends Error {
  readonly runFirst: LegacyRepairRelease;
  /** The `0_baseline` tables the database lacks. */
  readonly missingTables: readonly string[];

  constructor(runFirst: LegacyRepairRelease, missingTables: readonly string[]) {
    super(legacyDatabaseMessage(runFirst, missingTables));
    this.name = "LegacyDatabaseError";
    this.runFirst = runFirst;
    this.missingTables = missingTables;
  }
}

/** A statement of a migration file, without its comments or final `;`. */
interface SqlStatement {
  text: string;
  /**
   * The statement in upper case, whitespace collapsed, with every string
   * literal and quoted identifier emptied: a keyword inside one is not a
   * keyword.
   */
  keywords: string;
}

const TRIGGER_START = /^\s*CREATE\s+(?:TEMP\s+|TEMPORARY\s+)?TRIGGER\b/i;

/**
 * Whether a `;` at this point of a statement is inside a trigger's
 * `BEGIN` ... `END` body: from the body's `BEGIN` until the `END` that is not
 * a `CASE`'s.
 */
function insideTriggerBody(statement: string): boolean {
  if (!TRIGGER_START.test(statement)) return false;
  let begins = 0;
  let open = 0;
  for (const [word] of statement.matchAll(/\b(?:BEGIN|CASE|END)\b/gi)) {
    const keyword = word.toUpperCase();
    if (keyword === "BEGIN") begins++;
    if (keyword === "END") open--;
    else open++;
  }
  return begins === 0 || open > 0;
}

/** Splits SQL into statements, as SQLite reads them. */
function splitSqlStatements(sql: string): SqlStatement[] {
  const statements: SqlStatement[] = [];
  let text = "";
  let masked = "";
  const flush = (): void => {
    const keywords = masked.replace(/\s+/g, " ").trim().toUpperCase();
    if (keywords !== "") statements.push({ text: text.trim(), keywords });
    text = "";
    masked = "";
  };

  let i = 0;
  while (i < sql.length) {
    const ch = sql.charAt(i);
    const pair = sql.slice(i, i + 2);
    if (pair === "--" || pair === "/*") {
      const close = pair === "--" ? "\n" : "*/";
      const end = sql.indexOf(close, i + 2);
      i = end === -1 ? sql.length : end + close.length;
      text += " ";
      masked += " ";
    } else if (ch === "'" || ch === '"' || ch === "`" || ch === "[") {
      // A string literal or quoted identifier; a doubled quote is escaped
      const close = ch === "[" ? "]" : ch;
      let end = i + 1;
      while (end < sql.length) {
        if (sql.charAt(end) !== close) end++;
        else if (close !== "]" && sql.charAt(end + 1) === close) end += 2;
        else break;
      }
      text += sql.slice(i, end + 1);
      masked += ch === "'" ? "''" : '""';
      i = end + 1;
    } else if (ch === ";" && !insideTriggerBody(masked)) {
      flush();
      i++;
    } else {
      text += ch;
      masked += ch;
      i++;
    }
  }
  flush();
  return statements;
}

const TRANSACTION_CONTROL =
  /^(?:BEGIN|COMMIT|END|ROLLBACK|SAVEPOINT|RELEASE)\b/;
const FOREIGN_KEY_PRAGMA =
  /^PRAGMA (?:\w+ ?\. ?)?(?:FOREIGN_KEYS|DEFER_FOREIGN_KEYS)\b/;

/**
 * Whether a migration runs in one transaction, in the form every migration
 * from 20260925000000 on takes:
 *
 * ```sql
 * PRAGMA foreign_keys=OFF;
 * BEGIN;
 * ...
 * COMMIT;
 * PRAGMA foreign_keys=ON;
 * ```
 *
 * with no other transaction statement and no other `foreign_keys` or
 * `defer_foreign_keys` pragma. Prisma applies a migration statement by
 * statement, so without the wrapper a failure leaves the statements before it
 * applied. Foreign keys go off before `BEGIN` because inside a transaction the
 * pragma does nothing, and a rebuild's `DROP TABLE` would cascade.
 */
export function isAtomicMigration(sql: string): boolean {
  const statements = splitSqlStatements(sql).map((statement) =>
    statement.keywords.replace(/ ?= ?/g, "=")
  );
  if (statements.length < 4) return false;
  if (
    statements[0] !== "PRAGMA FOREIGN_KEYS=OFF" ||
    statements[1] !== "BEGIN" ||
    statements[statements.length - 2] !== "COMMIT" ||
    statements[statements.length - 1] !== "PRAGMA FOREIGN_KEYS=ON"
  ) {
    return false;
  }
  return statements
    .slice(2, -2)
    .every(
      (statement) =>
        !TRANSACTION_CONTROL.test(statement) &&
        !FOREIGN_KEY_PRAGMA.test(statement)
    );
}

// An identifier as SQL spells it: quoted, or a bare word
const NAME = String.raw`(?:"(?:[^"]|"")+"|\`[^\`]+\`|\[[^\]]+\]|[\w$]+)`;
// A name that may be schema-qualified, the name itself captured
const QUALIFIED = String.raw`(?:${NAME}\s*\.\s*)?(${NAME})`;

/** An identifier without its quotes or schema. */
function unquotedName(name: string): string {
  const parts = name.trim().split(".");
  const last = parts[parts.length - 1] ?? "";
  return last.replace(/^["`[]|["`\]]$/g, "").replace(/""/g, '"');
}

/** An identifier as SQLite compares it: unquoted, any case. */
function bareName(name: string): string {
  return unquotedName(name).toLowerCase();
}

/** The objects and columns a migration creates, drops or renames. */
interface MigrationObjects {
  /** Tables, indexes, triggers and views it creates, or renames a table to. */
  created: Set<string>;
  /** Tables, indexes, triggers and views it drops, or renames a table from. */
  dropped: Set<string>;
  addedColumns: Set<string>;
  /** Columns it drops, or renames. */
  droppedColumns: Set<string>;
}

const CREATE_OBJECT = new RegExp(
  String.raw`^CREATE\s+(?:UNIQUE\s+)?(?:TEMP(?:ORARY)?\s+)?(?:TABLE|INDEX|TRIGGER|VIEW)\s+(?:IF\s+NOT\s+EXISTS\s+)?${QUALIFIED}`,
  "i"
);
const DROP_OBJECT = new RegExp(
  String.raw`^DROP\s+(?:TABLE|INDEX|TRIGGER|VIEW)\s+(?:IF\s+EXISTS\s+)?${QUALIFIED}`,
  "i"
);
const RENAME_TABLE = new RegExp(
  String.raw`^ALTER\s+TABLE\s+${QUALIFIED}\s+RENAME\s+TO\s+(${NAME})`,
  "i"
);
const ADD_COLUMN = new RegExp(
  String.raw`^ALTER\s+TABLE\s+${QUALIFIED}\s+ADD\s+(?:COLUMN\s+)?(${NAME})`,
  "i"
);
const DROP_COLUMN = new RegExp(
  String.raw`^ALTER\s+TABLE\s+${QUALIFIED}\s+(?:DROP\s+(?:COLUMN\s+)?|RENAME\s+(?:COLUMN\s+)?(?!TO\b))(${NAME})`,
  "i"
);

function migrationObjects(sql: string): MigrationObjects {
  const objects: MigrationObjects = {
    created: new Set(),
    dropped: new Set(),
    addedColumns: new Set(),
    droppedColumns: new Set(),
  };
  for (const { text } of splitSqlStatements(sql)) {
    const created = CREATE_OBJECT.exec(text)?.[1];
    if (created !== undefined) objects.created.add(bareName(created));
    const dropped = DROP_OBJECT.exec(text)?.[1];
    if (dropped !== undefined) objects.dropped.add(bareName(dropped));
    const renamed = RENAME_TABLE.exec(text);
    if (renamed?.[1] !== undefined && renamed[2] !== undefined) {
      objects.dropped.add(bareName(renamed[1]));
      objects.created.add(bareName(renamed[2]));
    }
    const added = ADD_COLUMN.exec(text)?.[2];
    if (added !== undefined) objects.addedColumns.add(bareName(added));
    const droppedColumn = DROP_COLUMN.exec(text)?.[2];
    if (droppedColumn !== undefined) {
      objects.droppedColumns.add(bareName(droppedColumn));
    }
  }
  return objects;
}

/**
 * The database's own error in Prisma's output for a failed migration (its
 * stderr, or the `logs` it records), such as `no such table: X`, and its
 * SQLite code; null when the output has none.
 */
function databaseError(
  output: string
): { message: string; code: string | undefined } | null {
  const line = /Database error:\s*\n\s*(.+)/.exec(output)?.[1];
  if (line === undefined) return null;
  return {
    // SQLite's message goes on with " in <the rest of the migration>"
    message: line.replace(/\s+in\s*$/, "").trim(),
    code: /Database error code:\s*(\d+)/.exec(output)?.[1],
  };
}

/** Prisma's error for a failed migration, as one sentence. */
function describeFailure(output: string | null): string {
  const trimmed = output?.trim() ?? "";
  if (trimmed === "") return "Prisma recorded no error.";
  const error = databaseError(trimmed);
  if (error === null) {
    const short =
      trimmed.length > 500 ? `${trimmed.slice(0, 500)}...` : trimmed;
    return `Prisma said: ${short}`;
  }
  const code = error.code === undefined ? "" : ` (SQLite error ${error.code})`;
  return `The database said: ${error.message}${code}.`;
}

/**
 * The object a failed retry stumbled on when the migration itself creates or
 * drops it, which means the migration had committed at an earlier start:
 * `already exists` for what it creates, `no such` for what it drops. Null for
 * any other error.
 */
export function objectMigrationAlreadyChanged(
  sql: string,
  output: string
): string | null {
  const error = databaseError(output)?.message ?? output;
  const objects = migrationObjects(sql);
  const checks: [RegExp, Set<string>][] = [
    [/\b(?:table|index|trigger|view) (.+?) already exists/i, objects.created],
    [/\bno such (?:table|index|trigger|view): (\S+)/i, objects.dropped],
    [/\bduplicate column name: (\S+)/i, objects.addedColumns],
    [/\bno such column: (\S+)/i, objects.droppedColumns],
  ];
  for (const [pattern, names] of checks) {
    const name = pattern.exec(error)?.[1];
    if (name !== undefined && names.has(bareName(name))) {
      return unquotedName(name);
    }
  }
  return null;
}

/**
 * Why a migration stopped startup:
 * - `partial`: it did not finish at an earlier start and is not atomic, so
 *   some of its statements may have been applied. Nothing was run.
 * - `retryFailed`: it is atomic and failed again when retried, changing
 *   nothing. The next start retries it again.
 * - `alreadyApplied`: the retry failed on an object the migration itself
 *   creates or drops: it had committed at an earlier start that stopped before
 *   Prisma recorded it.
 */
export type MigrationFailure = "partial" | "retryFailed" | "alreadyApplied";

export interface MigrationFailedDetails {
  migration: string;
  failure: MigrationFailure;
  /** Prisma's output: the retry's stderr, or the unfinished row's `logs`. */
  output: string | null;
  /** The newest pre-migration backup's path; null when there is none. */
  backup: string | null;
  /** Where the pre-migration backups are kept. */
  backupDir: string;
  /** For `alreadyApplied`: the object the retry stumbled on. */
  object?: string | null;
}

/**
 * The command that records a migration's state with the image's own Prisma
 * CLI, on the data directory, while Peek is stopped. `docker exec` cannot do
 * it: the container stops at startup, and exec runs as root.
 */
function resolveCommand(
  flag: "--rolled-back" | "--applied",
  migration: string
): string {
  return `docker run --rm --user 99:100 -v <data dir>:/app/data --entrypoint node carrotwaxr/peek-stash-browser:${getServerVersion()} /app/node_modules/prisma/build/index.js migrate resolve ${flag} ${migration} --schema /app/prisma/schema.prisma`;
}

/** How to fill in `resolveCommand`'s placeholders. */
const RESOLVE_COMMAND_HELP =
  "with Peek stopped, and with your PUID:PGID in place of 99:100 if you set them and the host directory you mount at /app/data in place of <data dir>";

function migrationFailedMessage(details: MigrationFailedDetails): string {
  const { migration, backup, backupDir } = details;
  const error = describeFailure(details.output);
  const more = "See Upgrading → Migration failed.";
  switch (details.failure) {
    case "partial": {
      const fix = `fix the cause, undo what the migration applied, and mark it rolled back with the command below (${RESOLVE_COMMAND_HELP}); then start Peek again.`;
      const ways =
        backup === null
          ? `There is no pre-migration backup in ${backupDir}, so the way out is to ${fix}`
          : `Either restore the pre-migration backup ${backup}, the database as it was before this upgrade (see Upgrading → Restore from Backup), or ${fix}`;
      return `Migration ${migration} did not finish at an earlier start. ${error} It does not run in one transaction, so some of its changes may be in the database, and Peek will not run it again by itself. ${ways} ${more}\n${resolveCommand("--rolled-back", migration)}`;
    }
    case "retryFailed": {
      const back =
        backup === null
          ? ""
          : ` To go back to the version you ran before instead, restore the pre-migration backup ${backup} (see Upgrading → Downgrading).`;
      return `Migration ${migration} failed again when Peek retried it. ${error} It runs in one transaction, so it changed nothing, and Peek retries it at every start: fix the cause (a full disk is the usual one) and start Peek again.${back} ${more}`;
    }
    case "alreadyApplied": {
      const unsure =
        backup === null
          ? ""
          : ` If you are not sure, restore the pre-migration backup ${backup} instead, the database as it was before this upgrade (see Upgrading → Restore from Backup).`;
      return `Migration ${migration} failed when Peek retried it. ${error} The migration itself creates or drops ${details.object ?? "that object"}, so it most likely finished at an earlier start that stopped before Prisma recorded it. Mark it applied with the command below (${RESOLVE_COMMAND_HELP}), then start Peek again.${unsure} ${more}\n${resolveCommand("--applied", migration)}`;
    }
  }
}

/**
 * Thrown when a migration that failed cannot be retried by itself: one that
 * is not atomic and did not finish at an earlier start (before anything runs),
 * or an atomic one whose retry failed. The message names the migration,
 * Prisma's error, the newest pre-migration backup and the ways out.
 */
export class MigrationFailedError extends Error {
  readonly migration: string;
  readonly failure: MigrationFailure;
  readonly output: string | null;
  readonly backup: string | null;

  constructor(details: MigrationFailedDetails) {
    super(migrationFailedMessage(details));
    this.name = "MigrationFailedError";
    this.migration = details.migration;
    this.failure = details.failure;
    this.output = details.output;
    this.backup = details.backup;
  }
}

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
  /** `LEGACY_BASELINE_TABLES` the database lacks. */
  missingBaselineTables: string[];
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
    missingBaselineTables: LEGACY_BASELINE_TABLES.filter(
      (table) => !tables.includes(table)
    ),
  };
}

/**
 * Why this version cannot upgrade the database, or null when it can. A new
 * database lacks every baseline table, and one whose history has not reached
 * the baseline gets it from the deploy; neither is refused.
 */
function legacyDatabaseError(plan: MigrationPlan): LegacyDatabaseError | null {
  const missing = plan.missingBaselineTables;
  if (missing.length === 0) return null;
  if (plan.shape === "dbPush") return new LegacyDatabaseError("2.0.0", missing);
  if (plan.applied.includes(BASELINE_MIGRATION)) {
    return new LegacyDatabaseError("3.2.2", missing);
  }
  return null;
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

/**
 * After a failed deploy, gives back the disk its WAL took, which a migration
 * that ran out of space leaves behind. Best effort: the deploy's error is
 * the one that matters.
 */
async function truncateWal(client: PrismaClient): Promise<void> {
  try {
    await client.$queryRaw`PRAGMA wal_checkpoint(TRUNCATE)`;
  } catch (error) {
    logger.warn(
      `Could not truncate the WAL after the failed migration: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

function migrationCount(count: number): string {
  return `${count} migration${count === 1 ? "" : "s"}`;
}

/** A migration folder's SQL, or null when this version has no such folder. */
function readMigrationSql(prismaDir: string, name: string): string | null {
  try {
    return readFileSync(
      path.join(prismaDir, "migrations", name, "migration.sql"),
      "utf8"
    );
  } catch {
    return null;
  }
}

/** The migration Prisma's output for a failed deploy names, if it names one. */
function failedMigrationName(output: string): string | undefined {
  return /Migration name:\s*(\S+)/.exec(output)?.[1];
}

/**
 * What stops startup after the retried deploy failed: a failure of one of the
 * retried migrations, told apart by whether it stumbled on an object the
 * migration itself creates or drops. A later migration's first failure is
 * rethrown as it is, to be retried at the next start when it is atomic.
 */
function retryFailure(
  error: unknown,
  retried: readonly string[],
  prismaDir: string,
  backup: string | null,
  backupDir: string
): unknown {
  const output = error instanceof Error ? error.message : String(error);
  const named = failedMigrationName(output);
  if (named !== undefined && !retried.includes(named)) return error;
  const migration = named ?? retried.join(", ");
  const object = objectMigrationAlreadyChanged(
    readMigrationSql(prismaDir, migration) ?? "",
    output
  );
  return new MigrationFailedError({
    migration,
    failure: object === null ? "retryFailed" : "alreadyApplied",
    output,
    backup,
    backupDir,
    object,
  });
}

/**
 * Brings the database up to this version's migrations with at most one
 * `prisma migrate deploy`, and none when nothing is pending. A v2.0.0 `db push`
 * database is first marked at the baseline; one this version cannot upgrade
 * throws `LegacyDatabaseError` before anything is written.
 *
 * A migration an earlier start left unfinished is marked rolled back and
 * deployed again when it is atomic: it changed nothing. Otherwise, or when
 * that retry fails, it throws `MigrationFailedError`.
 */
export async function migrateDatabase(
  opts: MigrateOptions = {}
): Promise<MigrationResult> {
  const client = opts.client ?? prisma;
  const prismaDir = opts.prismaDir ?? defaultPrismaDir();
  const cli = { prismaDir, databaseUrl: opts.databaseUrl };
  const backupDir = opts.configDir ?? getConfigDir();
  const backups = { client, dir: opts.configDir };
  const version = getServerVersion();
  const plan = await readMigrationPlan(client, prismaDir);

  const legacy = legacyDatabaseError(plan);
  if (legacy) throw legacy;

  if (plan.unknownApplied.length > 0) {
    logger.warn(
      `A newer Peek migrated this database (migrations this version does not have: ${plan.unknownApplied.join(", ")}). Starting anyway; to go back, restore its pre-migration backup from ${backupDir}`
    );
  }

  // A migration an earlier start began and never finished. An atomic one
  // rolled back whole, so it runs again; any other may have applied part of
  // itself, and nothing is touched
  const retry = [...new Set(plan.unfinished.map((row) => row.name))];
  let newestBackup: string | null = null;
  let haveBackupForVersion = false;
  if (retry.length > 0) {
    const taken = await databaseBackupService.listPreMigrationBackups(backups);
    newestBackup = taken[taken.length - 1]?.path ?? null;
    const partial = plan.unfinished.find(
      (row) => !isAtomicMigration(readMigrationSql(prismaDir, row.name) ?? "")
    );
    if (partial) {
      throw new MigrationFailedError({
        migration: partial.name,
        failure: "partial",
        output: partial.logs,
        backup: newestBackup,
        backupDir,
      });
    }
    for (const name of retry) {
      logger.warn(
        `Migration ${name} was interrupted and rolled back; retrying`
      );
    }
    // The start that failed took it, and the server has not served since:
    // it is still the database before this version's migrations
    haveBackupForVersion =
      (
        await databaseBackupService.listPreMigrationBackups({
          ...backups,
          version,
        })
      ).length > 0;
  }

  // A new database has nothing to lose. Any other gets a copy before the
  // first write, which for a v2.0.0 database is the baseline marking; a
  // refusal for lack of space stops here with nothing changed
  if (
    plan.shape !== "empty" &&
    (plan.pending.length > 0 || plan.shape === "dbPush") &&
    !haveBackupForVersion
  ) {
    const backup = await databaseBackupService.createPreMigrationBackup(
      version,
      backups
    );
    if (retry.length > 0) newestBackup = backup.path;
  }

  if (retry.length > 0) {
    await client.$disconnect();
    for (const name of retry) {
      await runPrismaCli(["migrate", "resolve", "--rolled-back", name], cli);
    }
  }

  let pending = plan.pending;
  if (plan.shape === "dbPush") {
    // v2.0.0 created its tables with `db push`, which keeps no history: they
    // are the baseline's, so the baseline is marked applied without running
    logger.info(
      `This database is from Peek v2.0.0, before migration history: marking ${BASELINE_MIGRATION} applied`
    );
    await client.$disconnect();
    await runPrismaCli(
      ["migrate", "resolve", "--applied", BASELINE_MIGRATION],
      cli
    );
    pending = pending.filter((name) => name !== BASELINE_MIGRATION);
  }

  if (pending.length === 0) {
    const current = plan.applied.length + plan.pending.length;
    logger.info(`Database schema is up to date (${migrationCount(current)})`);
    return { plan, applied: [] };
  }

  logger.info(
    `Applying ${pending.length} pending ${pending.length === 1 ? "migration" : "migrations"}: ${pending.join(", ")}`
  );
  // No pooled connection stays open while the migrations' DDL runs; the
  // client reconnects at its next query
  await client.$disconnect();
  const started = performance.now();
  try {
    await runPrismaCli(["migrate", "deploy"], cli);
  } catch (error) {
    await truncateWal(client);
    if (retry.length === 0) throw error;
    throw retryFailure(error, retry, prismaDir, newestBackup, backupDir);
  }
  const seconds = ((performance.now() - started) / 1000).toFixed(1);
  logger.info(`Applied ${migrationCount(pending.length)} in ${seconds} s`);
  return { plan, applied: pending };
}
