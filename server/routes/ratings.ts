import express from "express";
import {
  updateGalleryRating,
  updateGroupRating,
  updateImageRating,
  updatePerformerRating,
  updateSceneRating,
  updateStudioRating,
  updateTagRating,
} from "../controllers/ratings.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// All rating routes require authentication
router.use(authenticate);

// Update ratings and favorites
router.put("/scene/:sceneId", updateSceneRating);
router.put("/performer/:performerId", updatePerformerRating);
router.put("/studio/:studioId", updateStudioRating);
router.put("/tag/:tagId", updateTagRating);
router.put("/gallery/:galleryId", updateGalleryRating);
router.put("/group/:groupId", updateGroupRating);
router.put("/image/:imageId", updateImageRating);

export default router;
