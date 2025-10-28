import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  updateSceneRating,
  updatePerformerRating,
  updateStudioRating,
  updateTagRating,
  updateGalleryRating,
  updateGroupRating,
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
router.put("/group/:groupId", updateGroupRating);

export default router;
