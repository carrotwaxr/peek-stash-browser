import { Request, Response } from "express";
import getStash from "../stash.js";
import fs from "fs";
import path from "path";
import { Scene } from "stashapp-api";
import { transcodingManager } from "../services/TranscodingManager.js";

interface PlayVideoRequest extends Request {
  query: {
    sceneId?: string;
    startTime?: string;
    sessionId?: string;
    userId?: string;
    direct?: string;
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
    if (fs.existsSync(session.masterPlaylistPath)) {
      res.sendFile(session.masterPlaylistPath);
    } else {
      res.status(404).send("Master playlist not found");
    }
    return;
  }

  // Handle quality-specific playlist or segment
  const parts = segment2.split("/");
  if (parts.length === 2) {
    const [quality, file] = parts;
    const filePath = path.join(session.outputDir, quality, file);

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
  return sceneFile.replace("/data", "/app/media");
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
  const response = (await withTimeout(
    stash.findScenes({ ids: [sceneId] }),
    5000 // 5 second timeout
  )) as any;

  const scene = response.findScenes.scenes[0] as Scene;
  if (scene) {
    sceneCache.set(sceneId, { scene, timestamp: now });
  }

  return scene;
};

export const playVideo = async (req: PlayVideoRequest, res: Response) => {
  try {
    const { direct, startTime = "0", sessionId, userId } = req.query;
    const { videoId } = req.params;

    // Use sceneId from query or fallback to videoId from params
    const sceneId = req.query.sceneId || videoId;

    if (!sceneId) {
      return res.status(400).json({ error: "Scene ID is required" });
    }

    console.log(
      `${
        direct === "true" ? "Direct playing" : "Playing transcoded"
      } scene ${sceneId}`
    );

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
      console.error(
        `File access error for scene ${sceneId}: ${sceneFilePath}`,
        error
      );
      return res.status(404).json({
        error: "Scene file not found on disk",
        path: sceneFilePath,
      });
    }

    // Handle direct play
    if (direct === "true") {
      try {
        res.sendFile(sceneFilePath);
      } catch (error) {
        console.error(`Error serving file for scene ${sceneId}:`, error);
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
      console.error("Transcoding error:", transcodingError);
      res.status(500).json({
        error: "Failed to start transcoding",
        details:
          transcodingError instanceof Error
            ? transcodingError.message
            : "Unknown error",
      });
    }
  } catch (error) {
    console.error("Error in playVideo:", error);
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

    // Handle seeking by creating new session
    const newSession = await transcodingManager.handleSeek(
      sessionId,
      startTime
    );

    // Get the scene file path from the new session
    const session = transcodingManager.getSession(newSession.sessionId);
    if (!session?.scene) {
      return res.status(404).json({ error: "Session scene not found" });
    }

    const sceneFile = session.scene.files?.[0];
    if (!sceneFile) {
      return res.status(404).json({ error: "Scene file not found" });
    }

    const sceneFilePath = getSceneFilePath(session.scene);

    // Start transcoding for the new position
    await transcodingManager.startTranscoding(newSession, sceneFilePath);

    res.json({
      success: true,
      sessionId: newSession.sessionId,
      playlistUrl: `/api/video/playlist/${newSession.sessionId}/master.m3u8`,
      status: newSession.status,
      startTime: newSession.startTime,
    });
  } catch (error) {
    console.error("Error in seekVideo:", error);
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

    res.json({
      sessionId: session.sessionId,
      status: session.status,
      startTime: session.startTime,
      qualities: session.qualities,
      lastAccess: session.lastAccess,
      activeProcesses: Array.from(session.processes.keys()),
    });
  } catch (error) {
    console.error("Error in getSessionStatus:", error);
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
    console.error("Error in killSession:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
