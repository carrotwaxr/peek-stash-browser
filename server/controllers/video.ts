import { Request, Response } from "express";
import fs from "fs";
import path from "path";
import { Scene } from "stashapp-api";
import { AuthenticatedRequest } from "../middleware/auth.js";
import { transcodingManager } from "../services/TranscodingManager.js";
import getStash from "../stash.js";
import { logger } from "../utils/logger.js";
import { translateStashPath } from "../utils/pathMapping.js";

interface PlayVideoRequest extends AuthenticatedRequest {
  query: {
    sceneId?: string;
    startTime?: string;
    sessionId?: string;
    quality?: string;
  };
  params: {
    videoId: string;
  };
}

interface SeekVideoRequest extends Request {
  body: {
    sessionId: string;
    startTime: number;
  };
}

// Track pending segment requests to avoid duplicate polling
// Map key: "sessionId:segmentFile", value: array of response objects waiting for this segment
const pendingSegmentRequests = new Map<string, Response[]>();

// Segment serving for both new and legacy routes
export const getStreamSegment = (req: Request, res: Response) => {
  const { sessionId, videoId, segment, quality, file } = req.params;

  // Determine the segment path based on route pattern
  let segmentPath: string;

  if (quality && file) {
    // Route pattern: /api/video/playlist/:sessionId/:quality/:file
    segmentPath = `${quality}/${file}`;
  } else if (file && !quality) {
    // Route pattern: /api/video/playlist/:sessionId/:file (master playlist)
    segmentPath = file;
  } else if (segment) {
    // Legacy route pattern: /api/stream/:videoId/:segment
    segmentPath = segment;
  } else {
    return res.status(400).send("No segment specified");
  }

  const segment2 = segmentPath;

  // Only allow .ts segment files and .m3u8 playlists to be served
  if (!segment2.endsWith(".ts") && !segment2.endsWith(".m3u8")) {
    return res.status(403).send("Forbidden");
  }

  // Handle legacy route differently
  if (videoId && !sessionId) {
    // Legacy behavior - serve from old stream_data structure
    const segmentPath = path.join(
      __dirname,
      "stream_data",
      `video_${videoId}`,
      segment2
    );
    if (fs.existsSync(segmentPath)) {
      res.sendFile(segmentPath);
    } else {
      res.status(404).send("Segment not found");
    }
    return;
  }

  // New session-based serving
  const session = transcodingManager.getSession(sessionId);
  if (!session) {
    return res.status(404).send("Session not found");
  }

  // Update session access time
  transcodingManager.updateSessionAccess(sessionId);

  // Handle master playlist request
  if (segment2 === "master.m3u8") {
    // session.masterPlaylistPath is already an absolute path
    if (fs.existsSync(session.masterPlaylistPath)) {
      // Use sendFile for better performance (streaming instead of reading entire file into memory)
      res.setHeader("Content-Type", "application/vnd.apple.mpegurl");
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(session.masterPlaylistPath, (err) => {
        if (err) {
          logger.error("Error sending master playlist", {
            sessionId,
            error: err.message,
          });
          if (!res.headersSent) {
            res.status(500).send("Error sending master playlist");
          }
        }
      });
    } else {
      res.status(404).send("Master playlist not found");
    }
    return;
  }

  // Handle quality-specific playlist or segment
  const parts = segment2.split("/");
  if (parts.length === 2) {
    const [quality, file] = parts;
    const filePath = path.resolve(path.join(session.outputDir, quality, file));

    if (fs.existsSync(filePath)) {
      res.sendFile(filePath);
    } else {
      // For playlists, wait a bit for FFmpeg to generate them
      if (file.endsWith(".m3u8")) {
        let attempts = 0;
        const maxAttempts = 20;
        const interval = 100;
        const trySend = () => {
          if (fs.existsSync(filePath)) {
            res.sendFile(filePath);
          } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(trySend, interval);
          } else {
            res.status(404).send("Playlist not found");
          }
        };
        trySend();
      } else if (file.endsWith(".ts")) {
        // CONTINUOUS TRANSCODING: Wait for segment to be generated
        // Extract segment number and check if it's within reasonable range
        const segmentMatch = file.match(/segment_(\d+)\.ts/);
        const segmentNum = segmentMatch ? parseInt(segmentMatch[1]) : -1;

        if (segmentNum >= 0) {
          // Check if this segment is already transcoded
          const segmentState = session.segmentStates.get(segmentNum);
          const segmentExists = segmentState?.state === "completed";

          if (segmentExists) {
            // Segment should exist, try serving immediately
            logger.verbose("Segment already completed, serving", {
              sessionId,
              segmentNum,
              file,
            });
          } else {
            // Segment not ready yet - check if it's reasonably close to current progress
            // Count completed segments
            let completedCount = 0;
            for (const [, metadata] of session.segmentStates) {
              if (metadata.state === "completed") completedCount++;
            }
            const currentProgress = completedCount;
            const segmentDistance = segmentNum - currentProgress;

            logger.debug("Waiting for segment", {
              sessionId,
              segmentNum,
              currentProgress,
              totalSegments: session.totalSegments,
              distance: segmentDistance,
            });

            // If requesting a segment too far ahead, warn but still wait
            if (segmentDistance > 50) {
              logger.warn("Segment request far ahead of current progress", {
                sessionId,
                segmentNum,
                segmentDistance,
              });
            }
          }
        }

        // Request deduplication: Check if another request is already waiting for this segment
        const requestKey = `${sessionId}:${file}`;
        const existingRequests = pendingSegmentRequests.get(requestKey);

        if (existingRequests) {
          // Another request is already polling for this segment, join that queue
          logger.verbose("Joining existing wait queue for segment", {
            sessionId,
            file,
            queueLength: existingRequests.length,
          });
          existingRequests.push(res);
          return; // This response will be handled when the segment is ready
        }

        // Create new wait queue for this segment
        pendingSegmentRequests.set(requestKey, [res]);

        // Wait for segment with retry logic (single polling loop for all concurrent requests)
        let attempts = 0;
        const maxAttempts = 150; // 15 seconds max wait
        const interval = 100;
        const trySend = () => {
          if (fs.existsSync(filePath)) {
            // Segment is ready! Serve it to all waiting requests
            const waitingRequests =
              pendingSegmentRequests.get(requestKey) || [];
            pendingSegmentRequests.delete(requestKey);

            logger.verbose("Serving segment to waiting requests", {
              sessionId,
              file,
              requestCount: waitingRequests.length,
            });

            for (const waitingRes of waitingRequests) {
              if (!waitingRes.headersSent) {
                waitingRes.sendFile(filePath);
              }
            }
          } else if (attempts < maxAttempts) {
            attempts++;
            setTimeout(trySend, interval);
          } else {
            // Timeout - send 404 to all waiting requests
            const waitingRequests =
              pendingSegmentRequests.get(requestKey) || [];
            pendingSegmentRequests.delete(requestKey);

            logger.error("Timeout waiting for segment", {
              sessionId,
              file,
              timeoutMs: maxAttempts * interval,
              failedRequests: waitingRequests.length,
            });

            for (const waitingRes of waitingRequests) {
              if (!waitingRes.headersSent) {
                waitingRes.status(404).send("Segment not ready yet");
              }
            }
          }
        };
        trySend();
      } else {
        res.status(404).send("Segment not found");
      }
    }
  } else {
    res.status(400).send("Invalid segment path");
  }
};

const getSceneFilePath = (scene: Scene) => {
  const sceneFile = scene.files?.[0].path;
  return translateStashPath(sceneFile);
};

// Simple scene cache to avoid repeated API calls
const sceneCache = new Map<string, { scene: Scene; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Timeout wrapper for Stash API calls
const withTimeout = <T>(promise: Promise<T>, ms: number): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Request timed out after ${ms}ms`));
    }, ms);

    promise
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeout));
  });
};

// Get scene data with caching
const getSceneData = async (sceneId: string): Promise<Scene> => {
  const cached = sceneCache.get(sceneId);
  const now = Date.now();

  if (cached && now - cached.timestamp < CACHE_TTL) {
    return cached.scene;
  }

  const stash = getStash();
  // Type assertion needed: GraphQL response type doesn't exactly match Scene type structure
  const response = (await withTimeout(
    stash.findScenes({ ids: [sceneId] }),
    5000 // 5 second timeout
  )) as unknown as { findScenes: { scenes: Scene[] } };

  const scene = response.findScenes.scenes[0] as Scene;
  if (scene) {
    sceneCache.set(sceneId, { scene, timestamp: now });
  }

  return scene;
};

export const playVideo = async (req: PlayVideoRequest, res: Response) => {
  try {
    const {
      startTime = "0",
      sessionId: _sessionId,
      quality = "direct",
    } = req.query;
    const { videoId } = req.params;

    // Get userId from authenticated user
    const userId = req.user?.id.toString();

    // Use sceneId from query or fallback to videoId from params
    const sceneId = req.query.sceneId || videoId;

    if (!sceneId) {
      return res.status(400).json({ error: "Scene ID is required" });
    }

    const isDirectPlay = quality === "direct";

    logger.info("Playing scene", {
      sceneId,
      mode: isDirectPlay ? "direct" : "transcoded",
      quality: isDirectPlay ? undefined : quality,
      startTime: parseFloat(startTime),
      userId,
    });

    const startTimeFloat = parseFloat(startTime);

    // Get scene data (cached if available)
    const scene = await getSceneData(sceneId);

    if (!scene) {
      return res.status(404).json({ error: "Video not found" });
    }

    const sceneFile = scene.files?.[0];
    const sceneFilePath = getSceneFilePath(scene);

    // Check if file exists with better error handling
    try {
      const stats = fs.statSync(sceneFilePath);
      if (!stats.isFile()) {
        return res
          .status(404)
          .json({ error: "Scene path exists but is not a file" });
      }
    } catch (error) {
      logger.error("File access error for scene", {
        sceneId,
        path: sceneFilePath,
        error: error instanceof Error ? error.message : String(error),
      });
      return res.status(404).json({
        error: "Scene file not found on disk",
        path: sceneFilePath,
      });
    }

    // Handle direct play
    if (isDirectPlay) {
      try {
        // Ensure absolute path for sendFile
        const absolutePath = path.resolve(sceneFilePath);

        // Get file stats for content-length and range support
        const stats = fs.statSync(absolutePath);

        logger.debug("Serving direct play", {
          sceneId,
          path: sceneFilePath,
          size: stats.size,
          format: sceneFile?.format,
          videoCodec: sceneFile?.video_codec,
          audioCodec: sceneFile?.audio_codec,
        });

        // Determine proper MIME type
        let mimeType = "video/mp4";
        if (sceneFile?.format) {
          const format = sceneFile.format.toLowerCase();
          if (format === "webm") mimeType = "video/webm";
          else if (format === "mkv") mimeType = "video/x-matroska";
          else if (format === "avi") mimeType = "video/x-msvideo";
          else if (format === "mov") mimeType = "video/quicktime";
          else mimeType = `video/${format}`;
        }

        // Add codec information to MIME type for better browser compatibility
        // This helps browsers enable the correct decoder
        if (sceneFile?.video_codec && sceneFile?.audio_codec) {
          const videoCodec = sceneFile.video_codec.toLowerCase();
          const audioCodec = sceneFile.audio_codec.toLowerCase();

          // Map codec names to proper MIME codec strings
          const codecMap: { [key: string]: string } = {
            h264: "avc1.42E01E",
            hevc: "hvc1.1.6.L93.B0", // Changed from hev1 to hvc1
            h265: "hvc1.1.6.L93.B0", // Changed from hev1 to hvc1
            aac: "mp4a.40.2",
            mp3: "mp3",
          };

          const videoCodecString = codecMap[videoCodec] || videoCodec;
          const audioCodecString = codecMap[audioCodec] || audioCodec;

          mimeType += `; codecs="${videoCodecString}, ${audioCodecString}"`;
        }

        logger.verbose("Using MIME type for direct play", {
          sceneId,
          mimeType,
        });

        // Handle range requests for seeking
        const range = req.headers.range;
        if (range) {
          logger.verbose("Handling range request for direct play", {
            sceneId,
            range,
          });
          const parts = range.replace(/bytes=/, "").split("-");
          const start = parseInt(parts[0], 10);
          const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
          const chunksize = end - start + 1;

          res.status(206);
          res.setHeader("Content-Type", mimeType);
          res.setHeader("Content-Range", `bytes ${start}-${end}/${stats.size}`);
          res.setHeader("Content-Length", chunksize.toString());
          res.setHeader("Accept-Ranges", "bytes");

          const stream = fs.createReadStream(absolutePath, { start, end });
          stream.pipe(res);
        } else {
          logger.verbose("Sending full file for direct play", { sceneId });
          // Send full file with proper headers
          res.setHeader("Content-Type", mimeType);
          res.setHeader("Accept-Ranges", "bytes");
          res.setHeader("Content-Length", stats.size.toString());

          res.sendFile(absolutePath);
        }
      } catch (error) {
        logger.error("Error serving file for scene", {
          sceneId,
          error: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({ error: "Failed to serve video file" });
      }
      return;
    }

    // Handle transcoded streaming
    try {
      // Get or create transcoding session
      const session = await transcodingManager.getOrCreateSession(
        sceneId,
        startTimeFloat,
        quality,
        userId,
        scene
      );

      // Start transcoding if session is new
      if (session.status === "starting") {
        await transcodingManager.startTranscoding(session, sceneFilePath);
      }

      // Update access time
      transcodingManager.updateSessionAccess(session.sessionId);

      // Return response with session info
      res.json({
        success: true,
        sessionId: session.sessionId,
        playlistUrl: `/api/video/playlist/${session.sessionId}/master.m3u8`,
        status: session.status,
        scene: {
          id: scene.id,
          title: scene.title,
          duration: sceneFile?.duration,
          path: sceneFilePath,
          organized: scene.organized,
          studio: scene.studio,
          files: scene.files.map((file) => ({
            path: file.path,
            size: file.size,
            duration: file.duration,
            video_codec: file.video_codec,
            audio_codec: file.audio_codec,
            width: file.width,
            height: file.height,
            framerate: file.frame_rate,
            bitrate: file.bit_rate,
          })),
        },
      });
    } catch (transcodingError) {
      logger.error("Transcoding error", {
        sceneId,
        error:
          transcodingError instanceof Error
            ? transcodingError.message
            : String(transcodingError),
      });
      res.status(500).json({
        error: "Failed to start transcoding",
        details:
          transcodingError instanceof Error
            ? transcodingError.message
            : "Unknown error",
      });
    }
  } catch (error) {
    logger.error("Error in playVideo", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  }
};

export async function seekVideo(req: SeekVideoRequest, res: Response) {
  try {
    const { sessionId, startTime } = req.body;

    if (!sessionId || typeof startTime !== "number") {
      return res.status(400).json({
        error: "Session ID and start time are required",
      });
    }

    // Handle seeking - may restart transcoding if needed
    const session = await transcodingManager.handleSeek(sessionId, startTime);

    // Get the scene file path
    if (!session?.scene) {
      return res.status(404).json({ error: "Session scene not found" });
    }

    const sceneFile = session.scene.files?.[0];
    if (!sceneFile) {
      return res.status(404).json({ error: "Scene file not found" });
    }

    const sceneFilePath = getSceneFilePath(session.scene);

    // If session was restarted (status = "starting"), restart transcoding
    if (session.status === "starting") {
      logger.info("Restarting transcoding after seek", {
        sessionId: session.sessionId,
        startTime: session.startTime,
      });
      await transcodingManager.startTranscoding(session, sceneFilePath);
    }

    res.json({
      success: true,
      sessionId: session.sessionId,
      playlistUrl: `/api/video/playlist/${session.sessionId}/master.m3u8`,
      status: session.status,
      startTime: session.startTime,
    });
  } catch (error) {
    logger.error("Error in seekVideo", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getSessionStatus(req: Request, res: Response) {
  try {
    const { sessionId } = req.params;

    const session = transcodingManager.getSession(sessionId);
    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Update access time
    transcodingManager.updateSessionAccess(sessionId);

    // Count segments by state
    let completedCount = 0;
    let transcodingCount = 0;
    let failedCount = 0;

    for (const [, metadata] of session.segmentStates) {
      if (metadata.state === "completed") completedCount++;
      else if (metadata.state === "transcoding") transcodingCount++;
      else if (metadata.state === "failed") failedCount++;
    }

    res.json({
      sessionId: session.sessionId,
      status: session.status,
      startTime: session.startTime,
      quality: session.quality,
      lastAccess: session.lastAccess,
      isProcessActive: session.process !== null,
      progress: {
        completed: completedCount,
        transcoding: transcodingCount,
        failed: failedCount,
        total: session.totalSegments,
        percentage: Math.round((completedCount / session.totalSegments) * 100),
      },
    });
  } catch (error) {
    logger.error("Error in getSessionStatus", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function getSegmentStates(req: Request, res: Response) {
  try {
    const { sessionId } = req.params;

    const segmentStates = transcodingManager.getSegmentStates(sessionId);
    if (!segmentStates) {
      return res.status(404).json({ error: "Session not found" });
    }

    // Update access time
    transcodingManager.updateSessionAccess(sessionId);

    // Convert Map to array for JSON serialization
    const segments: Array<{
      number: number;
      state: string;
      startTime?: number;
      completedTime?: number;
      retryCount: number;
      lastError?: string;
    }> = [];

    for (const [segmentNum, metadata] of segmentStates) {
      segments.push({
        number: segmentNum,
        state: metadata.state,
        startTime: metadata.startTime,
        completedTime: metadata.completedTime,
        retryCount: metadata.retryCount,
        lastError: metadata.lastError,
      });
    }

    // Sort by segment number
    segments.sort((a, b) => a.number - b.number);

    res.json({
      sessionId,
      segments,
      summary: {
        completed: segments.filter((s) => s.state === "completed").length,
        transcoding: segments.filter((s) => s.state === "transcoding").length,
        failed: segments.filter((s) => s.state === "failed").length,
        waiting: segments.filter((s) => s.state === "waiting").length,
        total: segments.length,
      },
    });
  } catch (error) {
    logger.error("Error in getSegmentStates", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  }
}

export async function killSession(req: Request, res: Response) {
  try {
    const { sessionId } = req.params;

    await transcodingManager.killSession(sessionId);

    res.json({
      success: true,
      message: "Session terminated",
    });
  } catch (error) {
    logger.error("Error in killSession", {
      error: error instanceof Error ? error.message : String(error),
    });
    res.status(500).json({ error: "Internal server error" });
  }
}

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
