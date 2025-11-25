import { Request, Response } from "express";
import { stashInstanceManager } from "../services/StashInstanceManager.js";
import { logger } from "../utils/logger.js";

// ============================================================================
// STASH STREAM PROXY
// ============================================================================

/**
 * Proxy all stream requests to Stash
 * Peek proxies ALL streams to Stash instead of managing its own transcoding.
 *
 * GET /api/scene/:sceneId/proxy-stream/stream -> Stash /scene/:sceneId/stream (Direct)
 * GET /api/scene/:sceneId/proxy-stream/stream.m3u8?resolution=STANDARD_HD -> Stash HLS 720p
 * GET /api/scene/:sceneId/proxy-stream/stream.mp4?resolution=STANDARD -> Stash MP4 480p
 * GET /api/scene/:sceneId/proxy-stream/hls/:segment.ts?resolution=STANDARD -> Stash HLS segment
 *
 * This lets Stash handle all codec detection, transcoding, and quality selection.
 */
export const proxyStashStream = async (req: Request, res: Response) => {
  try {
    const { sceneId, streamPath } = req.params;

    // Parse query string from original request
    const queryString = req.url.split('?')[1] || '';

    // Get Stash instance configuration
    let stashBaseUrl: string;
    let apiKey: string;

    try {
      stashBaseUrl = stashInstanceManager.getBaseUrl();
      apiKey = stashInstanceManager.getApiKey();
    } catch {
      logger.error("[PROXY] No Stash instance configured");
      return res.status(500).send("Stash not configured");
    }

    const stashUrl = `${stashBaseUrl}/scene/${sceneId}/${streamPath}${queryString ? '?' + queryString : ''}`;

    logger.info(`[PROXY] Proxying stream: ${req.url} -> ${stashUrl}`);

    // Forward request to Stash using fetch
    const response = await fetch(stashUrl, {
      headers: {
        'ApiKey': apiKey,
        'Range': req.headers.range || '', // Forward range requests for seeking
      },
    });

    if (!response.ok) {
      logger.warn(`[PROXY] Stash returned ${response.status} for ${stashUrl}`);
      return res.status(response.status).send(`Stash stream error: ${response.statusText}`);
    }

    // Forward status code
    res.status(response.status);

    // Forward relevant headers from Stash
    const headersToForward = [
      'content-type',
      'content-length',
      'accept-ranges',
      'content-range',
      'cache-control',
      'last-modified',
      'etag',
    ];

    headersToForward.forEach(header => {
      const value = response.headers.get(header);
      if (value) {
        res.setHeader(header, value);
      }
    });

    // Stream response body to client
    if (response.body) {
      const reader = response.body.getReader();
      const pump = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!res.write(value)) {
              // Backpressure - wait for drain
              await new Promise(resolve => res.once('drain', resolve));
            }
          }
          res.end();
        } catch (error) {
          logger.error("[PROXY] Error streaming response", { error });
          if (!res.headersSent) {
            res.status(500).send("Stream proxy error");
          }
        }
      };
      await pump();
    } else {
      res.end();
    }

    logger.debug(`[PROXY] Stream proxied successfully: ${streamPath}`);
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
 * GET /api/scene/:sceneId/caption?lang=en&type=srt
 *
 * Stash stores captions as separate .vtt or .srt files alongside video files
 * This endpoint proxies those files and converts SRT to VTT if needed
 */
export const getCaption = async (req: Request, res: Response) => {
  try {
    const { sceneId } = req.params;
    const { lang, type } = req.query;

    if (!lang || !type) {
      return res.status(400).send("Missing lang or type parameter");
    }

    logger.info(`[CAPTION] Request: scene=${sceneId}, lang=${lang}, type=${type}`);

    // Get Stash instance configuration
    let stashUrl: string;
    let apiKey: string;

    try {
      stashUrl = stashInstanceManager.getBaseUrl();
      apiKey = stashInstanceManager.getApiKey();
    } catch {
      logger.error("[CAPTION] No Stash instance configured");
      return res.status(500).send("Stash configuration missing");
    }

    // Construct Stash caption URL
    const captionUrl = `${stashUrl}/scene/${sceneId}/caption?lang=${lang}&type=${type}`;
    logger.debug(`[CAPTION] Fetching from Stash: ${captionUrl}`);

    // Fetch caption from Stash with API key
    const response = await fetch(captionUrl, {
      headers: {
        'ApiKey': apiKey,
      },
    });

    if (!response.ok) {
      logger.warn(`[CAPTION] Stash returned ${response.status} for scene ${sceneId}`);
      return res.status(response.status).send("Caption not found");
    }

    const captionData = await response.text();

    // Stash automatically converts SRT to VTT if needed, so we can just serve it
    res.setHeader("Content-Type", "text/vtt; charset=utf-8");
    res.setHeader("Cache-Control", "public, max-age=31536000"); // Cache for 1 year
    res.send(captionData);

    logger.info(`[CAPTION] Served caption: scene=${sceneId}, lang=${lang}, size=${captionData.length} bytes`);
  } catch (error) {
    logger.error("[CAPTION] Error serving caption", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).send("Internal server error");
  }
};
