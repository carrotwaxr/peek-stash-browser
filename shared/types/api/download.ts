// shared/types/api/download.ts
/**
 * Download API Types
 *
 * Request and response types for /api/downloads/* endpoints.
 */

// =============================================================================
// SHARED
// =============================================================================

/**
 * Serialized download record (BigInt fileSize converted to string)
 */
export interface SerializedDownload {
  id: number;
  userId: number;
  type: string;
  status: string;
  playlistId: number | null;
  entityType: string | null;
  entityId: string | null;
  fileName: string;
  fileSize: string | null;
  filePath: string | null;
  progress: number;
  error: string | null;
  createdAt: Date;
  completedAt: Date | null;
  expiresAt: Date | null;
}

// =============================================================================
// START SCENE DOWNLOAD
// =============================================================================

/** POST /api/downloads/scene/:sceneId */
export interface StartSceneDownloadParams extends Record<string, string> {
  sceneId: string;
}

export interface StartSceneDownloadResponse {
  download: SerializedDownload;
}

// =============================================================================
// START IMAGE DOWNLOAD
// =============================================================================

/** POST /api/downloads/image/:imageId */
export interface StartImageDownloadParams extends Record<string, string> {
  imageId: string;
}

export interface StartImageDownloadResponse {
  download: SerializedDownload;
}

// =============================================================================
// START PLAYLIST DOWNLOAD
// =============================================================================

/** POST /api/downloads/playlist/:playlistId */
export interface StartPlaylistDownloadParams extends Record<string, string> {
  playlistId: string;
}

export interface StartPlaylistDownloadResponse {
  download: SerializedDownload;
}

// =============================================================================
// GET USER DOWNLOADS
// =============================================================================

/** GET /api/downloads */
export interface GetUserDownloadsResponse {
  downloads: SerializedDownload[];
}

// =============================================================================
// GET DOWNLOAD STATUS
// =============================================================================

/** GET /api/downloads/:id */
export interface GetDownloadStatusParams extends Record<string, string> {
  id: string;
}

export interface GetDownloadStatusResponse {
  download: SerializedDownload;
}

// =============================================================================
// GET DOWNLOAD FILE
// =============================================================================

/** GET /api/downloads/:id/file */
export interface GetDownloadFileParams extends Record<string, string> {
  id: string;
}

// =============================================================================
// DELETE DOWNLOAD
// =============================================================================

/** DELETE /api/downloads/:id */
export interface DeleteDownloadParams extends Record<string, string> {
  id: string;
}

export interface DeleteDownloadResponse {
  success: true;
  message: string;
}

// =============================================================================
// RETRY DOWNLOAD
// =============================================================================

/** POST /api/downloads/:id/retry */
export interface RetryDownloadParams extends Record<string, string> {
  id: string;
}

export interface RetryDownloadResponse {
  download: SerializedDownload;
}
