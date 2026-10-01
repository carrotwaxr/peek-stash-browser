// shared/types/api/video.ts
/**
 * External player link types (sweep item 2).
 *
 * POST /api/scene/:sceneId/external-player-link mints a personal, signed
 * direct-stream path for the signed-in user. The server returns a path, not
 * an absolute URL, so it never trusts the Host header; the client prefixes
 * window.location.origin.
 */

export interface ExternalPlayerLinkRequest {
  instanceId: string;
}

export interface ExternalPlayerLinkResponse {
  /** `/api/scene/:id/proxy-stream/stream?instanceId=...&uid=...&exp=...&sig=...` */
  url: string;
  /** ISO timestamp, 12 hours after minting. */
  expiresAt: string;
  /**
   * The scene file's MIME type from its extension (`video/x-matroska` for an
   * mkv), `video/*` when unknown. The path itself is never returned.
   */
  mimeType: string;
}
