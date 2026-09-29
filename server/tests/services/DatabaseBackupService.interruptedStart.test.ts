/**
 * The pre-migration backup survives an interrupted start. A start killed
 * while it copied the database (two nodemon restarts within a second, or a
 * crash-looping container) must not leave a file posing as a backup, must not
 * stop the next start, and must not cost an older good backup.
 *
 * Real files in a temporary CONFIG_DIR; the database client is a stub whose
 * `VACUUM INTO` writes its target as SQLite does: a `-journal` beside it
 * while it writes, which it deletes when it commits.
 */
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import {
  databaseBackupService,
  parseBackupName,
} from "../../services/DatabaseBackupService.js";
import { logger } from "../../utils/logger.js";
import { stringContaining } from "../helpers/matchers.js";
import { prismaImpl } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  },
}));

const mockPrisma = vi.mocked(prisma, true);

const BASE = "peek-stash-browser.db";
const VERSION = "3.4.0-beta.2";
/** The clock of every test: the second the dev stack's restarts shared. */
const NOW = new Date("2026-09-28T08:06:15.000Z");
const STAMP = "20260928-080615";
/** The backup a start at `NOW` takes before migrating to `VERSION`. */
const FINAL = `${BASE}.backup-${STAMP}-pre-${VERSION}`;

/**
 * What the stub's `VACUUM INTO` writes, a stand-in for the copy: one page,
 * starting with SQLite's header.
 */
const COPY = "SQLite format 3\u0000".padEnd(4096, "x");

describe("DatabaseBackupService after an interrupted start", () => {
  let dir: string;
  const savedConfigDir = process.env.CONFIG_DIR;

  /** While `VACUUM INTO` writes, after its journal and first bytes. */
  let whileCopying: ((target: string) => void) | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "peek-backup-interrupted-"));
    process.env.CONFIG_DIR = dir;
    whileCopying = undefined;

    mockPrisma.$queryRaw.mockImplementation(
      prismaImpl<typeof prisma.$queryRaw>((query) => {
        const sql = "sql" in query ? query.sql : query.join("?");
        if (sql.includes("pragma_database_list")) {
          return [{ file: path.join(dir, BASE) }];
        }
        if (sql.includes("pragma_page_count")) return [{ used: 4096n }];
        throw new Error(`unexpected query: ${sql}`);
      })
    );
    mockPrisma.$executeRaw.mockImplementation(
      prismaImpl<typeof prisma.$executeRaw>((_query, ...values: unknown[]) => {
        const target = String(values[0]);
        if (fs.existsSync(target) && fs.statSync(target).size > 0) {
          throw new Error(
            "Raw query failed. Code: `1`. Message: `output file already exists`"
          );
        }
        fs.writeFileSync(`${target}-journal`, "");
        fs.writeFileSync(target, COPY.slice(0, 8));
        whileCopying?.(target);
        fs.writeFileSync(target, COPY);
        fs.unlinkSync(`${target}-journal`);
        return 0;
      })
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    fs.rmSync(dir, { recursive: true, force: true });
    process.env.CONFIG_DIR = savedConfigDir;
  });

  function seed(name: string, content = COPY): void {
    fs.writeFileSync(path.join(dir, name), content);
  }

  function filesInDir(): string[] {
    return fs.readdirSync(dir).sort();
  }

  /** The files in the backup directory any backup pattern matches. */
  function backupNamed(): string[] {
    return filesInDir().filter((name) => parseBackupName(name, BASE) !== null);
  }

  it("a start that finds a leftover .partial deletes it and backs up", async () => {
    // A start one second earlier died while copying
    const leftover = `${BASE}.backup-20260928-080614-pre-${VERSION}.partial`;
    seed(leftover, COPY.slice(0, 8));
    seed(`${leftover}-journal`, "");

    const backup =
      await databaseBackupService.createPreMigrationBackup(VERSION);

    expect(backup.filename).toBe(FINAL);
    expect(filesInDir()).toEqual([FINAL]);
    expect(fs.readFileSync(path.join(dir, FINAL), "utf8")).toBe(COPY);
    expect(logger.warn).toHaveBeenCalledWith(stringContaining(leftover));
  });

  it("a backup whose name is taken gets -2", async () => {
    // A start in the same second backed up, then died before it migrated
    seed(FINAL);

    const backup =
      await databaseBackupService.createPreMigrationBackup(VERSION);

    expect(backup.filename).toBe(`${FINAL}-2`);
    expect(backup.version).toBe(VERSION);
    expect(fs.readFileSync(path.join(dir, `${FINAL}-2`), "utf8")).toBe(COPY);
    // Oldest first: the second copy of a second after the first
    const ofVersion = await databaseBackupService.listPreMigrationBackups({
      version: VERSION,
    });
    expect(ofVersion.map((b) => b.filename)).toEqual([FINAL, `${FINAL}-2`]);
    expect(ofVersion.map((b) => b.version)).toEqual([VERSION, VERSION]);
  });

  it("a pre-migration backup with a -journal sibling is not counted and is removed", async () => {
    const complete = [
      `${BASE}.backup-20260925-130559-pre-3.4.0-beta.1`,
      `${BASE}.backup-20260925-140010-pre-3.4.0-beta.1`,
      `${BASE}.backup-20260925-155612-pre-3.4.0-beta.1`,
    ];
    for (const name of complete) seed(name);
    // An older version's copy, cut off mid-write one second earlier
    const cutOff = `${BASE}.backup-20260928-080614-pre-${VERSION}`;
    seed(cutOff, COPY.slice(0, 8));
    seed(`${cutOff}-journal`, "");

    await databaseBackupService.createPreMigrationBackup(VERSION);

    // The newest three complete backups: the one taken and the two newest
    // before it. Only the fourth complete one was pruned
    expect(filesInDir()).toEqual([...complete.slice(1), FINAL]);
    expect(logger.warn).toHaveBeenCalledWith(stringContaining(cutOff));
  });

  it("the backup just written survives a clock stepped back behind three older stamps", async () => {
    // The host's clock read earlier than the last three starts (no RTC
    // before NTP syncs), so the new stamp sorts oldest
    const later = [
      `${BASE}.backup-20261001-130559-pre-3.4.0-beta.1`,
      `${BASE}.backup-20261001-140010-pre-3.4.0-beta.1`,
      `${BASE}.backup-20261001-155612-pre-3.4.0-beta.1`,
    ];
    for (const name of later) seed(name);

    const backup =
      await databaseBackupService.createPreMigrationBackup(VERSION);

    expect(backup.filename).toBe(FINAL);
    // The new one and the two newest of the others: three kept
    expect(filesInDir()).toEqual([FINAL, ...later.slice(1)]);
  });

  it("an older -journal beside the backup just completed does not make it incomplete", async () => {
    const older = [
      `${BASE}.backup-20260925-130559-pre-3.4.0-beta.1`,
      `${BASE}.backup-20260925-140010-pre-3.4.0-beta.1`,
      `${BASE}.backup-20260925-155612-pre-3.4.0-beta.1`,
    ];
    for (const name of older) seed(name);
    // A SQLite client's leftover journal, from before the copy
    const realRename = fs.promises.rename.bind(fs.promises);
    const rename = vi.spyOn(fs.promises, "rename");
    rename.mockImplementation(async (from, to) => {
      await realRename(from, to);
      if (String(to).endsWith(FINAL)) {
        const journal = `${String(to)}-journal`;
        fs.writeFileSync(journal, "");
        const past = new Date(Date.now() - 60_000);
        fs.utimesSync(journal, past, past);
      }
    });

    try {
      await databaseBackupService.createPreMigrationBackup(VERSION);
    } finally {
      rename.mockRestore();
    }

    // Counted as complete: the oldest of the four was pruned, not the new one
    expect(backupNamed()).toEqual([...older.slice(1), FINAL]);
    expect(fs.existsSync(path.join(dir, `${FINAL}-journal`))).toBe(true);
  });

  it("a -journal newer than a backup marks it incomplete", async () => {
    seed(FINAL);
    const journal = path.join(dir, `${FINAL}-journal`);
    seed(`${FINAL}-journal`, "");
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(dir, FINAL), past, past);
    expect(fs.statSync(journal).mtimeMs).toBeGreaterThan(
      fs.statSync(path.join(dir, FINAL)).mtimeMs
    );

    const listed = await databaseBackupService.listPreMigrationBackups();

    expect(listed).toEqual([]);
  });

  it("a 0-byte pre-migration backup is not counted and is removed", async () => {
    const complete = [
      `${BASE}.backup-20260925-130559-pre-3.4.0-beta.1`,
      `${BASE}.backup-20260925-140010-pre-3.4.0-beta.1`,
      `${BASE}.backup-20260925-155612-pre-3.4.0-beta.1`,
    ];
    for (const name of complete) seed(name);
    // An older version claimed the name with an empty file and was killed
    // before SQLite wrote a byte or its journal
    const empty = `${BASE}.backup-20260928-080614-pre-${VERSION}`;
    seed(empty, "");

    expect(
      (await databaseBackupService.listBackups()).map((b) => b.filename)
    ).not.toContain(empty);

    await databaseBackupService.createPreMigrationBackup(VERSION);

    expect(filesInDir()).toEqual([...complete.slice(1), FINAL]);
    expect(logger.warn).toHaveBeenCalledWith(stringContaining(empty));
  });

  it("a backup without SQLite's header, or shorter than it, is not listed and is removed", async () => {
    const complete = `${BASE}.backup-20260925-155612-pre-3.4.0-beta.1`;
    const manual = `${BASE}.backup-20260927-120000`;
    seed(complete);
    seed(manual);
    // Not a database: the size of one, without SQLite's header
    const wrongHeader = `${BASE}.backup-20260927-130000-pre-3.4.0-beta.2`;
    seed(wrongHeader, "\u0000".repeat(4096));
    // SQLite's first 16 bytes, cut off inside its 100-byte header
    const short = `${BASE}.backup-20260927-140000`;
    seed(short, COPY.slice(0, 60));

    expect(
      (await databaseBackupService.listBackups()).map((b) => b.filename).sort()
    ).toEqual([complete, manual].sort());
    expect(
      (await databaseBackupService.listPreMigrationBackups()).map(
        (b) => b.filename
      )
    ).toEqual([complete]);

    await databaseBackupService.createPreMigrationBackup(VERSION);

    expect(filesInDir()).toEqual([complete, manual, FINAL].sort());
    expect(logger.warn).toHaveBeenCalledWith(stringContaining(wrongHeader));
    expect(logger.warn).toHaveBeenCalledWith(stringContaining(short));
  });

  it("a failed VACUUM leaves no file matching a backup pattern", async () => {
    const full = new Error(
      "Raw query failed. Code: `13`. Message: `database or disk is full`"
    );
    // What a start killed at this instant would leave behind
    let duringCopy: string[] | undefined;
    whileCopying = () => {
      duringCopy = backupNamed();
      throw full;
    };

    await expect(
      databaseBackupService.createPreMigrationBackup(VERSION)
    ).rejects.toBe(full);

    expect(duringCopy).toEqual([]);
    expect(filesInDir()).toEqual([]);
  });

  it("a manual backup is also written under a temporary name", async () => {
    let duringCopy: string[] | undefined;
    whileCopying = () => {
      duringCopy = backupNamed();
    };

    const backup = await databaseBackupService.createBackup();

    expect(duringCopy).toEqual([]);
    expect(backup.filename).toBe(`${BASE}.backup-${STAMP}`);
    expect(filesInDir()).toEqual([`${BASE}.backup-${STAMP}`]);
  });

  it("the backup listing never shows a .partial or journal-marked file", async () => {
    const manual = `${BASE}.backup-20260927-120000`;
    const preMigration = `${BASE}.backup-20260925-155612-pre-3.4.0-beta.1`;
    const cutOff = `${BASE}.backup-20260928-080614-pre-${VERSION}`;
    const cutOffManual = `${BASE}.backup-20260927-130000`;
    seed(manual);
    seed(preMigration);
    seed(`${FINAL}.partial`, COPY.slice(0, 8));
    seed(`${FINAL}.partial-journal`, "");
    seed(`${BASE}.backup-20260927-140000.partial`, COPY.slice(0, 8));
    seed(cutOff, COPY.slice(0, 8));
    seed(`${cutOff}-journal`, "");
    seed(cutOffManual, COPY.slice(0, 8));
    seed(`${cutOffManual}-journal`, "");

    const listed = await databaseBackupService.listBackups();
    expect(listed.map((b) => b.filename).sort()).toEqual(
      [manual, preMigration].sort()
    );
    const preMigrationListed =
      await databaseBackupService.listPreMigrationBackups();
    expect(preMigrationListed.map((b) => b.filename)).toEqual([preMigration]);
    const ofVersion = await databaseBackupService.listPreMigrationBackups({
      version: VERSION,
    });
    expect(ofVersion).toEqual([]);
    // A temporary is no backup, so nothing can ask to delete one
    await expect(
      databaseBackupService.deleteBackup(`${FINAL}.partial`)
    ).rejects.toThrow("Invalid backup filename");
  });
});
