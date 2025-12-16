import express from "express";
import {
  getCaption,
  proxyStashStream,
} from "../controllers/video.js";

const router = express.Router();

// Stash stream proxy - forwards ALL stream requests to Stash
// Two routes to handle both single-segment and multi-segment paths:
//   /scene/123/proxy-stream/stream.m3u8 -> streamPath = "stream.m3u8"
//   /scene/123/proxy-stream/stream/segment_0.ts -> streamPath = "stream", subPath = "segment_0.ts"
router.get("/scene/:sceneId/proxy-stream/:streamPath/:subPath", proxyStashStream);
router.get("/scene/:sceneId/proxy-stream/:streamPath", proxyStashStream);

// Caption/subtitle proxy
router.get("/scene/:sceneId/caption", getCaption);

export default router;
