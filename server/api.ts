import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  getStreamSegment,
  playVideo,
  seekVideo,
  getSessionStatus,
  getSegmentStates,
  killSession,
} from "./controllers/video.js";
import {
  findScenes,
  findPerformers,
  findStudios,
  findTags,
  findPerformersMinimal,
  findStudiosMinimal,
  findTagsMinimal,
  updateScene,
  updatePerformer,
  updateStudio,
  updateTag,
} from "./controllers/library.js";
import { proxyStashMedia } from "./controllers/proxy.js";
import * as statsController from "./controllers/stats.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/user.js";
import playlistRoutes from "./routes/playlist.js";
import watchHistoryRoutes from "./routes/watchHistory.js";
import ratingsRoutes from "./routes/ratings.js";
import setupRoutes from "./routes/setup.js";
import { authenticateToken, requireCacheReady } from "./middleware/auth.js";
import { logger } from "./utils/logger.js";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const setupAPI = () => {
  const app = express();
  app.use(
    cors({
      credentials: true,
      origin: ["http://localhost:5173", "http://localhost:6969"], // Add your client URLs
    })
  );
  app.use(express.json()); // Add JSON body parsing for POST/PUT requests
  app.use(cookieParser()); // Parse cookies for JWT

  // Health check endpoint (no auth required)
  app.get("/api/health", (req, res) => {
    res.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || "1.0.0",
    });
  });

  // Version endpoint (no auth required)
  app.get("/api/version", (req, res) => {
    // Read version from package.json (use process.cwd() for reliable path resolution)
    const packagePath = path.join(process.cwd(), 'package.json');

    let version = "1.0.0";
    try {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
      version = packageJson.version;
    } catch (err) {
      logger.error('Failed to read package.json version:', {
        error: err,
        packagePath,
        cwd: process.cwd(),
        __dirname
      });
    }

    res.json({
      server: version,
      buildDate: process.env.BUILD_DATE || new Date().toISOString(),
    });
  });

  // Server stats endpoint (admin only - authenticated)
  app.get("/api/stats", authenticateToken, statsController.getStats);

  // Media proxy (public - no auth required for images)
  app.get("/api/proxy/stash", proxyStashMedia);

  // Public authentication routes (no auth required for these)
  app.use("/api/auth", authRoutes);

  // Setup wizard routes (mixed - some public for initial setup, some protected for settings)
  app.use("/api/setup", setupRoutes);

  // User settings routes (protected)
  app.use("/api/user", userRoutes);

  // Playlist routes (protected)
  app.use("/api/playlists", playlistRoutes);

  // Watch history routes (protected)
  app.use("/api/watch-history", watchHistoryRoutes);

  // Rating and favorite routes (protected)
  app.use("/api/ratings", ratingsRoutes);

  // New filtered search endpoints (protected + require cache ready)
  app.post("/api/library/scenes", authenticateToken, requireCacheReady, findScenes);
  app.post("/api/library/performers", authenticateToken, requireCacheReady, findPerformers);
  app.post("/api/library/studios", authenticateToken, requireCacheReady, findStudios);
  app.post("/api/library/tags", authenticateToken, requireCacheReady, findTags);

  // Minimal data endpoints for filter dropdowns (id + name only)
  app.post("/api/library/performers/minimal", authenticateToken, requireCacheReady, findPerformersMinimal);
  app.post("/api/library/studios/minimal", authenticateToken, requireCacheReady, findStudiosMinimal);
  app.post("/api/library/tags/minimal", authenticateToken, requireCacheReady, findTagsMinimal);

  // Update endpoints for CRUD operations
  app.put("/api/library/scenes/:id", authenticateToken, updateScene);
  app.put("/api/library/performers/:id", authenticateToken, updatePerformer);
  app.put("/api/library/studios/:id", authenticateToken, updateStudio);
  app.put("/api/library/tags/:id", authenticateToken, updateTag);

  // Video playback endpoints (protected)
  app.get("/api/video/play", authenticateToken, playVideo); // New endpoint with query params

  // Session management endpoints (protected)
  app.post("/api/video/seek", authenticateToken, seekVideo);
  app.get(
    "/api/video/session/:sessionId/status",
    authenticateToken,
    getSessionStatus
  );
  app.get(
    "/api/video/session/:sessionId/segments",
    authenticateToken,
    getSegmentStates
  );
  app.delete("/api/video/session/:sessionId", authenticateToken, killSession);

  // HLS playlist and segment serving (no auth required - sessionId acts as token)
  app.get("/api/video/playlist/:sessionId/:quality/:file", getStreamSegment);
  app.get("/api/video/playlist/:sessionId/:file", getStreamSegment);

  // Legacy segment endpoint (keeping for compatibility, no auth required)
  app.get("/api/stream/:videoId/:segment", getStreamSegment);
  app.listen(8000, () => {
    logger.info("Server is running", {
      url: "http://localhost:8000",
      transcodingSystem: "session-based",
    });
  });

  return app;
};
