import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { proxyStashMedia } from "../controllers/proxy.js";
import * as statsController from "../controllers/stats.js";
import authRoutes from "../routes/auth.js";
import userRoutes from "../routes/user.js";
import playlistRoutes from "../routes/playlist.js";
import watchHistoryRoutes from "../routes/watchHistory.js";
import ratingsRoutes from "../routes/ratings.js";
import setupRoutes from "../routes/setup.js";
import customThemeRoutes from "../routes/customTheme.js";
import videoRoutes from "../routes/video.js";
import libraryScenesRoutes from "../routes/library/scenes.js";
import libraryPerformersRoutes from "../routes/library/performers.js";
import libraryStudiosRoutes from "../routes/library/studios.js";
import libraryTagsRoutes from "../routes/library/tags.js";
import libraryGroupsRoutes from "../routes/library/groups.js";
import libraryGalleriesRoutes from "../routes/library/galleries.js";
import { authenticateToken, requireAdmin } from "../middleware/auth.js";
import { logger } from "../utils/logger.js";

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
  app.get(
    "/api/stats",
    authenticateToken,
    requireAdmin,
    statsController.getStats
  );

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

  // Library routes (all entities)
  app.use("/api/library", libraryScenesRoutes);
  app.use("/api/library", libraryPerformersRoutes);
  app.use("/api/library", libraryStudiosRoutes);
  app.use("/api/library", libraryTagsRoutes);
  app.use("/api/library", libraryGroupsRoutes);
  app.use("/api/library", libraryGalleriesRoutes);

  // Video routes (playback, sessions, HLS streaming)
  app.use("/api", videoRoutes);

  // Start API server immediately so /api/setup/status is available
  app.listen(8000, () => {
    logger.info("Server is running", {
      url: "http://localhost:8000",
      transcodingSystem: "session-based",
    });
  });

  logger.info("Server started - accepting connections during cache load");

  return app;
};
