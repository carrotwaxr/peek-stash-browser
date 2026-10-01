import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanupExpiredDownloads,
  scheduleDownloadCleanup,
  sweepOrphanedDownloadFiles,
} from "../../jobs/downloadCleanup.js";
import prisma from "../../prisma/singleton.js";
import { downloadJobQueue } from "../../services/DownloadJobQueue.js";
import { downloadsDir, zipPath } from "../../utils/downloadPaths.js";
import { downloadRow } from "../helpers/fixtures.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../utils/logger.js", () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../services/DownloadJobQueue.js", () => ({
  downloadJobQueue: { isActive: vi.fn() },
}));

const mockPrisma = vi.mocked(prisma, true);
const mockQueue = vi.mocked(downloadJobQueue, true);

describe("download cleanup", () => {
  const previousConfigDir = process.env.CONFIG_DIR;
  let configDir: string;

  beforeEach(() => {
    vi.clearAllMocks();
    configDir = fs.mkdtempSync(path.join(os.tmpdir(), "peek-cleanup-"));
    process.env.CONFIG_DIR = configDir;
    mockQueue.isActive.mockReturnValue(false);
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.download.findMany.mockResolvedValue([]);
  });

  afterEach(() => {
    if (previousConfigDir === undefined) delete process.env.CONFIG_DIR;
    else process.env.CONFIG_DIR = previousConfigDir;
    fs.rmSync(configDir, { recursive: true, force: true });
  });

  /** A zip file for the user's download, with its folder */
  function writeZip(userId: number, downloadId: number): string {
    const file = zipPath(userId, downloadId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, "zip bytes");
    return file;
  }

  describe("cleanupExpiredDownloads", () => {
    it("an expired completed zip is deleted and marked EXPIRED", async () => {
      const file = writeZip(1, 4);
      mockPrisma.download.findMany.mockResolvedValue([
        downloadRow({
          id: 4,
          userId: 1,
          type: "PLAYLIST",
          status: "COMPLETED",
          filePath: file,
          expiresAt: new Date(Date.now() - 1000),
        }),
      ]);
      mockPrisma.download.update.mockResolvedValue(partialRow({}));

      await cleanupExpiredDownloads();

      expect(fs.existsSync(file)).toBe(false);
      expect(mockPrisma.download.update).toHaveBeenCalledWith({
        where: { id: 4 },
        data: { status: "EXPIRED", filePath: null },
      });
    });
  });

  describe("sweepOrphanedDownloadFiles", () => {
    /** The COMPLETED rows that name the given files, as the sweep asks */
    function completedRows(
      rows: Array<{ id: number; userId: number; filePath: string }>
    ): void {
      mockPrisma.download.findMany.mockImplementation((args) => {
        const userId = args?.where?.userId;
        return Promise.resolve(
          rows
            .filter((row) => row.userId === userId)
            .map((row) =>
              downloadRow({ ...row, type: "PLAYLIST", status: "COMPLETED" })
            )
        ) as never;
      });
    }

    it("a user folder whose user no longer exists is removed", async () => {
      writeZip(5, 1);
      writeZip(6, 2);
      mockPrisma.user.findMany.mockResolvedValue([partialRow({ id: 6 })]);
      completedRows([{ id: 2, userId: 6, filePath: zipPath(6, 2) }]);

      await sweepOrphanedDownloadFiles();

      expect(fs.existsSync(path.dirname(zipPath(5, 1)))).toBe(false);
      expect(fs.existsSync(zipPath(6, 2))).toBe(true);
      expect(mockPrisma.user.findMany).toHaveBeenCalledExactlyOnceWith({
        where: { id: { in: [5, 6] } },
        select: { id: true },
      });
    });

    it("a zip file with no COMPLETED row naming it is removed", async () => {
      const stray = writeZip(1, 3);
      const kept = writeZip(1, 4);
      mockPrisma.user.findMany.mockResolvedValue([partialRow({ id: 1 })]);
      completedRows([{ id: 4, userId: 1, filePath: kept }]);

      await sweepOrphanedDownloadFiles();

      expect(fs.existsSync(stray)).toBe(false);
      expect(fs.existsSync(kept)).toBe(true);
    });

    it("a zip still being built is kept", async () => {
      const building = writeZip(1, 8);
      mockPrisma.user.findMany.mockResolvedValue([partialRow({ id: 1 })]);
      mockQueue.isActive.mockImplementation((id) => id === 8);

      await sweepOrphanedDownloadFiles();

      expect(fs.existsSync(building)).toBe(true);
    });

    it("a zip whose build completes after the rows were read is kept", async () => {
      const file = writeZip(1, 8);
      mockPrisma.user.findMany.mockResolvedValue([partialRow({ id: 1 })]);
      // The build is running while the sweep reads the COMPLETED rows (so
      // 8 is not among them), then marks its row COMPLETED and leaves the
      // queue before the sweep reaches the file
      let building = true;
      mockQueue.isActive.mockImplementation((id) => id === 8 && building);
      mockPrisma.download.findMany.mockImplementation(() => {
        building = false;
        return Promise.resolve([]) as never;
      });
      mockPrisma.download.findFirst.mockImplementation(
        (args) =>
          Promise.resolve(
            args?.where?.id === 8
              ? downloadRow({
                  id: 8,
                  userId: 1,
                  type: "PLAYLIST",
                  status: "COMPLETED",
                  filePath: file,
                })
              : null
          ) as never
      );

      await sweepOrphanedDownloadFiles();

      expect(fs.existsSync(file)).toBe(true);
    });

    it("the current zip of a completed row is kept", async () => {
      const file = writeZip(2, 9);
      mockPrisma.user.findMany.mockResolvedValue([partialRow({ id: 2 })]);
      completedRows([{ id: 9, userId: 2, filePath: file }]);

      await sweepOrphanedDownloadFiles();

      expect(fs.existsSync(file)).toBe(true);
    });

    it("a completed row that names another file does not keep this one", async () => {
      const file = writeZip(2, 9);
      mockPrisma.user.findMany.mockResolvedValue([partialRow({ id: 2 })]);
      completedRows([
        { id: 9, userId: 2, filePath: path.join(configDir, "elsewhere.zip") },
      ]);

      await sweepOrphanedDownloadFiles();

      expect(fs.existsSync(file)).toBe(false);
    });

    it("files not named download-<n>.zip are left alone", async () => {
      writeZip(1, 1);
      const dir = path.dirname(zipPath(1, 1));
      const others = ["notes.txt", "download-x.zip", "download-3.zip.part"].map(
        (name) => path.join(dir, name)
      );
      for (const file of others) fs.writeFileSync(file, "x");
      const loose = path.join(downloadsDir(), "readme.txt");
      fs.writeFileSync(loose, "x");
      const foreign = path.join(downloadsDir(), "backup");
      fs.mkdirSync(foreign);
      mockPrisma.user.findMany.mockResolvedValue([partialRow({ id: 1 })]);

      await sweepOrphanedDownloadFiles();

      for (const file of [...others, loose, foreign]) {
        expect(fs.existsSync(file), file).toBe(true);
      }
      expect(fs.existsSync(zipPath(1, 1))).toBe(false);
    });

    it("one failing file does not stop the sweep", async () => {
      // A directory in a zip's name: unlink refuses it
      const dir = path.dirname(zipPath(1, 1));
      fs.mkdirSync(path.join(dir, "download-1.zip"), { recursive: true });
      const second = writeZip(1, 2);
      mockPrisma.user.findMany.mockResolvedValue([partialRow({ id: 1 })]);

      await expect(sweepOrphanedDownloadFiles()).resolves.toBeUndefined();

      expect(fs.existsSync(second)).toBe(false);
    });

    it("a missing downloads folder is nothing to sweep", async () => {
      await expect(sweepOrphanedDownloadFiles()).resolves.toBeUndefined();
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });
  });

  describe("scheduleDownloadCleanup", () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    /** Runs of the expiry pass: its read is the one filtering on expiresAt */
    function expiryReads() {
      return mockPrisma.download.findMany.mock.calls.filter(
        ([args]) => args?.where?.expiresAt !== undefined
      ).length;
    }

    it("runs at once, expiring finished zips before sweeping stray files, then every hour", async () => {
      vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
      const expiredFile = writeZip(1, 4);
      const strayFile = writeZip(1, 9);
      mockPrisma.user.findMany.mockResolvedValue([partialRow({ id: 1 })]);
      mockPrisma.download.findMany.mockResolvedValueOnce([
        downloadRow({
          id: 4,
          userId: 1,
          type: "PLAYLIST",
          status: "COMPLETED",
          filePath: expiredFile,
          expiresAt: new Date(Date.now() - 1000),
        }),
      ]);
      mockPrisma.download.update.mockResolvedValue(partialRow({}));

      scheduleDownloadCleanup();

      await vi.waitFor(() => {
        expect(fs.existsSync(strayFile)).toBe(false);
      });
      expect(fs.existsSync(expiredFile)).toBe(false);
      expect(mockPrisma.download.update).toHaveBeenCalledWith({
        where: { id: 4 },
        data: { status: "EXPIRED", filePath: null },
      });
      // The sweep reads the users' folders only after the expiry pass has
      // marked the row EXPIRED
      const expired = must(
        mockPrisma.download.update.mock.invocationCallOrder[0]
      );
      const swept = must(mockPrisma.user.findMany.mock.invocationCallOrder[0]);
      expect(expired).toBeLessThan(swept);
      expect(expiryReads()).toBe(1);

      await vi.advanceTimersByTimeAsync(59 * 60 * 1000);
      expect(expiryReads()).toBe(1);

      await vi.advanceTimersByTimeAsync(60 * 1000);
      await vi.waitFor(() => {
        expect(expiryReads()).toBe(2);
      });
    });
  });
});
