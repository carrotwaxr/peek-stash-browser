import express from "express";
import {
  findGalleries,
  findGalleriesMinimal,
} from "../../controllers/library/galleries.js";
import { authenticate, requireCacheReady } from "../../middleware/auth.js";
import { authenticated } from "../../utils/routeHelpers.js";

const router = express.Router();

// All rating routes require authentication
router.use(authenticate);

// Update ratings and favorites
router.post(
  "/galleries",
  authenticate,
  requireCacheReady,
  authenticated(findGalleries)
);

router.post(
  "/galleries/minimal",
  authenticate,
  requireCacheReady,
  authenticated(findGalleriesMinimal)
);

export default router;
