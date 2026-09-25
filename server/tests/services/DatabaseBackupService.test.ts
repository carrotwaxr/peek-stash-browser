/**
 * Unit Tests for DatabaseBackupService
 */
import type { PathLike, Stats, StatsFs } from "fs";
import fs, { type FileHandle } from "fs/promises";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { must } from "../helpers/must.js";
import { partialRow, prismaImpl } from "../helpers/prismaMock.js";

// Mock fs/promises
vi.mock("fs/promises");

// Mock prisma
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

// Mock logger
vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  },
}));

/** `fs.readdir` as the service calls it: it lists names, not `Dirent`s. */
/** `fs.stat` as the service calls it: plain `Stats`, not `BigIntStats`. */
const mockStat = vi.mocked<(path: PathLike) => Promise<Stats>>(fs.stat);
const mockReaddir = vi.mocked<(path: PathLike) => Promise<string[]>>(
  fs.readdir
);
/** `fs.statfs` as the service calls it: plain `StatsFs`. */
const mockStatfs = vi.mocked<(path: PathLike) => Promise<StatsFs>>(fs.statfs);
const mockPrisma = vi.mocked(prisma, true);

const MIB = 1024 * 1024;

/**
 * A database at `file` whose pages in use hold `used` bytes, as the
 * backup's size check reads it.
 */
function databaseOf(file: string, used: number): void {
  mockPrisma.$queryRaw.mockImplementation(
    prismaImpl<typeof prisma.$queryRaw>((query) => {
      const sql = "sql" in query ? query.sql : query.join("?");
      if (sql.includes("pragma_database_list")) return [{ file }];
      if (sql.includes("pragma_page_count")) return [{ used: BigInt(used) }];
      throw new Error(`unexpected query: ${sql}`);
    })
  );
}

/** A file handle whose `sync` and `close` succeed. */
function fileHandle(): FileHandle {
  return partialRow<FileHandle>({
    sync: vi.fn(() => Promise.resolve()),
    close: vi.fn(() => Promise.resolve()),
  });
}

/**
 * The backup directory `/app/data` on a fake disk, holding `existing` (names
 * to mtimes), 4096 bytes each. `open(name, "wx")` claims a name, failing
 * with EEXIST when it exists; `VACUUM INTO` fails as SQLite does when its
 * target exists and is not empty, and otherwise writes 4096 bytes.
 */
function fakeBackupDir(existing: Record<string, Date> = {}): void {
  const files = new Map(
    Object.entries(existing).map(([name, mtime]) => [
      `/app/data/${name}`,
      { size: 4096, mtime },
    ])
  );
  vi.mocked(fs.open).mockImplementation((file, flags) => {
    const name = String(file);
    if (flags === "wx" && files.has(name)) {
      return Promise.reject(
        Object.assign(
          new Error(`EEXIST: file already exists, open '${name}'`),
          {
            code: "EEXIST",
          }
        )
      );
    }
    if (!files.has(name)) files.set(name, { size: 0, mtime: new Date() });
    return Promise.resolve(fileHandle());
  });
  mockPrisma.$executeRaw.mockImplementation(
    prismaImpl<typeof prisma.$executeRaw>((_query, ...values: unknown[]) => {
      const target = String(values[0]);
      if ((files.get(target)?.size ?? 0) > 0) {
        throw new Error(
          "Raw query failed. Code: `1`. Message: `output file already exists`"
        );
      }
      files.set(target, { size: 4096, mtime: new Date() });
      return 0;
    })
  );
  mockStat.mockImplementation((file) => {
    const entry = files.get(String(file));
    return entry
      ? Promise.resolve(partialRow(entry))
      : Promise.reject(
          new Error(`ENOENT: no such file, stat '${String(file)}'`)
        );
  });
  mockReaddir.mockImplementation(() =>
    Promise.resolve([...files.keys()].map((name) => path.basename(name)))
  );
  vi.mocked(fs.unlink).mockImplementation((file) => {
    files.delete(String(file));
    return Promise.resolve();
  });
}

// Mock environment
const originalEnv = process.env;

describe("DatabaseBackupService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv, CONFIG_DIR: "/app/data" };
    databaseOf("/app/data/peek-stash-browser.db", MIB);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.resetModules();
  });

  describe("listBackups", () => {
    it("should return empty array when no backups exist", async () => {
      mockReaddir.mockResolvedValue([
        "peek-stash-browser.db",
        "other-file.txt",
      ]);

      const { databaseBackupService } =
        await import("../../services/DatabaseBackupService.js");
      const backups = await databaseBackupService.listBackups();

      expect(backups).toEqual([]);
    });

    it("should return backup files with metadata", async () => {
      mockReaddir.mockResolvedValue([
        "peek-stash-browser.db",
        "peek-stash-browser.db.backup-20260118-104532",
        "peek-stash-browser.db.backup-20260117-093045",
      ]);

      mockStat.mockImplementation(async (filePath) => {
        const filename = path.basename(filePath as string);
        if (filename === "peek-stash-browser.db.backup-20260118-104532") {
          return partialRow({
            size: 246747136,
            mtime: new Date("2026-01-18T10:45:32.000Z"),
          });
        }
        return partialRow({
          size: 123456789,
          mtime: new Date("2026-01-17T09:30:45.000Z"),
        });
      });

      const { databaseBackupService } =
        await import("../../services/DatabaseBackupService.js");
      const backups = await databaseBackupService.listBackups();

      expect(backups).toHaveLength(2);
      expect(must(backups[0]).filename).toBe(
        "peek-stash-browser.db.backup-20260118-104532"
      );
      expect(must(backups[0]).size).toBe(246747136);
      expect(must(backups[1]).filename).toBe(
        "peek-stash-browser.db.backup-20260117-093045"
      );
    });

    it("should sort backups by date descending (newest first)", async () => {
      mockReaddir.mockResolvedValue([
        "peek-stash-browser.db.backup-20260117-093045",
        "peek-stash-browser.db.backup-20260118-104532",
      ]);

      mockStat.mockImplementation(async (filePath) => {
        const filename = path.basename(filePath as string);
        if (filename.includes("20260118")) {
          return partialRow({
            size: 100,
            mtime: new Date("2026-01-18T10:45:32.000Z"),
          });
        }
        return partialRow({
          size: 100,
          mtime: new Date("2026-01-17T09:30:45.000Z"),
        });
      });

      const { databaseBackupService } =
        await import("../../services/DatabaseBackupService.js");
      const backups = await databaseBackupService.listBackups();

      expect(must(backups[0]).filename).toContain("20260118");
      expect(must(backups[1]).filename).toContain("20260117");
    });

    it("should log error and rethrow when directory read fails", async () => {
      const { logger } = await import("../../utils/logger.js");
      const readError = new Error("ENOENT: no such file or directory");
      mockReaddir.mockRejectedValue(readError);

      const { databaseBackupService } =
        await import("../../services/DatabaseBackupService.js");

      await expect(databaseBackupService.listBackups()).rejects.toThrow(
        "ENOENT: no such file or directory"
      );
      expect(logger.error).toHaveBeenCalledWith(
        "Failed to read backup directory",
        expect.objectContaining({
          dataDir: "/app/data",
          error: "ENOENT: no such file or directory",
        })
      );
    });

    it("should gracefully skip files deleted between readdir and stat", async () => {
      mockReaddir.mockResolvedValue([
        "peek-stash-browser.db.backup-20260118-104532",
        "peek-stash-browser.db.backup-20260117-093045",
        "peek-stash-browser.db.backup-20260116-080000",
      ]);

      mockStat.mockImplementation(async (filePath) => {
        const filename = path.basename(filePath as string);
        // Simulate file deletion - middle file throws ENOENT
        if (filename.includes("20260117")) {
          throw new Error("ENOENT: no such file or directory");
        }
        if (filename.includes("20260118")) {
          return partialRow({
            size: 200,
            mtime: new Date("2026-01-18T10:45:32.000Z"),
          });
        }
        return partialRow({
          size: 100,
          mtime: new Date("2026-01-16T08:00:00.000Z"),
        });
      });

      const { databaseBackupService } =
        await import("../../services/DatabaseBackupService.js");
      const backups = await databaseBackupService.listBackups();

      // Should return 2 backups, skipping the deleted one
      expect(backups).toHaveLength(2);
      expect(must(backups[0]).filename).toBe(
        "peek-stash-browser.db.backup-20260118-104532"
      );
      expect(must(backups[1]).filename).toBe(
        "peek-stash-browser.db.backup-20260116-080000"
      );
    });

    it("lists pre-migration and legacy backups with their kind", async () => {
      const manual = "peek-stash-browser.db.backup-20260118-104532";
      const sameSecond = "peek-stash-browser.db.backup-20260118-104532-2";
      const preMigration =
        "peek-stash-browser.db.backup-20260924-101112-pre-3.5.0";
      const legacy = "peek-stash-browser.db.backup.20251201_083000";
      const mtimes: Record<string, Date> = {
        [manual]: new Date("2026-01-18T10:45:32.100Z"),
        [sameSecond]: new Date("2026-01-18T10:45:32.900Z"),
        [preMigration]: new Date("2026-09-24T10:11:12.000Z"),
        [legacy]: new Date("2025-12-01T08:30:00.000Z"),
        // Not backups of this database
        "peek-stash-browser.db": new Date("2026-09-24T11:00:00.000Z"),
        "peek-stash-browser.db-wal": new Date("2026-09-24T11:00:00.000Z"),
        [`${preMigration}-wal`]: new Date("2026-09-24T10:11:12.000Z"),
        "peek-stash-browser.db.failed-migration": new Date("2026-01-26"),
        "other.db.backup-20260118-104532": new Date("2026-01-18"),
      };
      fakeBackupDir(mtimes);

      const { databaseBackupService } =
        await import("../../services/DatabaseBackupService.js");
      const backups = await databaseBackupService.listBackups();

      const entry = (
        filename: string,
        kind: string,
        version: string | null
      ) => ({
        filename,
        kind,
        version,
        path: `/app/data/${filename}`,
        size: 4096,
        createdAt: must(mtimes[filename]),
      });
      expect(backups).toEqual([
        entry(preMigration, "preMigration", "3.5.0"),
        entry(sameSecond, "manual", null),
        entry(manual, "manual", null),
        entry(legacy, "legacy", null),
      ]);
    });
  });

  describe("createBackup", () => {
    it("should create a backup with timestamped filename", async () => {
      // Mock Date to get predictable filename - must be before import
      vi.useFakeTimers();
      const mockDate = new Date("2026-01-18T10:45:32.000Z");
      vi.setSystemTime(mockDate);
      fakeBackupDir();

      const { databaseBackupService } =
        await import("../../services/DatabaseBackupService.js");

      const backup = await databaseBackupService.createBackup();

      expect(backup.filename).toBe(
        "peek-stash-browser.db.backup-20260118-104532"
      );
      expect(backup.size).toBe(4096);
      // The path is a bound parameter, not spliced into the SQL
      const [sql, ...values] = must(mockPrisma.$executeRaw.mock.calls[0]);
      expect([...(sql as TemplateStringsArray)]).toEqual(["VACUUM INTO ", ""]);
      expect(values).toEqual([
        "/app/data/peek-stash-browser.db.backup-20260118-104532",
      ]);
      expect(mockPrisma.$executeRawUnsafe).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it("should throw error if VACUUM INTO fails", async () => {
      fakeBackupDir();
      mockPrisma.$executeRaw.mockRejectedValue(new Error("Database locked"));

      const { databaseBackupService } =
        await import("../../services/DatabaseBackupService.js");

      await expect(databaseBackupService.createBackup()).rejects.toThrow(
        "Database locked"
      );
      // Nothing is left behind under the name
      expect(await databaseBackupService.listBackups()).toEqual([]);
    });

    it("two backups in the same second both succeed", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-18T10:45:32.000Z"));
      fakeBackupDir();

      const { databaseBackupService } =
        await import("../../services/DatabaseBackupService.js");

      const made = await Promise.all([
        databaseBackupService.createBackup(),
        databaseBackupService.createBackup(),
      ]);

      expect(made.map((backup) => backup.filename)).toEqual([
        "peek-stash-browser.db.backup-20260118-104532",
        "peek-stash-browser.db.backup-20260118-104532-2",
      ]);
      expect(made.map((backup) => backup.kind)).toEqual(["manual", "manual"]);
      const listed = await databaseBackupService.listBackups();
      expect(listed.map((backup) => backup.filename).sort()).toEqual([
        "peek-stash-browser.db.backup-20260118-104532",
        "peek-stash-browser.db.backup-20260118-104532-2",
      ]);

      vi.useRealTimers();
    });

    it("names backups after the database file", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-01-18T10:45:32.000Z"));
      databaseOf("/data/peek-db.db", MIB);
      fakeBackupDir({
        "peek-db.db.backup-20260117-093045": new Date("2026-01-17T09:30:45Z"),
        "peek-stash-browser.db.backup-20260117-093045": new Date(
          "2026-01-17T09:30:45Z"
        ),
      });

      const { databaseBackupService } =
        await import("../../services/DatabaseBackupService.js");

      const backup = await databaseBackupService.createBackup();
      expect(backup.filename).toBe("peek-db.db.backup-20260118-104532");
      expect(backup.path).toBe("/app/data/peek-db.db.backup-20260118-104532");
      const listed = await databaseBackupService.listBackups();
      expect(listed.map((b) => b.filename)).toEqual([
        "peek-db.db.backup-20260118-104532",
        "peek-db.db.backup-20260117-093045",
      ]);
      // Another database's backups are not this one's to delete
      await expect(
        databaseBackupService.deleteBackup(
          "peek-stash-browser.db.backup-20260117-093045"
        )
      ).rejects.toThrow("Invalid backup filename");

      vi.useRealTimers();
    });
  });

  describe("createPreMigrationBackup", () => {
    it("refuses with InsufficientSpaceError when free space is under 2.2x the used size plus 64 MiB, and writes nothing", async () => {
      databaseOf("/app/data/peek-stash-browser.db", 100 * MIB);
      // 2.2 * 100 MiB + 64 MiB, in bytes; one byte short of it is free
      const needed = 297_795_584;
      mockStatfs.mockResolvedValue(
        partialRow({ bavail: needed - 1, bsize: 1 })
      );

      const { databaseBackupService, InsufficientSpaceError } =
        await import("../../services/DatabaseBackupService.js");

      const refusal = databaseBackupService.createPreMigrationBackup("3.5.0");
      await expect(refusal).rejects.toThrow(InsufficientSpaceError);
      await expect(refusal).rejects.toMatchObject({
        dir: "/app/data",
        free: needed - 1,
        needed,
      });
      await expect(refusal).rejects.toThrow("needs 297.8 MB free");
      expect(mockStatfs).toHaveBeenCalledWith("/app/data");
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
      expect(fs.open).not.toHaveBeenCalled();
      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it("deletes a partial file when VACUUM INTO fails with SQLITE_FULL", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-24T10:11:12.000Z"));
      databaseOf("/app/data/peek-stash-browser.db", 100 * MIB);
      mockStatfs.mockResolvedValue(
        partialRow({ bavail: 1024 * MIB, bsize: 1 })
      );
      vi.mocked(fs.open).mockResolvedValue(fileHandle());
      const full = new Error(
        "Raw query failed. Code: `13`. Message: `database or disk is full`"
      );
      mockPrisma.$executeRaw.mockRejectedValue(full);
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const { databaseBackupService } =
        await import("../../services/DatabaseBackupService.js");

      await expect(
        databaseBackupService.createPreMigrationBackup("3.5.0")
      ).rejects.toBe(full);
      const target =
        "/app/data/peek-stash-browser.db.backup-20260924-101112-pre-3.5.0";
      expect(must(mockPrisma.$executeRaw.mock.calls[0]).slice(1)).toEqual([
        target,
      ]);
      expect(fs.unlink).toHaveBeenCalledExactlyOnceWith(target);

      vi.useRealTimers();
    });
  });

  describe("listPreMigrationBackups", () => {
    it("lists this database's pre-migration backups oldest first, or those of one version", async () => {
      databaseOf("/app/data/peek-stash-browser.db", MIB);
      mockReaddir.mockResolvedValue([
        "peek-stash-browser.db.backup-20260102-000000-pre-3.4.0",
        "peek-stash-browser.db.backup-20260101-000000-pre-3.3.8",
        "peek-stash-browser.db.backup-20260102-000000-pre-3.4.0-wal",
        "peek-stash-browser.db.backup-20260103-000000-pre-3.4.0-beta.1",
        "peek-stash-browser.db.backup-20250101-000000",
        "other.db.backup-20260101-000000-pre-3.4.0",
      ]);
      const mtime = new Date("2026-01-02T00:00:00Z");
      mockStat.mockResolvedValue(partialRow({ size: 4096, mtime }));

      const { databaseBackupService } =
        await import("../../services/DatabaseBackupService.js");

      const all = await databaseBackupService.listPreMigrationBackups();
      expect(all.map((backup) => backup.path)).toEqual([
        "/app/data/peek-stash-browser.db.backup-20260101-000000-pre-3.3.8",
        "/app/data/peek-stash-browser.db.backup-20260102-000000-pre-3.4.0",
        "/app/data/peek-stash-browser.db.backup-20260103-000000-pre-3.4.0-beta.1",
      ]);
      expect(must(all[0])).toEqual({
        filename: "peek-stash-browser.db.backup-20260101-000000-pre-3.3.8",
        kind: "preMigration",
        version: "3.3.8",
        path: "/app/data/peek-stash-browser.db.backup-20260101-000000-pre-3.3.8",
        size: 4096,
        createdAt: mtime,
      });
      const ofVersion = await databaseBackupService.listPreMigrationBackups({
        version: "3.4.0",
      });
      expect(ofVersion.map((backup) => backup.filename)).toEqual([
        "peek-stash-browser.db.backup-20260102-000000-pre-3.4.0",
      ]);
    });
  });

  describe("deleteBackup", () => {
    it("should delete a valid backup file", async () => {
      vi.mocked(fs.unlink).mockResolvedValue(undefined);

      const { databaseBackupService } =
        await import("../../services/DatabaseBackupService.js");

      await databaseBackupService.deleteBackup(
        "peek-stash-browser.db.backup-20260118-104532"
      );

      expect(fs.unlink).toHaveBeenCalledWith(
        "/app/data/peek-stash-browser.db.backup-20260118-104532"
      );
    });

    it("should reject invalid filenames (path traversal prevention)", async () => {
      const { databaseBackupService } =
        await import("../../services/DatabaseBackupService.js");

      await expect(
        databaseBackupService.deleteBackup("../../../etc/passwd")
      ).rejects.toThrow("Invalid backup filename");

      await expect(
        databaseBackupService.deleteBackup("peek-stash-browser.db")
      ).rejects.toThrow("Invalid backup filename");

      await expect(
        databaseBackupService.deleteBackup("random-file.txt")
      ).rejects.toThrow("Invalid backup filename");

      expect(fs.unlink).not.toHaveBeenCalled();
    });

    it("should throw error if file does not exist", async () => {
      vi.mocked(fs.unlink).mockRejectedValue(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" })
      );

      const { databaseBackupService } =
        await import("../../services/DatabaseBackupService.js");

      await expect(
        databaseBackupService.deleteBackup(
          "peek-stash-browser.db.backup-20260118-104532"
        )
      ).rejects.toThrow();
    });
  });
});
