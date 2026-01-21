import express from "express";
import {
  deleteDownload,
  getDownloadFile,
  getDownloadStatus,
  getUserDownloads,
  retryDownload,
  startImageDownload,
  startPlaylistDownload,
  startSceneDownload,
} from "../controllers/download.js";
import { authenticate } from "../middleware/auth.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All download routes require authentication
router.use(authenticate);

// Get all user downloads
router.get("/", authenticated(getUserDownloads));

// Get specific download status
router.get("/:id", authenticated(getDownloadStatus));

// Get download file
router.get("/:id/file", authenticated(getDownloadFile));

// Start scene download
router.post("/scene/:sceneId", authenticated(startSceneDownload));

// Start image download
router.post("/image/:imageId", authenticated(startImageDownload));

// Start playlist download
router.post("/playlist/:playlistId", authenticated(startPlaylistDownload));

// Delete download
router.delete("/:id", authenticated(deleteDownload));

// Retry failed download
router.post("/:id/retry", authenticated(retryDownload));

export default router;
