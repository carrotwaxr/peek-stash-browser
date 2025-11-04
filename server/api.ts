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
  findSimilarScenes,
  getRecommendedScenes,
  findPerformers,
  findStudios,
  findTags,
  findGroups,
  findGalleries,
  findGalleryById,
  findPerformersMinimal,
  findStudiosMinimal,
  findTagsMinimal,
  findGroupsMinimal,
  findGalleriesMinimal,
  updateScene,
  updatePerformer,
  updateStudio,
  updateTag,
  getGalleryImages,
} from "./controllers/library/index.js";
import { proxyStashMedia } from "./controllers/proxy.js";
import * as statsController from "./controllers/stats.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/user.js";
import playlistRoutes from "./routes/playlist.js";
import watchHistoryRoutes from "./routes/watchHistory.js";
import ratingsRoutes from "./routes/ratings.js";
import setupRoutes from "./routes/setup.js";
import customThemeRoutes from "./routes/customTheme.js";
import {
  authenticateToken,
  requireCacheReady,
  requireAdmin,
} from "./middleware/auth.js";
import { logger } from "./utils/logger.js";
import { authenticated } from "./utils/routeHelpers.js";

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
    const packagePath = path.join(process.cwd(), "package.json");

    let version = "1.0.0";
    try {
      const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));
      version = packageJson.version;
    } catch (err) {
      logger.error("Failed to read package.json version:", {
        error: err,
        packagePath,
        cwd: process.cwd(),
        __dirname,
      });
    }

    res.json({
      server: version,
      buildDate: process.env.BUILD_DATE || new Date().toISOString(),
    });
  });

  // Server stats endpoint (admin only - authenticated)
  app.get("/api/stats", authenticateToken, statsController.getStats);

  // Refresh cache endpoint (admin only)
  app.post(
    "/api/stats/refresh-cache",
    authenticateToken,
    requireAdmin,
    statsController.refreshCache
  );

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

  // Custom theme routes (protected)
  app.use("/api/themes/custom", customThemeRoutes);

  // New filtered search endpoints (protected + require cache ready)
  app.post(
    "/api/library/scenes",
    authenticateToken,
    requireCacheReady,
    authenticated(findScenes)
  );
  app.get(
    "/api/library/scenes/:id/similar",
    authenticateToken,
    requireCacheReady,
    authenticated(findSimilarScenes)
  );
  app.get(
    "/api/library/scenes/recommended",
    authenticateToken,
    requireCacheReady,
    authenticated(getRecommendedScenes)
  );
  app.post(
    "/api/library/performers",
    authenticateToken,
    requireCacheReady,
    authenticated(findPerformers)
  );
  app.post(
    "/api/library/studios",
    authenticateToken,
    requireCacheReady,
    authenticated(findStudios)
  );
  app.post(
    "/api/library/tags",
    authenticateToken,
    requireCacheReady,
    authenticated(findTags)
  );
  app.post(
    "/api/library/groups",
    authenticateToken,
    requireCacheReady,
    authenticated(findGroups)
  );
  app.post(
    "/api/library/galleries",
    authenticateToken,
    requireCacheReady,
    authenticated(findGalleries)
  );
  app.get(
    "/api/library/galleries/:id",
    authenticateToken,
    requireCacheReady,
    authenticated(findGalleryById)
  );
  app.get(
    "/api/library/galleries/:galleryId/images",
    authenticateToken,
    requireCacheReady,
    authenticated(getGalleryImages)
  );

  // Minimal data endpoints for filter dropdowns (id + name only)
  app.post(
    "/api/library/performers/minimal",
    authenticateToken,
    requireCacheReady,
    authenticated(findPerformersMinimal)
  );
  app.post(
    "/api/library/studios/minimal",
    authenticateToken,
    requireCacheReady,
    authenticated(findStudiosMinimal)
  );
  app.post(
    "/api/library/tags/minimal",
    authenticateToken,
    requireCacheReady,
    authenticated(findTagsMinimal)
  );
  app.post(
    "/api/library/groups/minimal",
    authenticateToken,
    requireCacheReady,
    authenticated(findGroupsMinimal)
  );
  app.post(
    "/api/library/galleries/minimal",
    authenticateToken,
    requireCacheReady,
    authenticated(findGalleriesMinimal)
  );

  // Update endpoints for CRUD operations
  app.put(
    "/api/library/scenes/:id",
    authenticateToken,
    authenticated(updateScene)
  );
  app.put(
    "/api/library/performers/:id",
    authenticateToken,
    authenticated(updatePerformer)
  );
  app.put(
    "/api/library/studios/:id",
    authenticateToken,
    authenticated(updateStudio)
  );
  app.put("/api/library/tags/:id", authenticateToken, authenticated(updateTag));

  // Video playback endpoints (protected)
  // Note: playVideo doesn't use authenticated() wrapper because it has custom params typing
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.get("/api/video/play", authenticateToken, playVideo as any); // New endpoint with query params

  // Session management endpoints (protected)
  app.post("/api/video/seek", authenticateToken, authenticated(seekVideo));
  app.get(
    "/api/video/session/:sessionId/status",
    authenticateToken,
    authenticated(getSessionStatus)
  );
  app.get(
    "/api/video/session/:sessionId/segments",
    authenticateToken,
    authenticated(getSegmentStates)
  );
  app.delete(
    "/api/video/session/:sessionId",
    authenticateToken,
    authenticated(killSession)
  );

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
