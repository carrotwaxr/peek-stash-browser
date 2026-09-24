import { DownloadStatus, DownloadType } from "@prisma/client";
import { downloadService } from "../services/DownloadService.js";
import { canUserAccessEntity } from "../services/EntityAccessService.js";
import { resolveUserPermissions } from "../services/PermissionService.js";
import { getPlaylistAccess } from "../services/PlaylistAccessService.js";
import { playlistZipService } from "../services/PlaylistZipService.js";
import { stashInstanceManager } from "../services/StashInstanceManager.js";
import type { ApiErrorResponse } from "../types/api/common.js";
import type {
  DeleteDownloadParams,
  DeleteDownloadResponse,
  GetDownloadFileParams,
  GetDownloadStatusParams,
  GetDownloadStatusResponse,
  GetUserDownloadsResponse,
  RetryDownloadParams,
  RetryDownloadResponse,
  StartEntityDownloadRequest,
  StartImageDownloadParams,
  StartImageDownloadResponse,
  StartPlaylistDownloadParams,
  StartPlaylistDownloadResponse,
  StartSceneDownloadParams,
  StartSceneDownloadResponse,
} from "../types/api/download.js";
import type { TypedAuthRequest, TypedResponse } from "../types/api/express.js";
import { attachmentContentDisposition } from "../utils/contentDisposition.js";
import { logger } from "../utils/logger.js";
import { pipeResponseToClient } from "../utils/streamProxy.js";

/**
 * Maximum playlist download size in MB (default: 10GB)
 */
const MAX_PLAYLIST_SIZE_MB = parseInt(
  process.env.MAX_PLAYLIST_DOWNLOAD_SIZE_MB || "10240",
  10
);
const MAX_PLAYLIST_SIZE_BYTES =
  BigInt(MAX_PLAYLIST_SIZE_MB) * BigInt(1024 * 1024);

/**
 * Serialize a download record for JSON response.
 * Converts BigInt fileSize to string since JSON doesn't support BigInt.
 */
function serializeDownload(download: {
  id: number;
  userId: number;
  type: string;
  status: string;
  playlistId: number | null;
  entityType: string | null;
  entityId: string | null;
  instanceId: string;
  fileName: string;
  fileSize: bigint | null;
  filePath: string | null;
  progress: number;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
}) {
  return {
    ...download,
    fileSize: download.fileSize !== null ? download.fileSize.toString() : null,
  };
}

/**
 * Start a scene download.
 * POST /api/downloads/scene/:sceneId
 */
export async function startSceneDownload(
  req: TypedAuthRequest<
    Partial<StartEntityDownloadRequest> | undefined,
    StartSceneDownloadParams
  >,
  res: TypedResponse<StartSceneDownloadResponse | ApiErrorResponse>
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { sceneId } = req.params;

    // Check permission
    const permissions = await resolveUserPermissions(userId);
    if (!permissions || !permissions.canDownloadFiles) {
      return res
        .status(403)
        .json({ error: "You do not have permission to download files" });
    }

    // Express 5 leaves req.body undefined on a POST with no body
    const instanceId = req.body?.instanceId;
    if (typeof instanceId !== "string" || instanceId === "") {
      return res.status(400).json({ error: "instanceId is required" });
    }
    if (!(await canUserAccessEntity(userId, "scene", sceneId, instanceId))) {
      return res.status(404).json({ error: "Scene not found" });
    }

    const download = await downloadService.createSceneDownload(
      userId,
      sceneId,
      instanceId
    );

    logger.info("Scene download created", {
      downloadId: download.id,
      userId,
      sceneId,
    });

    return res.json({ download: serializeDownload(download) });
  } catch (error) {
    logger.error("Error creating scene download", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to create download" });
  }
}

/**
 * Start an image download.
 * POST /api/downloads/image/:imageId
 */
export async function startImageDownload(
  req: TypedAuthRequest<
    Partial<StartEntityDownloadRequest> | undefined,
    StartImageDownloadParams
  >,
  res: TypedResponse<StartImageDownloadResponse | ApiErrorResponse>
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { imageId } = req.params;

    // Check permission
    const permissions = await resolveUserPermissions(userId);
    if (!permissions || !permissions.canDownloadFiles) {
      return res
        .status(403)
        .json({ error: "You do not have permission to download files" });
    }

    // Express 5 leaves req.body undefined on a POST with no body
    const instanceId = req.body?.instanceId;
    if (typeof instanceId !== "string" || instanceId === "") {
      return res.status(400).json({ error: "instanceId is required" });
    }
    if (!(await canUserAccessEntity(userId, "image", imageId, instanceId))) {
      return res.status(404).json({ error: "Image not found" });
    }

    const download = await downloadService.createImageDownload(
      userId,
      imageId,
      instanceId
    );

    logger.info("Image download created", {
      downloadId: download.id,
      userId,
      imageId,
    });

    return res.json({ download: serializeDownload(download) });
  } catch (error) {
    logger.error("Error creating image download", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to create download" });
  }
}

/**
 * Start a playlist download (creates a zip file).
 * POST /api/downloads/playlist/:playlistId
 */
export async function startPlaylistDownload(
  req: TypedAuthRequest<never, StartPlaylistDownloadParams>,
  res: TypedResponse<StartPlaylistDownloadResponse | ApiErrorResponse>
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const playlistId = parseInt(req.params.playlistId, 10);
    if (isNaN(playlistId)) {
      return res.status(400).json({ error: "Invalid playlist ID" });
    }

    // Check permission
    const permissions = await resolveUserPermissions(userId);
    if (!permissions || !permissions.canDownloadPlaylists) {
      return res
        .status(403)
        .json({ error: "You do not have permission to download playlists" });
    }

    // The owner, or anyone the playlist is shared with
    const access = await getPlaylistAccess(playlistId, userId);
    if (access.level === "none") {
      return res.status(404).json({ error: "Playlist not found" });
    }

    // Only the scenes this user may see, each on its own instance
    const items = await downloadService.getDownloadablePlaylistItems(
      userId,
      playlistId
    );
    if (items.length === 0) {
      return res
        .status(400)
        .json({ error: "This playlist has no scenes you can download" });
    }

    // Check size limit
    const totalSize = await downloadService.calculatePlaylistSize(items);
    if (totalSize > MAX_PLAYLIST_SIZE_BYTES) {
      const totalSizeMB = Math.ceil(Number(totalSize) / (1024 * 1024));
      return res.status(400).json({
        error: "Playlist exceeds maximum download size",
        details: `Total: ${totalSizeMB}MB, max: ${MAX_PLAYLIST_SIZE_MB}MB`,
      });
    }

    // Create download record
    const download = await downloadService.createPlaylistDownload(
      userId,
      playlistId
    );

    logger.info("Playlist download created", {
      downloadId: download.id,
      userId,
      playlistId,
    });

    // Start zip creation in background (don't await)
    playlistZipService.createZip(download.id).catch((error: unknown) => {
      logger.error("Background zip creation failed", {
        downloadId: download.id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return res.json({ download: serializeDownload(download) });
  } catch (error) {
    logger.error("Error creating playlist download", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to create download" });
  }
}

/**
 * Get all downloads for the current user.
 * GET /api/downloads
 */
export async function getUserDownloads(
  req: TypedAuthRequest,
  res: TypedResponse<GetUserDownloadsResponse | ApiErrorResponse>
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const downloads = await downloadService.getUserDownloads(userId);

    return res.json({
      downloads: downloads.map(serializeDownload),
    });
  } catch (error) {
    logger.error("Error getting user downloads", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to get downloads" });
  }
}

/**
 * Get a specific download's status.
 * GET /api/downloads/:id
 */
export async function getDownloadStatus(
  req: TypedAuthRequest<never, GetDownloadStatusParams>,
  res: TypedResponse<GetDownloadStatusResponse | ApiErrorResponse>
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const downloadId = parseInt(req.params.id, 10);
    if (isNaN(downloadId)) {
      return res.status(400).json({ error: "Invalid download ID" });
    }

    const download = await downloadService.getDownload(downloadId);
    if (!download) {
      return res.status(404).json({ error: "Download not found" });
    }

    // Check ownership
    if (download.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    return res.json({ download: serializeDownload(download) });
  } catch (error) {
    logger.error("Error getting download status", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to get download status" });
  }
}

/**
 * Get the actual download file.
 * GET /api/downloads/:id/file
 */
export async function getDownloadFile(
  req: TypedAuthRequest<never, GetDownloadFileParams>,
  res: TypedResponse<ApiErrorResponse>
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const downloadId = parseInt(req.params.id, 10);
    if (isNaN(downloadId)) {
      return res.status(400).json({ error: "Invalid download ID" });
    }

    const download = await downloadService.getDownload(downloadId);
    if (!download) {
      return res.status(404).json({ error: "Download not found" });
    }

    // Check ownership
    if (download.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // A zip past 24 hours, or a scene or image download from before
    // instances were stored
    if (download.status === DownloadStatus.EXPIRED) {
      return res
        .status(410)
        .json({ error: "This download has expired. Download it again." });
    }

    // Check if download is completed
    if (download.status !== DownloadStatus.COMPLETED) {
      return res.status(400).json({
        error: "Download is not ready",
        details: `Current status: ${download.status}`,
      });
    }

    // Access is checked again now: a permission, a hide, a restriction or a
    // share may have changed since the download was created.
    const permissions = await resolveUserPermissions(userId);

    if (download.type === DownloadType.PLAYLIST) {
      if (!permissions?.canDownloadPlaylists) {
        return res
          .status(403)
          .json({ error: "You do not have permission to download playlists" });
      }
      // The zip's contents were filtered for this user when it was built
      if (
        !download.playlistId ||
        (await getPlaylistAccess(download.playlistId, userId)).level === "none"
      ) {
        return res.status(404).json({ error: "Download not found" });
      }
      // Serve the zip file from filePath
      if (!download.filePath) {
        return res.status(500).json({ error: "Download file path missing" });
      }
      return res.sendFile(download.filePath, {
        headers: {
          "Content-Disposition": attachmentContentDisposition(
            download.fileName
          ),
        },
      });
    }

    if (
      download.type !== DownloadType.SCENE &&
      download.type !== DownloadType.IMAGE
    ) {
      return res.status(400).json({ error: "Unknown download type" });
    }

    // Scene and image files are proxied from Stash, so check before any fetch
    if (!permissions?.canDownloadFiles) {
      return res
        .status(403)
        .json({ error: "You do not have permission to download files" });
    }
    if (!download.entityId || !download.instanceId) {
      return res
        .status(410)
        .json({ error: "This download has expired. Download it again." });
    }
    const entityType = download.type === DownloadType.SCENE ? "scene" : "image";
    if (
      !(await canUserAccessEntity(
        userId,
        entityType,
        download.entityId,
        download.instanceId
      ))
    ) {
      return res.status(404).json({ error: "Download not found" });
    }

    // Each file comes from the instance it lives on
    const stashBaseUrl = stashInstanceManager.getBaseUrl(download.instanceId);
    const apiKey = stashInstanceManager.getApiKey(download.instanceId);
    const fileUrl =
      entityType === "scene"
        ? `${stashBaseUrl}/scene/${download.entityId}/stream`
        : `${stashBaseUrl}/image/${download.entityId}/image`;

    // Abort the upstream fetch if the client disconnects
    const abort = new AbortController();
    res.on("close", () => abort.abort());

    const upstream = await fetch(fileUrl, {
      headers: { ApiKey: apiKey },
      signal: abort.signal,
    });

    if (!upstream.ok) {
      return res.status(upstream.status).json({
        error: `Failed to fetch ${entityType} from Stash`,
      });
    }

    // Set headers for download
    res.setHeader(
      "Content-Disposition",
      attachmentContentDisposition(download.fileName)
    );

    await pipeResponseToClient(upstream, res, "[DOWNLOAD]", [
      "content-type",
      "content-length",
    ]);
    return;
  } catch (error) {
    logger.error("Error serving download file", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to serve download" });
  }
}

/**
 * Delete a download record.
 * DELETE /api/downloads/:id
 */
export async function deleteDownload(
  req: TypedAuthRequest<never, DeleteDownloadParams>,
  res: TypedResponse<DeleteDownloadResponse | ApiErrorResponse>
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const downloadId = parseInt(req.params.id, 10);
    if (isNaN(downloadId)) {
      return res.status(400).json({ error: "Invalid download ID" });
    }

    await downloadService.deleteDownload(downloadId, userId);

    logger.info("Download deleted", { downloadId, userId });

    return res.json({ success: true, message: "Download deleted" });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage.includes("not found")) {
      return res.status(404).json({ error: "Download not found" });
    }
    if (errorMessage.includes("Not authorized")) {
      return res.status(403).json({ error: "Access denied" });
    }

    logger.error("Error deleting download", { error: errorMessage });
    return res.status(500).json({ error: "Failed to delete download" });
  }
}

/**
 * Retry a failed playlist download.
 * POST /api/downloads/:id/retry
 */
export async function retryDownload(
  req: TypedAuthRequest<never, RetryDownloadParams>,
  res: TypedResponse<RetryDownloadResponse | ApiErrorResponse>
) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const downloadId = parseInt(req.params.id, 10);
    if (isNaN(downloadId)) {
      return res.status(400).json({ error: "Invalid download ID" });
    }

    const download = await downloadService.getDownload(downloadId);
    if (!download) {
      return res.status(404).json({ error: "Download not found" });
    }

    // Check ownership
    if (download.userId !== userId) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Only allow retrying failed playlist downloads
    if (download.type !== DownloadType.PLAYLIST) {
      return res.status(400).json({
        error: "Only playlist downloads can be retried",
      });
    }

    if (download.status !== DownloadStatus.FAILED) {
      return res.status(400).json({
        error: "Only failed downloads can be retried",
        details: `Current status: ${download.status}`,
      });
    }

    // The zip is rebuilt from the items the user may see now
    // (getDownloadablePlaylistItems), so only the playlist needs checking here
    if (!(await resolveUserPermissions(userId))?.canDownloadPlaylists) {
      return res
        .status(403)
        .json({ error: "You do not have permission to download playlists" });
    }
    if (
      !download.playlistId ||
      (await getPlaylistAccess(download.playlistId, userId)).level === "none"
    ) {
      return res.status(404).json({ error: "Playlist not found" });
    }

    // Reset progress and restart zip creation
    await downloadService.updateProgress(downloadId, 0);

    logger.info("Retrying playlist download", { downloadId, userId });

    // Start zip creation in background (don't await)
    playlistZipService.createZip(downloadId).catch((error: unknown) => {
      logger.error("Background zip retry failed", {
        downloadId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Fetch updated download record
    const updatedDownload = await downloadService.getDownload(downloadId);
    if (!updatedDownload) {
      return res
        .status(500)
        .json({ error: "Failed to retrieve updated download" });
    }

    return res.json({ download: serializeDownload(updatedDownload) });
  } catch (error) {
    logger.error("Error retrying download", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to retry download" });
  }
}
