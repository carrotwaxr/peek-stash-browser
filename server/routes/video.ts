import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  getStreamSegment,
  playVideo,
  seekVideo,
  getSessionStatus,
  getSegmentStates,
  killSession,
} from "../controllers/video.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// Video playback endpoint (protected)
// Note: playVideo doesn't use authenticated() wrapper because it has custom params typing
// eslint-disable-next-line @typescript-eslint/no-explicit-any
router.get("/video/play", authenticateToken, playVideo as any);

// Session management endpoints (protected)
router.post("/video/seek", authenticateToken, authenticated(seekVideo));
router.get(
  "/video/session/:sessionId/status",
  authenticateToken,
  authenticated(getSessionStatus)
);
router.get(
  "/video/session/:sessionId/segments",
  authenticateToken,
  authenticated(getSegmentStates)
);
router.delete(
  "/video/session/:sessionId",
  authenticateToken,
  authenticated(killSession)
);

// HLS playlist and segment serving (no auth required - sessionId acts as token)
router.get("/video/playlist/:sessionId/:quality/:file", getStreamSegment);
router.get("/video/playlist/:sessionId/:file", getStreamSegment);

// Legacy segment endpoint (keeping for compatibility, no auth required)
router.get("/stream/:videoId/:segment", getStreamSegment);

export default router;
