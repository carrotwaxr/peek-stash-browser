/**
 * DatabaseBackupService
 *
 * Handles database backup operations:
 * - List existing backups of every kind (see `BACKUP_PATTERNS`)
 * - Create new backups using VACUUM INTO
 * - Delete backup files
 * - Back up the database before the server applies pending migrations, and
 *   list those backups
 *
 * Nothing here sends a backup to the browser: a backup holds every user's
 * password hash and history and the Stash API keys, so it stays on the data
 * volume.
 */
import type { DatabaseBackupKind } from "@peek/shared-types/api/databaseBackup.js";
import type { PrismaClient } from "@prisma/client";
import fs from "fs/promises";
import path from "path";
import prisma from "../prisma/singleton.js";
import { getConfigDir } from "../utils/configDir.js";
import { logger } from "../utils/logger.js";
import { createSerialQueue } from "../utils/serialQueue.js";

/** How many pre-migration backups are kept; older ones are deleted. */
export const PRE_MIGRATION_BACKUPS_KEPT = 3;

const MIB = 1024 * 1024;

/**
 * Free space an upgrade needs, per byte the database uses: the backup (about
 * the used size, since `VACUUM INTO` writes only used pages), the migrations'
 * peak WAL (up to the used size again for a migration that rebuilds tables)
 * and the main file's growth.
 */
const UPGRADE_SPACE_PER_USED_BYTE = 2.2;
/** Headroom on top, so a small database still leaves room to run. */
const UPGRADE_SPACE_MARGIN = 64 * MIB;

/** Errors meaning the platform cannot open or fsync a directory. */
const DIRECTORY_SYNC_UNSUPPORTED = new Set([
  "EINVAL",
  "ENOTSUP",
  "EISDIR",
  "EPERM",
]);

export type BackupKind = DatabaseBackupKind;

export interface BackupInfo {
  filename: string;
  kind: BackupKind;
  /**
   * The version a pre-migration backup was taken before migrating to; null
   * for the other kinds.
   */
  version: string | null;
  /** The backup's full path. */
  path: string;
  size: number;
  createdAt: Date;
}

export interface PreMigrationBackup extends BackupInfo {
  kind: "preMigration";
  version: string;
}

export interface PreMigrationBackupOptions {
  /** The database to back up; the server's client by default. */
  client?: PrismaClient;
  /** Where the backup goes; `getBackupDir()` by default. */
  dir?: string;
}

export interface PreMigrationBackupListOptions extends PreMigrationBackupOptions {
  /** Only the backups taken before migrating to this version. */
  version?: string;
}

/** Bytes as MB or GB, for messages. */
function formatSize(bytes: number): string {
  return bytes >= 1e9
    ? `${(bytes / 1e9).toFixed(2)} GB`
    : `${(bytes / 1e6).toFixed(1)} MB`;
}

/**
 * Thrown before a migration when the backup directory has too little free
 * space for the backup and the migration after it. Nothing has been written.
 */
export class InsufficientSpaceError extends Error {
  readonly dir: string;
  /** Bytes free in `dir`. */
  readonly free: number;
  /** Bytes the backup and the migration need free. */
  readonly needed: number;

  constructor(dir: string, free: number, needed: number) {
    super(
      `Not enough disk space to upgrade the database: the upgrade needs ${formatSize(needed)} free in ${dir}, which has ${formatSize(free)} (a backup of the database, then room for the migrations to run). Free at least ${formatSize(needed - free)} there, for example by deleting old *.backup-* files, then start Peek again. Nothing was changed.`
    );
    this.name = "InsufficientSpaceError";
    this.dir = dir;
    this.free = free;
    this.needed = needed;
  }
}

/** A string safe inside a file name: the version, in practice. */
function fileNamePart(value: string): string {
  return value.replace(/[^0-9A-Za-z.+-]/g, "_");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The file names of each kind of backup of the database named `base`, which
 * never match SQLite's `-wal`, `-shm` or `-journal` files beside one:
 * - `manual`, from Settings → Backup: `<base>.backup-<YYYYMMDD-HHMMSS>`,
 *   then `-2`, `-3`... for more in the same second;
 * - `preMigration`, from the server before it applies a version's
 *   migrations: `<base>.backup-<YYYYMMDD-HHMMSS>-pre-<version>`, the
 *   version captured;
 * - `legacy`, from `start.sh` before 3.4.0, before it baselined a
 *   `db push` database: `<base>.backup.<YYYYMMDD_HHMMSS>`.
 */
export const BACKUP_PATTERNS: Readonly<
  Record<BackupKind, (base: string) => RegExp>
> = {
  manual: (base) =>
    new RegExp(`^${escapeRegExp(base)}\\.backup-\\d{8}-\\d{6}(?:-\\d+)?$`),
  preMigration: (base) =>
    new RegExp(
      `^${escapeRegExp(base)}\\.backup-\\d{8}-\\d{6}-pre-([0-9A-Za-z.+_-]+)(?<!-wal|-shm|-journal)$`
    ),
  legacy: (base) =>
    new RegExp(`^${escapeRegExp(base)}\\.backup\\.\\d{8}_\\d{6}$`),
};

const BACKUP_KINDS: readonly BackupKind[] = [
  "manual",
  "preMigration",
  "legacy",
];

/**
 * What `filename` is as a backup of the database named `base`, or null when
 * it is not one.
 */
export function parseBackupName(
  filename: string,
  base: string
): { kind: BackupKind; version: string | null } | null {
  for (const kind of BACKUP_KINDS) {
    const match = BACKUP_PATTERNS[kind](base).exec(filename);
    if (match) return { kind, version: match[1] ?? null };
  }
  return null;
}

/**
 * The names of the pre-migration backups of `base` in `dir`, oldest first:
 * their names sort by their timestamps.
 */
async function preMigrationBackupNames(
  dir: string,
  base: string
): Promise<string[]> {
  const pattern = BACKUP_PATTERNS.preMigration(base);
  return (await fs.readdir(dir)).filter((name) => pattern.test(name)).sort();
}

/**
 * The file name of the database `client` is connected to, such as
 * `peek-stash-browser.db`, read from SQLite itself so that it holds wherever
 * `DATABASE_URL` points.
 */
export async function getDatabaseBaseName(
  client: PrismaClient = prisma
): Promise<string> {
  const rows = await client.$queryRaw<
    { file: string }[]
  >`SELECT file FROM pragma_database_list WHERE name = 'main'`;
  const file = rows[0]?.file ?? "";
  return file === "" ? "peek-stash-browser.db" : path.basename(file);
}

/** More manual backups than this in one second is a loop, not a person. */
const MAX_BACKUPS_PER_SECOND = 100;

/**
 * Creates an empty file named `stem` in `dir`, or `stem-2`, `stem-3`... when
 * the name is taken, and returns its name. `VACUUM INTO` writes into an
 * empty file, and creating it first claims the name, so a failed backup's
 * cleanup deletes only a file this call made.
 */
async function claimBackupName(dir: string, stem: string): Promise<string> {
  for (let n = 1; n <= MAX_BACKUPS_PER_SECOND; n++) {
    const filename = n === 1 ? stem : `${stem}-${n}`;
    try {
      await (await fs.open(path.join(dir, filename), "wx")).close();
      return filename;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
  }
  throw new Error(`Too many backups named ${stem} in ${dir}`);
}

/** Bytes in the pages the database uses (its freelist left out). */
async function usedBytes(client: PrismaClient): Promise<number> {
  const rows = await client.$queryRaw<{ used: bigint | number }[]>`
    SELECT (page_count - freelist_count) * page_size AS used
    FROM pragma_page_count(), pragma_freelist_count(), pragma_page_size()
  `;
  return Number(rows[0]?.used ?? 0);
}

/** Flushes a file, then its directory entry, to disk. */
async function syncToDisk(file: string): Promise<void> {
  const handle = await fs.open(file, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    const dir = await fs.open(path.dirname(file), "r");
    try {
      await dir.sync();
    } finally {
      await dir.close();
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === undefined || !DIRECTORY_SYNC_UNSUPPORTED.has(code)) {
      throw error;
    }
  }
}

class DatabaseBackupService {
  /** Manual backups, one at a time: each claims its name after the last. */
  private readonly manualBackups = createSerialQueue({
    name: "createBackup",
  });

  /** Where backups are written and listed: the config directory. */
  getBackupDir(): string {
    return getConfigDir();
  }

  /**
   * The backups of this database of every kind (`BACKUP_PATTERNS`) in the
   * backup directory, newest first.
   */
  async listBackups(): Promise<BackupInfo[]> {
    const dataDir = this.getBackupDir();
    const base = await getDatabaseBaseName();

    let files: string[];
    try {
      files = await fs.readdir(dataDir);
    } catch (error) {
      logger.error("Failed to read backup directory", {
        dataDir,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    const results = await Promise.all(
      files.map(async (filename): Promise<BackupInfo | null> => {
        const parsed = parseBackupName(filename, base);
        if (!parsed) return null;
        const filePath = path.join(dataDir, filename);
        try {
          const stat = await fs.stat(filePath);
          return {
            filename,
            ...parsed,
            path: filePath,
            size: stat.size,
            createdAt: stat.mtime,
          };
        } catch {
          // File was deleted between readdir and stat - skip it
          return null;
        }
      })
    );
    const backups = results.filter((b): b is BackupInfo => b !== null);

    // Newest first; a same-second `-2` before the one it follows
    backups.sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() ||
        b.filename.localeCompare(a.filename)
    );

    return backups;
  }

  /**
   * Creates a backup with SQLite's `VACUUM INTO`, named after the database
   * file: `<base>.backup-<YYYYMMDD-HHMMSS>`, or with `-2`, `-3`... when a
   * backup of that second exists. Backups run one at a time, each after the
   * one before it; a failed one leaves no file behind.
   */
  createBackup(): Promise<BackupInfo> {
    return this.manualBackups.run("backup.manual", () =>
      this.writeManualBackup()
    );
  }

  private async writeManualBackup(): Promise<BackupInfo> {
    const dataDir = this.getBackupDir();
    const base = await getDatabaseBaseName();
    const filename = await claimBackupName(
      dataDir,
      `${base}.backup-${this.formatTimestamp(new Date())}`
    );
    const backupPath = path.join(dataDir, filename);

    logger.info(`Creating database backup: ${filename}`);

    // Use VACUUM INTO for atomic, consistent backup
    try {
      await prisma.$executeRaw`VACUUM INTO ${backupPath}`;
    } catch (error) {
      await fs.unlink(backupPath).catch(() => undefined);
      throw error;
    }

    const stat = await fs.stat(backupPath);

    logger.info(
      `Backup created successfully: ${filename} (${stat.size} bytes)`
    );

    return {
      filename,
      kind: "manual",
      version: null,
      path: backupPath,
      size: stat.size,
      createdAt: stat.mtime,
    };
  }

  /**
   * Copies the database with `VACUUM INTO` before the server migrates it to
   * `targetVersion`, as `<base>.backup-<YYYYMMDD-HHMMSS>-pre-<targetVersion>`
   * in the backup directory, synced to disk; then deletes all but the newest
   * `PRE_MIGRATION_BACKUPS_KEPT` pre-migration backups. Manual and legacy
   * backups are never deleted.
   *
   * Throws `InsufficientSpaceError`, before writing anything, when the
   * directory has less free space than the backup and the migration need.
   * A failed copy leaves no partial file behind.
   */
  async createPreMigrationBackup(
    targetVersion: string,
    opts: PreMigrationBackupOptions = {}
  ): Promise<PreMigrationBackup> {
    const client = opts.client ?? prisma;
    const dir = opts.dir ?? this.getBackupDir();
    const base = await getDatabaseBaseName(client);

    const used = await usedBytes(client);
    const { bavail, bsize } = await fs.statfs(dir);
    const free = bavail * bsize;
    const needed = Math.ceil(
      used * UPGRADE_SPACE_PER_USED_BYTE + UPGRADE_SPACE_MARGIN
    );
    if (free < needed) throw new InsufficientSpaceError(dir, free, needed);

    const version = fileNamePart(targetVersion);
    const filename = `${base}.backup-${this.formatTimestamp(new Date())}-pre-${version}`;
    const backupPath = path.join(dir, filename);
    const started = performance.now();
    // VACUUM INTO writes into an empty file. Creating it here claims the
    // name, so the cleanup below never deletes a file this call did not make
    await (await fs.open(backupPath, "wx")).close();
    try {
      await client.$executeRaw`VACUUM INTO ${backupPath}`;
      // A power cut after the migration must not find a torn backup
      await syncToDisk(backupPath);
    } catch (error) {
      await fs.unlink(backupPath).catch(() => undefined);
      throw error;
    }
    const seconds = (performance.now() - started) / 1000;

    const stat = await fs.stat(backupPath);
    logger.info(
      `Backed up the database to ${backupPath} before migrating (${formatSize(stat.size)}, ${seconds.toFixed(1)} s)`
    );
    await this.prunePreMigrationBackups(dir, base);
    return {
      filename,
      kind: "preMigration",
      version,
      path: backupPath,
      size: stat.size,
      createdAt: stat.mtime,
    };
  }

  /**
   * The pre-migration backups of the database `client` is connected to,
   * oldest first; with `version`, only those taken before migrating to it.
   */
  async listPreMigrationBackups(
    opts: PreMigrationBackupListOptions = {}
  ): Promise<PreMigrationBackup[]> {
    const dir = opts.dir ?? this.getBackupDir();
    const base = await getDatabaseBaseName(opts.client ?? prisma);
    const suffix =
      opts.version === undefined ? "" : `-pre-${fileNamePart(opts.version)}`;
    const names = (await preMigrationBackupNames(dir, base)).filter((name) =>
      name.endsWith(suffix)
    );
    const pattern = BACKUP_PATTERNS.preMigration(base);
    const backups: PreMigrationBackup[] = [];
    for (const filename of names) {
      const backupPath = path.join(dir, filename);
      try {
        const stat = await fs.stat(backupPath);
        backups.push({
          filename,
          kind: "preMigration",
          version: pattern.exec(filename)?.[1] ?? "",
          path: backupPath,
          size: stat.size,
          createdAt: stat.mtime,
        });
      } catch {
        // Deleted between readdir and stat
      }
    }
    return backups;
  }

  /**
   * Deletes all but the newest `PRE_MIGRATION_BACKUPS_KEPT` pre-migration
   * backups of `base` in `dir`.
   */
  private async prunePreMigrationBackups(
    dir: string,
    base: string
  ): Promise<void> {
    const backups = await preMigrationBackupNames(dir, base);
    for (const name of backups.slice(0, -PRE_MIGRATION_BACKUPS_KEPT)) {
      try {
        await fs.unlink(path.join(dir, name));
        logger.info(`Deleted the old pre-migration backup ${name}`);
      } catch (error) {
        logger.warn(`Could not delete the old pre-migration backup ${name}`, {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /**
   * Delete a backup file of any kind.
   * Validates filename to prevent path traversal attacks.
   */
  async deleteBackup(filename: string): Promise<void> {
    // Security: only a backup of this database, by the patterns
    if (!parseBackupName(filename, await getDatabaseBaseName())) {
      throw new Error("Invalid backup filename");
    }

    const dataDir = this.getBackupDir();
    const filePath = path.join(dataDir, filename);

    logger.info(`Deleting backup: ${filename}`);
    await fs.unlink(filePath);
    logger.info(`Backup deleted: ${filename}`);
  }

  private formatTimestamp(date: Date): string {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    const hours = String(date.getUTCHours()).padStart(2, "0");
    const minutes = String(date.getUTCMinutes()).padStart(2, "0");
    const seconds = String(date.getUTCSeconds()).padStart(2, "0");
    return `${year}${month}${day}-${hours}${minutes}${seconds}`;
  }
}

export const databaseBackupService = new DatabaseBackupService();
