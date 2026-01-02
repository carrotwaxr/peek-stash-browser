import express from "express";
import {
  getImageViewHistory,
  incrementImageOCounter,
  recordImageView,
} from "../controllers/imageViewHistory.js";
import { authenticate } from "../middleware/auth.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All image view history routes require authentication
router.use(authenticate);

// Increment O counter for image
router.post("/increment-o", authenticated(incrementImageOCounter));

// Record image view (when opened in Lightbox)
router.post("/view", authenticated(recordImageView));

// Get view history for specific image
router.get("/:imageId", authenticated(getImageViewHistory));

export default router;
