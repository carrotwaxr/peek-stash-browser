import { Request, Response } from "express";
import http from "http";
import https from "https";
import { URL } from "url";
import prisma from "../prisma/singleton.js";
import { stashInstanceManager } from "../services/StashInstanceManager.js";
import { logger } from "../utils/logger.js";

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
 * Get credentials for a specific Stash instance
 * @param instanceId - Optional instance ID. If not provided, uses default instance.
 * @returns Object with baseUrl and apiKey
 */
function getInstanceCredentials(instanceId?: string): { baseUrl: string; apiKey: string } {
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

/**
 * Proxy scene video preview (MP4)
 * GET /api/proxy/scene/:id/preview
 * Uses the scene's stashInstanceId to route to correct Stash server.
 */
export const proxyScenePreview = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "Missing scene ID" });
  }

  // Get scene from database to find its stashInstanceId
  const scene = await prisma.stashScene.findFirst({
    where: { id, deletedAt: null },
    select: { stashInstanceId: true },
  });

  if (!scene) {
    return res.status(404).json({ error: "Scene not found" });
  }

  let stashUrl: string;
  let apiKey: string;

  try {
    const creds = getInstanceCredentials(scene.stashInstanceId ?? undefined);
    stashUrl = creds.baseUrl;
    apiKey = creds.apiKey;
  } catch (error) {
    logger.error("Failed to get Stash instance credentials", { error, instanceId: scene.stashInstanceId });
    return res.status(500).json({ error: "Stash configuration missing" });
  }

  // Acquire concurrency slot before making request
  await acquireConcurrencySlot();

  try {
    // Construct Stash scene preview URL
    const fullUrl = `${stashUrl}/scene/${id}/preview?apikey=${apiKey}`;

    logger.debug("Proxying scene preview", {
      sceneId: id,
      url: fullUrl.replace(apiKey, "***"),
    });

    // Parse URL to determine protocol
    const urlObj = new URL(fullUrl);
    const httpModule = urlObj.protocol === "https:" ? https : http;
    const agent = getAgentForUrl(urlObj);

    // Make request to Stash with connection pooling
    const proxyReq = httpModule.get(fullUrl, { agent }, (proxyRes) => {
      // Forward response headers
      if (proxyRes.headers["content-type"]) {
        res.setHeader("Content-Type", proxyRes.headers["content-type"]);
      }
      if (proxyRes.headers["content-length"]) {
        res.setHeader("Content-Length", proxyRes.headers["content-length"]);
      }
      if (proxyRes.headers["cache-control"]) {
        res.setHeader("Cache-Control", proxyRes.headers["cache-control"]);
      } else {
        // Cache video previews for 24 hours
        res.setHeader("Cache-Control", "public, max-age=86400");
      }

      // Set status code
      res.status(proxyRes.statusCode || 200);

      // Stream response back to client
      proxyRes.pipe(res);

      // Release slot when response ends
      proxyRes.on("end", releaseConcurrencySlot);
      proxyRes.on("error", releaseConcurrencySlot);
    });

    // Handle request errors
    proxyReq.on("error", (error: Error) => {
      releaseConcurrencySlot();
      logger.error("Error proxying scene preview", {
        sceneId: id,
        error: error.message,
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Proxy request failed" });
      }
    });

    // Set timeout (longer for videos)
    proxyReq.setTimeout(60000, () => {
      releaseConcurrencySlot();
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: "Proxy request timeout" });
      }
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
 * GET /api/proxy/scene/:id/webp
 * Uses the scene's stashInstanceId to route to correct Stash server.
 */
export const proxySceneWebp = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "Missing scene ID" });
  }

  // Get scene from database to find its stashInstanceId
  const scene = await prisma.stashScene.findFirst({
    where: { id, deletedAt: null },
    select: { stashInstanceId: true },
  });

  if (!scene) {
    return res.status(404).json({ error: "Scene not found" });
  }

  let stashUrl: string;
  let apiKey: string;

  try {
    const creds = getInstanceCredentials(scene.stashInstanceId ?? undefined);
    stashUrl = creds.baseUrl;
    apiKey = creds.apiKey;
  } catch (error) {
    logger.error("Failed to get Stash instance credentials", { error, instanceId: scene.stashInstanceId });
    return res.status(500).json({ error: "Stash configuration missing" });
  }

  // Acquire concurrency slot before making request
  await acquireConcurrencySlot();

  try {
    // Construct Stash scene webp URL
    const fullUrl = `${stashUrl}/scene/${id}/webp?apikey=${apiKey}`;

    logger.debug("Proxying scene webp", {
      sceneId: id,
      url: fullUrl.replace(apiKey, "***"),
    });

    // Parse URL to determine protocol
    const urlObj = new URL(fullUrl);
    const httpModule = urlObj.protocol === "https:" ? https : http;
    const agent = getAgentForUrl(urlObj);

    // Make request to Stash with connection pooling
    const proxyReq = httpModule.get(fullUrl, { agent }, (proxyRes) => {
      // Forward response headers
      if (proxyRes.headers["content-type"]) {
        res.setHeader("Content-Type", proxyRes.headers["content-type"]);
      }
      if (proxyRes.headers["content-length"]) {
        res.setHeader("Content-Length", proxyRes.headers["content-length"]);
      }
      if (proxyRes.headers["cache-control"]) {
        res.setHeader("Cache-Control", proxyRes.headers["cache-control"]);
      } else {
        // Cache webp previews for 24 hours
        res.setHeader("Cache-Control", "public, max-age=86400");
      }

      // Set status code
      res.status(proxyRes.statusCode || 200);

      // Stream response back to client
      proxyRes.pipe(res);

      // Release slot when response ends
      proxyRes.on("end", releaseConcurrencySlot);
      proxyRes.on("error", releaseConcurrencySlot);
    });

    // Handle request errors
    proxyReq.on("error", (error: Error) => {
      releaseConcurrencySlot();
      logger.error("Error proxying scene webp", {
        sceneId: id,
        error: error.message,
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Proxy request failed" });
      }
    });

    // Set timeout
    proxyReq.setTimeout(60000, () => {
      releaseConcurrencySlot();
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: "Proxy request timeout" });
      }
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
 */
export const proxyStashMedia = async (req: Request, res: Response) => {
  const { path, instanceId } = req.query;

  if (!path || typeof path !== "string") {
    return res
      .status(400)
      .json({ error: "Missing or invalid path parameter" });
  }

  let stashUrl: string;
  let apiKey: string;

  try {
    const creds = getInstanceCredentials(instanceId as string | undefined);
    stashUrl = creds.baseUrl;
    apiKey = creds.apiKey;
  } catch (error) {
    logger.error("Failed to get Stash instance credentials", { error, instanceId });
    return res.status(500).json({ error: "Stash configuration missing" });
  }

  // Acquire concurrency slot before making request
  await acquireConcurrencySlot();

  try {
    // Construct full Stash URL with API key
    const fullUrl = `${stashUrl}${path}${path.includes("?") ? "&" : "?"}apikey=${apiKey}`;

    logger.debug("Proxying Stash media request", {
      path,
      stashUrl: fullUrl.replace(apiKey, "***"),
    });

    // Parse URL to determine protocol
    const urlObj = new URL(fullUrl);
    const httpModule = urlObj.protocol === "https:" ? https : http;
    const agent = getAgentForUrl(urlObj);

    // Make request to Stash with connection pooling
    const proxyReq = httpModule.get(fullUrl, { agent }, (proxyRes) => {
      // Forward response headers
      if (proxyRes.headers["content-type"]) {
        res.setHeader("Content-Type", proxyRes.headers["content-type"]);
      }
      if (proxyRes.headers["content-length"]) {
        res.setHeader("Content-Length", proxyRes.headers["content-length"]);
      }
      if (proxyRes.headers["cache-control"]) {
        res.setHeader("Cache-Control", proxyRes.headers["cache-control"]);
      } else {
        // Default cache policy for images
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      }

      // Set status code
      res.status(proxyRes.statusCode || 200);

      // Stream response back to client
      proxyRes.pipe(res);

      // Release slot when response ends
      proxyRes.on("end", releaseConcurrencySlot);
      proxyRes.on("error", releaseConcurrencySlot);
    });

    // Handle request errors
    proxyReq.on("error", (error: Error) => {
      releaseConcurrencySlot();
      logger.error("Error proxying Stash media", { error: error.message });
      if (!res.headersSent) {
        res.status(500).json({ error: "Proxy request failed" });
      }
    });

    // Set timeout
    proxyReq.setTimeout(30000, () => {
      releaseConcurrencySlot();
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: "Proxy request timeout" });
      }
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
 * GET /api/proxy/clip/:id/preview
 *
 * Returns the marker stream video for hover previews.
 * Falls back to screenshot if stream is unavailable.
 * Uses the clip's stashInstanceId to route to correct Stash server.
 */
export const proxyClipPreview = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "Missing clip ID" });
  }

  // Get clip from database - include stashInstanceId for routing
  const clip = await prisma.stashClip.findFirst({
    where: { id },
    select: { streamPath: true, screenshotPath: true, stashInstanceId: true },
  });

  // Use streamPath (video) if available, otherwise screenshotPath (image)
  const mediaPath = clip?.streamPath || clip?.screenshotPath;

  if (!mediaPath) {
    return res.status(404).json({ error: "Clip preview not found" });
  }

  let apiKey: string;

  try {
    const creds = getInstanceCredentials(clip.stashInstanceId ?? undefined);
    apiKey = creds.apiKey;
  } catch (error) {
    logger.error("Failed to get Stash instance credentials", { error, instanceId: clip.stashInstanceId });
    return res.status(500).json({ error: "Stash configuration missing" });
  }

  // Acquire concurrency slot before making request
  await acquireConcurrencySlot();

  try {
    // mediaPath is already a full URL from Stash, just append API key
    const fullUrl = `${mediaPath}${mediaPath.includes("?") ? "&" : "?"}apikey=${apiKey}`;

    logger.debug("Proxying clip preview", {
      clipId: id,
      url: fullUrl.replace(apiKey, "***"),
    });

    // Parse URL to determine protocol
    const urlObj = new URL(fullUrl);
    const httpModule = urlObj.protocol === "https:" ? https : http;
    const agent = getAgentForUrl(urlObj);

    // Make request to Stash with connection pooling
    const proxyReq = httpModule.get(fullUrl, { agent }, (proxyRes) => {
      // Forward response headers
      if (proxyRes.headers["content-type"]) {
        res.setHeader("Content-Type", proxyRes.headers["content-type"]);
      }
      if (proxyRes.headers["content-length"]) {
        res.setHeader("Content-Length", proxyRes.headers["content-length"]);
      }
      // Cache clip previews for 24 hours
      res.setHeader("Cache-Control", "public, max-age=86400");

      // Set status code
      res.status(proxyRes.statusCode || 200);

      // Stream response back to client
      proxyRes.pipe(res);

      // Release slot when response ends
      proxyRes.on("end", releaseConcurrencySlot);
      proxyRes.on("error", releaseConcurrencySlot);
    });

    // Handle request errors
    proxyReq.on("error", (error: Error) => {
      releaseConcurrencySlot();
      logger.error("Error proxying clip preview", {
        clipId: id,
        error: error.message,
      });
      if (!res.headersSent) {
        res.status(500).json({ error: "Proxy request failed" });
      }
    });

    // Set timeout
    proxyReq.setTimeout(30000, () => {
      releaseConcurrencySlot();
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: "Proxy request timeout" });
      }
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
 * GET /api/proxy/image/:imageId/:type
 * :type = "thumbnail" | "preview" | "image"
 * Uses the image's stashInstanceId to route to correct Stash server.
 */
export const proxyImage = async (req: Request, res: Response) => {
  const { imageId, type } = req.params;

  if (!imageId) {
    return res.status(400).json({ error: "Missing image ID" });
  }

  const validTypes = ["thumbnail", "preview", "image"];
  if (!type || !validTypes.includes(type)) {
    return res.status(400).json({ error: "Invalid image type. Must be: thumbnail, preview, or image" });
  }

  // Get image from database - include stashInstanceId for routing
  const image = await prisma.stashImage.findFirst({
    where: { id: imageId, deletedAt: null },
    select: {
      pathThumbnail: true,
      pathPreview: true,
      pathImage: true,
      stashInstanceId: true,
    },
  });

  if (!image) {
    return res.status(404).json({ error: "Image not found" });
  }

  // Get the appropriate path
  const pathMap: Record<string, string | null> = {
    thumbnail: image.pathThumbnail,
    preview: image.pathPreview,
    image: image.pathImage,
  };
  const stashPath = pathMap[type];

  if (!stashPath) {
    return res.status(404).json({ error: `Image ${type} path not available` });
  }

  let stashUrl: string;
  let apiKey: string;

  try {
    const creds = getInstanceCredentials(image.stashInstanceId ?? undefined);
    stashUrl = creds.baseUrl;
    apiKey = creds.apiKey;
  } catch (error) {
    logger.error("Failed to get Stash instance credentials", { error, instanceId: image.stashInstanceId });
    return res.status(500).json({ error: "Stash configuration missing" });
  }

  // Acquire concurrency slot before making request
  await acquireConcurrencySlot();

  try {
    // Construct full Stash URL with API key
    // Note: stashPath may already be a full URL (stored from Stash API response)
    // or it could be a relative path - handle both cases
    let fullUrl: string;
    if (stashPath.startsWith("http://") || stashPath.startsWith("https://")) {
      // Already a full URL, just append API key
      fullUrl = `${stashPath}${stashPath.includes("?") ? "&" : "?"}apikey=${apiKey}`;
    } else {
      // Relative path, prepend base URL
      fullUrl = `${stashUrl}${stashPath}${stashPath.includes("?") ? "&" : "?"}apikey=${apiKey}`;
    }

    logger.debug("Proxying image request", {
      imageId,
      type,
      url: fullUrl.replace(apiKey, "***"),
    });

    const urlObj = new URL(fullUrl);
    const httpModule = urlObj.protocol === "https:" ? https : http;
    const agent = getAgentForUrl(urlObj);

    const proxyReq = httpModule.get(fullUrl, { agent }, (proxyRes) => {
      if (proxyRes.headers["content-type"]) {
        res.setHeader("Content-Type", proxyRes.headers["content-type"]);
      }
      if (proxyRes.headers["content-length"]) {
        res.setHeader("Content-Length", proxyRes.headers["content-length"]);
      }
      // Cache images for 24 hours
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.status(proxyRes.statusCode || 200);
      proxyRes.pipe(res);
      proxyRes.on("end", releaseConcurrencySlot);
      proxyRes.on("error", releaseConcurrencySlot);
    });

    proxyReq.on("error", (error: Error) => {
      releaseConcurrencySlot();
      logger.error("Error proxying image", { imageId, type, error: error.message });
      if (!res.headersSent) {
        res.status(500).json({ error: "Proxy request failed" });
      }
    });

    proxyReq.setTimeout(30000, () => {
      releaseConcurrencySlot();
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: "Proxy request timeout" });
      }
    });
  } catch (error) {
    releaseConcurrencySlot();
    logger.error("Error proxying image", { error });
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
};
