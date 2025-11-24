import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { transcodingManager } from "../services/TranscodingManager.js";
import getStash from "../stash.js";
import { logger } from "../utils/logger.js";
import { translateStashPath } from "../utils/pathMapping.js";

// ============================================================================
// STATELESS HLS STREAMING (Stash-style)
// ============================================================================

/**
 * Serve HLS manifest or direct video for a scene (stateless, like Stash)
 * GET /api/scene/:sceneId/stream - Direct video file
 * GET /api/scene/:sceneId/stream.m3u8?quality=480p - HLS manifest
 */
export const streamHLS = async (req: Request, res: Response) => {
  try {
    const { sceneId } = req.params;
    const quality = (req.query.quality as string) || "480p";

    // Check if this is a direct play request (URL doesn't end in .m3u8)
    const isDirect = !req.path.endsWith('.m3u8');

    logger.info(`[HLS] Request: scene=${sceneId}, quality=${quality}, isDirect=${isDirect}, path=${req.path}`);

    // Fetch scene from Stash
    const stash = getStash();
    const result = await stash.findScenes({ ids: [sceneId] });
    const scene = result.findScenes?.scenes?.[0];

    if (!scene) {
      logger.warn(`[HLS] Scene ${sceneId} not found`);
      return res.status(404).send("Scene not found");
    }

    const firstFile = scene.files?.[0];
    if (!firstFile) {
      logger.warn(`[HLS] No video file for scene ${sceneId}`);
      return res.status(404).send("No video file found");
    }

    // Direct play - serve the file directly (no transcoding)
    if (isDirect) {
      const filePath = translateStashPath(firstFile.path);
      logger.info(`[HLS] Serving direct video file: ${filePath}`);

      if (fs.existsSync(filePath)) {
        // Set appropriate headers for video streaming
        const stat = fs.statSync(filePath);
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Content-Type', `video/${firstFile.format || 'mp4'}`);
        res.setHeader('Content-Length', stat.size.toString());
        return res.sendFile(filePath);
      } else {
        logger.error(`[HLS] Video file not found: ${filePath}`);
        return res.status(404).send("Video file not found");
      }
    }

    // Transcoded playback - get or create stream
    logger.info(`[HLS] Creating/getting transcoded stream for scene ${sceneId}, quality ${quality}`);
    const streamKey = `${sceneId}_${quality}`;
    const session = await transcodingManager.getOrCreateStreamByKey(
      streamKey,
      sceneId,
      quality,
      scene as any
    );

    if (!session) {
      logger.error(`[HLS] Failed to create transcoding session for scene ${sceneId}`);
      return res.status(500).send("Failed to create transcoding session");
    }

    logger.info(`[HLS] Session created/retrieved: ${session.sessionId}, outputDir: ${session.outputDir}`);

    // Serve the quality-specific playlist (not master playlist - like Stash does)
    const qualityPlaylistPath = path.join(session.outputDir, quality, "stream.m3u8");
    logger.info(`[HLS] Waiting for playlist at: ${qualityPlaylistPath}`);

    // Wait for playlist to be generated (with timeout)
    const timeout = 10000; // 10 seconds
    const start = Date.now();
    while (!fs.existsSync(qualityPlaylistPath)) {
      if (Date.now() - start > timeout) {
        logger.error(`[HLS] Playlist generation timeout for ${qualityPlaylistPath}`);
        return res.status(504).send("Playlist generation timeout");
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    logger.info(`[HLS] Serving playlist: ${qualityPlaylistPath}`);
    res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(qualityPlaylistPath);
  } catch (error) {
    logger.error("[HLS] Error serving manifest", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).send("Internal server error");
  }
};

/**
 * Serve HLS segment for a scene (stateless, like Stash)
 * GET /api/scene/:sceneId/stream/:segment.ts?quality=480p
 */
export const streamHLSSegment = async (req: Request, res: Response) => {
  try {
    const { sceneId, segment } = req.params;
    const quality = (req.query.quality as string) || "480p";

    logger.info(`[SEGMENT] Request: scene=${sceneId}, segment=${segment}, quality=${quality}`);

    // Get existing stream
    const streamKey = `${sceneId}_${quality}`;
    const session = transcodingManager.getStreamByKey(streamKey);

    if (!session) {
      logger.warn(`[SEGMENT] No session found for ${streamKey}`);
      return res.status(404).send("Stream not found - request manifest first");
    }

    // Route captures "segment_000" from URL "/scene/29591/segment_000.ts"
    // FFmpeg creates files as "segment_000.ts", so we need to append the extension
    const segmentFilename = `${segment}.ts`;
    const segmentPath = path.join(
      session.outputDir,
      quality,
      segmentFilename
    );

    logger.info(`[SEGMENT] Looking for file: ${segmentPath}`);

    // Wait for segment to be ready
    const timeout = 15000; // 15 seconds
    const start = Date.now();
    while (!fs.existsSync(segmentPath)) {
      if (Date.now() - start > timeout) {
        logger.warn(`[SEGMENT] Timeout waiting for: ${segmentPath}`);
        return res.status(504).send("Segment timeout");
      }
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    logger.info(`[SEGMENT] Serving file: ${segmentPath}`);

    // Update last access time
    transcodingManager.updateStreamAccess(streamKey);

    res.setHeader("Content-Type", "video/MP2T");
    res.setHeader("Cache-Control", "public, max-age=31536000");
    res.sendFile(segmentPath);
  } catch (error) {
    logger.error("[SEGMENT] Error serving segment", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).send("Internal server error");
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

    // Get Stash configuration
    const stashUrl = process.env.STASH_URL?.replace('/graphql', '');
    const apiKey = process.env.STASH_API_KEY;

    if (!stashUrl || !apiKey) {
      logger.error("[CAPTION] Stash configuration missing");
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

// ============================================================================
// STASH STREAM PROXY (New Architecture)
// ============================================================================

/**
 * Proxy all stream requests to Stash
 * This is the new architecture where Peek proxies ALL streams to Stash
 * instead of managing its own transcoding.
 *
 * GET /api/scene/:sceneId/proxy-stream/stream -> Stash /scene/:sceneId/stream (Direct)
 * GET /api/scene/:sceneId/proxy-stream/stream.m3u8?resolution=STANDARD_HD -> Stash HLS 720p
 * GET /api/scene/:sceneId/proxy-stream/stream.mp4?resolution=STANDARD -> Stash MP4 480p
 * GET /api/scene/:sceneId/proxy-stream/hls/:segment.ts?resolution=STANDARD -> Stash HLS segment
 *
 * This replaces the old TranscodingManager system and lets Stash handle
 * all codec detection, transcoding, and quality selection.
 */
export const proxyStashStream = async (req: Request, res: Response) => {
  try {
    const { sceneId, streamPath } = req.params;

    // Parse query string from original request
    const queryString = req.url.split('?')[1] || '';

    // Build Stash URL
    const stashBaseUrl = process.env.STASH_URL?.replace('/graphql', '');
    if (!stashBaseUrl) {
      logger.error("[PROXY] STASH_URL not configured");
      return res.status(500).send("Stash URL not configured");
    }

    const stashUrl = `${stashBaseUrl}/scene/${sceneId}/${streamPath}${queryString ? '?' + queryString : ''}`;

    logger.info(`[PROXY] Proxying stream: ${req.url} -> ${stashUrl}`);

    // Forward request to Stash using fetch
    const response = await fetch(stashUrl, {
      headers: {
        'ApiKey': process.env.STASH_API_KEY || '',
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
