import express from "express";
import { authenticateToken, requireCacheReady } from "../../middleware/auth.js";
import {
  findGalleries,
  findGalleriesMinimal,
  findGalleryById,
  getGalleryImages,
} from "../../controllers/library/galleries.js";
import { authenticated } from "../../utils/routeHelpers.js";

const router = express.Router();

// All rating routes require authentication
router.use(authenticateToken);

// Update ratings and favorites
router.post(
  "/galleries",
  authenticateToken,
  requireCacheReady,
  authenticated(findGalleries)
);

router.post(
  "/galleries/minimal",
  authenticateToken,
  requireCacheReady,
  authenticated(findGalleriesMinimal)
);

router.get(
  "/galleries/:id",
  authenticateToken,
  requireCacheReady,
  authenticated(findGalleryById)
);

router.get(
  "/galleries/:galleryId/images",
  authenticateToken,
  requireCacheReady,
  authenticated(getGalleryImages)
);

export default router;
