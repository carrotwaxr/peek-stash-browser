import { ChildProcess, spawn, execSync } from "child_process";
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
};

export interface TranscodingSession {
  sessionId: string;
  videoId: string;
  userId?: string;
  startTime: number;
  quality: string;
  process: ChildProcess | null;
  outputDir: string;
  masterPlaylistPath: string;
  lastAccess: number;
  status: "starting" | "active" | "completed" | "error";
  scene?: Scene;
  playlistMonitor?: NodeJS.Timeout; // Timer for dynamic playlist generation
}

/**
 * CONFIGURATION 1: CONTINUOUS HLS STREAM
 *
 * This implementation starts ONE continuous FFmpeg HLS transcode when playback begins.
 * FFmpeg manages the entire stream as one continuous encode, eliminating per-segment timestamp issues.
 *
 * Key differences from old approach:
 * - Single FFmpeg process per session (not per-segment)
 * - FFmpeg generates segments continuously
 * - Segments start from 0 with sequential timestamps
 * - Seeking restarts the FFmpeg process from new position
 */
export class TranscodingManager {
  private sessions = new Map<string, TranscodingSession>();
  private tmpDir: string;

  constructor(tmpDir: string) {
    // Normalize path to POSIX format for Docker/Linux containers
    this.tmpDir = tmpDir
      .replace(/\\/g, "/")
      .replace(/^[A-Z]:/i, "");

    if (!this.tmpDir.startsWith("/")) {
      this.tmpDir = "/" + this.tmpDir;
    }

    console.log(`[TranscodingManager] Initialized with tmpDir: ${this.tmpDir}`);

    // Kill any orphaned FFmpeg processes from previous runs
    this.killOrphanedFFmpegProcesses();

    // Clean up old transcoding sessions on startup
    this.cleanupOnStartup();

    // Start cleanup timer
    this.startCleanupTimer();
  }

  /**
   * Get or create a transcoding session
   */
  async getOrCreateSession(
    videoId: string,
    startTime: number = 0,
    userId?: string,
    scene?: Scene
  ): Promise<TranscodingSession> {
    const sessionId = `${videoId}_${startTime}_${Date.now()}`;
    const outputDir = posixPath.join(
      this.tmpDir,
      "segments",
      sessionId
    );

    const session: TranscodingSession = {
      sessionId,
      videoId,
      userId,
      startTime,
      quality: "480p", // Test with 480p
      process: null,
      outputDir,
      masterPlaylistPath: posixPath.join(outputDir, "master.m3u8"),
      lastAccess: Date.now(),
      status: "starting",
      scene,
    };

    this.sessions.set(sessionId, session);

    console.log(`[TranscodingManager] Created session ${sessionId} at startTime ${startTime}s`);

    return session;
  }

  /**
   * Start continuous HLS transcoding for a session
   */
  async startTranscoding(
    session: TranscodingSession,
    sceneFilePath: string
  ): Promise<void> {
    try {
      // Ensure output directory exists
      fs.mkdirSync(session.outputDir, { recursive: true });

      // Create quality-specific directory
      const qualityDir = posixPath.join(session.outputDir, session.quality);
      fs.mkdirSync(qualityDir, { recursive: true });

      console.log(`[TranscodingManager] Starting continuous HLS transcode for session ${session.sessionId}`);
      console.log(`[TranscodingManager] Input: ${sceneFilePath}`);
      console.log(`[TranscodingManager] Output: ${qualityDir}`);
      console.log(`[TranscodingManager] Start time: ${session.startTime}s`);

      // Get video duration from scene metadata
      const duration = session.scene?.files?.[0]?.duration || 0;
      const preset = QUALITY_PRESETS[session.quality as keyof typeof QUALITY_PRESETS];

      // Calculate segment number to start from (for seeking)
      const segmentDuration = 4;
      const startSegment = Math.floor(session.startTime / segmentDuration);

      console.log(`[TranscodingManager] Video duration: ${duration}s, Starting from segment ${startSegment}`);

      // FFmpeg command for CONTINUOUS HLS streaming
      // This is the key difference: ONE process generates ALL segments continuously
      const args = [
        "-ss", session.startTime.toString(),  // Seek to start position
        "-i", sceneFilePath,                  // Input file

        // Video encoding
        "-c:v", "libx264",
        "-preset", "veryfast",                // Balance between speed and quality
        "-crf", "23",                         // Constant quality
        "-profile:v", "main",
        "-level", "4.0",
        "-g", "48",                           // GOP size (keyframe every 2 seconds at 24fps)
        "-keyint_min", "48",
        "-sc_threshold", "0",                 // Disable scene change detection
        "-pix_fmt", "yuv420p",
        "-movflags", "+faststart",
        "-vf", `scale=${preset.width}:${preset.height}`,

        // Audio encoding
        "-c:a", "aac",
        "-b:a", preset.audioBitrate,
        "-ar", "48000",
        "-ac", "2",

        // HLS output format
        "-f", "hls",
        "-hls_time", "4",                     // 4-second segments
        "-hls_list_size", "0",                // Keep all segments in playlist
        "-hls_segment_filename", posixPath.join(qualityDir, "segment_%03d.ts"),
        "-hls_playlist_type", "vod",          // VOD mode for proper seeking
        "-hls_flags", "independent_segments", // Each segment is independently decodable
        "-start_number", startSegment.toString(), // Start numbering from seek position

        posixPath.join(qualityDir, "stream.m3u8")
      ];

      console.log(`[TranscodingManager] FFmpeg command: ffmpeg ${args.join(" ")}`);

      // Start FFmpeg process
      const ffmpeg = spawn("ffmpeg", args);
      session.process = ffmpeg;

      // Log FFmpeg output
      ffmpeg.stderr.on("data", (data) => {
        const output = data.toString().trim();

        // Parse and log important information
        if (output.includes("Output #0")) {
          console.log(`[FFmpeg] ${session.sessionId}: Started output`);
        } else if (output.includes("frame=")) {
          // Parse progress: frame= 1234 fps= 45 q=28.0 size= 12345kB time=00:00:51.23 bitrate=1234.5kbits/s speed=1.5x
          const frameMatch = output.match(/frame=\s*(\d+)/);
          const fpsMatch = output.match(/fps=\s*([\d.]+)/);
          const timeMatch = output.match(/time=(\d+:\d+:[\d.]+)/);
          const speedMatch = output.match(/speed=\s*([\d.]+)x/);

          if (frameMatch && timeMatch && speedMatch) {
            console.log(`[FFmpeg Progress] ${session.sessionId}: time=${timeMatch[1]} speed=${speedMatch[1]}x fps=${fpsMatch?.[1] || "?"}`);
          }
        } else if (output.includes("error") || output.includes("Error")) {
          console.error(`[FFmpeg Error] ${session.sessionId}: ${output}`);
        } else if (!output.includes("frame=") && output.length > 0) {
          // Log other important messages (skip repetitive frame= lines)
          console.log(`[FFmpeg] ${session.sessionId}: ${output}`);
        }
      });

      ffmpeg.on("close", (code) => {
        console.log(`[FFmpeg] ${session.sessionId} finished with code: ${code}`);

        if (code === 0) {
          session.status = "completed";
        } else {
          session.status = "error";
        }

        session.process = null;
      });

      ffmpeg.on("error", (error) => {
        console.error(`[FFmpeg Error] ${session.sessionId}:`, error);
        session.status = "error";
        session.process = null;
      });

      // Create master playlist
      this.createMasterPlaylist(session);

      // Start dynamic playlist generator
      // This monitors the segment directory and generates the playlist ourselves
      // since FFmpeg in VOD mode only writes it at the end
      this.startPlaylistMonitor(session);

      // Wait for first segment to be available
      await this.waitForFirstSegment(session);

      session.status = "active";
      console.log(`[TranscodingManager] Session ${session.sessionId} active`);

    } catch (error) {
      console.error("[TranscodingManager] Error starting transcoding:", error);
      session.status = "error";
      throw error;
    }
  }

  /**
   * Wait for first segment to be generated
   * Note: We only check for segment files, not the playlist.
   * FFmpeg creates segments first, then updates the playlist periodically.
   */
  private async waitForFirstSegment(session: TranscodingSession): Promise<void> {
    const qualityDir = posixPath.join(session.outputDir, session.quality);

    console.log(`[TranscodingManager] Waiting for first segment in: ${qualityDir}`);

    const maxAttempts = 150; // 15 seconds
    const interval = 100; // 100ms

    for (let i = 0; i < maxAttempts; i++) {
      try {
        // Check if quality directory exists and has any .ts segment files
        if (fs.existsSync(qualityDir)) {
          const files = fs.readdirSync(qualityDir);
          const segmentFiles = files.filter(f => f.endsWith('.ts'));

          if (segmentFiles.length > 0) {
            console.log(`[TranscodingManager] First segment ready after ${i * interval}ms (found ${segmentFiles.length} segments)`);
            return;
          }
        }
      } catch (err) {
        // Directory might not be accessible yet, continue waiting
      }

      await new Promise(resolve => setTimeout(resolve, interval));
    }

    throw new Error("Timeout waiting for first segment");
  }

  /**
   * Handle seeking - kill existing process and start new one
   */
  async handleSeek(
    sessionId: string,
    newStartTime: number
  ): Promise<TranscodingSession> {
    const oldSession = this.sessions.get(sessionId);
    if (!oldSession) {
      throw new Error("Session not found");
    }

    console.log(`[TranscodingManager] Seeking from ${oldSession.startTime}s to ${newStartTime}s`);

    // Kill existing process
    await this.killSession(sessionId);

    // Create new session for the new start time
    const newSession = await this.getOrCreateSession(
      oldSession.videoId,
      newStartTime,
      oldSession.userId,
      oldSession.scene
    );

    return newSession;
  }

  /**
   * Kill a session's FFmpeg process
   */
  async killSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    console.log(`[TranscodingManager] Killing session ${sessionId}`);

    // Stop playlist monitor
    if (session.playlistMonitor) {
      clearInterval(session.playlistMonitor);
      session.playlistMonitor = undefined;
    }

    if (session.process) {
      session.process.kill("SIGTERM");

      // Force kill after 5 seconds if still running
      setTimeout(() => {
        if (session.process && !session.process.killed) {
          session.process.kill("SIGKILL");
        }
      }, 5000);

      session.process = null;
    }

    session.status = "error";
    this.sessions.delete(sessionId);
  }

  /**
   * Create master playlist for HLS
   */
  private createMasterPlaylist(session: TranscodingSession): void {
    const preset = QUALITY_PRESETS[session.quality as keyof typeof QUALITY_PRESETS];
    const bandwidth = parseInt(preset.bitrate) * 1000 + parseInt(preset.audioBitrate) * 1000;

    const masterContent = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-INDEPENDENT-SEGMENTS

#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${preset.width}x${preset.height},CODECS="avc1.640028,mp4a.40.2"
${session.quality}/stream.m3u8
`;

    fs.writeFileSync(session.masterPlaylistPath, masterContent);
    console.log(`[TranscodingManager] Created master playlist: ${session.masterPlaylistPath}`);
  }

  /**
   * Start monitoring segment directory and dynamically generate playlist
   * This is a workaround for FFmpeg VOD mode which only writes playlist at the end
   */
  private startPlaylistMonitor(session: TranscodingSession): void {
    const qualityDir = posixPath.join(session.outputDir, session.quality);
    const playlistPath = posixPath.join(qualityDir, "stream.m3u8");
    const segmentDuration = 4; // 4-second segments
    const startSegment = Math.floor(session.startTime / 4);

    console.log(`[PlaylistMonitor] Starting for session ${session.sessionId}`);

    // Update playlist every 500ms
    session.playlistMonitor = setInterval(() => {
      try {
        if (!fs.existsSync(qualityDir)) return;

        // Find all segment files
        const files = fs.readdirSync(qualityDir);
        const segments = files
          .filter(f => f.match(/segment_\d+\.ts/))
          .map(f => parseInt(f.match(/segment_(\d+)\.ts/)?.[1] || "0"))
          .sort((a, b) => a - b);

        if (segments.length === 0) return;

        // Calculate total duration from video metadata
        const totalDuration = session.scene?.files?.[0]?.duration || 0;

        // Determine if transcoding is complete
        const isComplete = session.status === "completed" || session.process === null;

        // Generate VOD playlist
        let playlist = `#EXTM3U\n`;
        playlist += `#EXT-X-VERSION:3\n`;
        playlist += `#EXT-X-TARGETDURATION:${segmentDuration}\n`;
        playlist += `#EXT-X-MEDIA-SEQUENCE:${startSegment}\n`;

        // Add each segment
        for (const segNum of segments) {
          playlist += `#EXTINF:${segmentDuration}.000,\n`;
          playlist += `segment_${segNum.toString().padStart(3, '0')}.ts\n`;
        }

        // Add end tag if transcoding is complete
        if (isComplete) {
          playlist += `#EXT-X-ENDLIST\n`;
        }

        // Write playlist
        fs.writeFileSync(playlistPath, playlist);

        // Stop monitoring if complete
        if (isComplete && session.playlistMonitor) {
          clearInterval(session.playlistMonitor);
          session.playlistMonitor = undefined;
          console.log(`[PlaylistMonitor] Stopped for session ${session.sessionId} (transcoding complete)`);
        }
      } catch (error) {
        console.error(`[PlaylistMonitor] Error for session ${session.sessionId}:`, error);
      }
    }, 500);
  }

  /**
   * Get session by ID and update last access time
   */
  getSession(sessionId: string): TranscodingSession | undefined {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccess = Date.now();
    }
    return session;
  }

  /**
   * Update session access time
   */
  updateSessionAccess(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastAccess = Date.now();
    }
  }

  /**
   * Cleanup old sessions
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanupOldSessions();
    }, 60000); // Run every minute
  }

  /**
   * Cleanup inactive sessions (30 minutes)
   */
  private cleanupOldSessions(): void {
    const cutoff = Date.now() - 30 * 60 * 1000; // 30 minutes

    for (const [sessionId, session] of this.sessions) {
      if (session.lastAccess < cutoff) {
        console.log(`[TranscodingManager] Cleaning up inactive session: ${sessionId}`);
        this.killSession(sessionId);
      }
    }
  }

  /**
   * Kill any orphaned FFmpeg processes from previous runs
   * Safe to do in Docker as it only affects our container
   */
  private killOrphanedFFmpegProcesses(): void {
    try {
      console.log("[TranscodingManager] Checking for orphaned FFmpeg processes...");

      // Use ps + grep + kill to find and kill all ffmpeg processes
      // We're in Docker so this is safe - only affects processes in our container
      try {
        // Find FFmpeg PIDs: ps aux | grep ffmpeg | grep -v grep | awk '{print $2}'
        const pids = execSync("ps aux | grep '[f]fmpeg' | awk '{print $2}'", {
          stdio: "pipe",
          encoding: "utf-8"
        }).trim();

        if (pids) {
          const pidArray = pids.split("\n").filter(p => p.trim());
          console.log(`[TranscodingManager] Found ${pidArray.length} FFmpeg process(es): ${pidArray.join(", ")}`);

          // Kill each process
          for (const pid of pidArray) {
            try {
              execSync(`kill -9 ${pid}`, { stdio: "pipe" });
            } catch (err) {
              // Process might already be dead, ignore
            }
          }
          console.log("[TranscodingManager] Killed orphaned FFmpeg processes");
        } else {
          console.log("[TranscodingManager] No orphaned FFmpeg processes found");
        }
      } catch (err: any) {
        // No processes found or error executing - both are fine
        console.log("[TranscodingManager] No orphaned FFmpeg processes found");
      }
    } catch (error) {
      console.error("[TranscodingManager] Error checking for FFmpeg processes:", error);
    }
  }

  /**
   * Cleanup all old transcoding data on server startup
   * Only removes the segments directory, NOT the database
   * Uses best-effort approach - doesn't fail if some files are locked
   */
  private cleanupOnStartup(): void {
    const segmentsDir = posixPath.join(this.tmpDir, "segments");

    console.log(`[TranscodingManager] Cleaning up old transcoding sessions from: ${segmentsDir}`);

    try {
      if (fs.existsSync(segmentsDir)) {
        // Read all session directories
        const sessions = fs.readdirSync(segmentsDir);

        console.log(`[TranscodingManager] Found ${sessions.length} old session(s) to clean up`);

        // Delete each session directory individually with best-effort
        let successCount = 0;
        let errorCount = 0;

        for (const sessionDir of sessions) {
          const fullPath = posixPath.join(segmentsDir, sessionDir);
          try {
            // Recursively delete all files in the session directory
            this.deleteDirRecursive(fullPath);
            successCount++;
          } catch (err) {
            console.warn(`[TranscodingManager] Failed to fully delete session ${sessionDir}:`, err instanceof Error ? err.message : err);
            errorCount++;
            // Continue with next session even if this one failed
          }
        }

        console.log(`[TranscodingManager] Cleanup complete: ${successCount} deleted, ${errorCount} failed`);
      } else {
        console.log("[TranscodingManager] No existing segments directory to clean up");
      }
    } catch (error) {
      console.error("[TranscodingManager] Error during cleanup:", error instanceof Error ? error.message : error);
    }
  }

  /**
   * Recursively delete directory contents (best-effort)
   */
  private deleteDirRecursive(dirPath: string): void {
    if (!fs.existsSync(dirPath)) return;

    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = posixPath.join(dirPath, entry.name);

        try {
          if (entry.isDirectory()) {
            // Recursively delete subdirectory
            this.deleteDirRecursive(fullPath);
            // Try to remove the now-empty directory
            try {
              fs.rmdirSync(fullPath);
            } catch (err) {
              // Might not be empty yet, ignore
            }
          } else {
            // Delete file
            fs.unlinkSync(fullPath);
          }
        } catch (err) {
          // File might be locked, skip it
          console.warn(`[TranscodingManager] Could not delete ${fullPath}:`, err instanceof Error ? err.message : err);
        }
      }

      // Finally try to remove the directory itself
      fs.rmdirSync(dirPath);
    } catch (err) {
      // Best effort - if we can't delete everything, that's ok
    }
  }
}

// Singleton instance
export const transcodingManager = new TranscodingManager(
  process.env.CONFIG_DIR || "/app/data"
);
