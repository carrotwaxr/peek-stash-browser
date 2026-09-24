import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { DownloadService } from "../../services/DownloadService.js";
import {
  entityRefKey,
  getVisibleEntityKeys,
} from "../../services/EntityAccessService.js";
import { must } from "../helpers/must.js";

// Mock prisma
vi.mock("../../prisma/singleton.js", () => ({
  default: {
    download: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    stashScene: {
      findFirst: vi.fn(), // Changed from findUnique for composite primary key
      findMany: vi.fn(),
    },
    stashImage: {
      findFirst: vi.fn(), // Changed from findUnique for composite primary key
    },
    playlist: {
      findUnique: vi.fn(),
    },
    playlistItem: {
      findMany: vi.fn(),
    },
    $queryRawUnsafe: vi.fn(),
  },
}));

vi.mock("../../services/EntityAccessService.js", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../../services/EntityAccessService.js")
    >();
  return { ...actual, getVisibleEntityKeys: vi.fn() };
});

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
        mockScene as any
      );
      vi.mocked(prisma.download.create).mockResolvedValue({
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
      } as any);

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
        mockImage as any
      );
      vi.mocked(prisma.download.create).mockResolvedValue({
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
      } as any);

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
      const mockPlaylist = {
        id: 1,
        name: "My Playlist",
        items: [{ sceneId: "s1" }, { sceneId: "s2" }],
      };

      vi.mocked(prisma.playlist.findUnique).mockResolvedValue(
        mockPlaylist as any
      );
      vi.mocked(prisma.download.create).mockResolvedValue({
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
      } as any);

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

  describe("calculatePlaylistSize", () => {
    const items = [
      { sceneId: "s1", instanceId: "inst-a" },
      { sceneId: "s1", instanceId: "inst-b" },
    ];

    it("returns 0 for no items without a query", async () => {
      const size = await service.calculatePlaylistSize([]);

      expect(size).toBe(BigInt(0));
      expect(prisma.$queryRawUnsafe).not.toHaveBeenCalled();
    });

    it("sums the given (id, instance) pairs in one query with one JSON parameter", async () => {
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([
        { total: BigInt(3000000) },
      ]);

      const size = await service.calculatePlaylistSize(items);

      expect(size).toBe(BigInt(3000000));
      expect(prisma.$queryRawUnsafe).toHaveBeenCalledTimes(1);
      const [sql, ...params] = must(
        vi.mocked(prisma.$queryRawUnsafe).mock.calls[0]
      );
      expect(params).toEqual([
        JSON.stringify([
          ["s1", "inst-a"],
          ["s1", "inst-b"],
        ]),
      ]);
      expect(sql).toContain("json_each(?)");
      expect(sql).toContain(
        "s.stashInstanceId = json_extract(j.value, '$[1]')"
      );
      expect(sql).toContain("s.deletedAt IS NULL");
    });

    it("converts a number total to bigint", async () => {
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([{ total: 1500 }]);

      const size = await service.calculatePlaylistSize(items);

      expect(size).toBe(BigInt(1500));
    });

    it("returns 0 for a null total", async () => {
      vi.mocked(prisma.$queryRawUnsafe).mockResolvedValue([{ total: null }]);

      const size = await service.calculatePlaylistSize(items);

      expect(size).toBe(BigInt(0));
    });
  });

  describe("getDownloadablePlaylistItems", () => {
    it("keeps the visible items in position order", async () => {
      vi.mocked(prisma.playlistItem.findMany).mockResolvedValue([
        { sceneId: "s1", instanceId: "inst-b" },
        { sceneId: "s1", instanceId: "inst-a" },
        { sceneId: "s2", instanceId: "inst-a" },
        { sceneId: "s3", instanceId: "inst-a" },
      ] as never);
      vi.mocked(getVisibleEntityKeys).mockResolvedValue(
        new Set([
          entityRefKey("s3", "inst-a"),
          entityRefKey("s1", "inst-b"),
          entityRefKey("s1", "inst-a"),
        ])
      );

      const result = await service.getDownloadablePlaylistItems(7, 5);

      expect(prisma.playlistItem.findMany).toHaveBeenCalledWith({
        where: { playlistId: 5, instanceId: { not: null } },
        orderBy: { position: "asc" },
        select: { sceneId: true, instanceId: true },
      });
      expect(getVisibleEntityKeys).toHaveBeenCalledWith(7, "scene", [
        { id: "s1", instanceId: "inst-b" },
        { id: "s1", instanceId: "inst-a" },
        { id: "s2", instanceId: "inst-a" },
        { id: "s3", instanceId: "inst-a" },
      ]);
      expect(result).toEqual([
        { sceneId: "s1", instanceId: "inst-b" },
        { sceneId: "s1", instanceId: "inst-a" },
        { sceneId: "s3", instanceId: "inst-a" },
      ]);
    });
  });

  describe("getDownload", () => {
    it("should return download by id", async () => {
      const mockDownload = {
        id: 1,
        userId: 1,
        type: "SCENE",
        status: "COMPLETED",
      };

      vi.mocked(prisma.download.findUnique).mockResolvedValue(
        mockDownload as any
      );

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
        { id: 2, createdAt: new Date("2024-01-02") },
        { id: 1, createdAt: new Date("2024-01-01") },
      ];

      vi.mocked(prisma.download.findMany).mockResolvedValue(
        mockDownloads as any
      );

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
      const mockDownload = {
        id: 1,
        progress: 50,
        status: "PROCESSING",
      };

      vi.mocked(prisma.download.update).mockResolvedValue(mockDownload as any);

      const result = await service.updateProgress(1, 50);

      expect(prisma.download.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { progress: 50, status: "PROCESSING" },
      });
      expect(result.progress).toBe(50);
    });
  });

  describe("markCompleted", () => {
    it("should mark download as completed with 24h expiry", async () => {
      vi.useFakeTimers();
      const now = new Date();
      vi.setSystemTime(now);

      const expectedExpiry = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const mockDownload = {
        id: 1,
        status: "COMPLETED",
        progress: 100,
        filePath: "/tmp/download.zip",
        fileSize: BigInt(5000000),
        completedAt: now,
        expiresAt: expectedExpiry,
      };

      vi.mocked(prisma.download.update).mockResolvedValue(mockDownload as any);

      const result = await service.markCompleted(
        1,
        "/tmp/download.zip",
        BigInt(5000000)
      );

      expect(result.status).toBe("COMPLETED");
      expect(result.progress).toBe(100);
      expect(result.filePath).toBe("/tmp/download.zip");

      vi.useRealTimers();
    });
  });

  describe("markFailed", () => {
    it("should mark download as failed with error message", async () => {
      const mockDownload = {
        id: 1,
        status: "FAILED",
        error: "Something went wrong",
      };

      vi.mocked(prisma.download.update).mockResolvedValue(mockDownload as any);

      const result = await service.markFailed(1, "Something went wrong");

      expect(prisma.download.update).toHaveBeenCalledWith({
        where: { id: 1 },
        data: { status: "FAILED", error: "Something went wrong" },
      });
      expect(result.status).toBe("FAILED");
      expect(result.error).toBe("Something went wrong");
    });
  });

  describe("deleteDownload", () => {
    it("should delete download if user owns it", async () => {
      const mockDownload = {
        id: 1,
        userId: 1,
      };

      vi.mocked(prisma.download.findUnique).mockResolvedValue(
        mockDownload as any
      );
      vi.mocked(prisma.download.delete).mockResolvedValue(mockDownload as any);

      await service.deleteDownload(1, 1);

      expect(prisma.download.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it("should throw if download not found", async () => {
      vi.mocked(prisma.download.findUnique).mockResolvedValue(null);

      await expect(service.deleteDownload(999, 1)).rejects.toThrow(
        "Download not found"
      );
    });

    it("should throw if user does not own the download", async () => {
      const mockDownload = {
        id: 1,
        userId: 2, // Different user
      };

      vi.mocked(prisma.download.findUnique).mockResolvedValue(
        mockDownload as any
      );

      await expect(service.deleteDownload(1, 1)).rejects.toThrow(
        "Not authorized to delete this download"
      );
    });
  });

  describe("sanitizeFileName", () => {
    it("should remove invalid characters from filename", () => {
      // Access private method via any cast for testing
      const result = (service as any).sanitizeFileName("Test/File:Name*.mp4");

      expect(result).toBe("Test_File_Name_.mp4");
    });

    it("should handle empty string", () => {
      const result = (service as any).sanitizeFileName("");

      expect(result).toBe("download");
    });

    it("should trim whitespace", () => {
      const result = (service as any).sanitizeFileName("  Test File  ");

      expect(result).toBe("Test File");
    });
  });
});
