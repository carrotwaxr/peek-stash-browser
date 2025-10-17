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
  completedSegments: Set<number>; // Track which segments are actually transcoded
  totalSegments: number; // Total segments for the full video
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

    // Calculate total segments from video duration
    const duration = scene?.files?.[0]?.duration || 0;
    const segmentDuration = 4;
    const totalSegments = Math.ceil((duration - startTime) / segmentDuration);

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
      completedSegments: new Set(),
      totalSegments,
    };

    this.sessions.set(sessionId, session);

    console.log(`[TranscodingManager] Created session ${sessionId} at startTime ${startTime}s (${totalSegments} segments)`);

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

      console.log(`[TranscodingManager] Video duration: ${duration}s, Starting transcode from ${session.startTime}s`);

      // FFmpeg command for CONTINUOUS HLS streaming
      // IMPORTANT: Always start segment numbering from 0, even when seeking mid-video
      // This prevents Video.js confusion with media sequence numbers
      const args = [
        "-ss", session.startTime.toString(),  // Seek to start position in source file
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
        // NOTE: No -start_number, always start from 0 for clean HLS playlists

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
   * Handle seeking - restart transcoding from seek position while keeping same session
   *
   * Strategy:
   * - Keep the same session ID and output directory
   * - Kill the current FFmpeg process and restart from new position
   * - This allows Video.js to keep using the same playlist URL
   * - Segments before the seek position won't exist, but that's fine
   */
  async handleSeek(
    sessionId: string,
    newStartTime: number
  ): Promise<TranscodingSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    const segmentDuration = 4;
    const currentSegment = Math.floor(session.startTime / segmentDuration);
    const newSegment = Math.floor(newStartTime / segmentDuration);
    const segmentDistance = Math.abs(newSegment - currentSegment);

    console.log(`[SmartSeek] Seek request to ${newStartTime}s (segment ${newSegment})`);
    console.log(`[SmartSeek] Currently transcoding from segment ${currentSegment}, ${session.completedSegments.size}/${session.totalSegments} segments complete`);

    // Check if target segment already exists
    const targetSegmentExists = session.completedSegments.has(newSegment);
    if (targetSegmentExists) {
      console.log(`[SmartSeek] ✓ Target segment ${newSegment} already transcoded, no action needed`);
      return session;
    }

    // Check if transcoder can catch up in time (within 15s timeout)
    // Assuming ~1.8x transcode speed, distance of 27 segments = 60 seconds of video = ~33s to transcode
    const estimatedWaitTime = (segmentDistance * segmentDuration) / 1.8;
    const MAX_WAIT_TIME = 12; // Conservative - segment server waits 15s

    if (estimatedWaitTime <= MAX_WAIT_TIME && newSegment > currentSegment) {
      console.log(`[SmartSeek] ⏳ Seeking ahead ${segmentDistance} segments (~${estimatedWaitTime.toFixed(1)}s transcode time)`);
      console.log(`[SmartSeek] ✓ Transcoder will catch up in time, no restart needed`);
      return session;
    }

    // Need to restart transcoding from new position
    console.log(`[SmartSeek] 🔄 Restarting transcoding from ${newStartTime}s, preserving existing segments`);

    // Stop current playlist monitor
    if (session.playlistMonitor) {
      clearInterval(session.playlistMonitor);
      session.playlistMonitor = undefined;
    }

    // Kill current FFmpeg process
    if (session.process) {
      session.process.kill("SIGTERM");
      session.process = null;
    }

    // Save old completed segments before we update the session
    const oldCompletedSegments = new Set(session.completedSegments);
    const oldQualityDir = posixPath.join(session.outputDir, session.quality);

    // Update session to new start time
    const alignedStartTime = Math.floor(newStartTime / segmentDuration) * segmentDuration;
    const newStartSegment = Math.floor(alignedStartTime / segmentDuration);

    session.startTime = alignedStartTime;
    session.status = "starting";

    // Total segments should always represent the FULL video, not from seek position
    // This ensures consistency with the full playlist (segments 0-617)
    const duration = session.scene?.files?.[0]?.duration || 0;
    session.totalSegments = Math.ceil(duration / segmentDuration);

    // Copy already-transcoded segments that are still useful
    // We want segments from newStartSegment onwards that already exist
    const segmentsToCopy: number[] = [];
    for (const segNum of oldCompletedSegments) {
      if (segNum >= newStartSegment) {
        segmentsToCopy.push(segNum);
      }
    }

    console.log(`[SmartSeek] Found ${segmentsToCopy.length} segments to preserve (segments ${Math.min(...segmentsToCopy) || 'none'} to ${Math.max(...segmentsToCopy) || 'none'})`);

    // Preserve segments using move instead of copy for better performance
    if (segmentsToCopy.length > 0) {
      const backupDir = posixPath.join(session.outputDir, `${session.quality}_backup`);
      fs.mkdirSync(backupDir, { recursive: true });

      // Move segments to backup (fast, no copying)
      let movedCount = 0;
      for (const segNum of segmentsToCopy) {
        const segmentFile = `segment_${segNum.toString().padStart(3, '0')}.ts`;
        const oldPath = posixPath.join(oldQualityDir, segmentFile);
        const backupPath = posixPath.join(backupDir, segmentFile);

        try {
          if (fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, backupPath);
            movedCount++;
          }
        } catch (err) {
          console.warn(`[SmartSeek] Failed to move segment ${segNum}:`, err);
        }
      }

      console.log(`[SmartSeek] ✓ Moved ${movedCount} segments to backup`);

      // Delete old quality directory (segments we care about are already moved out)
      try {
        this.deleteDirRecursive(oldQualityDir);
        console.log(`[SmartSeek] Cleared old quality directory`);
      } catch (err) {
        console.warn(`[SmartSeek] Failed to clear old directory:`, err);
      }

      // Recreate quality directory and move segments back
      fs.mkdirSync(oldQualityDir, { recursive: true });

      for (const segNum of segmentsToCopy) {
        const segmentFile = `segment_${segNum.toString().padStart(3, '0')}.ts`;
        const backupPath = posixPath.join(backupDir, segmentFile);
        const newPath = posixPath.join(oldQualityDir, segmentFile);

        try {
          if (fs.existsSync(backupPath)) {
            fs.renameSync(backupPath, newPath);
            session.completedSegments.add(segNum);
          }
        } catch (err) {
          console.warn(`[SmartSeek] Failed to restore segment ${segNum}:`, err);
        }
      }

      // Delete backup directory
      try {
        fs.rmdirSync(backupDir);
      } catch (err) {
        console.warn(`[SmartSeek] Failed to delete backup directory:`, err);
      }

      console.log(`[SmartSeek] ✓ Restored ${session.completedSegments.size} segments`);
    } else {
      // No segments to preserve, just clear the directory
      try {
        this.deleteDirRecursive(oldQualityDir);
        fs.mkdirSync(oldQualityDir, { recursive: true });
        console.log(`[SmartSeek] Cleared quality directory, no segments to preserve`);
      } catch (err) {
        console.warn(`[SmartSeek] Failed to clear directory:`, err);
      }

      session.completedSegments = new Set();
    }

    console.log(`[SmartSeek] Restarting session ${sessionId} from ${alignedStartTime}s (segment ${newStartSegment})`);

    return session;
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
   *
   * VOD TRICK: We generate a FULL playlist immediately (as if the entire video is transcoded)
   * This shows Video.js a complete VOD with seek controls.
   * We track which segments actually exist and serve them when ready.
   *
   * SEGMENT RENAMING: When transcoding starts mid-video (e.g., from 1124s = segment 281),
   * FFmpeg creates segment_000.ts, segment_001.ts... but we rename them to segment_281.ts,
   * segment_282.ts... to match the full video timeline.
   */
  private startPlaylistMonitor(session: TranscodingSession): void {
    const qualityDir = posixPath.join(session.outputDir, session.quality);
    const playlistPath = posixPath.join(qualityDir, "stream.m3u8");
    const segmentDuration = 4; // 4-second segments
    const startSegment = Math.floor(session.startTime / segmentDuration);

    console.log(`[PlaylistMonitor] Starting for session ${session.sessionId} (${session.totalSegments} total segments, starting from segment ${startSegment})`);

    // Generate FULL playlist immediately (VOD trick) - includes ALL segments 0-617
    this.generateFullPlaylist(session);

    // Monitor segment creation, rename them, and track completion
    session.playlistMonitor = setInterval(() => {
      try {
        if (!fs.existsSync(qualityDir)) return;

        // Find segments that need renaming
        // FFmpeg creates: segment_000.ts, segment_001.ts, segment_002.ts, ...
        // We need to rename them to match the video timeline
        // For a seek to 1052s (segment 263): segment_000 → segment_263, segment_001 → segment_264, etc.
        const files = fs.readdirSync(qualityDir);

        // Look for unrenamed segments (those that exist but aren't in completedSegments yet)
        // OPTIMIZATION: Only check a reasonable range of segments based on current progress
        // This prevents blocking the event loop with 1000+ fs calls every 500ms
        const maxSegmentToCheck = Math.min(
          session.completedSegments.size + 20, // Check 20 segments ahead of current progress
          session.totalSegments - startSegment // Don't check beyond total segments
        );

        for (let ffmpegSegNum = 0; ffmpegSegNum <= maxSegmentToCheck; ffmpegSegNum++) {
          const actualSegNum = startSegment + ffmpegSegNum;

          // Skip if we've already processed this segment
          if (session.completedSegments.has(actualSegNum)) {
            continue;
          }

          const ffmpegPath = posixPath.join(qualityDir, `segment_${ffmpegSegNum.toString().padStart(3, '0')}.ts`);
          const actualPath = posixPath.join(qualityDir, `segment_${actualSegNum.toString().padStart(3, '0')}.ts`);

          // Check if FFmpeg's segment exists
          if (fs.existsSync(ffmpegPath)) {
            // If startSegment is 0, no renaming needed - segment numbers already match timeline
            if (startSegment === 0) {
              session.completedSegments.add(actualSegNum);
              // console.log(`[PlaylistMonitor] Segment ${actualSegNum} ready (no rename needed)`);
            } else if (!fs.existsSync(actualPath)) {
              // Need to rename: segment_000 → segment_263, etc.
              try {
                fs.renameSync(ffmpegPath, actualPath);
                session.completedSegments.add(actualSegNum);
                console.log(`[PlaylistMonitor] Renamed segment_${ffmpegSegNum.toString().padStart(3, '0')}.ts → segment_${actualSegNum.toString().padStart(3, '0')}.ts (${session.completedSegments.size}/${session.totalSegments})`);
              } catch (err) {
                // Segment might be in use by FFmpeg, will catch it next iteration
              }
            }
          } else {
            // If this segment doesn't exist, no point checking higher numbers yet
            break;
          }
        }

        // Check if transcoding is complete
        const expectedSegmentCount = session.totalSegments; // Total segments for the full video
        const transcodedCount = session.completedSegments.size;
        const isComplete = transcodedCount >= expectedSegmentCount ||
                          session.status === "completed";

        if (isComplete && session.playlistMonitor) {
          clearInterval(session.playlistMonitor);
          session.playlistMonitor = undefined;
          console.log(`[PlaylistMonitor] Stopped for session ${session.sessionId} (${transcodedCount} segments complete)`);
        }
      } catch (error) {
        console.error(`[PlaylistMonitor] Error for session ${session.sessionId}:`, error);
      }
    }, 500);
  }

  /**
   * Generate FULL VOD playlist for the ENTIRE video (all segments 0 to end)
   * This tricks Video.js into showing VOD controls with full seek bar
   *
   * The playlist represents the complete video timeline, even if we're only
   * transcoding from a certain point onwards. Segments before the start point
   * won't exist, but Video.js can still seek to them (segment serving will wait).
   */
  private generateFullPlaylist(session: TranscodingSession): void {
    const qualityDir = posixPath.join(session.outputDir, session.quality);
    const playlistPath = posixPath.join(qualityDir, "stream.m3u8");
    const segmentDuration = 4;
    const startSegment = Math.floor(session.startTime / segmentDuration);

    // Calculate total segments for the COMPLETE video (from 0, not from startTime)
    const videoDuration = session.scene?.files?.[0]?.duration || 0;
    const totalSegmentsInVideo = Math.ceil(videoDuration / segmentDuration);

    // Generate complete VOD playlist for entire video (0 to end)
    let playlist = `#EXTM3U\n`;
    playlist += `#EXT-X-VERSION:3\n`;
    playlist += `#EXT-X-TARGETDURATION:${segmentDuration}\n`;
    playlist += `#EXT-X-MEDIA-SEQUENCE:0\n`;

    // Add ALL segments from 0 to end of video (even ones that don't exist)
    for (let i = 0; i < totalSegmentsInVideo; i++) {
      playlist += `#EXTINF:${segmentDuration}.000,\n`;
      playlist += `segment_${i.toString().padStart(3, '0')}.ts\n`;
    }

    // Always include ENDLIST for VOD (this gives us the seek bar!)
    playlist += `#EXT-X-ENDLIST\n`;

    // Write playlist
    fs.writeFileSync(playlistPath, playlist);
    console.log(`[PlaylistMonitor] Generated COMPLETE VOD playlist: segments 0-${totalSegmentsInVideo-1} (${totalSegmentsInVideo} total, transcoding from segment ${startSegment})`);
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
