import express from "express";
import {
  streamHLS,
  streamHLSSegment,
  getCaption,
} from "../controllers/video.js";

const router = express.Router();

// Stateless HLS streaming (Stash-style) - no auth required, similar to Stash
router.get("/scene/:sceneId/stream", streamHLS);  // Direct video or HLS manifest
router.get("/scene/:sceneId/stream.m3u8", streamHLS);  // Explicit HLS manifest
router.get("/scene/:sceneId/:segment.ts", streamHLSSegment);  // HLS segments (segment_000.ts, etc.)

// Caption/subtitle proxy
router.get("/scene/:sceneId/caption", getCaption);  // Subtitle files (VTT/SRT)

export default router;
