import { Request, Response } from "express";
import http from "http";
import https from "https";
import { URL } from "url";
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

const MAX_CONCURRENT_REQUESTS = 4;
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
 * Proxy scene video preview (MP4)
 * GET /api/proxy/scene/:id/preview
 */
export const proxyScenePreview = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "Missing scene ID" });
  }

  let stashUrl: string;
  let apiKey: string;

  try {
    stashUrl = stashInstanceManager.getBaseUrl();
    apiKey = stashInstanceManager.getApiKey();
  } catch {
    logger.error("No Stash instance configured");
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
 */
export const proxySceneWebp = async (req: Request, res: Response) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ error: "Missing scene ID" });
  }

  let stashUrl: string;
  let apiKey: string;

  try {
    stashUrl = stashInstanceManager.getBaseUrl();
    apiKey = stashInstanceManager.getApiKey();
  } catch {
    logger.error("No Stash instance configured");
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
 */
export const proxyStashMedia = async (req: Request, res: Response) => {
  const { path } = req.query;

  if (!path || typeof path !== "string") {
    return res
      .status(400)
      .json({ error: "Missing or invalid path parameter" });
  }

  let stashUrl: string;
  let apiKey: string;

  try {
    stashUrl = stashInstanceManager.getBaseUrl();
    apiKey = stashInstanceManager.getApiKey();
  } catch {
    logger.error("No Stash instance configured");
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
