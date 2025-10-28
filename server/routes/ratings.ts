import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  updateSceneRating,
  updatePerformerRating,
  updateStudioRating,
  updateTagRating,
  updateGalleryRating,
} from "../controllers/ratings.js";

const router = express.Router();

// All rating routes require authentication
router.use(authenticateToken);

// Update ratings and favorites
router.put("/scene/:sceneId", updateSceneRating);
router.put("/performer/:performerId", updatePerformerRating);
router.put("/studio/:studioId", updateStudioRating);
router.put("/tag/:tagId", updateTagRating);
router.put("/gallery/:galleryId", updateGalleryRating);

export default router;
