import express from "express";
import {
  createExternalPlayerLink,
  getCaption,
  proxyStashStream,
} from "../controllers/video.js";
import { authenticate } from "../middleware/auth.js";
import { authenticateStreamRequest } from "../middleware/streamAuth.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// Every route here needs a Peek session, or on the direct stream a signed
// link (authenticateStreamRequest). Guarded per route rather than with
// router.use: this router is mounted on /api last, so a router-wide
// authenticate would turn every unmatched /api/* 404 into a 401.

// Stash stream proxy - forwards ALL stream requests to Stash
// Two routes to handle both single-segment and multi-segment paths:
//   /scene/123/proxy-stream/stream.m3u8 -> streamPath = "stream.m3u8"
//   /scene/123/proxy-stream/stream.m3u8/0.ts -> streamPath = "stream.m3u8", subPath = "0.ts"
router.get(
  "/scene/:sceneId/proxy-stream/:streamPath/:subPath",
  authenticateStreamRequest,
  authenticated(proxyStashStream)
);
router.get(
  "/scene/:sceneId/proxy-stream/:streamPath",
  authenticateStreamRequest,
  authenticated(proxyStashStream)
);

// Caption/subtitle proxy
router.get("/scene/:sceneId/caption", authenticate, authenticated(getCaption));

// Personal signed link for the external player button
router.post(
  "/scene/:sceneId/external-player-link",
  authenticate,
  authenticated(createExternalPlayerLink)
);

export default router;
