import { DownloadStatus, DownloadType } from "@prisma/client";
import { BadGatewayError, NotFoundError } from "../middleware/errorHandler.js";
import { downloadJobQueue } from "../services/DownloadJobQueue.js";
import { downloadService } from "../services/DownloadService.js";
import { canUserAccessEntity } from "../services/EntityAccessService.js";
import { resolveUserPermissions } from "../services/PermissionService.js";
import { getPlaylistAccess } from "../services/PlaylistAccessService.js";
import { playlistZipService } from "../services/PlaylistZipService.js";
import {
  type StashCredentials,
  UnknownInstanceError,
  stashInstanceManager,
} from "../services/StashInstanceManager.js";
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
import {
  MAX_ACTIVE_ZIPS_PER_USER,
  maxPlaylistBytes,
  plannedZipBytes,
  toMiB,
} from "../utils/downloadLimits.js";
import { userFacingReason } from "../utils/downloadReasons.js";
import { logger } from "../utils/logger.js";
import {
  fetchFromStash,
  pipeResponseToClient,
  stashFailure,
  stashFetchError,
} from "../utils/streamProxy.js";

/** How long Stash may take to answer, and to go quiet mid-body, on a file. */
const DEFAULT_STASH_HEADERS_TIMEOUT_MS = 60_000;
const STASH_IDLE_TIMEOUT_MS = 60_000;

/**
 * The limit for Stash's response headers; `STASH_HEADERS_TIMEOUT_MS` (read on
 * each request, for tests) overrides the 60 s default when it is a positive
 * number.
 */
function stashHeadersTimeoutMs(): number {
  const override = Number(process.env.STASH_HEADERS_TIMEOUT_MS);
  return override > 0 ? override : DEFAULT_STASH_HEADERS_TIMEOUT_MS;
}

/** What a download answers the browser with, from Stash's response. */
const FORWARDED_FILE_HEADERS = [
  "content-type",
  "content-length",
  "content-range",
  "accept-ranges",
  "last-modified",
  "etag",
];

/** The 429 a user gets with MAX_ACTIVE_ZIPS_PER_USER zips waiting or building */
const TOO_MANY_ZIPS = `You have ${MAX_ACTIVE_ZIPS_PER_USER} playlist downloads in progress; wait for one to finish`;

/**
 * Serialize a download record for JSON response.
 * Converts BigInt fileSize to string since JSON doesn't support BigInt, and
 * leaves out the server file path.
 */
function serializeDownload({
  filePath: _filePath,
  ...download
}: {
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
  skippedItems: number;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
}) {
  // The server's file path is never sent, nor a caught error's text
  return {
    ...download,
    fileSize: download.fileSize !== null ? download.fileSize.toString() : null,
    error: userFacingReason(download.error),
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
  const userId = req.user.id;
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
  const userId = req.user.id;
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
}

/**
 * Start a playlist download (creates a zip file).
 * POST /api/downloads/playlist/:playlistId
 */
export async function startPlaylistDownload(
  req: TypedAuthRequest<never, StartPlaylistDownloadParams>,
  res: TypedResponse<StartPlaylistDownloadResponse | ApiErrorResponse>
) {
  const userId = req.user.id;
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

  // A second click while the zip waits or builds gets that zip
  const active = await downloadService.findActivePlaylistDownload(
    userId,
    playlistId
  );
  if (active) {
    return res.json({ download: serializeDownload(active) });
  }
  if (
    (await downloadService.countActivePlaylistDownloads(userId)) >=
    MAX_ACTIVE_ZIPS_PER_USER
  ) {
    return res.status(429).json({ error: TOO_MANY_ZIPS });
  }

  // Only the scenes this user may see, each on its own instance
  const scenes = await playlistZipService.readDownloadableScenes(
    userId,
    playlistId
  );
  if (scenes.length === 0) {
    return res
      .status(400)
      .json({ error: "This playlist has no scenes you can download" });
  }

  // Check size limit
  const totalSize = plannedZipBytes(scenes);
  const maxBytes = maxPlaylistBytes();
  if (totalSize > maxBytes) {
    return res.status(400).json({
      error: "Playlist exceeds maximum download size",
      details: `Total: ${toMiB(totalSize)}MB, max: ${toMiB(maxBytes)}MB`,
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

  // Built when its turn comes in the zip queue, which checks access again
  downloadJobQueue.enqueue(download.id, userId);

  return res.json({ download: serializeDownload(download) });
}

/**
 * Get all downloads for the current user.
 * GET /api/downloads
 */
export async function getUserDownloads(
  req: TypedAuthRequest,
  res: TypedResponse<GetUserDownloadsResponse | ApiErrorResponse>
) {
  const userId = req.user.id;
  const downloads = await downloadService.getUserDownloads(userId);

  return res.json({
    downloads: downloads.map(serializeDownload),
  });
}

/**
 * Get a specific download's status.
 * GET /api/downloads/:id
 */
export async function getDownloadStatus(
  req: TypedAuthRequest<never, GetDownloadStatusParams>,
  res: TypedResponse<GetDownloadStatusResponse | ApiErrorResponse>
) {
  const userId = req.user.id;
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
}

/**
 * Get the actual download file.
 * GET /api/downloads/:id/file
 */
export async function getDownloadFile(
  req: TypedAuthRequest<never, GetDownloadFileParams>,
  res: TypedResponse<ApiErrorResponse>
) {
  const userId = req.user.id;
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
      throw new NotFoundError("Download not found");
    }
    return res.sendFile(download.filePath, {
      headers: {
        "Content-Disposition": attachmentContentDisposition(download.fileName),
      },
    });
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

  // Each file comes from the instance it lives on, and from no other: an
  // instance disabled or deleted since then is not found
  let credentials: StashCredentials;
  try {
    credentials = stashInstanceManager.getCredentials(download.instanceId);
  } catch (error) {
    if (error instanceof UnknownInstanceError) {
      return res.status(404).json({ error: "Download not found" });
    }
    throw error;
  }
  const { baseUrl, apiKey } = credentials;
  const fileUrl =
    entityType === "scene"
      ? `${baseUrl}/scene/${download.entityId}/stream`
      : `${baseUrl}/image/${download.entityId}/image`;

  // Range and If-Range go to Stash, which answers 206 or 416 itself
  const rangeHeaders: Record<string, string> = {};
  const range = req.headers.range;
  if (range) rangeHeaders.range = range;
  const ifRange = req.headers["if-range"];
  if (typeof ifRange === "string") rangeHeaders["if-range"] = ifRange;

  let fetched;
  try {
    fetched = await fetchFromStash(fileUrl, {
      apiKey,
      clientRes: res,
      headersTimeoutMs: stashHeadersTimeoutMs(),
      headers: rangeHeaders,
    });
  } catch (error) {
    // Null when the client left, which needs no answer
    const mapped = stashFetchError(error, res);
    if (mapped) throw mapped;
    return;
  }
  const { response: upstream, abort } = fetched;

  // 206, 304 and 416 pass through; a refused body is cancelled, not left open
  const failure = stashFailure(upstream.status);
  if (failure || upstream.status === 410) {
    logger.warn(
      `[DOWNLOAD] Stash returned ${upstream.status} for ${entityType} ${download.entityId}`
    );
    abort.abort();
    await upstream.body?.cancel().catch(() => undefined);
    throw failure instanceof BadGatewayError
      ? new BadGatewayError("Stash could not serve the file")
      : new NotFoundError("Download not found");
  }

  res.status(upstream.status);
  res.setHeader(
    "Content-Disposition",
    attachmentContentDisposition(download.fileName)
  );

  await pipeResponseToClient(
    upstream,
    res,
    "[DOWNLOAD]",
    FORWARDED_FILE_HEADERS,
    { idleTimeoutMs: STASH_IDLE_TIMEOUT_MS, abort }
  );
  return;
}

/**
 * Delete a download record.
 * DELETE /api/downloads/:id
 */
export async function deleteDownload(
  req: TypedAuthRequest<never, DeleteDownloadParams>,
  res: TypedResponse<DeleteDownloadResponse | ApiErrorResponse>
) {
  const userId = req.user.id;
  const downloadId = parseInt(req.params.id, 10);
  if (isNaN(downloadId)) {
    return res.status(400).json({ error: "Invalid download ID" });
  }

  await downloadService.deleteDownload(downloadId, userId);

  logger.info("Download deleted", { downloadId, userId });

  return res.json({ success: true, message: "Download deleted" });
}

/**
 * Retry a failed playlist download.
 * POST /api/downloads/:id/retry
 */
export async function retryDownload(
  req: TypedAuthRequest<never, RetryDownloadParams>,
  res: TypedResponse<RetryDownloadResponse | ApiErrorResponse>
) {
  const userId = req.user.id;
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

  // The zip is rebuilt from the scenes the user may see when its turn
  // comes (PlaylistZipService reads them as this user and checks again),
  // so only the playlist needs checking here
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

  if (
    (await downloadService.countActivePlaylistDownloads(userId)) >=
    MAX_ACTIVE_ZIPS_PER_USER
  ) {
    return res.status(429).json({ error: TOO_MANY_ZIPS });
  }

  // Back to PENDING only if still FAILED: of two quick retries, one wins
  if (!(await downloadService.requeueFailedDownload(downloadId))) {
    return res
      .status(409)
      .json({ error: "This download is already being retried" });
  }

  logger.info("Retrying playlist download", { downloadId, userId });

  downloadJobQueue.enqueue(downloadId, userId);

  // Fetch updated download record
  const updatedDownload = await downloadService.getDownload(downloadId);
  if (!updatedDownload) {
    return res
      .status(500)
      .json({ error: "Failed to retrieve updated download" });
  }

  return res.json({ download: serializeDownload(updatedDownload) });
}
