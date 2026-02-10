import type { Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import { DownloadStatus, DownloadType } from "@prisma/client";
import { downloadService } from "../services/DownloadService.js";
import { playlistZipService } from "../services/PlaylistZipService.js";
import { resolveUserPermissions } from "../services/PermissionService.js";
import { stashInstanceManager } from "../services/StashInstanceManager.js";
import { logger } from "../utils/logger.js";
import { pipeResponseToClient } from "../utils/streamProxy.js";

/**
 * Maximum playlist download size in MB (default: 10GB)
 */
const MAX_PLAYLIST_SIZE_MB = parseInt(
  process.env.MAX_PLAYLIST_DOWNLOAD_SIZE_MB || "10240",
  10
);
const MAX_PLAYLIST_SIZE_BYTES = BigInt(MAX_PLAYLIST_SIZE_MB) * BigInt(1024 * 1024);

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
  req: AuthenticatedRequest,
  res: Response
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

    const download = await downloadService.createSceneDownload(userId, sceneId);

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
  req: AuthenticatedRequest,
  res: Response
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

    const download = await downloadService.createImageDownload(userId, imageId);

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
  req: AuthenticatedRequest,
  res: Response
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

    // Check size limit
    const totalSize = await downloadService.calculatePlaylistSize(playlistId);
    if (totalSize > MAX_PLAYLIST_SIZE_BYTES) {
      const totalSizeMB = Math.ceil(Number(totalSize) / (1024 * 1024));
      return res.status(400).json({
        error: "Playlist exceeds maximum download size",
        totalSizeMB,
        maxSizeMB: MAX_PLAYLIST_SIZE_MB,
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
    playlistZipService.createZip(download.id).catch((error) => {
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
  req: AuthenticatedRequest,
  res: Response
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
  req: AuthenticatedRequest,
  res: Response
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
  req: AuthenticatedRequest,
  res: Response
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

    // Check if download is completed
    if (download.status !== DownloadStatus.COMPLETED) {
      return res.status(400).json({
        error: "Download is not ready",
        status: download.status,
      });
    }

    // Handle different download types
    switch (download.type) {
      case DownloadType.PLAYLIST:
        // Serve the zip file from filePath
        if (!download.filePath) {
          return res.status(500).json({ error: "Download file path missing" });
        }
        return res.sendFile(download.filePath, {
          headers: {
            "Content-Disposition": `attachment; filename="${download.fileName}"`,
          },
        });

      case DownloadType.SCENE: {
        // Proxy scene stream with Content-Disposition header for download
        const stashBaseUrl = stashInstanceManager.getBaseUrl();
        const apiKey = stashInstanceManager.getApiKey();
        const sceneUrl = `${stashBaseUrl}/scene/${download.entityId}/stream`;

        // Abort the upstream fetch if the client disconnects
        const sceneAbort = new AbortController();
        res.on("close", () => sceneAbort.abort());

        const sceneResponse = await fetch(sceneUrl, {
          headers: { ApiKey: apiKey },
          signal: sceneAbort.signal,
        });

        if (!sceneResponse.ok) {
          return res.status(sceneResponse.status).json({
            error: "Failed to fetch scene from Stash",
          });
        }

        // Set headers for download
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${download.fileName}"`
        );

        await pipeResponseToClient(sceneResponse, res, "[DOWNLOAD]", [
          "content-type",
          "content-length",
        ]);
        return;
      }

      case DownloadType.IMAGE: {
        // Proxy image with Content-Disposition header for download
        const stashBaseUrl2 = stashInstanceManager.getBaseUrl();
        const apiKey2 = stashInstanceManager.getApiKey();
        const imageUrl = `${stashBaseUrl2}/image/${download.entityId}/image`;

        // Abort the upstream fetch if the client disconnects
        const imageAbort = new AbortController();
        res.on("close", () => imageAbort.abort());

        const imageResponse = await fetch(imageUrl, {
          headers: { ApiKey: apiKey2 },
          signal: imageAbort.signal,
        });

        if (!imageResponse.ok) {
          return res.status(imageResponse.status).json({
            error: "Failed to fetch image from Stash",
          });
        }

        // Set headers for download
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${download.fileName}"`
        );

        await pipeResponseToClient(imageResponse, res, "[DOWNLOAD]", [
          "content-type",
          "content-length",
        ]);
        return;
      }

      default:
        return res.status(400).json({ error: "Unknown download type" });
    }
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
  req: AuthenticatedRequest,
  res: Response
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
  req: AuthenticatedRequest,
  res: Response
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
        currentStatus: download.status,
      });
    }

    // Reset progress and restart zip creation
    await downloadService.updateProgress(downloadId, 0);

    logger.info("Retrying playlist download", { downloadId, userId });

    // Start zip creation in background (don't await)
    playlistZipService.createZip(downloadId).catch((error) => {
      logger.error("Background zip retry failed", {
        downloadId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    // Fetch updated download record
    const updatedDownload = await downloadService.getDownload(downloadId);
    if (!updatedDownload) {
      return res.status(500).json({ error: "Failed to retrieve updated download" });
    }

    return res.json({ download: serializeDownload(updatedDownload) });
  } catch (error) {
    logger.error("Error retrying download", {
      error: error instanceof Error ? error.message : String(error),
    });
    return res.status(500).json({ error: "Failed to retry download" });
  }
}
