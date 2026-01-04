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
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All rating routes require authentication
router.use(authenticate);

// Update ratings and favorites
router.put("/scene/:sceneId", authenticated(updateSceneRating));
router.put("/performer/:performerId", authenticated(updatePerformerRating));
router.put("/studio/:studioId", authenticated(updateStudioRating));
router.put("/tag/:tagId", authenticated(updateTagRating));
router.put("/gallery/:galleryId", authenticated(updateGalleryRating));
router.put("/group/:groupId", authenticated(updateGroupRating));
router.put("/image/:imageId", authenticated(updateImageRating));

export default router;
