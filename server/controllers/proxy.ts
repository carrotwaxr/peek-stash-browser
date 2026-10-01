import type { Response } from "express";
import http, { type IncomingHttpHeaders, type OutgoingHttpHeaders } from "http";
import https from "https";
import { pipeline } from "stream";
import { URL } from "url";
import {
  BadGatewayError,
  GatewayTimeoutError,
  sendAppError,
} from "../middleware/errorHandler.js";
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
import {
  INSTANCE_ID_REQUIRED,
  canUserLoadMedia,
  isValidInstanceId,
} from "../utils/mediaAccess.js";
import {
  SCENE_ID_PATTERN,
  parseStashMediaPath,
} from "../utils/stashMediaPath.js";
import { stashFailure } from "../utils/streamProxy.js";

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
 * Forwarding such a request would fetch a response nobody reads and hold a
 * slot until Stash answers (with the old `pipe`, until the upstream
 * timeout), and a backlog of those starves every later request.
 */
function isClientGone(res: Response): boolean {
  return res.destroyed || res.writableEnded;
}

/** Stash's response headers that Range and revalidation depend on. */
const RANGE_RESPONSE_HEADERS = [
  "accept-ranges",
  "content-range",
  "etag",
  "last-modified",
] as const;

/**
 * The browser's `Range` and `If-Range`, for Stash: a partial request gets a
 * partial answer (iOS Safari plays `<video>` only from a server that answers
 * ranges). A request without them sends none. These media routes serve files
 * and images, never manifests, so a range is never cut across a key.
 */
function rangeHeaders(req: {
  headers: IncomingHttpHeaders;
}): OutgoingHttpHeaders {
  const headers: OutgoingHttpHeaders = {};
  const { range, "if-range": ifRange } = req.headers;
  if (range) headers.Range = range;
  if (ifRange) headers["If-Range"] = ifRange;
  return headers;
}

/**
 * The one answer for media the user may not load: a missing entity, a
 * deleted one, one they cannot see and an instance that is not enabled all
 * read the same, so the answer never tells which.
 */
const NOT_FOUND = "Not found";

/**
 * The address and key of the instance a request names, or null once the
 * response is sent: 404 for an instance that is not enabled (disabled or
 * deleted; invariant 11).
 */
function credentialsOrRespond(
  instanceId: string,
  res: TypedResponse<ApiErrorResponse>
): StashCredentials | null {
  try {
    return stashInstanceManager.getCredentials(instanceId);
  } catch (error) {
    if (!(error instanceof UnknownInstanceError)) throw error;
    res.status(404).json({ error: NOT_FOUND });
    return null;
  }
}

/**
 * True when the request names one well-formed instance; otherwise answers
 * 400 before anything is read.
 */
function instanceIdOrRespond(
  instanceId: unknown,
  res: TypedResponse<ApiErrorResponse>
): instanceId is string {
  if (isValidInstanceId(instanceId)) return true;
  res.status(400).json({ error: INSTANCE_ID_REQUIRED });
  return false;
}

// =============================================================================
// Shared proxy helper
// =============================================================================

/**
 * Shared helper that makes an HTTP(S) request to Stash and pipes the response
 * to the Express client. Handles:
 * - Connection pooling via keep-alive agents
 * - Range: the browser's `Range` and `If-Range` go to Stash, and Stash's
 *   206, `Content-Range`, `Accept-Ranges`, `ETag` and `Last-Modified` come back
 * - Client disconnect cleanup (destroys upstream request)
 * - Double-release guard for concurrency slots
 * - Timeout handling
 * - Stash failing mid-transfer: once the status and Content-Length are out
 *   the response can only be cut short, so it is destroyed and the browser
 *   sees the request fail at once
 * - Private Cache-Control: media belongs to a signed-in user, so a shared
 *   cache must never store it (privateCacheControl keeps Stash's freshness)
 */
function proxyHttpRequest({
  fullUrl,
  res,
  label,
  defaultCacheControl,
  timeoutMs,
  requestHeaders,
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

  // Stash's response, once it arrives: from then on the pipeline owns `res`
  let upstreamRes: http.IncomingMessage | undefined;
  // Who ended the transfer before it completed, for the log: the browser
  // leaving is routine and Peek's own destroy follows it; Stash failing or
  // going quiet for `timeoutMs` is logged once, where it is seen
  let endedBy: "client" | "timeout" | "stash" | undefined;
  // The response reached the browser whole (`finish`: every byte handed to
  // the socket), as opposed to closing first
  let responseFinished = false;
  res.on("finish", () => {
    responseFinished = true;
  });

  const proxyReq = httpModule.get(
    fullUrl,
    { agent, headers: requestHeaders },
    (proxyRes) => {
      upstreamRes = proxyRes;

      // Stash's own 401, 403 and 5xx are 502 here and its 404 is 404 (206, 304
      // and 416 pass): answer in the central shape, and drain Stash's body so
      // its socket and our slot are free at once
      const failure = stashFailure(proxyRes.statusCode ?? 200);
      if (failure) {
        logger.warn(`${label} Stash answered ${proxyRes.statusCode}`);
        proxyRes.resume();
        releaseOnce();
        sendAppError(res, failure);
        return;
      }

      // Forward response headers
      if (proxyRes.headers["content-type"]) {
        res.setHeader("Content-Type", proxyRes.headers["content-type"]);
      }
      if (proxyRes.headers["content-length"]) {
        res.setHeader("Content-Length", proxyRes.headers["content-length"]);
      }
      // Range support and cache validators: Stash's 206 is only usable with
      // its Content-Range, and a browser revalidates with ETag/Last-Modified
      for (const name of RANGE_RESPONSE_HEADERS) {
        const value = proxyRes.headers[name];
        if (value !== undefined) res.setHeader(name, value);
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

      // `pipeline` ends `res` when Stash fails mid-body (a reset, a close, or
      // our destroy at the timeout) by destroying both sides, so the browser
      // sees the request fail at once; `pipe` left it waiting for the promised
      // Content-Length until nginx gave up. On a clean end Stash's socket goes
      // back to the keep-alive agent.
      pipeline(proxyRes, res, (error) => {
        releaseOnce();
        if (!error) return;
        if (endedBy === "client") {
          logger.debug(`${label} Client disconnected mid-transfer`);
        } else if (endedBy === undefined) {
          // Stash closed the connection mid-body without a socket error
          logger.warn(`${label} Stash failed mid-transfer`, { error });
        }
      });
    }
  );

  // When the client disconnects (seek, refresh, navigate away),
  // destroy the upstream request to stop downloading into memory.
  res.on("close", () => {
    // A response that closes before it finished, while Stash's side is whole
    // or was whole when it ended: the browser left. That includes Stash
    // having sent its last byte while the browser still had bytes to read
    // (Stash's response is destroyed after `end`, but `complete`). A Stash
    // failure has already set `endedBy` (a socket error) or destroyed an
    // incomplete response (a clean close mid-body). `writableFinished`
    // is not the test: it reads true once the socket is gone.
    const stashFailed =
      upstreamRes?.destroyed === true && !upstreamRes.complete;
    if (!responseFinished && !stashFailed) {
      endedBy ??= "client";
    }
    if (!proxyReq.destroyed) {
      proxyReq.destroy();
    }
    releaseOnce();
  });

  // Handle request errors
  proxyReq.on("error", (error: Error) => {
    releaseOnce();
    // The ECONNRESET ("socket hang up") that follows our own destroy
    if (endedBy !== undefined) {
      logger.debug(`${label} Upstream request ended (${endedBy})`);
      return;
    }
    endedBy = "stash";
    // The response has started, with its status and length: it can only be
    // cut short. (The pipeline would end it too, as Stash's response fails.)
    if (upstreamRes !== undefined) {
      logger.warn(`${label} Stash failed mid-transfer`, { error });
      res.destroy();
      return;
    }
    logger.error(`${label} Error`, { error });
    sendAppError(res, new BadGatewayError("Stash could not serve this media"));
  });

  // Stash sent nothing for `timeoutMs`: before its response, answer 504;
  // after, the response can only be cut short
  proxyReq.setTimeout(timeoutMs, () => {
    endedBy ??= "timeout";
    logger.warn(`${label} Stash sent nothing for ${timeoutMs} ms`, {
      responseStarted: upstreamRes !== undefined,
    });
    releaseOnce();
    proxyReq.destroy();
    if (upstreamRes !== undefined) {
      res.destroy();
      return;
    }
    sendAppError(res, new GatewayTimeoutError("Stash did not answer"));
  });
}

// =============================================================================
// Proxy endpoints
// =============================================================================

/**
 * Proxy scene video preview (MP4)
 * GET /api/proxy/scene/:id/preview?instanceId=
 * Requires a Peek session; the scene must be visible to the user.
 * Served from the instance `instanceId` names (400 without one).
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

  if (!instanceIdOrRespond(instanceId, res)) return;

  // The access check finds the row itself (a missing or deleted scene is
  // refused), so a missing scene and a refused one get the same answer
  // after the same reads
  if (!(await canUserAccessEntity(req.user.id, "scene", id, instanceId))) {
    res.status(404).json({ error: NOT_FOUND });
    return;
  }

  const creds = credentialsOrRespond(instanceId, res);
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
      requestHeaders: rangeHeaders(req),
    });
  } catch (error) {
    // The central error handler answers; the slot is not left held
    releaseConcurrencySlot();
    throw error;
  }
};

/**
 * Proxy scene WebP animated preview
 * GET /api/proxy/scene/:id/webp?instanceId=
 * Requires a Peek session; the scene must be visible to the user.
 * Served from the instance `instanceId` names (400 without one).
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

  if (!instanceIdOrRespond(instanceId, res)) return;

  // The access check finds the row itself (a missing or deleted scene is
  // refused), so a missing scene and a refused one get the same answer
  // after the same reads
  if (!(await canUserAccessEntity(req.user.id, "scene", id, instanceId))) {
    res.status(404).json({ error: NOT_FOUND });
    return;
  }

  const creds = credentialsOrRespond(instanceId, res);
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
      requestHeaders: rangeHeaders(req),
    });
  } catch (error) {
    // The central error handler answers; the slot is not left held
    releaseConcurrencySlot();
    throw error;
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
 * apart from their own hides (a scene_marker path names its scene and its
 * clip): the paths stored on entities are the thumbnails Hidden Items shows
 * for what the user hid. Rejecting `#` and `%`
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

  if (!instanceIdOrRespond(instanceId, res)) return;

  // An entity the user hid themselves keeps its thumbnail on Hidden Items
  if (
    !(await canUserLoadMedia(
      req.user.id,
      target.entities,
      instanceId,
      "apartFromOwnHides"
    ))
  ) {
    res.status(404).json({ error: NOT_FOUND });
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
      requestHeaders: rangeHeaders(req),
    });
  } catch (error) {
    // The central error handler answers; the slot is not left held
    releaseConcurrencySlot();
    throw error;
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
 * Served from the instance `instanceId` names (400 without one).
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

  if (!instanceIdOrRespond(instanceId, res)) return;

  // Access first: it finds the row itself, so a missing clip and a refused
  // one get the same answer after the same reads
  if (!(await canUserAccessEntity(req.user.id, "clip", id, instanceId))) {
    res.status(404).json({ error: NOT_FOUND });
    return;
  }

  // The clip on the instance the request names
  const clip = await prisma.stashClip.findUnique({
    where: { id_stashInstanceId: { id, stashInstanceId: instanceId } },
    select: { streamPath: true, screenshotPath: true, deletedAt: true },
  });

  // Deleted since the access check
  if (!clip || clip.deletedAt) {
    res.status(404).json({ error: NOT_FOUND });
    return;
  }

  // Use streamPath (video) if available, otherwise screenshotPath (image)
  const mediaPath = clip.streamPath || clip.screenshotPath;

  if (!mediaPath) {
    res.status(404).json({ error: "Clip preview not found" });
    return;
  }

  const creds = credentialsOrRespond(instanceId, res);
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
      requestHeaders: rangeHeaders(req),
    });
  } catch (error) {
    // The central error handler answers; the slot is not left held
    releaseConcurrencySlot();
    throw error;
  }
};

/**
 * Proxy image requests by image ID and type
 * GET /api/proxy/image/:imageId/:type?instanceId=
 * :type = "thumbnail" | "preview" | "image"
 * Requires a Peek session; the image must be visible to the user.
 * Served from the instance `instanceId` names (400 without one).
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

  if (!instanceIdOrRespond(instanceId, res)) return;

  // Access first: it finds the row itself, so a missing image and a refused
  // one get the same answer after the same reads
  if (!(await canUserAccessEntity(req.user.id, "image", imageId, instanceId))) {
    res.status(404).json({ error: NOT_FOUND });
    return;
  }

  // The image on the instance the request names
  const image = await prisma.stashImage.findUnique({
    where: { id_stashInstanceId: { id: imageId, stashInstanceId: instanceId } },
    select: {
      pathThumbnail: true,
      pathPreview: true,
      pathImage: true,
      deletedAt: true,
    },
  });

  // Deleted since the access check
  if (!image || image.deletedAt) {
    res.status(404).json({ error: NOT_FOUND });
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

  const creds = credentialsOrRespond(instanceId, res);
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
      requestHeaders: rangeHeaders(req),
    });
  } catch (error) {
    // The central error handler answers; the slot is not left held
    releaseConcurrencySlot();
    throw error;
  }
};
