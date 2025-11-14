import { ChildProcess, execSync, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { Scene } from "stashapp-api";
import { createThrottledFFmpegHandler } from "../utils/ffmpegLogger.js";
import { logger } from "../utils/logger.js";

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

// Segment state enum
export enum SegmentState {
  WAITING = "waiting", // Segment not yet started transcoding
  TRANSCODING = "transcoding", // Segment currently being transcoded
  COMPLETED = "completed", // Segment successfully transcoded
  FAILED = "failed", // Segment transcoding failed
}

// Segment metadata interface
export interface SegmentMetadata {
  state: SegmentState;
  startTime?: number; // When transcoding started (timestamp)
  completedTime?: number; // When transcoding completed (timestamp)
  lastError?: string; // Error message if failed
  retryCount: number; // Number of retry attempts (default 0)
}

// Maximum retry attempts for failed segments
const MAX_SEGMENT_RETRIES = 3;

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
  segmentStates: Map<number, SegmentMetadata>; // Track state of each segment with metadata
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
  private totalSessionsCreated = 0;

  constructor(tmpDir: string) {
    // Normalize path to POSIX format for Docker/Linux containers
    this.tmpDir = tmpDir.replace(/\\/g, "/").replace(/^[A-Z]:/i, "");

    if (!this.tmpDir.startsWith("/")) {
      this.tmpDir = "/" + this.tmpDir;
    }

    logger.info("TranscodingManager initialized", { tmpDir: this.tmpDir });

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
    quality: string = "480p",
    userId?: string,
    scene?: Scene
  ): Promise<TranscodingSession> {
    const sessionId = `${videoId}_${startTime}_${Date.now()}`;
    const outputDir = posixPath.join(this.tmpDir, "segments", sessionId);

    // Calculate total segments from video duration
    const duration = scene?.files?.[0]?.duration || 0;
    const segmentDuration = 4;
    const totalSegments = Math.ceil((duration - startTime) / segmentDuration);

    const session: TranscodingSession = {
      sessionId,
      videoId,
      userId,
      startTime,
      quality,
      process: null,
      outputDir,
      masterPlaylistPath: posixPath.join(outputDir, "master.m3u8"),
      lastAccess: Date.now(),
      status: "starting",
      scene,
      segmentStates: new Map(),
      totalSegments,
    };

    this.sessions.set(sessionId, session);
    this.totalSessionsCreated++;

    logger.info("Created transcoding session", {
      sessionId,
      startTime,
      totalSegments,
      quality,
    });

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

      // Get video duration from scene metadata
      const duration = session.scene?.files?.[0]?.duration || 0;
      const preset =
        QUALITY_PRESETS[session.quality as keyof typeof QUALITY_PRESETS];

      logger.info("Starting continuous HLS transcode", {
        sessionId: session.sessionId,
        input: sceneFilePath,
        output: qualityDir,
        startTime: session.startTime,
        duration,
        quality: session.quality,
      });

      // FFmpeg command for CONTINUOUS HLS streaming
      // IMPORTANT: Always start segment numbering from 0, even when seeking mid-video
      // This prevents Video.js confusion with media sequence numbers
      const args = [
        "-ss",
        session.startTime.toString(), // Seek to start position in source file
        "-i",
        sceneFilePath, // Input file

        // Video encoding
        "-c:v",
        "libx264",
        "-preset",
        "veryfast", // Balance between speed and quality
        "-crf",
        "23", // Constant quality
        "-profile:v",
        "main",
        "-level",
        "4.0",
        "-g",
        "48", // GOP size (keyframe every 2 seconds at 24fps)
        "-keyint_min",
        "48",
        "-sc_threshold",
        "0", // Disable scene change detection
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-vf",
        `scale=${preset.width}:${preset.height}`,

        // Audio encoding
        "-c:a",
        "aac",
        "-b:a",
        preset.audioBitrate,
        "-ar",
        "48000",
        "-ac",
        "2",

        // HLS output format
        "-f",
        "hls",
        "-hls_time",
        "4", // 4-second segments
        "-hls_list_size",
        "0", // Keep all segments in playlist
        "-hls_segment_filename",
        posixPath.join(qualityDir, "segment_%03d.ts"),
        "-hls_playlist_type",
        "vod", // VOD mode for proper seeking
        "-hls_flags",
        "independent_segments", // Each segment is independently decodable
        // NOTE: No -start_number, always start from 0 for clean HLS playlists

        posixPath.join(qualityDir, "stream.m3u8"),
      ];

      logger.debug("FFmpeg command", {
        sessionId: session.sessionId,
        command: `ffmpeg ${args.join(" ")}`,
      });

      // Start FFmpeg process
      const ffmpeg = spawn("ffmpeg", args);
      session.process = ffmpeg;

      // Setup throttled FFmpeg output handler (logs progress every 5 seconds)
      const ffmpegHandler = createThrottledFFmpegHandler(session.sessionId);
      ffmpeg.stderr.on("data", ffmpegHandler);

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          logger.info("FFmpeg process completed successfully", {
            sessionId: session.sessionId,
            exitCode: code,
          });
          session.status = "completed";
        } else {
          logger.warn("FFmpeg process exited with non-zero code", {
            sessionId: session.sessionId,
            exitCode: code,
          });
          session.status = "error";
        }

        session.process = null;
      });

      ffmpeg.on("error", (error) => {
        logger.error("FFmpeg process error", {
          sessionId: session.sessionId,
          error: error.message,
        });
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
      logger.info("Transcoding session active", {
        sessionId: session.sessionId,
      });
    } catch (error) {
      logger.error("Error starting transcoding", {
        sessionId: session.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      session.status = "error";
      throw error;
    }
  }

  /**
   * Wait for first segment to be generated
   * Note: We only check for segment files, not the playlist.
   * FFmpeg creates segments first, then updates the playlist periodically.
   */
  private async waitForFirstSegment(
    session: TranscodingSession
  ): Promise<void> {
    const qualityDir = posixPath.join(session.outputDir, session.quality);

    logger.debug("Waiting for first segment", {
      sessionId: session.sessionId,
      qualityDir,
    });

    const maxAttempts = 150; // 15 seconds
    const interval = 100; // 100ms

    for (let i = 0; i < maxAttempts; i++) {
      try {
        // Check if quality directory exists and has any .ts segment files
        if (fs.existsSync(qualityDir)) {
          const files = fs.readdirSync(qualityDir);
          const segmentFiles = files.filter((f) => f.endsWith(".ts"));

          if (segmentFiles.length > 0) {
            logger.info("First segment ready", {
              sessionId: session.sessionId,
              waitTimeMs: i * interval,
              segmentCount: segmentFiles.length,
            });
            return;
          }
        }
      } catch {
        // Directory might not be accessible yet, continue waiting
      }

      await new Promise((resolve) => setTimeout(resolve, interval));
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

    logger.info("Seek request received", {
      sessionId,
      newStartTime,
      newSegment,
      currentSegment,
      completedSegments: session.segmentStates.size,
      totalSegments: session.totalSegments,
    });

    // Check if target segment already exists and is completed
    const targetSegmentState = session.segmentStates.get(newSegment);
    const targetSegmentExists =
      targetSegmentState?.state === SegmentState.COMPLETED;
    if (targetSegmentExists) {
      logger.debug("Target segment already transcoded, no action needed", {
        sessionId,
        targetSegment: newSegment,
      });
      return session;
    }

    // Check if transcoder can catch up in time (within 15s timeout)
    // Assuming ~1.8x transcode speed, distance of 27 segments = 60 seconds of video = ~33s to transcode
    const estimatedWaitTime = (segmentDistance * segmentDuration) / 1.8;
    const MAX_WAIT_TIME = 12; // Conservative - segment server waits 15s

    if (estimatedWaitTime <= MAX_WAIT_TIME && newSegment > currentSegment) {
      logger.debug("Transcoder will catch up, no restart needed", {
        sessionId,
        segmentDistance,
        estimatedWaitTime,
      });
      return session;
    }

    // Need to restart transcoding from new position
    logger.info("Restarting transcoding from new position", {
      sessionId,
      newStartTime,
      preservingSegments: true,
    });

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
    const oldCompletedSegments = new Map(session.segmentStates);
    const oldQualityDir = posixPath.join(session.outputDir, session.quality);

    // Update session to new start time
    const alignedStartTime =
      Math.floor(newStartTime / segmentDuration) * segmentDuration;
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
    for (const [segNum, metadata] of oldCompletedSegments) {
      if (
        segNum >= newStartSegment &&
        metadata.state === SegmentState.COMPLETED
      ) {
        segmentsToCopy.push(segNum);
      }
    }

    if (segmentsToCopy.length > 0) {
      logger.debug("Preserving already-transcoded segments", {
        sessionId,
        segmentCount: segmentsToCopy.length,
        rangeMin: Math.min(...segmentsToCopy),
        rangeMax: Math.max(...segmentsToCopy),
      });
    }

    // Preserve segments using move instead of copy for better performance
    if (segmentsToCopy.length > 0) {
      const backupDir = posixPath.join(
        session.outputDir,
        `${session.quality}_backup`
      );
      fs.mkdirSync(backupDir, { recursive: true });

      // Move segments to backup (fast, no copying)
      let movedCount = 0;
      for (const segNum of segmentsToCopy) {
        const segmentFile = `segment_${segNum.toString().padStart(3, "0")}.ts`;
        const oldPath = posixPath.join(oldQualityDir, segmentFile);
        const backupPath = posixPath.join(backupDir, segmentFile);

        try {
          if (fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, backupPath);
            movedCount++;
          }
        } catch (err) {
          logger.warn("Failed to move segment during seek", {
            sessionId,
            segmentNum: segNum,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      logger.debug("Moved segments to backup", { sessionId, movedCount });

      // Delete old quality directory (segments we care about are already moved out)
      try {
        this.deleteDirRecursive(oldQualityDir);
        logger.debug("Cleared old quality directory", { sessionId });
      } catch (err) {
        logger.warn("Failed to clear old directory during seek", {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      // Recreate quality directory and move segments back
      fs.mkdirSync(oldQualityDir, { recursive: true });

      for (const segNum of segmentsToCopy) {
        const segmentFile = `segment_${segNum.toString().padStart(3, "0")}.ts`;
        const backupPath = posixPath.join(backupDir, segmentFile);
        const newPath = posixPath.join(oldQualityDir, segmentFile);

        try {
          if (fs.existsSync(backupPath)) {
            fs.renameSync(backupPath, newPath);
            // Restore segment metadata
            const oldMetadata = oldCompletedSegments.get(segNum);
            if (oldMetadata) {
              session.segmentStates.set(segNum, oldMetadata);
            }
          }
        } catch (err) {
          logger.warn("Failed to restore segment during seek", {
            sessionId,
            segmentNum: segNum,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Delete backup directory
      try {
        fs.rmdirSync(backupDir);
      } catch (err) {
        logger.warn("Failed to delete backup directory", {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      logger.info("Restored preserved segments", {
        sessionId,
        restoredCount: session.segmentStates.size,
      });
    } else {
      // No segments to preserve, just clear the directory
      try {
        this.deleteDirRecursive(oldQualityDir);
        fs.mkdirSync(oldQualityDir, { recursive: true });
        logger.debug("Cleared quality directory, no segments to preserve", {
          sessionId,
        });
      } catch (err) {
        logger.warn("Failed to clear directory during seek", {
          sessionId,
          error: err instanceof Error ? err.message : String(err),
        });
      }

      session.segmentStates = new Map();
    }

    logger.info("Session restarted from new position", {
      sessionId,
      alignedStartTime,
      startSegment: newStartSegment,
    });

    return session;
  }

  /**
   * Kill a session's FFmpeg process
   */
  async killSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    logger.info("Killing transcoding session", { sessionId });

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
    const preset =
      QUALITY_PRESETS[session.quality as keyof typeof QUALITY_PRESETS];
    const bandwidth =
      parseInt(preset.bitrate) * 1000 + parseInt(preset.audioBitrate) * 1000;

    const masterContent = `#EXTM3U
#EXT-X-VERSION:6
#EXT-X-INDEPENDENT-SEGMENTS

#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${preset.width}x${preset.height},CODECS="avc1.640028,mp4a.40.2"
${session.quality}/stream.m3u8
`;

    fs.writeFileSync(session.masterPlaylistPath, masterContent);
    logger.debug("Created master playlist", {
      sessionId: session.sessionId,
      path: session.masterPlaylistPath,
    });
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
    const segmentDuration = 4; // 4-second segments
    const startSegment = Math.floor(session.startTime / segmentDuration);

    logger.debug("Starting playlist monitor", {
      sessionId: session.sessionId,
      totalSegments: session.totalSegments,
      startSegment,
    });

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
        // Look for unrenamed segments (those that exist but aren't in completedSegments yet)
        // OPTIMIZATION: Only check a reasonable range of segments based on current progress
        // This prevents blocking the event loop with 1000+ fs calls every 500ms
        const completedCount = this.getCompletedSegmentCount(session);
        const maxSegmentToCheck = Math.min(
          completedCount + 20, // Check 20 segments ahead of current progress
          session.totalSegments - startSegment // Don't check beyond total segments
        );

        for (
          let ffmpegSegNum = 0;
          ffmpegSegNum <= maxSegmentToCheck;
          ffmpegSegNum++
        ) {
          const actualSegNum = startSegment + ffmpegSegNum;

          // Get current segment state
          const currentState = session.segmentStates.get(actualSegNum);

          // Skip if segment is already completed
          if (currentState?.state === SegmentState.COMPLETED) {
            continue;
          }

          const ffmpegPath = posixPath.join(
            qualityDir,
            `segment_${ffmpegSegNum.toString().padStart(3, "0")}.ts`
          );
          const actualPath = posixPath.join(
            qualityDir,
            `segment_${actualSegNum.toString().padStart(3, "0")}.ts`
          );

          // Check if FFmpeg's segment exists
          if (fs.existsSync(ffmpegPath)) {
            // Mark segment as transcoding if not already tracked
            if (!currentState) {
              session.segmentStates.set(actualSegNum, {
                state: SegmentState.TRANSCODING,
                startTime: Date.now(),
                retryCount: 0,
              });
            }

            // If startSegment is 0, no renaming needed - segment numbers already match timeline
            if (startSegment === 0) {
              session.segmentStates.set(actualSegNum, {
                state: SegmentState.COMPLETED,
                startTime: currentState?.startTime || Date.now(),
                completedTime: Date.now(),
                retryCount: currentState?.retryCount || 0,
              });
            } else if (!fs.existsSync(actualPath)) {
              // Need to rename: segment_000 → segment_263, etc.
              try {
                fs.renameSync(ffmpegPath, actualPath);
                session.segmentStates.set(actualSegNum, {
                  state: SegmentState.COMPLETED,
                  startTime: currentState?.startTime || Date.now(),
                  completedTime: Date.now(),
                  retryCount: currentState?.retryCount || 0,
                });
                logger.verbose("Renamed segment", {
                  sessionId: session.sessionId,
                  from: `segment_${ffmpegSegNum.toString().padStart(3, "0")}.ts`,
                  to: `segment_${actualSegNum.toString().padStart(3, "0")}.ts`,
                  progress: `${this.getCompletedSegmentCount(session)}/${session.totalSegments}`,
                });
              } catch (err) {
                // Segment might be in use by FFmpeg, will catch it next iteration
                // Don't mark as failed yet - this is expected during active transcoding
                logger.verbose("Segment rename failed, will retry", {
                  sessionId: session.sessionId,
                  segmentNum: actualSegNum,
                  error: err instanceof Error ? err.message : String(err),
                });
              }
            }
          } else if (currentState?.state === SegmentState.TRANSCODING) {
            // Segment was marked as transcoding but file doesn't exist
            // This might indicate a problem - check if it's been too long
            const elapsedTime = Date.now() - (currentState.startTime || 0);
            const SEGMENT_TIMEOUT = 60000; // 60 seconds per segment is very generous

            if (elapsedTime > SEGMENT_TIMEOUT) {
              const retryCount = currentState.retryCount || 0;

              if (retryCount < MAX_SEGMENT_RETRIES) {
                // Retry the segment
                logger.warn("Segment transcoding timeout, retrying", {
                  sessionId: session.sessionId,
                  segmentNum: actualSegNum,
                  retryCount: retryCount + 1,
                  elapsedTime,
                });

                session.segmentStates.set(actualSegNum, {
                  state: SegmentState.TRANSCODING,
                  startTime: Date.now(),
                  retryCount: retryCount + 1,
                  lastError: `Timeout after ${elapsedTime}ms`,
                });
              } else {
                // Max retries exceeded, mark as failed
                logger.error("Segment transcoding failed after max retries", {
                  sessionId: session.sessionId,
                  segmentNum: actualSegNum,
                  retryCount,
                });

                session.segmentStates.set(actualSegNum, {
                  state: SegmentState.FAILED,
                  startTime: currentState.startTime,
                  retryCount: retryCount + 1,
                  lastError: `Max retries (${MAX_SEGMENT_RETRIES}) exceeded`,
                });
              }
            }
          } else {
            // If this segment doesn't exist, no point checking higher numbers yet
            break;
          }
        }

        // Check if transcoding is complete
        const expectedSegmentCount = session.totalSegments; // Total segments for the full video
        const transcodedCount = this.getCompletedSegmentCount(session);
        const isComplete =
          transcodedCount >= expectedSegmentCount ||
          session.status === "completed";

        if (isComplete && session.playlistMonitor) {
          clearInterval(session.playlistMonitor);
          session.playlistMonitor = undefined;
          logger.info("Playlist monitor stopped - transcoding complete", {
            sessionId: session.sessionId,
            completedSegments: transcodedCount,
          });
        }
      } catch (error) {
        logger.error("Playlist monitor error", {
          sessionId: session.sessionId,
          error: error instanceof Error ? error.message : String(error),
        });
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
      playlist += `segment_${i.toString().padStart(3, "0")}.ts\n`;
    }

    // Always include ENDLIST for VOD (this gives us the seek bar!)
    playlist += `#EXT-X-ENDLIST\n`;

    // Write playlist
    fs.writeFileSync(playlistPath, playlist);
    logger.debug("Generated complete VOD playlist", {
      sessionId: session.sessionId,
      segmentRange: `0-${totalSegmentsInVideo - 1}`,
      totalSegments: totalSegmentsInVideo,
      startSegment,
    });
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
   * Cleanup inactive sessions (90 seconds)
   * Sessions are kept alive by segment requests during active playback
   * When user navigates away, no more segments = cleanup after 90s
   */
  private cleanupOldSessions(): void {
    const cutoff = Date.now() - 90 * 1000; // 90 seconds

    for (const [sessionId, session] of this.sessions) {
      if (session.lastAccess < cutoff) {
        logger.info("Cleaning up inactive session", {
          sessionId,
          lastAccessAge:
            Math.floor((Date.now() - session.lastAccess) / 1000) + " seconds",
        });
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
      logger.info("Checking for orphaned FFmpeg processes");

      // Use ps + grep + kill to find and kill all ffmpeg processes
      // We're in Docker so this is safe - only affects processes in our container
      try {
        // Find FFmpeg PIDs: ps aux | grep ffmpeg | grep -v grep | awk '{print $2}'
        const pids = execSync("ps aux | grep '[f]fmpeg' | awk '{print $2}'", {
          stdio: "pipe",
          encoding: "utf-8",
        }).trim();

        if (pids) {
          const pidArray = pids.split("\n").filter((p) => p.trim());
          logger.info("Found orphaned FFmpeg processes", {
            count: pidArray.length,
            pids: pidArray.join(", "),
          });

          // Kill each process
          for (const pid of pidArray) {
            try {
              execSync(`kill -9 ${pid}`, { stdio: "pipe" });
            } catch {
              // Process might already be dead, ignore
            }
          }
          logger.info("Killed orphaned FFmpeg processes");
        } else {
          logger.debug("No orphaned FFmpeg processes found");
        }
      } catch {
        // No processes found or error executing - both are fine
        logger.debug("No orphaned FFmpeg processes found");
      }
    } catch (error) {
      logger.error("Error checking for FFmpeg processes", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Cleanup all old transcoding data on server startup
   * Only removes the segments directory, NOT the database
   * Uses best-effort approach - doesn't fail if some files are locked
   */
  private cleanupOnStartup(): void {
    const segmentsDir = posixPath.join(this.tmpDir, "segments");

    logger.info("Cleaning up old transcoding sessions", { segmentsDir });

    try {
      if (fs.existsSync(segmentsDir)) {
        // Read all session directories
        const sessions = fs.readdirSync(segmentsDir);

        logger.info("Found old sessions to clean up", {
          count: sessions.length,
        });

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
            logger.warn("Failed to delete old session directory", {
              sessionDir,
              error: err instanceof Error ? err.message : String(err),
            });
            errorCount++;
            // Continue with next session even if this one failed
          }
        }

        logger.info("Cleanup complete", {
          deleted: successCount,
          failed: errorCount,
        });
      } else {
        logger.debug("No existing segments directory to clean up");
      }
    } catch (error) {
      logger.error("Error during startup cleanup", {
        error: error instanceof Error ? error.message : String(error),
      });
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
            } catch {
              // Might not be empty yet, ignore
            }
          } else {
            // Delete file
            fs.unlinkSync(fullPath);
          }
        } catch (err) {
          // File might be locked, skip it
          logger.verbose("Could not delete file during cleanup", {
            path: fullPath,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Finally try to remove the directory itself
      fs.rmdirSync(dirPath);
    } catch {
      // Best effort - if we can't delete everything, that's ok
    }
  }

  /**
   * Get count of completed segments for a session
   */
  private getCompletedSegmentCount(session: TranscodingSession): number {
    let count = 0;
    for (const [, metadata] of session.segmentStates) {
      if (metadata.state === SegmentState.COMPLETED) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get segment state information for a session
   */
  getSegmentStates(
    sessionId: string
  ): Map<number, SegmentMetadata> | undefined {
    const session = this.sessions.get(sessionId);
    return session?.segmentStates;
  }

  /**
   * Get statistics for monitoring and debugging
   */
  getStats() {
    const sessions = Array.from(this.sessions.values());
    return {
      activeSessions: this.sessions.size,
      totalSessionsCreated: this.totalSessionsCreated,
      sessions: sessions.map((session) => ({
        sessionId: session.sessionId,
        sceneId: session.videoId,
        quality: session.quality,
        status: session.status,
        startTime: new Date(
          session.lastAccess - (Date.now() - session.lastAccess)
        ).toISOString(),
        lastAccess: new Date(session.lastAccess).toISOString(),
        totalSegments: session.totalSegments,
        completedSegments: this.getCompletedSegmentCount(session),
        ffmpegProcess: session.process
          ? {
              pid: session.process.pid,
              killed: session.process.killed,
            }
          : null,
      })),
    };
  }
}

// Singleton instance
export const transcodingManager = new TranscodingManager(
  process.env.CONFIG_DIR || "/app/data"
);
