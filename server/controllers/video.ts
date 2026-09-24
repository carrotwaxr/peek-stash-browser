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
 */
function rewriteHlsPlaylist(
  content: string,
  sceneId: string,
  _stashBaseUrl: string,
  instanceId?: string
): string {
  const lines = content.split("\n");

  return lines
    .map((line) => {
      // Skip empty lines and HLS tags (start with #)
      if (!line.trim() || line.startsWith("#")) {
        return line;
      }

      try {
        let urlPath: string;
        let queryParams: URLSearchParams;

        // Check if it's a full URL or a path
        if (line.includes("://")) {
          // Absolute URL: http://stash:9999/scene/123/stream.m3u8/0.ts?apikey=xxx
          const url = new URL(line);
          urlPath = url.pathname;
          queryParams = url.searchParams;
        } else if (line.startsWith("/")) {
          // Absolute path: /scene/123/stream.m3u8/0.ts?apikey=xxx
          const [path, query] = line.split("?");
          urlPath = path ?? "";
          queryParams = new URLSearchParams(query || "");
        } else {
          // Relative path: stream.m3u8/0.ts?apikey=xxx or 0.ts?apikey=xxx
          const [path, query] = line.split("?");
          urlPath = path ?? "";
          queryParams = new URLSearchParams(query || "");
        }

        // Strip apikey from query params (case-insensitive)
        queryParams.delete("apikey");
        queryParams.delete("ApiKey");
        queryParams.delete("APIKEY");

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

        // Build clean query string
        const cleanQuery = queryParams.toString();
        const queryString = cleanQuery ? `?${cleanQuery}` : "";

        // Return proxied URL
        return `/api/scene/${sceneId}/proxy-stream/${streamPath}${queryString}`;
      } catch {
        // If parsing fails, return original line (shouldn't happen for valid playlists)
        logger.warn(`[PROXY] Failed to rewrite HLS line: ${line}`);
        return line;
      }
    })
    .join("\n");
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
 * through Peek's proxy.
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
    if (req.headers.range) {
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

    logger.info(
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

    logger.info(
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
