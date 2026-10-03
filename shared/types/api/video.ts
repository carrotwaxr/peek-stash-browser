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

/**
 * POST /api/scene/:sceneId/media-link: signed paths (scope `media`) for one
 * scene's media, for a Cast receiver or Safari's native player. Every URL is a
 * path; the client prefixes `window.location.origin`.
 */
export interface SceneMediaLinkRequest {
  instanceId: string;
}

export interface SceneMediaLinkResponse {
  /** ISO timestamp, 12 hours after minting. */
  expiresAt: string;
  /** Direct and the HLS tiers only, in `buildSceneStreams`' order. */
  streams: { url: string; mime_type: string; label: string }[];
  /** The one source a Cast receiver is given; null when none plays there. */
  cast: { url: string; contentType: string; kind: "direct" | "hls" } | null;
  captions: { url: string; lang: string; type: string }[];
  poster: string | null;
}
