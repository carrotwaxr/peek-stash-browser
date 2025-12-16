import { Request, Response } from "express";
import { stashInstanceManager } from "../services/StashInstanceManager.js";
import { logger } from "../utils/logger.js";

// ============================================================================
// STASH STREAM PROXY
// ============================================================================

/**
 * Rewrite URLs in HLS playlist to use Peek's proxy
 * Stash includes apikey in segment URLs - we need to strip that and route through our proxy
 *
 * HLS playlists can contain various URL formats:
 * - Absolute: http://stash:9999/scene/123/stream/segment_0.ts?apikey=xxx&resolution=FULL_HD
 * - Absolute path: /scene/123/stream/segment_0.ts?apikey=xxx
 * - Relative: stream/segment_0.ts?apikey=xxx
 * - Just segment: segment_0.ts?apikey=xxx
 *
 * All should be rewritten to: /api/scene/{sceneId}/proxy-stream/{path}?{params without apikey}
 */
function rewriteHlsPlaylist(content: string, sceneId: string, _stashBaseUrl: string): string {
  const lines = content.split('\n');

  return lines.map(line => {
    // Skip empty lines and HLS tags (start with #)
    if (!line.trim() || line.startsWith('#')) {
      return line;
    }

    try {
      let urlPath: string;
      let queryParams: URLSearchParams;

      // Check if it's a full URL or a path
      if (line.includes('://')) {
        // Absolute URL: http://stash:9999/scene/123/stream/segment.ts?apikey=xxx
        const url = new URL(line);
        urlPath = url.pathname;
        queryParams = url.searchParams;
      } else if (line.startsWith('/')) {
        // Absolute path: /scene/123/stream/segment.ts?apikey=xxx
        const [path, query] = line.split('?');
        urlPath = path;
        queryParams = new URLSearchParams(query || '');
      } else {
        // Relative path: stream/segment.ts?apikey=xxx or segment.ts?apikey=xxx
        const [path, query] = line.split('?');
        urlPath = path;
        queryParams = new URLSearchParams(query || '');
      }

      // Strip apikey from query params (case-insensitive)
      queryParams.delete('apikey');
      queryParams.delete('ApiKey');
      queryParams.delete('APIKEY');

      // Extract the stream path (everything after /scene/{id}/)
      let streamPath: string;
      const scenePathMatch = urlPath.match(/\/scene\/\d+\/(.+)/);
      if (scenePathMatch) {
        streamPath = scenePathMatch[1];
      } else {
        // If no scene path pattern, use the path as-is
        streamPath = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
      }

      // Build clean query string
      const cleanQuery = queryParams.toString();
      const queryString = cleanQuery ? `?${cleanQuery}` : '';

      // Return proxied URL
      return `/api/scene/${sceneId}/proxy-stream/${streamPath}${queryString}`;
    } catch {
      // If parsing fails, return original line (shouldn't happen for valid playlists)
      logger.warn(`[PROXY] Failed to rewrite HLS line: ${line}`);
      return line;
    }
  }).join('\n');
}

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
 *
 * SECURITY: For HLS playlists (.m3u8), we rewrite internal URLs to strip the Stash API key
 * and route segment requests through Peek's proxy.
 */
export const proxyStashStream = async (req: Request, res: Response) => {
  try {
    const { sceneId, streamPath, subPath } = req.params;
    // Combine path segments if subPath exists (for HLS segments like stream/segment_0.ts)
    const fullStreamPath = subPath ? `${streamPath}/${subPath}` : streamPath;

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

    const stashUrl = `${stashBaseUrl}/scene/${sceneId}/${fullStreamPath}${queryString ? '?' + queryString : ''}`;

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

    // Check if this is an HLS playlist that needs URL rewriting
    const contentType = response.headers.get('content-type') || '';
    const isHlsPlaylist = fullStreamPath.endsWith('.m3u8') ||
                          contentType.includes('mpegurl') ||
                          contentType.includes('x-mpegURL');

    if (isHlsPlaylist) {
      // For HLS playlists, read the entire response and rewrite URLs
      const playlistContent = await response.text();
      const rewrittenContent = rewriteHlsPlaylist(playlistContent, sceneId, stashBaseUrl);

      // Set headers for the rewritten playlist
      res.status(response.status);
      res.setHeader('content-type', 'application/vnd.apple.mpegurl');
      res.setHeader('cache-control', 'no-cache');
      res.send(rewrittenContent);

      logger.debug(`[PROXY] Rewrote HLS playlist: ${fullStreamPath}`);
      return;
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
