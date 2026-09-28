/**
 * DatabaseBackupService
 *
 * Handles database backup operations:
 * - List existing backups of every kind (see `BACKUP_PATTERNS`)
 * - Create new backups using VACUUM INTO, under a temporary name that is
 *   renamed once the copy is complete and on disk (`writeBackup`)
 * - Delete backup files
 * - Back up the database before the server applies pending migrations, and
 *   list those backups
 * - Delete what an interrupted backup left (`discardInterruptedBackups`)
 *
 * Nothing here sends a backup to the browser: a backup holds every user's
 * password hash and history and the Stash API keys, so it stays on the data
 * volume.
 */
import type { DatabaseBackupKind } from "@peek/shared-types/api/databaseBackup.js";
import type { PrismaClient } from "@prisma/client";
import fs, { type FileHandle } from "fs/promises";
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

/**
 * Added to a backup's name while it is written: no backup pattern matches
 * it, so a copy cut off partway never poses as a backup.
 */
const PARTIAL_SUFFIX = ".partial";

/** The files SQLite may keep beside a database it writes. */
const SQLITE_SIDECARS = ["-journal", "-wal", "-shm"] as const;

/** The first 16 bytes of every SQLite database file: this text, then a 0. */
const SQLITE_MAGIC = Buffer.concat([
  Buffer.from("SQLite format 3", "latin1"),
  Buffer.alloc(1),
]);

/** SQLite's database header is 100 bytes: a shorter file is no database. */
const SQLITE_HEADER_BYTES = 100;

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
 * never match SQLite's `-wal`, `-shm` or `-journal` files beside one, nor a
 * backup still being written (`<name>.partial`):
 * - `manual`, from Settings → Backup: `<base>.backup-<YYYYMMDD-HHMMSS>`,
 *   then `-2`, `-3`... for more in the same second;
 * - `preMigration`, from the server before it applies a version's
 *   migrations: `<base>.backup-<YYYYMMDD-HHMMSS>-pre-<version>`, then `-2`,
 *   `-3`... for more in the same second (a restart). The groups are `stamp`,
 *   `version` (without that number: Peek's versions never end in
 *   `-<digits>`) and `copy`;
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
      `^${escapeRegExp(base)}\\.backup-(?<stamp>\\d{8}-\\d{6})-pre-(?<version>[0-9A-Za-z.+_-]+?)(?:-(?<copy>\\d+))?(?<!-wal|-shm|-journal|\\.partial)$`
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
    if (match) return { kind, version: match.groups?.version ?? null };
  }
  return null;
}

/**
 * - `complete`: a whole SQLite file as far as its header shows, or one this
 *   user cannot read, which is not known to be broken and stays as it is;
 * - `incomplete`: cut off partway (see `backupFileState`);
 * - `gone`: deleted since the directory was read.
 */
type BackupFileState = "complete" | "incomplete" | "gone";

/** The state of a backup file that could not be opened or read. */
function unreadableState(error: unknown): BackupFileState {
  const code = (error as NodeJS.ErrnoException).code;
  if (code === "ENOENT") return "gone";
  if (typeof code === "string") return "complete";
  throw error;
}

/**
 * Whether the backup `filename` in `dir` (`present` being the directory's
 * names) is complete. Versions before 3.4.0-beta.3 wrote a backup under its
 * final name, so a process stopped while copying left one cut off partway:
 * with SQLite's `-journal` beside it, still being written; or with no
 * journal yet, when it stopped between creating the empty file and SQLite's
 * first write, a file shorter than SQLite's 100-byte header or without its
 * first 16 bytes. Manual and pre-migration backups are checked; legacy ones,
 * copied by `start.sh`, are complete. Reads only the 100-byte header.
 */
async function backupFileState(
  dir: string,
  filename: string,
  kind: BackupKind,
  present: ReadonlySet<string>
): Promise<BackupFileState> {
  if (present.has(`${filename}-journal`)) return "incomplete";
  if (kind === "legacy") return "complete";
  let handle: FileHandle;
  try {
    handle = await fs.open(path.join(dir, filename), "r");
  } catch (error) {
    return unreadableState(error);
  }
  try {
    const header = Buffer.alloc(SQLITE_HEADER_BYTES);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return bytesRead === header.length &&
      header.subarray(0, SQLITE_MAGIC.length).equals(SQLITE_MAGIC)
      ? "complete"
      : "incomplete";
  } catch (error) {
    return unreadableState(error);
  } finally {
    await handle.close();
  }
}

interface PreMigrationName {
  filename: string;
  version: string;
  /** When it was taken, `YYYYMMDD-HHMMSS`. */
  stamp: string;
  /** 1, then 2, 3... for later backups in the same second. */
  copy: number;
}

function compareText(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/**
 * The complete pre-migration backups of `base` among `names` in `dir`,
 * oldest first. One cut off partway (`backupFileState`) is left out, so it is
 * never listed and never counted among the backups kept.
 */
async function completePreMigrationBackups(
  dir: string,
  names: readonly string[],
  base: string
): Promise<PreMigrationName[]> {
  const present = new Set(names);
  const pattern = BACKUP_PATTERNS.preMigration(base);
  const backups: PreMigrationName[] = [];
  for (const filename of names) {
    const groups = pattern.exec(filename)?.groups;
    if (groups === undefined) continue;
    const state = await backupFileState(dir, filename, "preMigration", present);
    if (state !== "complete") continue;
    backups.push({
      filename,
      version: groups.version ?? "",
      stamp: groups.stamp ?? "",
      copy: groups.copy === undefined ? 1 : Number(groups.copy),
    });
  }
  return backups.sort(
    (a, b) =>
      compareText(a.stamp, b.stamp) ||
      a.copy - b.copy ||
      compareText(a.filename, b.filename)
  );
}

/**
 * The files among `names` in `dir` that interrupted backups of `base` left:
 * the temporaries of copies that never finished (`<backup>.partial`, with
 * SQLite's `-journal`, `-wal` and `-shm` beside them), and each backup cut
 * off partway (`backupFileState`) with SQLite's files beside it.
 */
async function interruptedBackupFiles(
  dir: string,
  names: readonly string[],
  base: string
): Promise<string[]> {
  const present = new Set(names);
  const temporary = new RegExp(
    `^${escapeRegExp(base)}\\.backup-.+${escapeRegExp(PARTIAL_SUFFIX)}(?:${SQLITE_SIDECARS.join("|")})?$`
  );
  const files = names.filter((name) => temporary.test(name));
  for (const name of names) {
    const parsed = parseBackupName(name, base);
    if (parsed === null) continue;
    const state = await backupFileState(dir, name, parsed.kind, present);
    if (state !== "incomplete") continue;
    files.push(
      name,
      ...SQLITE_SIDECARS.map((sidecar) => `${name}${sidecar}`).filter((file) =>
        present.has(file)
      )
    );
  }
  return files;
}

/**
 * Deletes what interrupted backups of `base` left in `dir`
 * (`interruptedBackupFiles`), logging each at WARN. None of it is being
 * written: one server uses a database, and it takes its backups one at a
 * time, pre-migration ones before it serves and manual ones in a queue. A
 * file that cannot be deleted is logged and left; it is still never listed
 * or counted.
 */
async function discardInterruptedBackups(
  dir: string,
  base: string
): Promise<void> {
  const names = await fs.readdir(dir);
  for (const name of await interruptedBackupFiles(dir, names, base)) {
    try {
      await fs.unlink(path.join(dir, name));
      logger.warn(
        `Deleted ${name} from ${dir}: a backup that was interrupted before it finished left it`
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      logger.warn(`Could not delete ${name}, left by an interrupted backup`, {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
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

/** More backups than this in one second is a loop, not a person or a restart. */
const MAX_BACKUPS_PER_SECOND = 100;

/** Bytes in the pages the database uses (its freelist left out). */
async function usedBytes(client: PrismaClient): Promise<number> {
  const rows = await client.$queryRaw<{ used: bigint | number }[]>`
    SELECT (page_count - freelist_count) * page_size AS used
    FROM pragma_page_count(), pragma_freelist_count(), pragma_page_size()
  `;
  return Number(rows[0]?.used ?? 0);
}

/** Flushes a file's contents to disk. */
async function syncFile(file: string): Promise<void> {
  const handle = await fs.open(file, "r+");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

/**
 * Flushes a directory's entries to disk, so a rename in it survives a power
 * cut. Skipped where the platform cannot open or fsync a directory.
 */
async function syncDirectory(dir: string): Promise<void> {
  try {
    const handle = await fs.open(dir, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === undefined || !DIRECTORY_SYNC_UNSUPPORTED.has(code)) {
      throw error;
    }
  }
}

/**
 * Copies the database `client` is connected to into `dir` as `stem`, or
 * `stem-2`, `stem-3`... when a file has that name, and returns the name.
 * `VACUUM INTO` writes `<name>.partial`, which is synced and then renamed, and
 * the directory synced: a backup name only ever names a complete copy on
 * disk, and a copy cut off partway is a temporary no pattern matches. A
 * failed copy leaves nothing behind.
 */
async function writeBackup(
  client: PrismaClient,
  dir: string,
  stem: string
): Promise<string> {
  const taken = new Set(await fs.readdir(dir));
  for (let n = 1; n <= MAX_BACKUPS_PER_SECOND; n++) {
    const filename = n === 1 ? stem : `${stem}-${n}`;
    if (taken.has(filename)) continue;
    const backupPath = path.join(dir, filename);
    const partialPath = `${backupPath}${PARTIAL_SUFFIX}`;
    // VACUUM INTO writes into an empty file. Creating the temporary here
    // claims it, so the cleanup below never deletes a file this call did not
    // make
    try {
      await (await fs.open(partialPath, "wx")).close();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") continue;
      throw error;
    }
    let renamed = false;
    try {
      await client.$executeRaw`VACUUM INTO ${partialPath}`;
      // A power cut after the migration must not find a torn backup
      await syncFile(partialPath);
      await fs.rename(partialPath, backupPath);
      renamed = true;
      await syncDirectory(dir);
    } catch (error) {
      const leftovers = [
        partialPath,
        ...SQLITE_SIDECARS.map((sidecar) => `${partialPath}${sidecar}`),
        ...(renamed ? [backupPath] : []),
      ];
      for (const file of leftovers) {
        await fs.unlink(file).catch(() => undefined);
      }
      throw error;
    }
    return filename;
  }
  throw new Error(`Too many backups named ${stem} in ${dir}`);
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
   * backup directory, newest first. A backup still being written, or cut off
   * partway (`backupFileState`), is not one.
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

    const present = new Set(files);
    const results = await Promise.all(
      files.map(async (filename): Promise<BackupInfo | null> => {
        const parsed = parseBackupName(filename, base);
        if (!parsed) return null;
        const state = await backupFileState(
          dataDir,
          filename,
          parsed.kind,
          present
        );
        if (state !== "complete") return null;
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
   * Creates a backup with SQLite's `VACUUM INTO` (`writeBackup`), named after
   * the database file: `<base>.backup-<YYYYMMDD-HHMMSS>`, or with `-2`,
   * `-3`... when a backup of that second exists. Backups run one at a time,
   * each after the one before it; a failed one leaves no file behind. What an
   * interrupted backup left is deleted first (`discardInterruptedBackups`).
   */
  createBackup(): Promise<BackupInfo> {
    return this.manualBackups.run("backup.manual", () =>
      this.writeManualBackup()
    );
  }

  private async writeManualBackup(): Promise<BackupInfo> {
    const dataDir = this.getBackupDir();
    const base = await getDatabaseBaseName();
    await discardInterruptedBackups(dataDir, base);

    logger.info(`Creating database backup in ${dataDir}`);
    const filename = await writeBackup(
      prisma,
      dataDir,
      `${base}.backup-${this.formatTimestamp(new Date())}`
    );
    const backupPath = path.join(dataDir, filename);
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
   * Copies the database with `VACUUM INTO` (`writeBackup`) before the server
   * migrates it to `targetVersion`, as
   * `<base>.backup-<YYYYMMDD-HHMMSS>-pre-<targetVersion>` in the backup
   * directory, or with `-2`, `-3`... when a start in the same second took
   * that name; then deletes all but the newest `PRE_MIGRATION_BACKUPS_KEPT`
   * complete pre-migration backups. Manual and legacy backups are never
   * pruned.
   *
   * First deletes what an interrupted backup left (`discardInterruptedBackups`):
   * the start before this one may have died while copying. Then throws
   * `InsufficientSpaceError`, before writing anything, when the directory has
   * less free space than the backup and the migration need. A failed copy
   * leaves nothing behind.
   */
  async createPreMigrationBackup(
    targetVersion: string,
    opts: PreMigrationBackupOptions = {}
  ): Promise<PreMigrationBackup> {
    const client = opts.client ?? prisma;
    const dir = opts.dir ?? this.getBackupDir();
    const base = await getDatabaseBaseName(client);
    // What a dead start left takes space the backup needs
    await discardInterruptedBackups(dir, base);

    const used = await usedBytes(client);
    const { bavail, bsize } = await fs.statfs(dir);
    const free = bavail * bsize;
    const needed = Math.ceil(
      used * UPGRADE_SPACE_PER_USED_BYTE + UPGRADE_SPACE_MARGIN
    );
    if (free < needed) throw new InsufficientSpaceError(dir, free, needed);

    const version = fileNamePart(targetVersion);
    const started = performance.now();
    const filename = await writeBackup(
      client,
      dir,
      `${base}.backup-${this.formatTimestamp(new Date())}-pre-${version}`
    );
    const backupPath = path.join(dir, filename);
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
   * The complete pre-migration backups of the database `client` is connected
   * to, oldest first; with `version`, only those taken before migrating to
   * it.
   */
  async listPreMigrationBackups(
    opts: PreMigrationBackupListOptions = {}
  ): Promise<PreMigrationBackup[]> {
    const dir = opts.dir ?? this.getBackupDir();
    const base = await getDatabaseBaseName(opts.client ?? prisma);
    const wanted =
      opts.version === undefined ? undefined : fileNamePart(opts.version);
    const backups: PreMigrationBackup[] = [];
    for (const { filename, version } of await completePreMigrationBackups(
      dir,
      await fs.readdir(dir),
      base
    )) {
      if (wanted !== undefined && version !== wanted) continue;
      const backupPath = path.join(dir, filename);
      try {
        const stat = await fs.stat(backupPath);
        backups.push({
          filename,
          kind: "preMigration",
          version,
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
   * Deletes all but the newest `PRE_MIGRATION_BACKUPS_KEPT` complete
   * pre-migration backups of `base` in `dir`. One cut off partway is not
   * counted, so it never costs a good backup its place.
   */
  private async prunePreMigrationBackups(
    dir: string,
    base: string
  ): Promise<void> {
    const backups = await completePreMigrationBackups(
      dir,
      await fs.readdir(dir),
      base
    );
    const old = backups.slice(0, -PRE_MIGRATION_BACKUPS_KEPT);
    for (const { filename: name } of old) {
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
