import type {
  ExternalPlayerLinkRequest,
  ExternalPlayerLinkResponse,
} from "@peek/shared-types/api/video.js";
import type { Response } from "express";
import prisma from "../prisma/singleton.js";
import { canUserAccessEntity } from "../services/EntityAccessService.js";
import { stashInstanceManager } from "../services/StashInstanceManager.js";
import type { ApiErrorResponse } from "../types/api/common.js";
import type { TypedAuthRequest, TypedResponse } from "../types/api/express.js";
import { privateCacheControl } from "../utils/cacheControl.js";
import { redactUrl } from "../utils/logRedaction.js";
import { logger } from "../utils/logger.js";
import { canUserLoadMedia } from "../utils/mediaAccess.js";
import {
  INSTANCE_ID_PATTERN,
  SCENE_ID_PATTERN,
  isAllowedCaption,
  isAllowedStreamPath,
  pickStreamQuery,
} from "../utils/stashMediaPath.js";
import {
  STREAM_LINK_TTL_SECONDS,
  type StreamLinkClaims,
  buildStreamLinkPath,
  getStreamLinkKey,
  signStreamLink,
} from "../utils/streamLink.js";
import { pipeResponseToClient } from "../utils/streamProxy.js";

/**
 * Get credentials for a specific Stash instance
 * @param instanceId - Optional instance ID. If not provided, uses default instance.
 * @returns Object with baseUrl and apiKey
 */
function getInstanceCredentials(instanceId?: string): {
  baseUrl: string;
  apiKey: string;
} {
  // Treat "default" the same as undefined - use the default instance
  if (instanceId && instanceId !== "default") {
    const instance = stashInstanceManager.get(instanceId);
    if (!instance) {
      throw new Error(`Stash instance not found: ${instanceId}`);
    }
    return {
      baseUrl: stashInstanceManager.getBaseUrl(instanceId),
      apiKey: stashInstanceManager.getApiKey(instanceId),
    };
  }
  // Default instance
  return {
    baseUrl: stashInstanceManager.getBaseUrl(),
    apiKey: stashInstanceManager.getApiKey(),
  };
}

/** A present instanceId must be well-formed; absent means the default instance. */
function isValidOptionalInstanceId(
  instanceId: unknown
): instanceId is string | undefined {
  return (
    instanceId === undefined ||
    (typeof instanceId === "string" && INSTANCE_ID_PATTERN.test(instanceId))
  );
}

// ============================================================================
// STASH STREAM PROXY
// ============================================================================

/** Delete every `apikey` query parameter, in any casing. */
function deleteApiKeyParams(params: URLSearchParams): void {
  for (const key of [...params.keys()]) {
    if (key.toLowerCase() === "apikey") {
      params.delete(key);
    }
  }
}

/**
 * One URI from a Stash HLS playlist as a Peek proxy-stream path, without
 * apikey and with instanceId. Null when the URI cannot be parsed.
 */
function rewriteStashUri(
  uri: string,
  sceneId: string,
  instanceId: string | undefined
): string | null {
  if (!uri.trim()) {
    return null;
  }

  try {
    let urlPath: string;
    let queryParams: URLSearchParams;

    if (uri.includes("://")) {
      // Absolute URL: http://stash:9999/scene/123/stream.m3u8/0.ts?apikey=xxx
      const url = new URL(uri);
      urlPath = url.pathname;
      queryParams = url.searchParams;
    } else {
      // Absolute path (/scene/123/stream.m3u8/0.ts?apikey=xxx), relative
      // path (stream.m3u8/0.ts?apikey=xxx) or bare segment (0.ts?apikey=xxx)
      const [path, query] = uri.split("?");
      urlPath = path ?? "";
      queryParams = new URLSearchParams(query || "");
    }

    deleteApiKeyParams(queryParams);

    // Add instanceId for multi-instance routing
    if (instanceId) {
      queryParams.set("instanceId", instanceId);
    }

    // Extract the stream path (everything after /scene/{id}/)
    let streamPath: string;
    const scenePathMatch = urlPath.match(/\/scene\/\d+\/(.+)/);
    if (scenePathMatch) {
      streamPath = scenePathMatch[1] as string;
    } else {
      // If no scene path pattern, use the path as-is
      streamPath = urlPath.startsWith("/") ? urlPath.slice(1) : urlPath;
    }

    const cleanQuery = queryParams.toString();
    const queryString = cleanQuery ? `?${cleanQuery}` : "";

    return `/api/scene/${sceneId}/proxy-stream/${streamPath}${queryString}`;
  } catch {
    return null;
  }
}

/** A URI attribute in an HLS tag (#EXT-X-KEY, #EXT-X-MAP, #EXT-X-MEDIA, ...). */
const HLS_URI_ATTRIBUTE = /([:,])URI="([^"]*)"/g;

/** Any spelling of apikey, anywhere: no line matching it leaves Peek. */
const API_KEY_ANYWHERE = /apikey/i;

/**
 * One playlist line rewritten for Peek, or "" when it cannot be made safe.
 * Tags keep their text with each URI attribute rewritten; a tag with a URI
 * that cannot be rewritten is dropped whole.
 */
function rewriteHlsLine(
  line: string,
  sceneId: string,
  instanceId: string | undefined
): string {
  if (!line.trim()) {
    return line;
  }

  if (line.startsWith("#")) {
    let unparsable = false;
    const rewritten = line.replace(
      HLS_URI_ATTRIBUTE,
      (match, separator: string, uri: string) => {
        const proxied = rewriteStashUri(uri, sceneId, instanceId);
        if (proxied === null) {
          unparsable = true;
          return match;
        }
        return `${separator}URI="${proxied}"`;
      }
    );
    if (unparsable) {
      logger.warn(`[PROXY] Dropped an HLS tag: ${redactUrl(line)}`);
      return "";
    }
    return rewritten;
  }

  const proxied = rewriteStashUri(line, sceneId, instanceId);
  if (proxied === null) {
    // Never return the raw line: Stash's playlist lines can carry apikey
    logger.warn(`[PROXY] Failed to rewrite HLS line: ${redactUrl(line)}`);
    return "";
  }
  return proxied;
}

/**
 * Rewrite URLs in HLS playlist to use Peek's proxy
 * Stash includes apikey in segment URLs - we need to strip that and route through our proxy
 *
 * Stash 0.31 lists each segment as /scene/{id}/stream.m3u8/{n}.ts?resolution=...
 * (its segment route is stream.m3u8/{n}.ts). The line may arrive as:
 * - Absolute: http://stash:9999/scene/123/stream.m3u8/0.ts?apikey=xxx&resolution=LOW
 * - Absolute path: /scene/123/stream.m3u8/0.ts?apikey=xxx&resolution=LOW
 * - Relative: stream.m3u8/0.ts?apikey=xxx
 * - Just segment: 0.ts?apikey=xxx
 *
 * All are rewritten to: /api/scene/{sceneId}/proxy-stream/{path}?{params without apikey}&instanceId=xxx,
 * which proxyStashStream serves again (isAllowedStreamPath admits stream.m3u8/{n}.ts).
 * URI attributes in tags are rewritten the same way. A line that cannot be
 * rewritten, or that still names apikey afterwards, is replaced by "".
 */
function rewriteHlsPlaylist(
  content: string,
  sceneId: string,
  _stashBaseUrl: string,
  instanceId?: string
): string {
  return content
    .split("\n")
    .map((line, index) => {
      const rewritten = rewriteHlsLine(line, sceneId, instanceId);
      if (API_KEY_ANYWHERE.test(rewritten)) {
        // The line has a shape redactUrl may not know, so log only where it was
        const kind = line.startsWith("#")
          ? (line.match(/^#[A-Z0-9-]+/)?.[0] ?? "a tag")
          : "a URI line";
        logger.warn(
          `[PROXY] Dropped HLS line ${index + 1} (${kind}): it still names apikey`
        );
        return "";
      }
      return rewritten;
    })
    .join("\n");
}

// An apikey query parameter in a DASH manifest, after "&" or its XML escape
// "&amp;", with its value (up to the next separator, quote, tag or space)
const DASH_TRAILING_API_KEY = /(?:&amp;|&)apikey=[^&"'<\s]*/gi;
// The same parameter first in its query, with the separator that follows it
const DASH_LEADING_API_KEY = /\?apikey=[^&"'<\s]*(&amp;|&)?/gi;

/**
 * Remove apikey query parameters from every URL in a DASH manifest, leaving
 * the rest of each query well formed. Trailing ones go first, so a query
 * that starts with apikey keeps its following parameter.
 */
function stripDashApiKeys(manifest: string): string {
  return manifest
    .replace(DASH_TRAILING_API_KEY, "")
    .replace(DASH_LEADING_API_KEY, (_match, next: string | undefined) =>
      next ? "?" : ""
    );
}

/**
 * Proxy all stream requests to Stash
 * Peek proxies ALL streams to Stash instead of managing its own transcoding.
 *
 * GET /api/scene/:sceneId/proxy-stream/stream?instanceId=xxx -> Stash /scene/:sceneId/stream (Direct)
 * GET /api/scene/:sceneId/proxy-stream/stream.m3u8?resolution=STANDARD_HD&instanceId=xxx -> Stash HLS 720p
 * GET /api/scene/:sceneId/proxy-stream/stream.mp4?resolution=STANDARD&instanceId=xxx -> Stash MP4 480p
 * GET /api/scene/:sceneId/proxy-stream/stream.m3u8/:n.ts?resolution=STANDARD&instanceId=xxx -> Stash HLS segment
 *
 * This lets Stash handle all codec detection, transcoding, and quality selection.
 *
 * SECURITY: authenticateStreamRequest runs first (a session, or a signed link
 * on the direct stream). The path must be one of Stash's stream files
 * (isAllowedStreamPath), the scene must be visible to the user, and only
 * `resolution` and `start` go upstream. For HLS playlists (.m3u8), internal
 * URLs are rewritten to strip the Stash API key and route segment requests
 * through Peek's proxy. A DASH manifest (.mpd) has its apikey parameters
 * stripped, and is refused if it still names apikey. Manifests are fetched
 * whole, never by Range.
 */
export const proxyStashStream = async (
  req: TypedAuthRequest<
    never,
    { sceneId: string; streamPath: string; subPath?: string },
    { instanceId?: string }
  >,
  res: Response
) => {
  try {
    const { sceneId, streamPath, subPath } = req.params;
    const instanceId = req.query.instanceId;

    if (
      !SCENE_ID_PATTERN.test(sceneId) ||
      !isAllowedStreamPath(streamPath, subPath) ||
      !isValidOptionalInstanceId(instanceId)
    ) {
      return res.status(400).send("Invalid stream path");
    }

    if (
      !(await canUserLoadMedia(
        req.user.id,
        [{ entityType: "scene", entityId: sceneId }],
        instanceId
      ))
    ) {
      return res.status(404).send("Not found");
    }

    // Combine path segments if subPath exists (for HLS segments like stream.m3u8/0.ts)
    const fullStreamPath = subPath ? `${streamPath}/${subPath}` : streamPath;

    // Only Stash's own stream parameters go upstream; instanceId is Peek
    // routing and uid/exp/sig are the signed link's claims
    const queryString = pickStreamQuery(
      new URLSearchParams(req.url.split("?")[1] ?? "")
    ).toString();

    // Get Stash instance configuration
    let stashBaseUrl: string;
    let apiKey: string;

    try {
      const creds = getInstanceCredentials(instanceId);
      stashBaseUrl = creds.baseUrl;
      apiKey = creds.apiKey;
    } catch (error) {
      logger.error("[PROXY] Failed to get Stash instance credentials", {
        error,
        instanceId,
      });
      return res.status(500).send("Stash not configured");
    }

    const stashUrl = `${stashBaseUrl}/scene/${sceneId}/${fullStreamPath}${queryString ? "?" + queryString : ""}`;

    logger.debug(`[PROXY] Proxying stream: scene=${sceneId} ${fullStreamPath}`);

    // Abort the upstream fetch if the client disconnects (seek, refresh, navigate away).
    // This prevents orphaned connections from downloading entire files into memory.
    const abortController = new AbortController();
    res.on("close", () => abortController.abort());

    // Forward request to Stash using fetch
    const headers: Record<string, string> = { ApiKey: apiKey };
    // Manifests go whole: Stash honours Range on them, and a slice starting
    // past "apikey=" would carry a bare key through every rewrite below
    const isManifestPath = /\.(m3u8|mpd)$/.test(fullStreamPath);
    if (req.headers.range && !isManifestPath) {
      headers["Range"] = req.headers.range;
    }

    const response = await fetch(stashUrl, {
      headers,
      signal: abortController.signal,
    });

    if (!response.ok) {
      logger.warn(
        `[PROXY] Stash returned ${response.status} for scene=${sceneId} ${fullStreamPath}`
      );
      return res
        .status(response.status)
        .send(`Stash stream error: ${response.statusText}`);
    }

    // Check if this is an HLS playlist that needs URL rewriting
    const contentType = response.headers.get("content-type") || "";
    const isHlsPlaylist =
      fullStreamPath.endsWith(".m3u8") ||
      contentType.includes("mpegurl") ||
      contentType.includes("x-mpegURL");

    if (isHlsPlaylist) {
      // For HLS playlists, read the entire response and rewrite URLs
      const playlistContent = await response.text();
      const rewrittenContent = rewriteHlsPlaylist(
        playlistContent,
        sceneId,
        stashBaseUrl,
        instanceId
      );

      // Set headers for the rewritten playlist
      res.status(response.status);
      res.setHeader("content-type", "application/vnd.apple.mpegurl");
      res.setHeader("cache-control", "private, no-cache");
      res.send(rewrittenContent);

      logger.debug(`[PROXY] Rewrote HLS playlist: ${fullStreamPath}`);
      return;
    }

    // Forward status code
    res.status(response.status);

    // The response belongs to a signed-in user: keep Stash's freshness, never
    // let a shared cache store it
    res.setHeader(
      "cache-control",
      privateCacheControl(
        response.headers.get("cache-control"),
        "private, no-cache"
      )
    );

    // A DASH manifest (about 1 KB) is read whole and sent without apikey
    const isDashManifest =
      fullStreamPath.endsWith(".mpd") || contentType.includes("dash+xml");

    if (isDashManifest) {
      const manifest = stripDashApiKeys(await response.text());
      if (API_KEY_ANYWHERE.test(manifest)) {
        logger.warn(
          `[PROXY] Refused a DASH manifest that names apikey: scene=${sceneId} ${fullStreamPath}`
        );
        return res.status(502).send("Stash stream error");
      }
      res.setHeader("content-type", contentType || "application/dash+xml");
      res.send(manifest);

      logger.debug(`[PROXY] Stripped DASH manifest: ${fullStreamPath}`);
      return;
    }

    // Stream response body to client with proper backpressure and cleanup
    const headersToForward = [
      "content-type",
      "content-length",
      "accept-ranges",
      "content-range",
      "last-modified",
      "etag",
    ];

    await pipeResponseToClient(response, res, "[PROXY]", headersToForward);

    logger.debug(`[PROXY] Stream proxied successfully: ${fullStreamPath}`);
  } catch (error) {
    logger.error("[PROXY] Error proxying stream", {
      error: error instanceof Error ? error.message : String(error),
    });
    if (!res.headersSent) {
      res.status(500).send("Stream proxy failed");
    }
  }
};

// ============================================================================
// CAPTION PROXY
// ============================================================================

/**
 * Proxy caption/subtitle files from Stash
 * GET /api/scene/:sceneId/caption?lang=en&type=srt&instanceId=xxx
 *
 * Requires a Peek session; the scene must be visible to the user. `lang` is
 * a short code and `type` is srt or vtt; the upstream query is rebuilt with
 * URLSearchParams so neither can smuggle another parameter.
 *
 * Stash stores captions as separate .vtt or .srt files alongside video files
 * This endpoint proxies those files and converts SRT to VTT if needed
 */
export const getCaption = async (
  req: TypedAuthRequest<
    never,
    { sceneId: string },
    { lang?: string; type?: string; instanceId?: string }
  >,
  res: Response
) => {
  try {
    const { sceneId } = req.params;
    const { lang, type, instanceId } = req.query;

    if (!lang || !type) {
      return res.status(400).send("Missing lang or type parameter");
    }

    if (
      !SCENE_ID_PATTERN.test(sceneId) ||
      typeof lang !== "string" ||
      typeof type !== "string" ||
      !isAllowedCaption(lang, type) ||
      !isValidOptionalInstanceId(instanceId)
    ) {
      return res.status(400).send("Invalid caption parameters");
    }

    if (
      !(await canUserLoadMedia(
        req.user.id,
        [{ entityType: "scene", entityId: sceneId }],
        instanceId
      ))
    ) {
      return res.status(404).send("Not found");
    }

    logger.debug(
      `[CAPTION] Request: scene=${sceneId}, lang=${lang}, type=${type}, instanceId=${instanceId ?? "(not specified)"}`
    );

    // Get Stash instance configuration
    let stashUrl: string;
    let apiKey: string;

    try {
      const creds = getInstanceCredentials(instanceId);
      stashUrl = creds.baseUrl;
      apiKey = creds.apiKey;
    } catch (error) {
      logger.error("[CAPTION] Failed to get Stash instance credentials", {
        error,
        instanceId,
      });
      return res.status(500).send("Stash configuration missing");
    }

    // Construct Stash caption URL
    const captionUrl = new URL(`${stashUrl}/scene/${sceneId}/caption`);
    captionUrl.searchParams.set("lang", lang);
    captionUrl.searchParams.set("type", type);
    logger.debug(`[CAPTION] Fetching from Stash: ${captionUrl.pathname}`);

    // Fetch caption from Stash with API key
    const response = await fetch(captionUrl.toString(), {
      headers: {
        ApiKey: apiKey,
      },
    });

    if (!response.ok) {
      logger.warn(
        `[CAPTION] Stash returned ${response.status} for scene ${sceneId}`
      );
      return res.status(response.status).send("Caption not found");
    }

    const captionData = await response.text();

    // Stash automatically converts SRT to VTT if needed, so we can just serve it
    res.setHeader("Content-Type", "text/vtt; charset=utf-8");
    res.setHeader("Cache-Control", "private, max-age=86400");
    res.send(captionData);

    logger.debug(
      `[CAPTION] Served caption: scene=${sceneId}, lang=${lang}, size=${captionData.length} bytes`
    );
  } catch (error) {
    logger.error("[CAPTION] Error serving caption", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).send("Internal server error");
  }
};

// ============================================================================
// EXTERNAL PLAYER LINK
// ============================================================================

/**
 * Mint a personal, signed direct-stream link for the external player button.
 * POST /api/scene/:sceneId/external-player-link { instanceId }
 *
 * The link carries the user's id, a 12-hour expiry and an HMAC over those
 * plus the scene, the instance and the user's passwordChangedAt
 * (utils/streamLink.ts). authenticateStreamRequest accepts it on the direct
 * stream without a cookie; proxyStashStream then runs the same access check
 * as for a session, so the link plays only what this user may see at
 * request time. A path is returned, not an absolute URL, so the server never
 * trusts the Host header.
 */
export const createExternalPlayerLink = async (
  req: TypedAuthRequest<ExternalPlayerLinkRequest, { sceneId: string }>,
  res: TypedResponse<ExternalPlayerLinkResponse | ApiErrorResponse>
) => {
  const { sceneId } = req.params;
  const instanceId = req.body?.instanceId;

  if (
    !SCENE_ID_PATTERN.test(sceneId) ||
    typeof instanceId !== "string" ||
    !INSTANCE_ID_PATTERN.test(instanceId)
  ) {
    return res.status(400).json({ error: "Invalid scene or instance" });
  }

  if (!(await canUserAccessEntity(req.user.id, "scene", sceneId, instanceId))) {
    return res.status(404).json({ error: "Not found" });
  }

  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { passwordChangedAt: true },
  });
  if (!user) {
    return res.status(401).json({ error: "Session expired" });
  }

  const exp = Math.floor(Date.now() / 1000) + STREAM_LINK_TTL_SECONDS;
  const claims: StreamLinkClaims = {
    userId: req.user.id,
    sceneId,
    instanceId,
    exp,
    passwordChangedAtMs: user.passwordChangedAt?.getTime() ?? 0,
  };

  res.setHeader("Cache-Control", "no-store");
  res.json({
    url: buildStreamLinkPath(
      claims,
      signStreamLink(claims, getStreamLinkKey())
    ),
    expiresAt: new Date(exp * 1000).toISOString(),
  });
};
