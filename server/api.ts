import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import {
  getStreamSegment,
  playVideo,
  seekVideo,
  getSessionStatus,
  killSession,
} from "./controllers/video.js";
import {
  findScenes,
  findPerformers,
  findStudios,
  findTags,
  updateScene,
  updatePerformer,
  updateStudio,
  updateTag,
} from "./controllers/library.js";
import authRoutes from "./routes/auth.js";
import { authenticateToken } from "./middleware/auth.js";

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

  // Public authentication routes (no auth required for these)
  app.use("/api/auth", authRoutes);

  // New filtered search endpoints (protected)
  app.post("/api/library/scenes", authenticateToken, findScenes);
  app.post("/api/library/performers", authenticateToken, findPerformers);
  app.post("/api/library/studios", authenticateToken, findStudios);
  app.post("/api/library/tags", authenticateToken, findTags);

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
  app.delete("/api/video/session/:sessionId", authenticateToken, killSession);

  // HLS playlist and segment serving (no auth required - sessionId acts as token)
  app.get("/api/video/playlist/:sessionId/:quality/:file", getStreamSegment);
  app.get("/api/video/playlist/:sessionId/:file", getStreamSegment);

  // Legacy segment endpoint (keeping for compatibility, no auth required)
  app.get("/api/stream/:videoId/:segment", getStreamSegment);
  app.listen(8000, () => {
    console.log("Server is running on http://localhost:8000");
    console.log("New transcoding system active with session management");
  });

  return app;
};
