import express from "express";
import {
  getCaption,
  proxyStashStream,
} from "../controllers/video.js";

const router = express.Router();

// Stash stream proxy - forwards ALL stream requests to Stash
// :streamPath matches the file being requested (stream, stream.m3u8, stream.mp4, etc.)
router.get("/scene/:sceneId/proxy-stream/:streamPath", proxyStashStream);

// Caption/subtitle proxy
router.get("/scene/:sceneId/caption", getCaption);

export default router;
