import express from "express";
import { findImages } from "../../controllers/library/images.js";
import { authenticateToken, requireCacheReady } from "../../middleware/auth.js";
import { authenticated } from "../../utils/routeHelpers.js";

const router = express.Router();

// Find images (with filters, pagination, sorting)
router.post(
  "/images",
  authenticateToken,
  requireCacheReady,
  authenticated(findImages)
);

export default router;
