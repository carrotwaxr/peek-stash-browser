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
  backgroundTranscoding?: boolean; // Track if background transcoding is active
  currentSegment?: number; // Track which segment we're transcoding in background
}

export interface VideoSegment {
  videoId: string;
  startTime: number;
  qualities: string[];
  outputDir: string;
  status: "transcoding" | "completed" | "abandoned";
  lastAccess: number;
}

interface GetFfmpegSettingsParams {
  startTime: number;
  sceneFilePath: string;
  qualityDir: string;
  segmentNumber: number;
}

// FFmpeg arguments for segment transcoding
// NOTE: Timestamp issue - see TRANSCODING_TIMESTAMP_DEBUG_SUMMARY.md for details
// All attempts to reset timestamps to 0 have failed so far
/*const args = [
      "-ss",
      startTime.toString(), // Seek to segment start time (fast seek)
      "-i",
      sceneFilePath,
      "-t",
      segmentDuration.toString(), // Duration of this segment
      // Video encoding
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast", // Fastest preset for real-time transcoding
      "-tune",
      "zerolatency", // Optimize for low latency
      "-crf",
      "26", // Constant quality mode
      "-profile:v",
      "baseline", // Most compatible profile
      "-level:v",
      "3.0",
      "-pix_fmt",
      "yuv420p", // Standard pixel format
      "-vf",
      `scale=${preset.width}:${preset.height}`, // Scale to target resolution
      "-maxrate",
      preset.bitrate,
      "-bufsize",
      `${parseInt(preset.bitrate) * 2}k`, // 2x bitrate for buffer
      "-g",
      "120", // GOP size (keyframe every 5 seconds)
      "-keyint_min",
      "120",
      "-sc_threshold",
      "0", // Disable scene change detection
      "-bf",
      "0", // No B-frames for faster encoding
      "-threads",
      "0", // Use all available CPU cores
      // Audio encoding
      "-c:a",
      "aac",
      "-b:a",
      preset.audioBitrate,
      "-ar",
      "48000", // 48kHz sample rate
      "-ac",
      "2", // Stereo
      // Output format
      "-f",
      "mpegts", // MPEG-TS container
      "-y", // Overwrite output file
      segmentPath,
    ];*/

const getFfmpegSettings = ({
  startTime,
  sceneFilePath,
  qualityDir,
  segmentNumber,
}: GetFfmpegSettingsParams) => {
  const ffmpegArgs = {
    ss: startTime.toString(), // Seek to start time
    i: sceneFilePath,
    "c:v": "libx264",
    preset: "ultrafast", // Fastest encoding for immediate playback
    crf: "23",
    g: "48", // GOP size (2 seconds at 24fps)
    keyint_min: "48",
    sc_threshold: "0",
    "c:a": "aac",
    "b:a": "128k",
    ar: "48000",
    f: "hls",
    hls_time: "4", // 4-second segments
    hls_list_size: "0",
    hls_segment_filename: path.posix.join(qualityDir, "segment_%03d.ts"),
    hls_playlist_type: "vod",
    hls_flags: "independent_segments",
    start_number: segmentNumber.toString(),
  };

  const stringifiedArgs = Object.entries(ffmpegArgs)
    .flatMap(([key, value]) => {
      return `-${key} ${value}`;
    })
    .join(" ");

  return `ffmpeg ${stringifiedArgs}`;
};

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
      qualities: ["480p"], // Use 480p for faster transcoding during testing
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
   * Pre-generates complete VOD playlists then pre-transcodes initial segments
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

      // Get video duration from scene metadata
      const duration = session.scene?.files?.[0]?.duration || 0;
      if (!duration) {
        throw new Error("Cannot generate VOD playlist without video duration");
      }

      // PRE-GENERATE complete VOD playlists for all qualities
      // This gives the player full seeking capability from the start
      const segmentDuration = 4; // seconds per segment (increased from 2s for better efficiency)
      const totalSegments = Math.ceil(duration / segmentDuration);

      console.log(
        `Pre-generating VOD playlists for ${duration}s video (${totalSegments} segments)`
      );

      for (const quality of session.qualities) {
        const qualityDir = posixPath.join(session.outputDir, quality);
        const playlistPath = posixPath.join(qualityDir, "index.m3u8");

        // Generate complete VOD playlist
        let playlist = "#EXTM3U\n";
        playlist += "#EXT-X-VERSION:6\n";
        playlist += "#EXT-X-TARGETDURATION:5\n";
        playlist += "#EXT-X-MEDIA-SEQUENCE:0\n";
        playlist += "#EXT-X-PLAYLIST-TYPE:VOD\n";
        playlist += "#EXT-X-INDEPENDENT-SEGMENTS\n";

        // Add all segments to playlist
        for (let i = 0; i < totalSegments; i++) {
          const segmentDur =
            i === totalSegments - 1
              ? duration - i * segmentDuration // Last segment might be shorter
              : segmentDuration;

          playlist += `#EXTINF:${segmentDur.toFixed(6)},\n`;
          playlist += `segment_${String(i).padStart(3, "0")}.ts\n`;
        }

        playlist += "#EXT-X-ENDLIST\n";

        fs.writeFileSync(playlistPath, playlist);
        console.log(
          `Generated complete VOD playlist: ${playlistPath} (${totalSegments} segments)`
        );
      }

      // Create master playlist
      this.createMasterPlaylist(session);

      session.status = "active";
      console.log(
        `Session ${session.sessionId} ready - pre-transcoding initial segments`
      );

      // PRE-TRANSCODE first 12 segments (48 seconds) to build initial buffer
      // Increased to ensure smooth playback start, especially over network
      const { translateStashPath } = await import("../utils/pathMapping.js");
      const absoluteSceneFilePath = translateStashPath(sceneFilePath);

      const preTranscodeCount = 12; // Pre-transcode 48 seconds
      for (const quality of session.qualities) {
        console.log(
          `Pre-transcoding first ${preTranscodeCount} segments for ${quality}...`
        );

        // Transcode segments sequentially
        for (let i = 0; i < Math.min(preTranscodeCount, totalSegments); i++) {
          const segmentStartTime = session.startTime + i * segmentDuration;

          try {
            await this.transcodeSpecificSegment(
              session,
              quality,
              i,
              segmentStartTime,
              absoluteSceneFilePath
            );
          } catch (error) {
            console.error(`Failed to pre-transcode segment ${i}:`, error);
            // Continue with next segment even if one fails
          }
        }

        console.log(`Pre-transcoding complete for ${quality}`);
      }

      // Start continuous background transcoding to stay ahead of playback
      session.currentSegment = preTranscodeCount;
      session.backgroundTranscoding = true;
      this.startBackgroundTranscoding(
        session,
        absoluteSceneFilePath,
        totalSegments
      );
    } catch (error) {
      console.error("Error starting transcoding:", error);
      session.status = "error";
      throw error;
    }
  }

  /**
   * Continuously transcode segments in the background to stay ahead of playback
   * Transcodes 4 segments in parallel for better performance
   */
  private async startBackgroundTranscoding(
    session: TranscodingSession,
    sceneFilePath: string,
    totalSegments: number
  ): Promise<void> {
    const segmentDuration = 4;
    const parallelCount = 4; // Transcode 4 segments at once for faster throughput

    console.log(
      `Starting background transcoding from segment ${session.currentSegment}`
    );

    // Transcode remaining segments in background
    while (
      session.backgroundTranscoding &&
      session.currentSegment !== undefined &&
      session.currentSegment < totalSegments
    ) {
      // Transcode multiple segments in parallel
      const transcodePromises: Promise<void>[] = [];

      for (let p = 0; p < parallelCount; p++) {
        const segmentNumber = session.currentSegment! + p;

        // Stop if we've reached the end
        if (segmentNumber >= totalSegments) break;

        for (const quality of session.qualities) {
          const qualityDir = posixPath.join(session.outputDir, quality);
          const segmentFileName = `segment_${String(segmentNumber).padStart(
            3,
            "0"
          )}.ts`;
          const segmentPath = posixPath.join(qualityDir, segmentFileName);

          // Skip if already exists
          if (fs.existsSync(segmentPath)) {
            continue;
          }

          const segmentStartTime =
            session.startTime + segmentNumber * segmentDuration;

          // Add to parallel transcode queue
          transcodePromises.push(
            this.transcodeSpecificSegment(
              session,
              quality,
              segmentNumber,
              segmentStartTime,
              sceneFilePath
            ).catch((error) => {
              console.error(
                `Background transcode failed for segment ${segmentNumber}:`,
                error
              );
            })
          );
        }
      }

      // Wait for all parallel transcodes to complete
      if (transcodePromises.length > 0) {
        await Promise.all(transcodePromises);
      }

      // Move to next batch
      session.currentSegment += parallelCount;

      // Check if session is still active (not killed/abandoned)
      if (!this.sessions.has(session.sessionId)) {
        console.log(
          `Session ${session.sessionId} no longer exists, stopping background transcoding`
        );
        break;
      }
    }

    // Mark session as completed when all segments are transcoded
    if (session.currentSegment && session.currentSegment >= totalSegments) {
      session.status = "completed";
      session.backgroundTranscoding = false;
      this.markSegmentCompleted(session.videoId, session.startTime);
      console.log(
        `Background transcoding complete for session ${session.sessionId}`
      );
    }
  }

  /**
   * Start transcoding for a specific quality
   * Playlist is already pre-generated, just transcode segments
   */
  private async startQualityTranscoding(
    session: TranscodingSession,
    quality: string,
    sceneFilePath: string
  ): Promise<void> {
    const preset = QUALITY_PRESETS[quality as keyof typeof QUALITY_PRESETS];
    const qualityDir = posixPath.join(session.outputDir, quality);

    // Playlist already exists - we pre-generated it
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
      `${parseInt(preset.bitrate) * 1}k`,
      "-g",
      "48", // GOP size (2 seconds at 24fps)
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
      "2", // 2-second segments
      "-hls_list_size",
      "0",
      "-hls_segment_filename",
      posixPath.join(qualityDir, "segment_%03d.ts"),
      "-hls_flags",
      "independent_segments+temp_file+omit_endlist", // omit_endlist: don't overwrite our pre-generated playlist
      "-hls_allow_cache",
      "1",
      "-y", // Overwrite output files
      playlistPath,
    ];

    return new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", args);
      let resolved = false;
      let ffmpegStarted = false;

      ffmpeg.stderr.on("data", (data) => {
        const output = data.toString().trim();

        // Log non-verbose output
        if (output.length > 0 && !output.includes("frame=")) {
          console.log(`FFmpeg [${quality}] ${session.sessionId}: ${output}`);
        }

        // Resolve once FFmpeg starts outputting (playlist already exists)
        if (!ffmpegStarted && output.includes("Output #0")) {
          ffmpegStarted = true;
          console.log(`FFmpeg [${quality}] started for ${session.sessionId}`);
          if (!resolved) {
            resolved = true;
            resolve();
          }
        }
      });

      ffmpeg.on("close", (code) => {
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
        console.error(`FFmpeg [${quality}] ${session.sessionId} error:`, error);
        session.processes.delete(quality);
        session.status = "error";
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      });

      session.processes.set(quality, ffmpeg);

      // Fallback timeout
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          reject(new Error(`Timeout waiting for FFmpeg to start: ${quality}`));
        }
      }, 15000);
    });
  }

  /**
   * Transcode a specific segment on-demand with read-ahead buffering
   * This enables instant seeking anywhere in the video
   */
  async transcodeSegmentOnDemand(
    sessionId: string,
    quality: string,
    segmentNumber: number
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!session.scene) {
      throw new Error(`Session ${sessionId} has no scene metadata`);
    }

    // Calculate time offset for this segment (4 seconds per segment)
    const segmentDuration = 4;
    const segmentStartTime =
      session.startTime + segmentNumber * segmentDuration;

    // Get scene file path
    const sceneFilePath = session.scene.files?.[0]?.path;
    if (!sceneFilePath) {
      throw new Error(`Session ${sessionId} has no scene file path`);
    }

    // Translate path using the same logic as the video controller
    const { translateStashPath } = await import("../utils/pathMapping.js");
    const absoluteSceneFilePath = translateStashPath(sceneFilePath);

    // Check if segment already exists or is being transcoded
    const qualityDir = posixPath.join(session.outputDir, quality);
    const segmentFileName = `segment_${String(segmentNumber).padStart(
      3,
      "0"
    )}.ts`;
    const segmentPath = posixPath.join(qualityDir, segmentFileName);

    if (fs.existsSync(segmentPath)) {
      console.log(
        `Segment ${segmentNumber} already exists, skipping transcode`
      );
      return;
    }

    // Check if already being transcoded (process exists for this segment)
    const processKey = `${quality}_seg_${segmentNumber}`;
    if (session.processes.has(processKey)) {
      console.log(
        `Segment ${segmentNumber} already being transcoded, skipping`
      );
      return;
    }

    console.log(
      `Transcoding segment ${segmentNumber} on-demand (time: ${segmentStartTime}s)`
    );

    // Transcode this specific segment
    await this.transcodeSpecificSegment(
      session,
      quality,
      segmentNumber,
      segmentStartTime,
      absoluteSceneFilePath
    );

    // Read-ahead: Transcode the next 6 segments ahead
    const readAheadCount = 6; // Transcode 6 segments ahead (24 seconds of video)
    for (let i = 1; i <= readAheadCount; i++) {
      const aheadSegmentNumber = segmentNumber + i;
      const aheadSegmentFileName = `segment_${String(
        aheadSegmentNumber
      ).padStart(3, "0")}.ts`;
      const aheadSegmentPath = posixPath.join(qualityDir, aheadSegmentFileName);

      // Only transcode if segment doesn't exist and isn't being transcoded
      if (
        !fs.existsSync(aheadSegmentPath) &&
        !session.processes.has(`${quality}_seg_${aheadSegmentNumber}`)
      ) {
        const aheadStartTime =
          session.startTime + aheadSegmentNumber * segmentDuration;

        console.log(
          `Read-ahead: transcoding segment ${aheadSegmentNumber} (time: ${aheadStartTime}s)`
        );

        // Don't await - let these transcode in background
        this.transcodeSpecificSegment(
          session,
          quality,
          aheadSegmentNumber,
          aheadStartTime,
          absoluteSceneFilePath
        ).catch((err) => {
          console.error(
            `Read-ahead transcode failed for segment ${aheadSegmentNumber}:`,
            err
          );
        });
      }
    }
  }

  /**
   * Transcode a specific segment using FFmpeg with precise seeking
   */
  private async transcodeSpecificSegment(
    session: TranscodingSession,
    quality: string,
    segmentNumber: number,
    startTime: number,
    sceneFilePath: string
  ): Promise<void> {
    const preset = QUALITY_PRESETS[quality as keyof typeof QUALITY_PRESETS];
    const qualityDir = posixPath.join(session.outputDir, quality);
    const segmentFileName = `segment_${String(segmentNumber).padStart(
      3,
      "0"
    )}.ts`;
    const segmentPath = posixPath.join(qualityDir, segmentFileName);

    // Ensure quality directory exists
    fs.mkdirSync(qualityDir, { recursive: true });

    const segmentDuration = 4; // 4 seconds per segment

    // FFmpeg arguments for segment transcoding
    // NOTE: Timestamp issue - see TRANSCODING_TIMESTAMP_DEBUG_SUMMARY.md for details
    // All attempts to reset timestamps to 0 have failed so far
    const args = [
      "-ss",
      startTime.toString(), // Seek to segment start time (fast seek)
      "-i",
      sceneFilePath,
      "-t",
      segmentDuration.toString(), // Duration of this segment
      // Video encoding
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast", // Fastest preset for real-time transcoding
      "-tune",
      "zerolatency", // Optimize for low latency
      "-crf",
      "26", // Constant quality mode
      "-profile:v",
      "baseline", // Most compatible profile
      "-level:v",
      "3.0",
      "-pix_fmt",
      "yuv420p", // Standard pixel format
      "-vf",
      `scale=${preset.width}:${preset.height}`, // Scale to target resolution
      "-maxrate",
      preset.bitrate,
      "-bufsize",
      `${parseInt(preset.bitrate) * 2}k`, // 2x bitrate for buffer
      "-g",
      "120", // GOP size (keyframe every 5 seconds)
      "-keyint_min",
      "120",
      "-sc_threshold",
      "0", // Disable scene change detection
      "-bf",
      "0", // No B-frames for faster encoding
      "-threads",
      "0", // Use all available CPU cores
      // Audio encoding
      "-c:a",
      "aac",
      "-b:a",
      preset.audioBitrate,
      "-ar",
      "48000", // 48kHz sample rate
      "-ac",
      "2", // Stereo
      // Output format
      "-f",
      "mpegts", // MPEG-TS container
      "-y", // Overwrite output file
      segmentPath,
    ];

    return new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn("ffmpeg", args);
      const processKey = `${quality}_seg_${segmentNumber}`;
      let resolved = false;

      ffmpeg.stderr.on("data", (data) => {
        const output = data.toString().trim();

        // Log progress for debugging (only key messages)
        if (output.includes("time=") || output.includes("Output #0")) {
          console.log(`FFmpeg [${quality}] seg ${segmentNumber}: ${output}`);
        }
      });

      ffmpeg.on("close", (code) => {
        session.processes.delete(processKey);

        if (code === 0) {
          console.log(
            `Segment ${segmentNumber} [${quality}] transcoded successfully`
          );
          if (!resolved) {
            resolved = true;
            resolve();
          }
        } else {
          console.error(
            `Segment ${segmentNumber} [${quality}] failed with code ${code}`
          );
          if (!resolved) {
            resolved = true;
            reject(new Error(`FFmpeg exited with code ${code}`));
          }
        }
      });

      ffmpeg.on("error", (error) => {
        console.error(
          `FFmpeg segment ${segmentNumber} [${quality}] error:`,
          error
        );
        session.processes.delete(processKey);
        if (!resolved) {
          resolved = true;
          reject(error);
        }
      });

      // Track this process
      session.processes.set(processKey, ffmpeg);

      // Timeout for segment transcoding (120 seconds max)
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          session.processes.delete(processKey);
          ffmpeg.kill("SIGTERM");
          reject(new Error(`Timeout transcoding segment ${segmentNumber}`));
        }
      }, 120000);
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

    // Stop background transcoding
    if (session.backgroundTranscoding) {
      console.log(`Stopping background transcoding for session ${sessionId}`);
      session.backgroundTranscoding = false;
    }

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
  process.env.CONFIG_DIR || "/app/data"
);
