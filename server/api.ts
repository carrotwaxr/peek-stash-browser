import express from "express";
import cors from "cors";
import {
  getStreamSegment,
  playVideo,
  seekVideo,
  getSessionStatus,
  killSession,
} from "./controllers/video.js";
import {
  getSceneLibrary,
  findScenes,
  findPerformers,
  findStudios,
  findTags,
} from "./controllers/library.js";

export const setupAPI = () => {
  const app = express();
  app.use(cors());
  app.use(express.json()); // Add JSON body parsing for POST/PUT requests

  // Library endpoints
  app.get("/api/scenes", getSceneLibrary);
  app.get("/api/videos", getSceneLibrary); // Keep legacy endpoint for compatibility

  // New filtered search endpoints
  app.post("/api/library/scenes", findScenes);
  app.post("/api/library/performers", findPerformers);
  app.post("/api/library/studios", findStudios);
  app.post("/api/library/tags", findTags);

  // Video playback endpoints
  app.get("/api/play/:videoId", playVideo); // Legacy endpoint
  app.get("/api/video/play", playVideo); // New endpoint with query params

  // Session management endpoints
  app.post("/api/video/seek", seekVideo);
  app.get("/api/video/session/:sessionId/status", getSessionStatus);
  app.delete("/api/video/session/:sessionId", killSession);

  // HLS playlist and segment serving
  app.get("/api/video/playlist/:sessionId/:quality/:file", getStreamSegment);
  app.get("/api/video/playlist/:sessionId/:file", getStreamSegment);

  // Legacy segment endpoint (keeping for compatibility)
  app.get("/api/stream/:videoId/:segment", getStreamSegment);
  app.listen(8000, () => {
    console.log("Server is running on http://localhost:8000");
    console.log("New transcoding system active with session management");
  });

  return app;
};
