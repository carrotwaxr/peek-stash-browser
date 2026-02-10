import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Response } from "express";
import type { AuthenticatedRequest } from "../../middleware/auth.js";

// Mock the services
vi.mock("../../services/DownloadService.js", () => ({
  downloadService: {
    createSceneDownload: vi.fn(),
    createImageDownload: vi.fn(),
    createPlaylistDownload: vi.fn(),
    calculatePlaylistSize: vi.fn(),
    getUserDownloads: vi.fn(),
    getDownload: vi.fn(),
    deleteDownload: vi.fn(),
    updateProgress: vi.fn(),
  },
}));

vi.mock("../../services/PlaylistZipService.js", () => ({
  playlistZipService: {
    createZip: vi.fn(),
  },
}));

vi.mock("../../services/PermissionService.js", () => ({
  resolveUserPermissions: vi.fn(),
}));

vi.mock("../../utils/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock("../../utils/streamProxy.js", () => ({
  pipeResponseToClient: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("../../services/StashInstanceManager.js", () => ({
  stashInstanceManager: {
    getBaseUrl: vi.fn(() => "http://stash:9999"),
    getApiKey: vi.fn(() => "test-api-key"),
  },
}));

import {
  startSceneDownload,
  startPlaylistDownload,
  getUserDownloads,
  getDownloadStatus,
  getDownloadFile,
  deleteDownload,
  retryDownload,
} from "../../controllers/download.js";
import { downloadService } from "../../services/DownloadService.js";
import { playlistZipService } from "../../services/PlaylistZipService.js";
import { resolveUserPermissions } from "../../services/PermissionService.js";
import { pipeResponseToClient } from "../../utils/streamProxy.js";

const mockDownloadService = vi.mocked(downloadService);
const mockPlaylistZipService = vi.mocked(playlistZipService);
const mockResolveUserPermissions = vi.mocked(resolveUserPermissions);
const mockPipeResponseToClient = vi.mocked(pipeResponseToClient);

describe("Download Controller", () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let responseJson: ReturnType<typeof vi.fn>;
  let responseStatus: ReturnType<typeof vi.fn>;
  let responseSendFile: ReturnType<typeof vi.fn>;
  let responseRedirect: ReturnType<typeof vi.fn>;
  let responseSetHeader: ReturnType<typeof vi.fn>;
  let responseWrite: ReturnType<typeof vi.fn>;
  let responseEnd: ReturnType<typeof vi.fn>;
  let responseOn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    responseJson = vi.fn();
    responseSendFile = vi.fn();
    responseRedirect = vi.fn();
    responseSetHeader = vi.fn();
    responseWrite = vi.fn();
    responseEnd = vi.fn();
    responseOn = vi.fn();
    responseStatus = vi.fn(() => ({ json: responseJson }));
    mockResponse = {
      json: responseJson,
      status: responseStatus,
      sendFile: responseSendFile,
      redirect: responseRedirect,
      setHeader: responseSetHeader,
      write: responseWrite,
      end: responseEnd,
      on: responseOn,
    };

    // Mock global fetch for scene/image downloads
    global.fetch = vi.fn();
  });

  describe("startSceneDownload", () => {
    it("should return 403 if user does not have canDownloadFiles permission", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { sceneId: "scene-123" },
      };
      mockResolveUserPermissions.mockResolvedValue({
        canShare: false,
        canDownloadFiles: false,
        canDownloadPlaylists: false,
        sources: {
          canShare: "default",
          canDownloadFiles: "default",
          canDownloadPlaylists: "default",
        },
      });

      await startSceneDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(responseJson).toHaveBeenCalledWith({
        error: "You do not have permission to download files",
      });
    });

    it("should create scene download and return serialized download on success", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { sceneId: "scene-123" },
      };
      mockResolveUserPermissions.mockResolvedValue({
        canShare: false,
        canDownloadFiles: true,
        canDownloadPlaylists: false,
        sources: {
          canShare: "default",
          canDownloadFiles: "override",
          canDownloadPlaylists: "default",
        },
      });
      const mockDownload = {
        id: 1,
        userId: 1,
        type: "SCENE",
        status: "COMPLETED",
        entityType: "scene",
        entityId: "scene-123",
        fileName: "test-scene.mp4",
        fileSize: BigInt(1000000),
        filePath: null,
        progress: 100,
        error: null,
        playlistId: null,
        createdAt: new Date("2024-01-01"),
        completedAt: new Date("2024-01-01"),
        expiresAt: null,
      };
      mockDownloadService.createSceneDownload.mockResolvedValue(mockDownload);

      await startSceneDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockDownloadService.createSceneDownload).toHaveBeenCalledWith(
        1,
        "scene-123"
      );
      expect(responseJson).toHaveBeenCalledWith({
        download: expect.objectContaining({
          id: 1,
          type: "SCENE",
          fileSize: "1000000", // BigInt serialized to string
        }),
      });
    });
  });

  describe("startPlaylistDownload", () => {
    it("should return 400 if playlist exceeds maximum size", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { playlistId: "5" },
      };
      mockResolveUserPermissions.mockResolvedValue({
        canShare: false,
        canDownloadFiles: false,
        canDownloadPlaylists: true,
        sources: {
          canShare: "default",
          canDownloadFiles: "default",
          canDownloadPlaylists: "override",
        },
      });
      // Mock size exceeds limit (default is 10GB = 10 * 1024 * 1024 * 1024 bytes)
      const oversizedBytes = BigInt(11 * 1024 * 1024 * 1024); // 11GB
      mockDownloadService.calculatePlaylistSize.mockResolvedValue(oversizedBytes);

      await startPlaylistDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: "Playlist exceeds maximum download size",
        totalSizeMB: expect.any(Number),
        maxSizeMB: 10240,
      });
    });

    it("should return 403 if user does not have canDownloadPlaylists permission", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { playlistId: "5" },
      };
      mockResolveUserPermissions.mockResolvedValue({
        canShare: false,
        canDownloadFiles: true,
        canDownloadPlaylists: false,
        sources: {
          canShare: "default",
          canDownloadFiles: "override",
          canDownloadPlaylists: "default",
        },
      });

      await startPlaylistDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(responseJson).toHaveBeenCalledWith({
        error: "You do not have permission to download playlists",
      });
    });
  });

  describe("getUserDownloads", () => {
    it("should return serialized downloads for the user", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
      };
      const mockDownloads = [
        {
          id: 1,
          userId: 1,
          type: "SCENE",
          status: "COMPLETED",
          entityType: "scene",
          entityId: "scene-123",
          fileName: "test-scene.mp4",
          fileSize: BigInt(1000000),
          filePath: null,
          progress: 100,
          error: null,
          playlistId: null,
          createdAt: new Date("2024-01-01"),
          completedAt: new Date("2024-01-01"),
          expiresAt: null,
        },
        {
          id: 2,
          userId: 1,
          type: "PLAYLIST",
          status: "PROCESSING",
          entityType: null,
          entityId: null,
          fileName: "my-playlist.zip",
          fileSize: null,
          filePath: null,
          progress: 50,
          error: null,
          playlistId: 5,
          createdAt: new Date("2024-01-02"),
          completedAt: null,
          expiresAt: null,
        },
      ];
      mockDownloadService.getUserDownloads.mockResolvedValue(mockDownloads);

      await getUserDownloads(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockDownloadService.getUserDownloads).toHaveBeenCalledWith(1);
      expect(responseJson).toHaveBeenCalledWith({
        downloads: [
          expect.objectContaining({
            id: 1,
            type: "SCENE",
            fileSize: "1000000",
          }),
          expect.objectContaining({
            id: 2,
            type: "PLAYLIST",
            fileSize: null,
            progress: 50,
          }),
        ],
      });
    });

    it("should return 401 if user is not authenticated", async () => {
      mockRequest = {
        user: undefined,
      };

      await getUserDownloads(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(401);
      expect(responseJson).toHaveBeenCalledWith({ error: "Unauthorized" });
    });
  });

  describe("getDownloadStatus", () => {
    it("should return download status for own download", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "1" },
      };
      const mockDownload = {
        id: 1,
        userId: 1,
        type: "SCENE",
        status: "COMPLETED",
        entityType: "scene",
        entityId: "scene-123",
        fileName: "test.mp4",
        fileSize: BigInt(1000),
        filePath: null,
        progress: 100,
        error: null,
        playlistId: null,
        createdAt: new Date(),
        completedAt: new Date(),
        expiresAt: null,
      };
      mockDownloadService.getDownload.mockResolvedValue(mockDownload);

      await getDownloadStatus(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseJson).toHaveBeenCalledWith({
        download: expect.objectContaining({ id: 1 }),
      });
    });

    it("should return 403 if user does not own the download", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "1" },
      };
      const mockDownload = {
        id: 1,
        userId: 2, // Different user
        type: "SCENE",
        status: "COMPLETED",
        entityType: "scene",
        entityId: "scene-123",
        fileName: "test.mp4",
        fileSize: BigInt(1000),
        filePath: null,
        progress: 100,
        error: null,
        playlistId: null,
        createdAt: new Date(),
        completedAt: new Date(),
        expiresAt: null,
      };
      mockDownloadService.getDownload.mockResolvedValue(mockDownload);

      await getDownloadStatus(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(responseJson).toHaveBeenCalledWith({ error: "Access denied" });
    });

    it("should return 404 if download not found", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "999" },
      };
      mockDownloadService.getDownload.mockResolvedValue(null);

      await getDownloadStatus(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(responseJson).toHaveBeenCalledWith({ error: "Download not found" });
    });
  });

  describe("getDownloadFile", () => {
    it("should proxy scene stream with Content-Disposition for SCENE downloads", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "1" },
      };
      const mockDownload = {
        id: 1,
        userId: 1,
        type: "SCENE",
        status: "COMPLETED",
        entityType: "scene",
        entityId: "scene-123",
        fileName: "test.mp4",
        fileSize: BigInt(1000),
        filePath: null,
        progress: 100,
        error: null,
        playlistId: null,
        createdAt: new Date(),
        completedAt: new Date(),
        expiresAt: null,
      };
      mockDownloadService.getDownload.mockResolvedValue(mockDownload);

      // Mock fetch response
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        headers: new Headers([
          ["content-type", "video/mp4"],
          ["content-length", "1000"],
        ]),
        body: new ReadableStream(),
      });

      await getDownloadFile(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(global.fetch).toHaveBeenCalledWith(
        "http://stash:9999/scene/scene-123/stream",
        { headers: { ApiKey: "test-api-key" }, signal: expect.any(AbortSignal) }
      );
      expect(responseSetHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        'attachment; filename="test.mp4"'
      );
      expect(mockPipeResponseToClient).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true }),
        mockResponse,
        "[DOWNLOAD]",
        ["content-type", "content-length"],
      );
    });

    it("should proxy image with Content-Disposition for IMAGE downloads", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "1" },
      };
      const mockDownload = {
        id: 1,
        userId: 1,
        type: "IMAGE",
        status: "COMPLETED",
        entityType: "image",
        entityId: "image-456",
        fileName: "test.jpg",
        fileSize: BigInt(1000),
        filePath: null,
        progress: 100,
        error: null,
        playlistId: null,
        createdAt: new Date(),
        completedAt: new Date(),
        expiresAt: null,
      };
      mockDownloadService.getDownload.mockResolvedValue(mockDownload);

      // Mock fetch response
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        headers: new Headers([
          ["content-type", "image/jpeg"],
          ["content-length", "1000"],
        ]),
        body: new ReadableStream(),
      });

      await getDownloadFile(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(global.fetch).toHaveBeenCalledWith(
        "http://stash:9999/image/image-456/image",
        { headers: { ApiKey: "test-api-key" }, signal: expect.any(AbortSignal) }
      );
      expect(responseSetHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        'attachment; filename="test.jpg"'
      );
      expect(mockPipeResponseToClient).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true }),
        mockResponse,
        "[DOWNLOAD]",
        ["content-type", "content-length"],
      );
    });

    it("should return 400 if download is not completed", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "1" },
      };
      const mockDownload = {
        id: 1,
        userId: 1,
        type: "PLAYLIST",
        status: "PROCESSING",
        entityType: null,
        entityId: null,
        fileName: "playlist.zip",
        fileSize: null,
        filePath: null,
        progress: 50,
        error: null,
        playlistId: 1,
        createdAt: new Date(),
        completedAt: null,
        expiresAt: null,
      };
      mockDownloadService.getDownload.mockResolvedValue(mockDownload);

      await getDownloadFile(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: "Download is not ready",
        status: "PROCESSING",
      });
    });
  });

  describe("deleteDownload", () => {
    it("should delete download successfully", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "1" },
      };
      mockDownloadService.deleteDownload.mockResolvedValue(undefined);

      await deleteDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockDownloadService.deleteDownload).toHaveBeenCalledWith(1, 1);
      expect(responseJson).toHaveBeenCalledWith({
        success: true,
        message: "Download deleted",
      });
    });

    it("should return 404 if download not found", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "999" },
      };
      mockDownloadService.deleteDownload.mockRejectedValue(
        new Error("Download not found")
      );

      await deleteDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(responseJson).toHaveBeenCalledWith({ error: "Download not found" });
    });

    it("should return 403 if user not authorized", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "1" },
      };
      mockDownloadService.deleteDownload.mockRejectedValue(
        new Error("Not authorized to delete this download")
      );

      await deleteDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(responseJson).toHaveBeenCalledWith({ error: "Access denied" });
    });
  });

  describe("retryDownload", () => {
    it("should retry failed playlist download", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "1" },
      };
      const failedDownload = {
        id: 1,
        userId: 1,
        type: "PLAYLIST",
        status: "FAILED",
        entityType: null,
        entityId: null,
        fileName: "playlist.zip",
        fileSize: null,
        filePath: null,
        progress: 0,
        error: "Network error",
        playlistId: 1,
        createdAt: new Date(),
        completedAt: null,
        expiresAt: null,
      };
      const retriedDownload = { ...failedDownload, status: "PROCESSING", progress: 0, error: null };

      mockDownloadService.getDownload
        .mockResolvedValueOnce(failedDownload)
        .mockResolvedValueOnce(retriedDownload);
      mockDownloadService.updateProgress.mockResolvedValue({} as any);
      mockPlaylistZipService.createZip.mockResolvedValue(undefined);

      await retryDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockDownloadService.updateProgress).toHaveBeenCalledWith(1, 0);
      expect(responseJson).toHaveBeenCalledWith({
        download: expect.objectContaining({ id: 1, status: "PROCESSING" }),
      });
    });

    it("should return 400 if download is not PLAYLIST type", async () => {
      // Need to clear mocks to remove previous mockResolvedValueOnce calls
      mockDownloadService.getDownload.mockReset();

      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "1" },
      };
      const sceneDownload = {
        id: 1,
        userId: 1,
        type: "SCENE",
        status: "FAILED",
        entityType: "scene",
        entityId: "scene-123",
        fileName: "test.mp4",
        fileSize: null,
        filePath: null,
        progress: 0,
        error: "Error",
        playlistId: null,
        createdAt: new Date(),
        completedAt: null,
        expiresAt: null,
      };
      mockDownloadService.getDownload.mockResolvedValue(sceneDownload);

      await retryDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: "Only playlist downloads can be retried",
      });
    });

    it("should return 400 if download status is not FAILED", async () => {
      mockDownloadService.getDownload.mockReset();

      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "1" },
      };
      const completedDownload = {
        id: 1,
        userId: 1,
        type: "PLAYLIST",
        status: "COMPLETED",
        entityType: null,
        entityId: null,
        fileName: "playlist.zip",
        fileSize: BigInt(1000),
        filePath: "/path/to/file.zip",
        progress: 100,
        error: null,
        playlistId: 1,
        createdAt: new Date(),
        completedAt: new Date(),
        expiresAt: new Date(),
      };
      mockDownloadService.getDownload.mockResolvedValue(completedDownload);

      await retryDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: "Only failed downloads can be retried",
        currentStatus: "COMPLETED",
      });
    });
  });
});
