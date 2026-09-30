import express from "express";
import {
  findGalleries,
  findGalleriesMinimal,
  getGalleryCounts,
} from "../../controllers/library/galleries.js";
import {
  authenticate,
  requireCacheReady,
  requirePickerReady,
} from "../../middleware/auth.js";
import { libraryHandler } from "../../utils/routeHelpers.js";

const router = express.Router();

// All rating routes require authentication
router.use(authenticate);

// Update ratings and favorites
router.post(
  "/galleries",
  authenticate,
  requireCacheReady,
  libraryHandler(findGalleries)
);

router.post(
  "/galleries/minimal",
  authenticate,
  requirePickerReady,
  libraryHandler(findGalleriesMinimal)
);

// The detail page's tab counts, as the viewer sees them
router.get(
  "/galleries/:id/counts",
  requireCacheReady,
  libraryHandler(getGalleryCounts)
);

export default router;
