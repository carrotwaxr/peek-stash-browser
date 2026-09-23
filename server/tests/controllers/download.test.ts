import type { Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  deleteDownload,
  getDownloadFile,
  getDownloadStatus,
  getUserDownloads,
  retryDownload,
  startImageDownload,
  startPlaylistDownload,
  startSceneDownload,
} from "../../controllers/download.js";
import type { AuthenticatedRequest } from "../../middleware/auth.js";
import { downloadService } from "../../services/DownloadService.js";
import { canUserAccessEntity } from "../../services/EntityAccessService.js";
import { resolveUserPermissions } from "../../services/PermissionService.js";
import { getPlaylistAccess } from "../../services/PlaylistAccessService.js";
import { playlistZipService } from "../../services/PlaylistZipService.js";
import { pipeResponseToClient } from "../../utils/streamProxy.js";

// Mock the services
vi.mock("../../services/DownloadService.js", () => ({
  downloadService: {
    createSceneDownload: vi.fn(),
    createImageDownload: vi.fn(),
    createPlaylistDownload: vi.fn(),
    calculatePlaylistSize: vi.fn(),
    getDownloadablePlaylistItems: vi.fn(),
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

vi.mock("../../services/EntityAccessService.js", () => ({
  canUserAccessEntity: vi.fn(),
}));

vi.mock("../../services/PlaylistAccessService.js", () => ({
  getPlaylistAccess: vi.fn(),
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
    getBaseUrl: vi.fn((id?: string) => `http://stash-${id}:9999`),
    getApiKey: vi.fn((id?: string) => `key-${id}`),
  },
}));

const mockDownloadService = vi.mocked(downloadService);
const mockPlaylistZipService = vi.mocked(playlistZipService);
const mockResolveUserPermissions = vi.mocked(resolveUserPermissions);
const mockPipeResponseToClient = vi.mocked(pipeResponseToClient);
const mockCanUserAccessEntity = vi.mocked(canUserAccessEntity);
const mockGetPlaylistAccess = vi.mocked(getPlaylistAccess);

const ALL_DOWNLOAD_PERMISSIONS = {
  canShare: false,
  canDownloadFiles: true,
  canDownloadPlaylists: true,
  sources: {
    canShare: "default",
    canDownloadFiles: "override",
    canDownloadPlaylists: "override",
  },
};

/** A completed download row; override any field per test. */
function downloadRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    userId: 1,
    type: "SCENE",
    status: "COMPLETED",
    entityType: "scene",
    entityId: "scene-123",
    instanceId: "inst-a",
    fileName: "test.mp4",
    fileSize: BigInt(1000),
    filePath: null,
    progress: 100,
    error: null,
    playlistId: null,
    createdAt: new Date(),
    completedAt: new Date(),
    expiresAt: null,
    ...overrides,
  } as never;
}

const okStream = () => ({
  ok: true,
  headers: new Headers([
    ["content-type", "video/mp4"],
    ["content-length", "1000"],
  ]),
  body: new ReadableStream(),
});

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

    mockResolveUserPermissions.mockResolvedValue(ALL_DOWNLOAD_PERMISSIONS);
    mockCanUserAccessEntity.mockResolvedValue(true);
    mockGetPlaylistAccess.mockResolvedValue({ level: "owner" });
    mockDownloadService.getDownloadablePlaylistItems.mockResolvedValue([
      { sceneId: "scene-1", instanceId: "inst-a" },
    ]);
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
        body: { instanceId: "inst-a" },
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
        instanceId: "inst-a",
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
        "scene-123",
        "inst-a"
      );
      expect(responseJson).toHaveBeenCalledWith({
        download: expect.objectContaining({
          id: 1,
          type: "SCENE",
          instanceId: "inst-a",
          fileSize: "1000000", // BigInt serialized to string
        }),
      });
    });

    it("returns 400 without an instanceId", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { sceneId: "scene-123" },
        body: undefined,
      };

      await startSceneDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: "instanceId is required",
      });
      expect(mockDownloadService.createSceneDownload).not.toHaveBeenCalled();
    });

    it("returns 404 when the user cannot see the scene", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { sceneId: "scene-123" },
        body: { instanceId: "inst-b" },
      };
      mockCanUserAccessEntity.mockResolvedValue(false);

      await startSceneDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockCanUserAccessEntity).toHaveBeenCalledWith(
        1,
        "scene",
        "scene-123",
        "inst-b"
      );
      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(responseJson).toHaveBeenCalledWith({ error: "Scene not found" });
      expect(mockDownloadService.createSceneDownload).not.toHaveBeenCalled();
    });

    it("passes the instance to the service", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { sceneId: "scene-123" },
        body: { instanceId: "inst-b" },
      };
      mockDownloadService.createSceneDownload.mockResolvedValue(
        downloadRow({ instanceId: "inst-b" })
      );

      await startSceneDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockDownloadService.createSceneDownload).toHaveBeenCalledWith(
        1,
        "scene-123",
        "inst-b"
      );
      expect(responseJson).toHaveBeenCalledWith({
        download: expect.objectContaining({ instanceId: "inst-b" }),
      });
    });
  });

  describe("startImageDownload", () => {
    it("returns 400 without an instanceId", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { imageId: "image-456" },
        body: {},
      };

      await startImageDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: "instanceId is required",
      });
      expect(mockDownloadService.createImageDownload).not.toHaveBeenCalled();
    });

    it("returns 404 when the user cannot see the image", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { imageId: "image-456" },
        body: { instanceId: "inst-b" },
      };
      mockCanUserAccessEntity.mockResolvedValue(false);

      await startImageDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockCanUserAccessEntity).toHaveBeenCalledWith(
        1,
        "image",
        "image-456",
        "inst-b"
      );
      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(responseJson).toHaveBeenCalledWith({ error: "Image not found" });
      expect(mockDownloadService.createImageDownload).not.toHaveBeenCalled();
    });

    it("passes the instance to the service", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { imageId: "image-456" },
        body: { instanceId: "inst-b" },
      };
      mockDownloadService.createImageDownload.mockResolvedValue(
        downloadRow({
          type: "IMAGE",
          entityType: "image",
          entityId: "image-456",
          instanceId: "inst-b",
        })
      );

      await startImageDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockDownloadService.createImageDownload).toHaveBeenCalledWith(
        1,
        "image-456",
        "inst-b"
      );
      expect(responseJson).toHaveBeenCalledWith({
        download: expect.objectContaining({ type: "IMAGE" }),
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
      mockDownloadService.calculatePlaylistSize.mockResolvedValue(
        oversizedBytes
      );

      await startPlaylistDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: "Playlist exceeds maximum download size",
        details: expect.stringContaining("max: 10240MB"),
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

    it("returns 404 when the playlist is not the user's or shared with them", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { playlistId: "5" },
      };
      mockGetPlaylistAccess.mockResolvedValue({ level: "none" });

      await startPlaylistDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockGetPlaylistAccess).toHaveBeenCalledWith(5, 1);
      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(responseJson).toHaveBeenCalledWith({
        error: "Playlist not found",
      });
      expect(mockDownloadService.createPlaylistDownload).not.toHaveBeenCalled();
    });

    it("lets a shared recipient download", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { playlistId: "5" },
      };
      mockGetPlaylistAccess.mockResolvedValue({
        level: "shared",
        groups: ["friends"],
      });
      mockDownloadService.calculatePlaylistSize.mockResolvedValue(BigInt(100));
      mockDownloadService.createPlaylistDownload.mockResolvedValue(
        downloadRow({
          type: "PLAYLIST",
          status: "PENDING",
          entityType: null,
          entityId: null,
          instanceId: "",
          fileName: "p.zip",
          fileSize: null,
          progress: 0,
          playlistId: 5,
        })
      );
      mockPlaylistZipService.createZip.mockResolvedValue(undefined);

      await startPlaylistDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockDownloadService.createPlaylistDownload).toHaveBeenCalledWith(
        1,
        5
      );
      expect(responseJson).toHaveBeenCalledWith({
        download: expect.objectContaining({ type: "PLAYLIST", playlistId: 5 }),
      });
    });

    it("returns 400 when no scene is downloadable", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { playlistId: "5" },
      };
      mockDownloadService.getDownloadablePlaylistItems.mockResolvedValue([]);

      await startPlaylistDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(
        mockDownloadService.getDownloadablePlaylistItems
      ).toHaveBeenCalledWith(1, 5);
      expect(responseStatus).toHaveBeenCalledWith(400);
      expect(responseJson).toHaveBeenCalledWith({
        error: "This playlist has no scenes you can download",
      });
      expect(mockDownloadService.calculatePlaylistSize).not.toHaveBeenCalled();
      expect(mockDownloadService.createPlaylistDownload).not.toHaveBeenCalled();
    });

    it("sizes only the downloadable items", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { playlistId: "5" },
      };
      const items = [
        { sceneId: "s1", instanceId: "inst-a" },
        { sceneId: "s1", instanceId: "inst-b" },
      ];
      mockDownloadService.getDownloadablePlaylistItems.mockResolvedValue(items);
      mockDownloadService.calculatePlaylistSize.mockResolvedValue(
        BigInt(11 * 1024 * 1024 * 1024)
      );

      await startPlaylistDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockDownloadService.calculatePlaylistSize).toHaveBeenCalledWith(
        items
      );
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
          instanceId: "inst-a",
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
          instanceId: "",
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
        instanceId: "inst-a",
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
        instanceId: "inst-a",
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
      expect(responseJson).toHaveBeenCalledWith({
        error: "Download not found",
      });
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
        instanceId: "inst-a",
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
        "http://stash-inst-a:9999/scene/scene-123/stream",
        { headers: { ApiKey: "key-inst-a" }, signal: expect.any(AbortSignal) }
      );
      expect(responseSetHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        "attachment; filename=\"test.mp4\"; filename*=UTF-8''test.mp4"
      );
      expect(mockPipeResponseToClient).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true }),
        mockResponse,
        "[DOWNLOAD]",
        ["content-type", "content-length"]
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
        instanceId: "inst-a",
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
        "http://stash-inst-a:9999/image/image-456/image",
        { headers: { ApiKey: "key-inst-a" }, signal: expect.any(AbortSignal) }
      );
      expect(responseSetHeader).toHaveBeenCalledWith(
        "Content-Disposition",
        "attachment; filename=\"test.jpg\"; filename*=UTF-8''test.jpg"
      );
      expect(mockPipeResponseToClient).toHaveBeenCalledWith(
        expect.objectContaining({ ok: true }),
        mockResponse,
        "[DOWNLOAD]",
        ["content-type", "content-length"]
      );
    });

    it("should serve a completed PLAYLIST zip with an RFC 6266 Content-Disposition", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "1" },
      };
      const mockDownload = {
        id: 1,
        userId: 1,
        type: "PLAYLIST",
        status: "COMPLETED",
        entityType: null,
        entityId: null,
        instanceId: "",
        fileName: "Kate’s picks.zip",
        fileSize: BigInt(1000),
        filePath: "/tmp/p.zip",
        progress: 100,
        error: null,
        playlistId: 5,
        createdAt: new Date(),
        completedAt: new Date(),
        expiresAt: null,
      };
      mockDownloadService.getDownload.mockResolvedValue(mockDownload);

      await getDownloadFile(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseSendFile).toHaveBeenCalledWith("/tmp/p.zip", {
        headers: {
          "Content-Disposition":
            "attachment; filename=\"Kate_s picks.zip\"; filename*=UTF-8''Kate%E2%80%99s%20picks.zip",
        },
      });
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
        instanceId: "",
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
        details: "Current status: PROCESSING",
      });
    });

    it("streams a scene from its own instance", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "1" },
      };
      mockDownloadService.getDownload.mockResolvedValue(
        downloadRow({ instanceId: "inst-b" })
      );
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue(okStream());

      await getDownloadFile(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockCanUserAccessEntity).toHaveBeenCalledWith(
        1,
        "scene",
        "scene-123",
        "inst-b"
      );
      expect(global.fetch).toHaveBeenCalledWith(
        "http://stash-inst-b:9999/scene/scene-123/stream",
        { headers: { ApiKey: "key-inst-b" }, signal: expect.any(AbortSignal) }
      );
    });

    it("returns 404 and fetches nothing when scene access was revoked", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "1" },
      };
      mockDownloadService.getDownload.mockResolvedValue(downloadRow());
      mockCanUserAccessEntity.mockResolvedValue(false);

      await getDownloadFile(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(responseJson).toHaveBeenCalledWith({
        error: "Download not found",
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("returns 403 when the files permission was revoked", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "1" },
      };
      mockDownloadService.getDownload.mockResolvedValue(
        downloadRow({
          type: "IMAGE",
          entityType: "image",
          entityId: "image-456",
        })
      );
      mockResolveUserPermissions.mockResolvedValue({
        ...ALL_DOWNLOAD_PERMISSIONS,
        canDownloadFiles: false,
      });

      await getDownloadFile(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(responseJson).toHaveBeenCalledWith({
        error: "You do not have permission to download files",
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it("returns 410 for a scene download with no stored instance", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "1" },
      };
      mockDownloadService.getDownload.mockResolvedValue(
        downloadRow({ instanceId: "" })
      );

      await getDownloadFile(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(410);
      expect(responseJson).toHaveBeenCalledWith({
        error: "This download has expired. Download it again.",
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it.each(["SCENE", "IMAGE", "PLAYLIST"])(
      "returns 410 for an EXPIRED download of any type, before the status check (%s)",
      async (type) => {
        mockRequest = {
          user: { id: 1, username: "testuser", role: "USER" },
          params: { id: "1" },
        };
        mockDownloadService.getDownload.mockResolvedValue(
          downloadRow({
            type,
            status: "EXPIRED",
            filePath: type === "PLAYLIST" ? "/tmp/p.zip" : null,
            playlistId: type === "PLAYLIST" ? 5 : null,
          })
        );

        await getDownloadFile(
          mockRequest as AuthenticatedRequest,
          mockResponse as Response
        );

        expect(responseStatus).toHaveBeenCalledWith(410);
        expect(responseJson).toHaveBeenCalledWith({
          error: "This download has expired. Download it again.",
        });
        expect(global.fetch).not.toHaveBeenCalled();
        expect(responseSendFile).not.toHaveBeenCalled();
      }
    );

    it("serves a zip only while the playlist is accessible", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "1" },
      };
      const zipRow = downloadRow({
        type: "PLAYLIST",
        entityType: null,
        entityId: null,
        instanceId: "",
        fileName: "p.zip",
        filePath: "/tmp/p.zip",
        playlistId: 5,
      });
      mockDownloadService.getDownload.mockResolvedValue(zipRow);
      mockGetPlaylistAccess.mockResolvedValue({ level: "none" });

      await getDownloadFile(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockGetPlaylistAccess).toHaveBeenCalledWith(5, 1);
      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(responseJson).toHaveBeenCalledWith({
        error: "Download not found",
      });
      expect(responseSendFile).not.toHaveBeenCalled();
    });

    it("returns 403 for a zip when the playlist permission was revoked", async () => {
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "1" },
      };
      mockDownloadService.getDownload.mockResolvedValue(
        downloadRow({
          type: "PLAYLIST",
          entityType: null,
          entityId: null,
          instanceId: "",
          fileName: "p.zip",
          filePath: "/tmp/p.zip",
          playlistId: 5,
        })
      );
      mockResolveUserPermissions.mockResolvedValue({
        ...ALL_DOWNLOAD_PERMISSIONS,
        canDownloadPlaylists: false,
      });

      await getDownloadFile(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(responseJson).toHaveBeenCalledWith({
        error: "You do not have permission to download playlists",
      });
      expect(responseSendFile).not.toHaveBeenCalled();
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
      expect(responseJson).toHaveBeenCalledWith({
        error: "Download not found",
      });
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
        instanceId: "",
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
      const retriedDownload = {
        ...failedDownload,
        status: "PROCESSING",
        progress: 0,
        error: null,
      };

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
        instanceId: "inst-a",
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
        instanceId: "",
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
        details: "Current status: COMPLETED",
      });
    });

    const failedZip = () =>
      downloadRow({
        type: "PLAYLIST",
        status: "FAILED",
        entityType: null,
        entityId: null,
        instanceId: "",
        fileName: "playlist.zip",
        fileSize: null,
        progress: 0,
        error: "Network error",
        playlistId: 5,
        completedAt: null,
      });

    it("returns 404 when the playlist is no longer accessible", async () => {
      mockDownloadService.getDownload.mockReset();
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "1" },
      };
      mockDownloadService.getDownload.mockResolvedValue(failedZip());
      mockGetPlaylistAccess.mockResolvedValue({ level: "none" });

      await retryDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(mockGetPlaylistAccess).toHaveBeenCalledWith(5, 1);
      expect(responseStatus).toHaveBeenCalledWith(404);
      expect(responseJson).toHaveBeenCalledWith({
        error: "Playlist not found",
      });
      expect(mockPlaylistZipService.createZip).not.toHaveBeenCalled();
      expect(mockDownloadService.updateProgress).not.toHaveBeenCalled();
    });

    it("returns 403 when the playlist permission was revoked", async () => {
      mockDownloadService.getDownload.mockReset();
      mockRequest = {
        user: { id: 1, username: "testuser", role: "USER" },
        params: { id: "1" },
      };
      mockDownloadService.getDownload.mockResolvedValue(failedZip());
      mockResolveUserPermissions.mockResolvedValue({
        ...ALL_DOWNLOAD_PERMISSIONS,
        canDownloadPlaylists: false,
      });

      await retryDownload(
        mockRequest as AuthenticatedRequest,
        mockResponse as Response
      );

      expect(responseStatus).toHaveBeenCalledWith(403);
      expect(responseJson).toHaveBeenCalledWith({
        error: "You do not have permission to download playlists",
      });
      expect(mockPlaylistZipService.createZip).not.toHaveBeenCalled();
      expect(mockDownloadService.updateProgress).not.toHaveBeenCalled();
    });
  });
});
