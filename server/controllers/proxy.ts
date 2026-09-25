import type { Response } from "express";
import http from "http";
import https from "https";
import { URL } from "url";
import prisma from "../prisma/singleton.js";
import { canUserAccessEntity } from "../services/EntityAccessService.js";
import {
  type StashCredentials,
  UnknownInstanceError,
  stashInstanceManager,
} from "../services/StashInstanceManager.js";
import type { ApiErrorResponse } from "../types/api/common.js";
import type { TypedAuthRequest, TypedResponse } from "../types/api/express.js";
import type { ProxyOptions } from "../types/api/proxy.js";
import { privateCacheControl } from "../utils/cacheControl.js";
import { logger } from "../utils/logger.js";
import { canUserLoadMedia } from "../utils/mediaAccess.js";
import {
  INSTANCE_ID_PATTERN,
  SCENE_ID_PATTERN,
  parseStashMediaPath,
} from "../utils/stashMediaPath.js";

// =============================================================================
// Connection Pooling
// =============================================================================
// Reusable HTTP agents with keep-alive to avoid TCP handshake overhead
// for each request. Connections are reused across proxy requests.

const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 6, // Max concurrent connections to Stash
  keepAliveMsecs: 30000,
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 6,
  keepAliveMsecs: 30000,
});

// =============================================================================
// Concurrency Limiting
// =============================================================================
// Limits concurrent outbound requests to Stash to prevent overwhelming it.
// Requests beyond the limit are queued and processed in order.

const MAX_CONCURRENT_REQUESTS = 6;
let activeRequests = 0;
const requestQueue: Array<() => void> = [];

function acquireConcurrencySlot(): Promise<void> {
  return new Promise((resolve) => {
    if (activeRequests < MAX_CONCURRENT_REQUESTS) {
      activeRequests++;
      resolve();
    } else {
      requestQueue.push(() => {
        activeRequests++;
        resolve();
      });
    }
  });
}

function releaseConcurrencySlot(): void {
  activeRequests--;
  const next = requestQueue.shift();
  if (next) {
    next();
  }
}

// =============================================================================
// Helper to get the appropriate agent for a URL
// =============================================================================

function getAgentForUrl(urlObj: URL): http.Agent | https.Agent {
  return urlObj.protocol === "https:" ? httpsAgent : httpAgent;
}

/**
 * True once the browser has moved on (page closed, next page loaded): Node
 * marks the response destroyed when the client's socket closes. A media
 * request waits on the session check, the access check and the upstream
 * slot queue, and a grid of thumbnails is often abandoned mid-wait.
 * Forwarding such a request would pipe Stash's response into a dead
 * response: the write returns false, the upstream body pauses, `end` never
 * fires and the slot is held until the upstream timeout, and a backlog of
 * those starves every later request.
 */
function isClientGone(res: Response): boolean {
  return res.destroyed || res.writableEnded;
}

/**
 * The address and key of the instance to serve from (the one named, or the
 * highest-priority enabled instance), or null once the response is sent:
 * 404 for an instance that is not enabled (disabled or deleted; invariant
 * 11), 500 when none is named and none is configured.
 */
function credentialsOrRespond(
  instanceId: string | undefined,
  res: TypedResponse<ApiErrorResponse>
): StashCredentials | null {
  try {
    return stashInstanceManager.getCredentials(instanceId);
  } catch (error) {
    if (error instanceof UnknownInstanceError) {
      res.status(404).json({ error: "Not found" });
      return null;
    }
    logger.error("Failed to get Stash instance credentials", {
      error,
      instanceId,
    });
    res.status(500).json({ error: "Stash configuration missing" });
    return null;
  }
}

/**
 * The optional `?instanceId=` on the by-id routes narrows the row lookup, so
 * a multi-instance setup checks the row it will serve. Every id is an
 * ordinary id, "default" included; absent, the bare id picks the first row.
 */
function rowInstanceFilter(
  instanceId: string | undefined
): { stashInstanceId: string } | Record<never, never> {
  return instanceId === undefined ? {} : { stashInstanceId: instanceId };
}

// =============================================================================
// Shared proxy helper
// =============================================================================

/**
 * Shared helper that makes an HTTP(S) request to Stash and pipes the response
 * to the Express client. Handles:
 * - Connection pooling via keep-alive agents
 * - Client disconnect cleanup (destroys upstream request)
 * - Double-release guard for concurrency slots
 * - Timeout handling
 * - Private Cache-Control: media belongs to a signed-in user, so a shared
 *   cache must never store it (privateCacheControl keeps Stash's freshness)
 */
function proxyHttpRequest({
  fullUrl,
  res,
  label,
  defaultCacheControl,
  timeoutMs,
}: ProxyOptions): void {
  let slotReleased = false;
  const releaseOnce = () => {
    if (!slotReleased) {
      slotReleased = true;
      releaseConcurrencySlot();
    }
  };

  // The client left while this request waited for its slot: free the slot
  // at once rather than fetching a response nobody will read
  if (isClientGone(res)) {
    releaseOnce();
    return;
  }

  const urlObj = new URL(fullUrl);
  const httpModule = urlObj.protocol === "https:" ? https : http;
  const agent = getAgentForUrl(urlObj);

  const proxyReq = httpModule.get(fullUrl, { agent }, (proxyRes) => {
    // Forward response headers
    if (proxyRes.headers["content-type"]) {
      res.setHeader("Content-Type", proxyRes.headers["content-type"]);
    }
    if (proxyRes.headers["content-length"]) {
      res.setHeader("Content-Length", proxyRes.headers["content-length"]);
    }
    res.setHeader(
      "Cache-Control",
      privateCacheControl(
        proxyRes.headers["cache-control"],
        defaultCacheControl
      )
    );

    // Set status code
    res.status(proxyRes.statusCode || 200);

    // Stream response back to client
    proxyRes.pipe(res);

    // Release slot when response ends
    proxyRes.on("end", releaseOnce);
    proxyRes.on("error", releaseOnce);
  });

  // When the client disconnects (seek, refresh, navigate away),
  // destroy the upstream request to stop downloading into memory.
  res.on("close", () => {
    if (!proxyReq.destroyed) {
      proxyReq.destroy();
    }
    releaseOnce();
  });

  // Handle request errors
  proxyReq.on("error", (error: Error) => {
    releaseOnce();
    // ECONNRESET is expected when we destroy the request on client disconnect
    if ((error as NodeJS.ErrnoException).code === "ECONNRESET") {
      logger.debug(`${label} Upstream request aborted (client disconnected)`);
      return;
    }
    logger.error(`${label} Error`, { error: error.message });
    if (!res.headersSent) {
      res.status(500).json({ error: "Proxy request failed" });
    }
  });

  // Set timeout
  proxyReq.setTimeout(timeoutMs, () => {
    releaseOnce();
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: "Proxy request timeout" });
    }
  });
}

// =============================================================================
// Proxy endpoints
// =============================================================================

/**
 * Proxy scene video preview (MP4)
 * GET /api/proxy/scene/:id/preview?instanceId=
 * Requires a Peek session; the scene must be visible to the user.
 * Uses the scene's stashInstanceId to route to correct Stash server.
 */
export const proxyScenePreview = async (
  req: TypedAuthRequest<never, { id: string }, { instanceId?: string }>,
  res: TypedResponse<ApiErrorResponse>
) => {
  const { id } = req.params;
  const { instanceId } = req.query;

  if (!id) {
    res.status(400).json({ error: "Missing scene ID" });
    return;
  }
  if (!SCENE_ID_PATTERN.test(id)) {
    res.status(400).json({ error: "Invalid scene ID" });
    return;
  }

  // Get scene from database to find its stashInstanceId
  const scene = await prisma.stashScene.findFirst({
    where: { id, deletedAt: null, ...rowInstanceFilter(instanceId) },
    select: { stashInstanceId: true },
  });

  if (!scene) {
    res.status(404).json({ error: "Scene not found" });
    return;
  }

  // The check uses the row actually served
  if (
    !(await canUserAccessEntity(
      req.user.id,
      "scene",
      id,
      scene.stashInstanceId
    ))
  ) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const creds = credentialsOrRespond(scene.stashInstanceId, res);
  if (!creds) return;
  const { baseUrl: stashUrl, apiKey } = creds;

  // Nothing to send to a browser that has moved on; skip the queue entirely
  if (isClientGone(res)) return;

  await acquireConcurrencySlot();

  try {
    const fullUrl = `${stashUrl}/scene/${id}/preview?apikey=${apiKey}`;

    logger.debug("Proxying scene preview", { sceneId: id });

    proxyHttpRequest({
      fullUrl,
      res,
      label: "[PROXY scene preview]",
      defaultCacheControl: "private, max-age=86400",
      timeoutMs: 60000,
    });
  } catch (error) {
    releaseConcurrencySlot();
    logger.error("Error proxying scene preview", { error });
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

/**
 * Proxy scene WebP animated preview
 * GET /api/proxy/scene/:id/webp?instanceId=
 * Requires a Peek session; the scene must be visible to the user.
 * Uses the scene's stashInstanceId to route to correct Stash server.
 */
export const proxySceneWebp = async (
  req: TypedAuthRequest<never, { id: string }, { instanceId?: string }>,
  res: TypedResponse<ApiErrorResponse>
) => {
  const { id } = req.params;
  const { instanceId } = req.query;

  if (!id) {
    res.status(400).json({ error: "Missing scene ID" });
    return;
  }
  if (!SCENE_ID_PATTERN.test(id)) {
    res.status(400).json({ error: "Invalid scene ID" });
    return;
  }

  // Get scene from database to find its stashInstanceId
  const scene = await prisma.stashScene.findFirst({
    where: { id, deletedAt: null, ...rowInstanceFilter(instanceId) },
    select: { stashInstanceId: true },
  });

  if (!scene) {
    res.status(404).json({ error: "Scene not found" });
    return;
  }

  if (
    !(await canUserAccessEntity(
      req.user.id,
      "scene",
      id,
      scene.stashInstanceId
    ))
  ) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const creds = credentialsOrRespond(scene.stashInstanceId, res);
  if (!creds) return;
  const { baseUrl: stashUrl, apiKey } = creds;

  // Nothing to send to a browser that has moved on; skip the queue entirely
  if (isClientGone(res)) return;

  await acquireConcurrencySlot();

  try {
    const fullUrl = `${stashUrl}/scene/${id}/webp?apikey=${apiKey}`;

    logger.debug("Proxying scene webp", { sceneId: id });

    proxyHttpRequest({
      fullUrl,
      res,
      label: "[PROXY scene webp]",
      defaultCacheControl: "private, max-age=86400",
      timeoutMs: 60000,
    });
  } catch (error) {
    releaseConcurrencySlot();
    logger.error("Error proxying scene webp", { error });
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

/**
 * Proxy Stash media requests to avoid exposing API keys to clients
 * Handles images, sprites, and other static media
 * GET /api/proxy/stash?path=/xxx&instanceId=yyy
 *
 * Requires a Peek session. The path must be one of Stash's media routes for
 * a numeric id (utils/stashMediaPath.ts); only the `t` and `default` query
 * keys go upstream. Every entity the path names must be visible to the user
 * (a scene_marker path names its scene and its clip). Rejecting `#` and `%`
 * also closes fragment and double-encoding tricks.
 */
export const proxyStashMedia = async (
  req: TypedAuthRequest<
    never,
    Record<string, string>,
    { path?: string; instanceId?: string }
  >,
  res: TypedResponse<ApiErrorResponse>
) => {
  const { path, instanceId } = req.query;

  if (!path || typeof path !== "string") {
    res.status(400).json({ error: "Missing or invalid path parameter" });
    return;
  }

  const target = parseStashMediaPath(path);
  if (!target) {
    res.status(400).json({ error: "Invalid path parameter" });
    return;
  }

  if (
    instanceId !== undefined &&
    (typeof instanceId !== "string" || !INSTANCE_ID_PATTERN.test(instanceId))
  ) {
    res.status(400).json({ error: "Invalid instanceId parameter" });
    return;
  }

  if (!(await canUserLoadMedia(req.user.id, target.entities, instanceId))) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const creds = credentialsOrRespond(instanceId, res);
  if (!creds) return;
  const { baseUrl: stashUrl, apiKey } = creds;

  // Nothing to send to a browser that has moved on; skip the queue entirely
  if (isClientGone(res)) return;

  await acquireConcurrencySlot();

  try {
    const url = new URL(`${stashUrl}${target.pathname}`);
    target.search.forEach((value, key) => {
      url.searchParams.set(key, value);
    });
    url.searchParams.set("apikey", apiKey);

    logger.debug("Proxying Stash media request", { path: target.pathname });

    proxyHttpRequest({
      fullUrl: url.toString(),
      res,
      label: "[PROXY stash media]",
      defaultCacheControl: "private, max-age=31536000, immutable",
      timeoutMs: 30000,
    });
  } catch (error) {
    releaseConcurrencySlot();
    logger.error("Error proxying Stash media", { error });
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

/**
 * Proxy clip preview video (MP4 stream)
 * GET /api/proxy/clip/:id/preview?instanceId=
 *
 * Returns the marker stream video for hover previews.
 * Falls back to screenshot if stream is unavailable.
 * Requires a Peek session; the clip and its scene must be visible to the
 * user (EntityAccessService's "clip" type covers both).
 * Uses the clip's stashInstanceId to route to correct Stash server.
 */
export const proxyClipPreview = async (
  req: TypedAuthRequest<never, { id: string }, { instanceId?: string }>,
  res: TypedResponse<ApiErrorResponse>
) => {
  const { id } = req.params;
  const { instanceId } = req.query;

  if (!id) {
    res.status(400).json({ error: "Missing clip ID" });
    return;
  }

  // Get clip from database - include stashInstanceId for routing
  const clip = await prisma.stashClip.findFirst({
    where: { id, deletedAt: null, ...rowInstanceFilter(instanceId) },
    select: { streamPath: true, screenshotPath: true, stashInstanceId: true },
  });

  if (!clip) {
    res.status(404).json({ error: "Clip preview not found" });
    return;
  }

  if (
    !(await canUserAccessEntity(req.user.id, "clip", id, clip.stashInstanceId))
  ) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Use streamPath (video) if available, otherwise screenshotPath (image)
  const mediaPath = clip.streamPath || clip.screenshotPath;

  if (!mediaPath) {
    res.status(404).json({ error: "Clip preview not found" });
    return;
  }

  const creds = credentialsOrRespond(clip.stashInstanceId, res);
  if (!creds) return;
  const { apiKey } = creds;

  // Nothing to send to a browser that has moved on; skip the queue entirely
  if (isClientGone(res)) return;

  await acquireConcurrencySlot();

  try {
    const fullUrl = `${mediaPath}${mediaPath.includes("?") ? "&" : "?"}apikey=${apiKey}`;

    logger.debug("Proxying clip preview", { clipId: id });

    proxyHttpRequest({
      fullUrl,
      res,
      label: "[PROXY clip preview]",
      defaultCacheControl: "private, max-age=86400",
      timeoutMs: 30000,
    });
  } catch (error) {
    releaseConcurrencySlot();
    logger.error("Error proxying clip preview", { error });
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};

/**
 * Proxy image requests by image ID and type
 * GET /api/proxy/image/:imageId/:type?instanceId=
 * :type = "thumbnail" | "preview" | "image"
 * Requires a Peek session; the image must be visible to the user.
 * Uses the image's stashInstanceId to route to correct Stash server.
 */
export const proxyImage = async (
  req: TypedAuthRequest<
    never,
    { imageId: string; type: string },
    { instanceId?: string }
  >,
  res: TypedResponse<ApiErrorResponse>
) => {
  const { imageId, type } = req.params;
  const { instanceId } = req.query;

  if (!imageId) {
    res.status(400).json({ error: "Missing image ID" });
    return;
  }
  if (!SCENE_ID_PATTERN.test(imageId)) {
    res.status(400).json({ error: "Invalid image ID" });
    return;
  }

  const validTypes = ["thumbnail", "preview", "image"];
  if (!type || !validTypes.includes(type)) {
    res.status(400).json({
      error: "Invalid image type. Must be: thumbnail, preview, or image",
    });
    return;
  }

  // Get image from database - include stashInstanceId for routing
  const image = await prisma.stashImage.findFirst({
    where: { id: imageId, deletedAt: null, ...rowInstanceFilter(instanceId) },
    select: {
      pathThumbnail: true,
      pathPreview: true,
      pathImage: true,
      stashInstanceId: true,
    },
  });

  if (!image) {
    res.status(404).json({ error: "Image not found" });
    return;
  }

  if (
    !(await canUserAccessEntity(
      req.user.id,
      "image",
      imageId,
      image.stashInstanceId
    ))
  ) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  // Get the appropriate path
  const pathMap: Record<string, string | null> = {
    thumbnail: image.pathThumbnail,
    preview: image.pathPreview,
    image: image.pathImage,
  };
  const stashPath = pathMap[type];

  if (!stashPath) {
    res.status(404).json({ error: `Image ${type} path not available` });
    return;
  }

  const creds = credentialsOrRespond(image.stashInstanceId, res);
  if (!creds) return;
  const { baseUrl: stashUrl, apiKey } = creds;

  // Nothing to send to a browser that has moved on; skip the queue entirely
  if (isClientGone(res)) return;

  await acquireConcurrencySlot();

  try {
    // Note: stashPath may already be a full URL (stored from Stash API response)
    // or it could be a relative path - handle both cases
    let fullUrl: string;
    if (stashPath.startsWith("http://") || stashPath.startsWith("https://")) {
      fullUrl = `${stashPath}${stashPath.includes("?") ? "&" : "?"}apikey=${apiKey}`;
    } else {
      fullUrl = `${stashUrl}${stashPath}${stashPath.includes("?") ? "&" : "?"}apikey=${apiKey}`;
    }

    logger.debug("Proxying image request", { imageId, type });

    proxyHttpRequest({
      fullUrl,
      res,
      label: "[PROXY image]",
      defaultCacheControl: "private, max-age=86400",
      timeoutMs: 30000,
    });
  } catch (error) {
    releaseConcurrencySlot();
    logger.error("Error proxying image", { error });
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};
