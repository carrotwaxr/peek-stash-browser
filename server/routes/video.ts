import express from "express";
import {
  streamHLS,
  streamHLSSegment,
  getCaption,
  proxyStashStream,
} from "../controllers/video.js";

const router = express.Router();

// NEW: Stash stream proxy - forwards ALL stream requests to Stash
// This is the new architecture that replaces Peek's TranscodingManager
// :streamPath matches the file being requested (stream, stream.m3u8, stream.mp4, etc.)
router.get("/scene/:sceneId/proxy-stream/:streamPath", proxyStashStream);

// OLD: Peek-managed transcoding (will be deprecated)
// Stateless HLS streaming (Stash-style) - no auth required, similar to Stash
router.get("/scene/:sceneId/stream", streamHLS);  // Direct video or HLS manifest
router.get("/scene/:sceneId/stream.m3u8", streamHLS);  // Explicit HLS manifest
router.get("/scene/:sceneId/:segment.ts", streamHLSSegment);  // HLS segments (segment_000.ts, etc.)

// Caption/subtitle proxy
router.get("/scene/:sceneId/caption", getCaption);  // Subtitle files (VTT/SRT)

export default router;
