import express from "express";
import {
  findGalleries,
  findGalleriesMinimal,
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

export default router;
