/**
 * FFmpeg output parser and logger
 *
 * FFmpeg produces extremely verbose output. This utility:
 * - Parses stderr for meaningful information
 * - Extracts progress info (time, speed, fps)
 * - Filters out noise and repetitive messages
 * - Logs only important events at appropriate levels
 */

import { logger } from "./logger.js";

export interface FFmpegProgress {
  frame?: number;
  fps?: number;
  time?: string;
  speed?: number;
  bitrate?: string;
}

/**
 * Parse FFmpeg progress line
 * Example: "frame= 1234 fps= 45 q=28.0 size= 12345kB time=00:00:51.23 bitrate=1234.5kbits/s speed=1.5x"
 */
export function parseFFmpegProgress(line: string): FFmpegProgress | null {
  if (!line.includes("frame=")) {
    return null;
  }

  const frameMatch = line.match(/frame=\s*(\d+)/);
  const fpsMatch = line.match(/fps=\s*([\d.]+)/);
  const timeMatch = line.match(/time=(\d+:\d+:[\d.]+)/);
  const speedMatch = line.match(/speed=\s*([\d.]+)x/);
  const bitrateMatch = line.match(/bitrate=\s*([\d.]+\w+)/);

  return {
    frame: frameMatch ? parseInt(frameMatch[1]) : undefined,
    fps: fpsMatch ? parseFloat(fpsMatch[1]) : undefined,
    time: timeMatch ? timeMatch[1] : undefined,
    speed: speedMatch ? parseFloat(speedMatch[1]) : undefined,
    bitrate: bitrateMatch ? bitrateMatch[1] : undefined,
  };
}

/**
 * Handle FFmpeg stderr output
 * Parses and logs only meaningful information
 */
export function handleFFmpegOutput(
  sessionId: string,
  data: Buffer | string
): void {
  const output = data.toString().trim();

  // Skip empty lines
  if (output.length === 0) {
    return;
  }

  // Log errors at ERROR level
  if (output.includes("error") || output.includes("Error")) {
    logger.error(`FFmpeg error in session ${sessionId}`, { output });
    return;
  }

  // Log important startup messages at INFO level
  if (output.includes("Output #0")) {
    logger.info(`FFmpeg output started for session ${sessionId}`);
    return;
  }

  // Parse and log progress at INFO level (throttled by caller)
  const progress = parseFFmpegProgress(output);
  if (progress && progress.time && progress.speed) {
    logger.info(
      `FFmpeg progress in session ${sessionId}: time=${progress.time} speed=${progress.speed}x fps=${progress.fps || "?"}`
    );
    return;
  }

  // Log all other FFmpeg output at VERBOSE level only
  logger.verbose(`FFmpeg output in session ${sessionId}`, { output });
}

/**
 * Create throttled FFmpeg output handler with progress smoothing
 * Only logs progress updates at specified interval to avoid spam
 * Tracks progress over time and reports average speed
 */
export function createThrottledFFmpegHandler(
  sessionId: string,
  intervalMs: number = 30000
): (data: Buffer | string) => void {
  let lastProgressLog = 0;
  let progressSamples: { time: number; speed: number; fps: number }[] = [];

  return (data: Buffer | string) => {
    const output = data.toString().trim();

    // Always log errors immediately
    if (output.includes("error") || output.includes("Error")) {
      handleFFmpegOutput(sessionId, output);
      return;
    }

    // Log important messages immediately
    if (output.includes("Output #0")) {
      handleFFmpegOutput(sessionId, output);
      return;
    }

    // Collect progress samples for smoothing
    const progress = parseFFmpegProgress(output);
    if (progress && progress.speed !== undefined && progress.fps !== undefined) {
      const now = Date.now();

      // Collect sample
      progressSamples.push({
        time: now,
        speed: progress.speed,
        fps: progress.fps,
      });

      // Log averaged progress at specified interval
      if (now - lastProgressLog >= intervalMs) {
        // Calculate averages from samples
        const avgSpeed = progressSamples.reduce((sum, s) => sum + s.speed, 0) / progressSamples.length;
        const avgFps = progressSamples.reduce((sum, s) => sum + s.fps, 0) / progressSamples.length;

        logger.info(
          `FFmpeg progress in session ${sessionId}: time=${progress.time} avgSpeed=${avgSpeed.toFixed(2)}x avgFps=${avgFps.toFixed(1)} (${progressSamples.length} samples over ${intervalMs / 1000}s)`
        );

        // Reset for next interval
        progressSamples = [];
        lastProgressLog = now;
      }
      return;
    }

    // Everything else goes to verbose
    logger.verbose(`FFmpeg output in session ${sessionId}`, { output });
  };
}
