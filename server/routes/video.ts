import express from "express";
import { proxyScenePoster } from "../controllers/proxy.js";
import {
  createExternalPlayerLink,
  createSceneMediaLink,
  getCaption,
  proxyStashStream,
} from "../controllers/video.js";
import { authenticate } from "../middleware/auth.js";
import {
  authenticateCaptionRequest,
  authenticatePosterRequest,
  authenticateStreamRequest,
} from "../middleware/streamAuth.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// Every route here needs a Peek session, or on the stream, caption and poster
// routes a signed link (authenticateStreamRequest, authenticateCaptionRequest,
// authenticatePosterRequest; see middleware/streamAuth.ts for what each link
// opens). Guarded per route rather than with router.use: this router is mounted on /api last, so a router-wide
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
router.get(
  "/scene/:sceneId/caption",
  authenticateCaptionRequest,
  authenticated(getCaption)
);

// Scene poster (Stash's screenshot), for a Cast receiver's media link too
router.get(
  "/scene/:sceneId/poster",
  authenticatePosterRequest,
  authenticated(proxyScenePoster)
);

// Personal signed link for the external player button
router.post(
  "/scene/:sceneId/external-player-link",
  authenticate,
  authenticated(createExternalPlayerLink)
);

// One signed media link per scene: Direct and HLS, captions and poster, for a
// Cast receiver or Safari's native player
router.post(
  "/scene/:sceneId/media-link",
  authenticate,
  authenticated(createSceneMediaLink)
);

export default router;
