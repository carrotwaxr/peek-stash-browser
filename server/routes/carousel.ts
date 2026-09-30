import express from "express";
import {
  createCarousel,
  deleteCarousel,
  executeCarouselById,
  getCarousel,
  getUserCarousels,
  previewCarousel,
  updateCarousel,
} from "../controllers/carousel.js";
import { authenticate, requireCacheReady } from "../middleware/auth.js";
import { authenticated, libraryHandler } from "../utils/routeHelpers.js";

const router = express.Router();

// All carousel routes require authentication
router.use(authenticate);

// Get all user's custom carousels
router.get("/", authenticated(getUserCarousels));

// Preview carousel results without saving. Scenes are listed only from the
// user's instances: none ready yet answers 503 ready:false, as the lists do
router.post("/preview", requireCacheReady, libraryHandler(previewCarousel));

// Get single carousel by ID
router.get("/:id", authenticated(getCarousel));

// Execute carousel query and get scenes (503 ready:false as above)
router.get(
  "/:id/execute",
  requireCacheReady,
  libraryHandler(executeCarouselById)
);

// Create new carousel
router.post("/", authenticated(createCarousel));

// Update carousel
router.put("/:id", authenticated(updateCarousel));

// Delete carousel
router.delete("/:id", authenticated(deleteCarousel));

export default router;
