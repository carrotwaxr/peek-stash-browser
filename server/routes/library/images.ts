import express from "express";
import { findImageById, findImages } from "../../controllers/library/images.js";
import { authenticate, requireCacheReady } from "../../middleware/auth.js";
import { authenticated } from "../../utils/routeHelpers.js";

const router = express.Router();

// Find images (with filters, pagination, sorting)
router.post(
  "/images",
  authenticate,
  requireCacheReady,
  authenticated(findImages)
);

// Get single image by ID
router.get(
  "/images/:id",
  authenticate,
  requireCacheReady,
  authenticated(findImageById)
);

export default router;
