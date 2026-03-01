import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  proxyClipPreview,
  proxyImage,
  proxyScenePreview,
  proxySceneWebp,
  proxyStashMedia,
} from "../controllers/proxy.js";
import * as statsController from "../controllers/stats.js";
import { authenticate, requireAdmin, requireCacheReady } from "../middleware/auth.js";
import { getClipsForScene } from "../controllers/clips.js";
import authRoutes from "../routes/auth.js";
import carouselRoutes from "../routes/carousel.js";
import customThemeRoutes from "../routes/customTheme.js";
import imageViewHistoryRoutes from "../routes/imageViewHistory.js";
import libraryGalleriesRoutes from "../routes/library/galleries.js";
import libraryGroupsRoutes from "../routes/library/groups.js";
import libraryImagesRoutes from "../routes/library/images.js";
import libraryPerformersRoutes from "../routes/library/performers.js";
import libraryScenesRoutes from "../routes/library/scenes.js";
import libraryStudiosRoutes from "../routes/library/studios.js";
import libraryTagsRoutes from "../routes/library/tags.js";
import playlistRoutes from "../routes/playlist.js";
import ratingsRoutes from "../routes/ratings.js";
import setupRoutes from "../routes/setup.js";
import syncRoutes from "../routes/sync.js";
import exclusionsRoutes from "../routes/exclusions.js";
import mergeReconciliationRoutes from "../routes/mergeReconciliation.js";
import databaseBackupRoutes from "../routes/databaseBackup.js";
import downloadRoutes from "../routes/download.js";
import userRoutes from "../routes/user.js";
import groupRoutes from "../routes/groups.js";
import videoRoutes from "../routes/video.js";
import watchHistoryRoutes from "../routes/watchHistory.js";
import userStatsRoutes from "../routes/userStats.js";
import timelineRoutes from "../routes/timeline.js";
import clipsRoutes from "../routes/clips.js";
import { authenticated } from "../utils/routeHelpers.js";
import { logger } from "../utils/logger.js";

// ES module equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const setupAPI = () => {
  const app = express();

  // Configure trust proxy for reverse proxy setups (nginx, etc.)
  // Prevents express-rate-limit ERR_ERL_UNEXPECTED_X_FORWARDED_FOR errors
  const trustProxy = process.env.TRUST_PROXY;
  if (trustProxy) {
    if (trustProxy === "true") {
      app.set("trust proxy", true);
    } else if (/^\d+$/.test(trustProxy)) {
      app.set("trust proxy", parseInt(trustProxy, 10));
    } else {
      app.set("trust proxy", trustProxy);
    }
  }

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
      const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8")) as { version?: string };
      version = packageJson.version ?? version;
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
  app.get("/api/stats", authenticate, requireAdmin, statsController.getStats);

  // Refresh cache endpoint (admin only)
  app.post(
    "/api/stats/refresh-cache",
    authenticate,
    requireAdmin,
    statsController.refreshCache
  );

  // Media proxy (public - no auth required for images)
  app.get("/api/proxy/stash", proxyStashMedia);

  // Scene preview proxy routes (public - no auth for performance)
  app.get("/api/proxy/scene/:id/preview", proxyScenePreview);
  app.get("/api/proxy/scene/:id/webp", proxySceneWebp);

  // Image proxy route (public - no auth for performance)
  app.get("/api/proxy/image/:imageId/:type", proxyImage);

  // Clip preview proxy route (public - no auth for performance)
  app.get("/api/proxy/clip/:id/preview", proxyClipPreview);

  // Public authentication routes (no auth required for these)
  app.use("/api/auth", authRoutes);

  // Setup wizard routes (mixed - some public for initial setup, some protected for settings)
  app.use("/api/setup", setupRoutes);

  // Sync routes (protected - admin only for triggering syncs)
  app.use("/api/sync", syncRoutes);

  // Exclusion routes (protected - admin only for recomputing exclusions)
  app.use("/api/exclusions", exclusionsRoutes);

  // Merge reconciliation routes (admin only)
  app.use("/api/admin", mergeReconciliationRoutes);

  // Database backup routes (admin only)
  app.use("/api/admin", databaseBackupRoutes);

  // User settings routes (protected)
  app.use("/api/user", userRoutes);

  // User group routes (protected, mostly admin only)
  app.use("/api/groups", groupRoutes);

  // Playlist routes (protected)
  app.use("/api/playlists", playlistRoutes);

  // Download routes (protected)
  app.use("/api/downloads", downloadRoutes);

  // Custom carousel routes (protected)
  app.use("/api/carousels", carouselRoutes);

  // Watch history routes (protected)
  app.use("/api/watch-history", watchHistoryRoutes);

  // User stats routes (protected)
  app.use("/api/user-stats", userStatsRoutes);

  // Image view history routes (protected)
  app.use("/api/image-view-history", imageViewHistoryRoutes);

  // Rating and favorite routes (protected)
  app.use("/api/ratings", ratingsRoutes);

  // Custom theme routes (protected)
  app.use("/api/themes/custom", customThemeRoutes);

  // Timeline routes (date distribution)
  app.use("/api/timeline", timelineRoutes);

  // Clips routes (protected)
  app.use("/api/clips", clipsRoutes);

  // Scene clips endpoint (get clips for a specific scene)
  app.get(
    "/api/scenes/:id/clips",
    authenticate,
    requireCacheReady,
    authenticated(getClipsForScene)
  );

  // Library routes (all entities)
  app.use("/api/library", libraryScenesRoutes);
  app.use("/api/library", libraryPerformersRoutes);
  app.use("/api/library", libraryStudiosRoutes);
  app.use("/api/library", libraryTagsRoutes);
  app.use("/api/library", libraryGroupsRoutes);
  app.use("/api/library", libraryGalleriesRoutes);
  app.use("/api/library", libraryImagesRoutes);

  // Video routes (playback, sessions, HLS streaming)
  app.use("/api", videoRoutes);

  return app;
};

/**
 * Start the API server on the specified port.
 * Separated from setupAPI() to allow integration tests to start on a different port.
 */
export const startServer = (
  app: ReturnType<typeof setupAPI>,
  port: number = 8000
) => {
  return app.listen(port, () => {
    logger.info("Server is running", {
      url: `http://localhost:${port}`,
      transcodingSystem: "session-based",
    });
  });
};
