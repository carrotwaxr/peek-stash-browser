import { ChildProcess, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { Scene } from "stashapp-api";

// Use POSIX paths since we always run in Docker/Linux containers
const posixPath = path.posix;

// Quality configurations
export const QUALITY_PRESETS = {
  "360p": { width: 640, height: 360, bitrate: "800k", audioBitrate: "96k" },
  "480p": { width: 854, height: 480, bitrate: "1400k", audioBitrate: "128k" },
  "720p": { width: 1280, height: 720, bitrate: "2800k", audioBitrate: "128k" },
  "1080p": {
    width: 1920,
    height: 1080,
    bitrate: "5000k",
    audioBitrate: "192k",
  },
};

export interface TranscodingSession {
  sessionId: string;
  videoId: string;
  userId?: string;
  startTime: number;
  qualities: string[];
  processes: Map<string, ChildProcess>;
  outputDir: string;
  masterPlaylistPath: string;
  lastAccess: number;
  status: "starting" | "active" | "completed" | "error";
  scene?: Scene;
}

export interface VideoSegment {
  videoId: string;
  startTime: number;
  qualities: string[];
  outputDir: string;
  status: "transcoding" | "completed" | "abandoned";
  lastAccess: number;
}

export class TranscodingManager {
  private sessions = new Map<string, TranscodingSession>();
  private videoSegments = new Map<string, VideoSegment[]>();
  private tmpDir: string;

  constructor(tmpDir: string) {
    // Normalize path to POSIX format for Docker/Linux containers
    // Replace Windows backslashes and drive letters
    this.tmpDir = tmpDir
      .replace(/\\/g, "/") // Convert backslashes to forward slashes
      .replace(/^[A-Z]:/i, ""); // Remove Windows drive letters (C:, D:, etc.)

    // If path started with drive letter, make it absolute from root
    if (!this.tmpDir.startsWith("/")) {
      this.tmpDir = "/" + this.tmpDir;
    }

    console.log(`TranscodingManager tmpDir normalized to: ${this.tmpDir}`);

    // Clean up old transcoding sessions on startup
    this.cleanupOnStartup();

    this.startCleanupTimer();
  }

  /**
   * Get or create a transcoding session for a video
   * Uses shared segments when possible, creates new session for seeks
   */
  async getOrCreateSession(
    videoId: string,
    startTime: number = 0,
    userId?: string,
    scene?: Scene
  ): Promise<TranscodingSession> {
    // Check if we can reuse existing segments
    const existingSegment = this.findUsableSegment(videoId, startTime);

    if (existingSegment && existingSegment.status === "completed") {
      // Reuse existing completed transcoding
      return this.createSessionFromSegment(videoId, existingSegment, userId);
    }

    // Create new session
    const sessionId = `${videoId}_${startTime}_${Date.now()}`;
    const outputDir = posixPath.join(
      this.tmpDir,
      "segments",
      `${videoId}_${Math.floor(startTime)}`
    );

    const session: TranscodingSession = {
      sessionId,
      videoId,
      userId,
      startTime,
      qualities: Object.keys(QUALITY_PRESETS),
      processes: new Map(),
      outputDir,
      masterPlaylistPath: posixPath.join(outputDir, "master.m3u8"),
      lastAccess: Date.now(),
      status: "starting",
      scene,
    };

    this.sessions.set(sessionId, session);

    // Add to video segments tracking
    if (!this.videoSegments.has(videoId)) {
      this.videoSegments.set(videoId, []);
    }

    const videoSegment: VideoSegment = {
      videoId,
      startTime,
      qualities: session.qualities,
      outputDir,
      status: "transcoding",
      lastAccess: Date.now(),
    };

    this.videoSegments.get(videoId)!.push(videoSegment);

    return session;
  }

  /**
   * Start transcoding for a session
   */
  async startTranscoding(
    session: TranscodingSession,
    sceneFilePath: string
  ): Promise<void> {
    try {
      // Ensure output directory exists
      fs.mkdirSync(session.outputDir, { recursive: true });

      // Create quality-specific directories
      for (const quality of session.qualities) {
        const qualityDir = posixPath.join(session.outputDir, quality);
        fs.mkdirSync(qualityDir, { recursive: true });
      }

      // Start transcoding for each quality
      const transcodingPromises = session.qualities.map((quality) =>
        this.startQualityTranscoding(session, quality, sceneFilePath)
      );

      // Create master playlist
      this.createMasterPlaylist(session);

      session.status = "active";

      // Wait for all qualities to start
      await Promise.all(transcodingPromises);
    } catch (error) {
      console.error("Error starting transcoding:", error);
      session.status = "error";
      throw error;
    }
  }

  /**
   * Start transcoding for a specific quality
   */
  private async startQualityTranscoding(
    session: TranscodingSession,
    quality: string,
    sceneFilePath: string
  ): Promise<void> {
    const preset = QUALITY_PRESETS[quality as keyof typeof QUALITY_PRESETS];
    const qualityDir = posixPath.join(session.outputDir, quality);
    const playlistPath = posixPath.join(qualityDir, "index.m3u8");

    const args = [
      "-ss",
      session.startTime.toString(), // Seek to start time
      "-i",
      sceneFilePath,
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast", // Fastest encoding for immediate playback
      "-tune",
      "zerolatency", // Optimize for low latency
      "-profile:v",
      "baseline", // Use baseline profile for better compatibility and speed
      "-level:v",
      "3.1",
      "-pix_fmt",
      "yuv420p",
      "-vf",
      `scale=${preset.width}:${preset.height}`,
      "-b:v",
      preset.bitrate,
      "-maxrate",
      preset.bitrate,
      "-bufsize",
      `${parseInt(preset.bitrate) * 1}k`, // Smaller buffer for faster startup
      "-g",
      "48", // GOP size (2 seconds at 24fps) - keep keyframes frequent
      "-keyint_min",
      "48",
      "-sc_threshold",
      "0",
      "-bf",
      "0", // No B-frames for lower latency
      "-threads",
      "0", // Use all available CPU cores
      "-c:a",
      "aac",
      "-b:a",
      preset.audioBitrate,
      "-ar",
      "48000",
      "-ac",
      "2",
      "-f",
      "hls",
      "-hls_time",
      "2", // 2-second segments for faster startup
      "-hls_list_size",
      "0", // Keep all segments (don't limit playlist size)
      "-hls_playlist_type",
      "event", // Event playlist - updates as segments are added (suitable for live/progressive transcoding)
      "-hls_segment_filename",
      posixPath.join(qualityDir, "segment_%03d.ts"),
      "-hls_flags",
      "independent_segments+temp_file+append_list", // append_list prevents ENDLIST until transcoding completes
      "-hls_start_number_source",
      "datetime", // Use datetime for segment numbering
      "-hls_allow_cache",
      "1", // Allow caching
      "-y", // Overwrite output files
      playlistPath,
    ];

    return new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", args);
      let resolved = false;
      let ffmpegStarted = false;
      let playlistCheckInterval: NodeJS.Timeout | null = null;

      ffmpeg.stderr.on("data", (data) => {
        const output = data.toString().trim();

        // Log non-verbose output
        if (output.length > 0 && !output.includes("frame=")) {
          console.log(`FFmpeg [${quality}] ${session.sessionId}: ${output}`);
        }

        // Start checking for playlist once FFmpeg starts outputting
        if (!ffmpegStarted && output.includes("Output #0")) {
          ffmpegStarted = true;
          console.log(
            `FFmpeg [${quality}] started for ${session.sessionId}, waiting for playlist...`
          );

          // Poll for playlist file creation
          let attempts = 0;
          const maxAttempts = 100; // 10 seconds max (100 * 100ms)

          playlistCheckInterval = setInterval(() => {
            attempts++;

            if (fs.existsSync(playlistPath)) {
              console.log(`Playlist ready: ${playlistPath}`);
              if (playlistCheckInterval) clearInterval(playlistCheckInterval);
              if (!resolved) {
                resolved = true;
                resolve();
              }
            } else if (attempts >= maxAttempts) {
              console.warn(
                `Playlist not found after ${
                  maxAttempts * 100
                }ms: ${playlistPath}`
              );
              if (playlistCheckInterval) clearInterval(playlistCheckInterval);
              if (!resolved) {
                resolved = true;
                // Resolve anyway - playlist might be created soon
                resolve();
              }
            }
          }, 100);
        }
      });

      ffmpeg.on("close", (code) => {
        if (playlistCheckInterval) clearInterval(playlistCheckInterval);
        console.log(
          `FFmpeg [${quality}] ${session.sessionId} finished with code: ${code}`
        );
        session.processes.delete(quality);

        // Mark segment as completed if all processes are done
        if (session.processes.size === 0) {
          this.markSegmentCompleted(session.videoId, session.startTime);
          session.status = "completed";
        }

        // Resolve if we haven't already
        if (!resolved) {
          if (code === 0) {
            resolved = true;
            resolve();
          } else {
            reject(new Error(`FFmpeg exited with code ${code}`));
          }
        }
      });

      ffmpeg.on("error", (error) => {
        if (playlistCheckInterval) clearInterval(playlistCheckInterval);
        console.error(`FFmpeg [${quality}] ${session.sessionId} error:`, error);
        session.processes.delete(quality);
        session.status = "error";
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      });

      session.processes.set(quality, ffmpeg);

      // Fallback timeout in case FFmpeg never outputs "Output #0"
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`Timeout waiting for FFmpeg to start: ${quality}`));
        }
      }, 15000); // 15 seconds for FFmpeg to start
    });
  }

  /**
   * Handle seeking - kill existing processes and start new ones
   */
  async handleSeek(
    sessionId: string,
    newStartTime: number
  ): Promise<TranscodingSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    // Kill existing processes
    await this.killSession(sessionId);

    // Mark current segment as abandoned
    this.markSegmentAbandoned(session.videoId, session.startTime);

    // Create new session for the new start time
    const newSession = await this.getOrCreateSession(
      session.videoId,
      newStartTime,
      session.userId,
      session.scene
    );

    return newSession;
  }

  /**
   * Kill all processes for a session
   */
  async killSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Kill all FFmpeg processes
    for (const [quality, process] of session.processes) {
      console.log(
        `Killing FFmpeg process for ${quality} in session ${sessionId}`
      );
      process.kill("SIGTERM");

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (!process.killed) {
          process.kill("SIGKILL");
        }
      }, 5000);
    }

    session.processes.clear();
    session.status = "error";
    this.sessions.delete(sessionId);
  }

  /**
   * Create master playlist for HLS
   */
  private createMasterPlaylist(session: TranscodingSession): void {
    let masterContent =
      "#EXTM3U\n#EXT-X-VERSION:6\n#EXT-X-INDEPENDENT-SEGMENTS\n\n";

    for (const quality of session.qualities) {
      const preset = QUALITY_PRESETS[quality as keyof typeof QUALITY_PRESETS];
      const bandwidth =
        parseInt(preset.bitrate) * 1000 + parseInt(preset.audioBitrate) * 1000;

      masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${preset.width}x${preset.height},CODECS="avc1.640028,mp4a.40.2"\n`;
      masterContent += `${quality}/index.m3u8\n`;
    }

    fs.writeFileSync(session.masterPlaylistPath, masterContent);
  }

  /**
   * Find a usable existing segment for a video and start time
   */
  private findUsableSegment(
    videoId: string,
    startTime: number
  ): VideoSegment | null {
    const segments = this.videoSegments.get(videoId) || [];

    // Look for exact match first
    let exactMatch = segments.find(
      (seg) =>
        Math.abs(seg.startTime - startTime) < 2 && seg.status !== "abandoned"
    );

    if (exactMatch) return exactMatch;

    // Look for segment that covers this start time
    return (
      segments.find(
        (seg) =>
          seg.startTime <= startTime &&
          seg.status === "completed" &&
          startTime - seg.startTime < 300 // Within 5 minutes
      ) || null
    );
  }

  /**
   * Create a session from an existing segment
   */
  private createSessionFromSegment(
    videoId: string,
    segment: VideoSegment,
    userId?: string
  ): TranscodingSession {
    const sessionId = `reuse_${videoId}_${userId}_${Date.now()}`;

    const session: TranscodingSession = {
      sessionId,
      videoId,
      userId,
      startTime: segment.startTime,
      qualities: segment.qualities,
      processes: new Map(),
      outputDir: segment.outputDir,
      masterPlaylistPath: posixPath.join(segment.outputDir, "master.m3u8"),
      lastAccess: Date.now(),
      status: "completed",
    };

    // Update segment access time
    segment.lastAccess = Date.now();

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Mark a segment as completed
   */
  private markSegmentCompleted(videoId: string, startTime: number): void {
    const segments = this.videoSegments.get(videoId);
    if (segments) {
      const segment = segments.find(
        (seg) => Math.abs(seg.startTime - startTime) < 1
      );
      if (segment) {
        segment.status = "completed";
        segment.lastAccess = Date.now();
      }
    }
  }

  /**
   * Mark a segment as abandoned (due to seeking)
   */
  private markSegmentAbandoned(videoId: string, startTime: number): void {
    const segments = this.videoSegments.get(videoId);
    if (segments) {
      const segment = segments.find(
        (seg) => Math.abs(seg.startTime - startTime) < 1
      );
      if (segment) {
        segment.status = "abandoned";
      }
    }
  }

  /**
   * Update session access time
   */
  updateSessionAccess(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccess = Date.now();

      // Also update the corresponding segment
      const segments = this.videoSegments.get(session.videoId);
      if (segments) {
        const segment = segments.find(
          (seg) => seg.outputDir === session.outputDir
        );
        if (segment) {
          segment.lastAccess = Date.now();
        }
      }
    }
  }

  /**
   * Get session by ID and update last access time
   */
  getSession(sessionId: string): TranscodingSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccess = Date.now(); // Update access time to prevent cleanup
    }
    return session;
  }

  /**
   * Cleanup old segments and sessions
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanupOldSessions();
      this.cleanupOldSegments();
    }, 60000); // Run every minute
  }

  /**
   * Cleanup inactive sessions (30 minutes)
   */
  private cleanupOldSessions(): void {
    const cutoff = Date.now() - 30 * 60 * 1000; // 30 minutes

    for (const [sessionId, session] of this.sessions) {
      if (session.lastAccess < cutoff) {
        console.log(`Cleaning up inactive session: ${sessionId}`);
        this.killSession(sessionId);
      }
    }
  }

  /**
   * Cleanup old segments
   */
  private cleanupOldSegments(): void {
    const abandonedCutoff = Date.now() - 10 * 60 * 1000; // 10 minutes for abandoned
    const completedCutoff = Date.now() - 4 * 60 * 60 * 1000; // 4 hours for completed

    for (const [videoId, segments] of this.videoSegments) {
      const toRemove: number[] = [];

      segments.forEach((segment, index) => {
        let shouldRemove = false;

        if (
          segment.status === "abandoned" &&
          segment.lastAccess < abandonedCutoff
        ) {
          shouldRemove = true;
        } else if (
          segment.status === "completed" &&
          segment.lastAccess < completedCutoff
        ) {
          shouldRemove = true;
        }

        if (shouldRemove) {
          console.log(`Cleaning up segment: ${segment.outputDir}`);
          try {
            fs.rmSync(segment.outputDir, { recursive: true, force: true });
            toRemove.push(index);
          } catch (error) {
            console.error(`Error removing segment directory: ${error}`);
          }
        }
      });

      // Remove segments from tracking (in reverse order to maintain indices)
      toRemove.reverse().forEach((index) => {
        segments.splice(index, 1);
      });

      // Remove video entry if no segments left
      if (segments.length === 0) {
        this.videoSegments.delete(videoId);
      }
    }
  }

  /**
   * Cleanup all old transcoding data on server startup
   * Removes all segment directories but preserves other files in tmpDir
   */
  private cleanupOnStartup(): void {
    const segmentsDir = posixPath.join(this.tmpDir, "segments");

    console.log(`Cleaning up old transcoding sessions from: ${segmentsDir}`);

    try {
      if (fs.existsSync(segmentsDir)) {
        fs.rmSync(segmentsDir, { recursive: true, force: true });
        console.log("Old transcoding sessions cleaned up successfully");
      } else {
        console.log("No existing segments directory to clean up");
      }
    } catch (error) {
      console.error("Error cleaning up old transcoding sessions:", error);
    }
  }
}

// Singleton instance
export const transcodingManager = new TranscodingManager(
  process.env.TMP_DIR || "/app/tmp"
);
