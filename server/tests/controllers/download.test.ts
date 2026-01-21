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

import {
  startSceneDownload,
  startPlaylistDownload,
  getUserDownloads,
} from "../../controllers/download.js";
import { downloadService } from "../../services/DownloadService.js";
import { resolveUserPermissions } from "../../services/PermissionService.js";

const mockDownloadService = vi.mocked(downloadService);
const mockResolveUserPermissions = vi.mocked(resolveUserPermissions);

describe("Download Controller", () => {
  let mockRequest: Partial<AuthenticatedRequest>;
  let mockResponse: Partial<Response>;
  let responseJson: ReturnType<typeof vi.fn>;
  let responseStatus: ReturnType<typeof vi.fn>;
  let responseSendFile: ReturnType<typeof vi.fn>;
  let responseRedirect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    responseJson = vi.fn();
    responseSendFile = vi.fn();
    responseRedirect = vi.fn();
    responseStatus = vi.fn(() => ({ json: responseJson }));
    mockResponse = {
      json: responseJson,
      status: responseStatus,
      sendFile: responseSendFile,
      redirect: responseRedirect,
    };
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
});
