import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { DownloadService } from "../../services/DownloadService.js";
import { type PlaylistWithItems, downloadRow } from "../helpers/fixtures.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";

// Mock prisma
vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

describe("DownloadService", () => {
  let service: DownloadService;

  beforeEach(() => {
    service = new DownloadService();
    vi.clearAllMocks();
  });

  describe("createSceneDownload", () => {
    it("should create a download record for a scene", async () => {
      const mockScene = {
        id: "scene-123",
        title: "Test Scene",
        fileSize: BigInt(1000000),
      };

      vi.mocked(prisma.stashScene.findFirst).mockResolvedValue(
        partialRow(mockScene)
      );
      vi.mocked(prisma.download.create).mockResolvedValue(
        downloadRow({
          id: 1,
          userId: 1,
          type: "SCENE",
          status: "COMPLETED",
          entityType: "scene",
          entityId: "scene-123",
          fileName: "Test Scene.mp4",
          fileSize: BigInt(1000000),
          progress: 100,
          createdAt: new Date(),
          completedAt: new Date(),
          playlistId: null,
          filePath: null,
          error: null,
          expiresAt: null,
        })
      );

      const result = await service.createSceneDownload(
        1,
        "scene-123",
        "inst-a"
      );

      expect(result.type).toBe("SCENE");
      expect(result.status).toBe("COMPLETED");
      expect(result.fileName).toBe("Test Scene.mp4");
      expect(prisma.stashScene.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "scene-123",
            stashInstanceId: "inst-a",
            deletedAt: null,
          },
        })
      );
      expect(
        must(vi.mocked(prisma.download.create).mock.calls[0])[0].data.instanceId
      ).toBe("inst-a");
    });

    it("should throw if scene not found", async () => {
      vi.mocked(prisma.stashScene.findFirst).mockResolvedValue(null);

      await expect(
        service.createSceneDownload(1, "unknown", "inst-a")
      ).rejects.toThrow("Scene not found");
    });
  });

  describe("createImageDownload", () => {
    it("should create a download record for an image", async () => {
      const mockImage = {
        id: "image-123",
        title: "Test Image",
        fileSize: BigInt(500000),
      };

      vi.mocked(prisma.stashImage.findFirst).mockResolvedValue(
        partialRow(mockImage)
      );
      vi.mocked(prisma.download.create).mockResolvedValue(
        downloadRow({
          id: 2,
          userId: 1,
          type: "IMAGE",
          status: "COMPLETED",
          entityType: "image",
          entityId: "image-123",
          fileName: "Test Image.jpg",
          fileSize: BigInt(500000),
          progress: 100,
          createdAt: new Date(),
          completedAt: new Date(),
          playlistId: null,
          filePath: null,
          error: null,
          expiresAt: null,
        })
      );

      const result = await service.createImageDownload(
        1,
        "image-123",
        "inst-a"
      );

      expect(result.type).toBe("IMAGE");
      expect(result.status).toBe("COMPLETED");
      expect(result.fileName).toBe("Test Image.jpg");
      expect(prisma.stashImage.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: "image-123",
            stashInstanceId: "inst-a",
            deletedAt: null,
          },
        })
      );
      expect(
        must(vi.mocked(prisma.download.create).mock.calls[0])[0].data.instanceId
      ).toBe("inst-a");
    });

    it("should throw if image not found", async () => {
      vi.mocked(prisma.stashImage.findFirst).mockResolvedValue(null);

      await expect(
        service.createImageDownload(1, "unknown", "inst-a")
      ).rejects.toThrow("Image not found");
    });
  });

  describe("createPlaylistDownload", () => {
    it("should create a PENDING download for a playlist", async () => {
      const mockPlaylist = partialRow<PlaylistWithItems>({
        id: 1,
        name: "My Playlist",
        items: [partialRow({ sceneId: "s1" }), partialRow({ sceneId: "s2" })],
      });

      vi.mocked(prisma.playlist.findUnique).mockResolvedValue(mockPlaylist);
      vi.mocked(prisma.download.create).mockResolvedValue(
        downloadRow({
          id: 3,
          userId: 1,
          type: "PLAYLIST",
          status: "PENDING",
          playlistId: 1,
          entityType: null,
          entityId: null,
          fileName: "My Playlist.zip",
          fileSize: null,
          progress: 0,
          createdAt: new Date(),
          completedAt: null,
          filePath: null,
          error: null,
          expiresAt: null,
        })
      );

      const result = await service.createPlaylistDownload(1, 1);

      expect(result.type).toBe("PLAYLIST");
      expect(result.status).toBe("PENDING");
      expect(result.fileName).toBe("My Playlist.zip");
      expect(result.progress).toBe(0);
    });

    it("should throw if playlist not found", async () => {
      vi.mocked(prisma.playlist.findUnique).mockResolvedValue(null);

      await expect(service.createPlaylistDownload(1, 999)).rejects.toThrow(
        "Playlist not found"
      );
    });
  });

  describe("the file name a download is created with", () => {
    function createdFileName(): string {
      return must(vi.mocked(prisma, true).download.create.mock.calls[0])[0].data
        .fileName;
    }

    beforeEach(() => {
      vi.mocked(prisma.download.create).mockResolvedValue(downloadRow());
    });

    it("a scene is named by its title made safe", async () => {
      vi.mocked(prisma.stashScene.findFirst).mockResolvedValue(
        partialRow({ id: "s1", title: 'Who? What: "This"/That.\n' })
      );

      await service.createSceneDownload(1, "s1", "inst-a");

      expect(createdFileName()).toBe("Who_ What_ _This__That.mp4");
    });

    it("a scene without a title is named by its file, then by its id", async () => {
      vi.mocked(prisma.stashScene.findFirst)
        .mockResolvedValueOnce(
          partialRow({ id: "s1", title: "", filePath: "/media/My Clip.v2.mkv" })
        )
        .mockResolvedValueOnce(
          partialRow({ id: "s2", title: null, filePath: null })
        );

      await service.createSceneDownload(1, "s1", "inst-a");
      await service.createSceneDownload(1, "s2", "inst-a");

      expect(
        vi
          .mocked(prisma.download.create)
          .mock.calls.map(([args]) => args.data.fileName)
      ).toEqual(["My Clip.v2.mkv", "s2.mp4"]);
    });

    it("a scene is named with its file's extension", async () => {
      vi.mocked(prisma.stashScene.findFirst).mockResolvedValue(
        partialRow({ id: "s1", title: "My Scene", filePath: "/v/Scene.wmv" })
      );

      await service.createSceneDownload(1, "s1", "inst-a");

      expect(createdFileName()).toBe("My Scene.wmv");
    });

    it("an image is named with its file's extension, .jpg without a path", async () => {
      vi.mocked(prisma.stashImage.findFirst)
        .mockResolvedValueOnce(
          partialRow({ id: "i1", title: "Pic", filePath: "/i/a.png" })
        )
        .mockResolvedValueOnce(
          partialRow({ id: "i2", title: "Pic2", filePath: null })
        );

      await service.createImageDownload(1, "i1", "inst-a");
      await service.createImageDownload(1, "i2", "inst-a");

      expect(
        vi
          .mocked(prisma.download.create)
          .mock.calls.map(([args]) => args.data.fileName)
      ).toEqual(["Pic.png", "Pic2.jpg"]);
      const query = must(
        vi.mocked(prisma, true).stashImage.findFirst.mock.calls[0]
      )[0];
      expect(query?.select?.filePath).toBe(true);
    });

    it("an image titled with a Windows device name is not that device", async () => {
      vi.mocked(prisma.stashImage.findFirst).mockResolvedValue(
        partialRow({ id: "i1", title: "NUL" })
      );

      await service.createImageDownload(1, "i1", "inst-a");

      expect(createdFileName()).toBe("_NUL.jpg");
    });

    it("a playlist named '..' downloads as download.zip", async () => {
      vi.mocked(prisma.playlist.findUnique).mockResolvedValue(
        partialRow<PlaylistWithItems>({ id: 1, name: "..", items: [] })
      );

      await service.createPlaylistDownload(1, 1);

      expect(createdFileName()).toBe("download.zip");
    });
  });

  describe("the active zips of a user", () => {
    it("finds this user's PENDING or PROCESSING zip of a playlist", async () => {
      const active = downloadRow({
        id: 4,
        type: "PLAYLIST",
        status: "PENDING",
      });
      vi.mocked(prisma.download.findFirst).mockResolvedValue(active);

      expect(await service.findActivePlaylistDownload(7, 5)).toBe(active);
      expect(prisma.download.findFirst).toHaveBeenCalledWith({
        where: {
          userId: 7,
          type: "PLAYLIST",
          playlistId: 5,
          status: { in: ["PENDING", "PROCESSING"] },
        },
        orderBy: { createdAt: "asc" },
      });
    });

    it("counts this user's PENDING and PROCESSING zips", async () => {
      vi.mocked(prisma.download.count).mockResolvedValue(2);

      expect(await service.countActivePlaylistDownloads(7)).toBe(2);
      expect(prisma.download.count).toHaveBeenCalledWith({
        where: {
          userId: 7,
          type: "PLAYLIST",
          status: { in: ["PENDING", "PROCESSING"] },
        },
      });
    });
  });

  describe("requeueFailedDownload", () => {
    it("sets a FAILED row back to PENDING in one conditional update", async () => {
      vi.mocked(prisma.download.updateMany).mockResolvedValue({ count: 1 });

      expect(await service.requeueFailedDownload(4)).toBe(true);
      expect(prisma.download.updateMany).toHaveBeenCalledWith({
        where: { id: 4, status: "FAILED" },
        data: { status: "PENDING", progress: 0, error: null, skippedItems: 0 },
      });
    });

    it("reports false when the row is no longer FAILED", async () => {
      vi.mocked(prisma.download.updateMany).mockResolvedValue({ count: 0 });

      expect(await service.requeueFailedDownload(4)).toBe(false);
    });
  });

  describe("getDownload", () => {
    it("should return download by id", async () => {
      const mockDownload = downloadRow({
        id: 1,
        userId: 1,
        type: "SCENE",
        status: "COMPLETED",
      });

      vi.mocked(prisma.download.findUnique).mockResolvedValue(mockDownload);

      const result = await service.getDownload(1);

      expect(result).toEqual(mockDownload);
      expect(prisma.download.findUnique).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });
  });

  describe("getUserDownloads", () => {
    it("should return downloads for user sorted by createdAt desc", async () => {
      const mockDownloads = [
        downloadRow({ id: 2, createdAt: new Date("2024-01-02") }),
        downloadRow({ id: 1, createdAt: new Date("2024-01-01") }),
      ];

      vi.mocked(prisma.download.findMany).mockResolvedValue(mockDownloads);

      const result = await service.getUserDownloads(1);

      expect(prisma.download.findMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        orderBy: { createdAt: "desc" },
        take: 20,
      });
      expect(result).toHaveLength(2);
    });

    it("should respect limit parameter", async () => {
      vi.mocked(prisma.download.findMany).mockResolvedValue([]);

      await service.getUserDownloads(1, 50);

      expect(prisma.download.findMany).toHaveBeenCalledWith({
        where: { userId: 1 },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    });
  });

  describe("updateProgress", () => {
    it("should update download progress", async () => {
      vi.mocked(prisma.download.updateMany).mockResolvedValue({ count: 1 });

      const result = await service.updateProgress(1, 50);

      expect(prisma.download.updateMany).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { progress: 50, status: "PROCESSING" },
      });
      expect(result).toBe(true);
    });

    it("reports false for a deleted row", async () => {
      vi.mocked(prisma.download.updateMany).mockResolvedValue({ count: 0 });

      expect(await service.updateProgress(1, 50)).toBe(false);
    });
  });

  describe("markCompleted", () => {
    it("should mark download as completed with 24h expiry", async () => {
      vi.useFakeTimers();
      const now = new Date();
      vi.setSystemTime(now);

      const expectedExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      vi.mocked(prisma.download.updateMany).mockResolvedValue({ count: 1 });

      const result = await service.markCompleted(
        1,
        "/tmp/download.zip",
        BigInt(5000000),
        2
      );

      expect(result).toBe(true);
      const update = must(
        vi.mocked(prisma, true).download.updateMany.mock.calls[0],
        "the download update"
      )[0];
      expect(update.where).toEqual({ id: 1 });
      expect(update.data).toEqual({
        status: "COMPLETED",
        progress: 100,
        filePath: "/tmp/download.zip",
        fileSize: BigInt(5000000),
        skippedItems: 2,
        completedAt: now,
        expiresAt: expectedExpiry,
      });

      vi.useRealTimers();
    });

    it("reports false for a deleted row", async () => {
      vi.mocked(prisma.download.updateMany).mockResolvedValue({ count: 0 });

      expect(await service.markCompleted(1, "/tmp/download.zip", 5n, 0)).toBe(
        false
      );
    });
  });

  describe("markFailed", () => {
    it("should mark download as failed with error message", async () => {
      vi.mocked(prisma.download.updateMany).mockResolvedValue({ count: 1 });

      const result = await service.markFailed(1, "Something went wrong");

      expect(prisma.download.updateMany).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: "FAILED", error: "Something went wrong" },
      });
      expect(result).toBe(true);
    });

    it("reports false for a deleted row", async () => {
      vi.mocked(prisma.download.updateMany).mockResolvedValue({ count: 0 });

      expect(await service.markFailed(1, "Something went wrong")).toBe(false);
    });
  });

  describe("deleteDownload", () => {
    it("should delete download if user owns it", async () => {
      const mockDownload = downloadRow({ id: 1, userId: 1 });

      vi.mocked(prisma.download.findUnique).mockResolvedValue(mockDownload);
      vi.mocked(prisma.download.delete).mockResolvedValue(mockDownload);

      await service.deleteDownload(1, 1);

      expect(prisma.download.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it("should throw if download not found", async () => {
      vi.mocked(prisma.download.findUnique).mockResolvedValue(null);

      await expect(service.deleteDownload(999, 1)).rejects.toMatchObject({
        statusCode: 404,
        message: "Download not found",
      });
    });

    it("should throw if user does not own the download", async () => {
      const mockDownload = downloadRow({
        id: 1,
        userId: 2, // Different user
      });

      vi.mocked(prisma.download.findUnique).mockResolvedValue(mockDownload);

      await expect(service.deleteDownload(1, 1)).rejects.toMatchObject({
        statusCode: 403,
        message: "Access denied",
      });
    });
  });
});
