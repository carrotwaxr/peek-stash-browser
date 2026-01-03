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
import { authenticate } from "../middleware/auth.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All carousel routes require authentication
router.use(authenticate);

// Get all user's custom carousels
router.get("/", authenticated(getUserCarousels));

// Preview carousel results without saving
router.post("/preview", authenticated(previewCarousel));

// Get single carousel by ID
router.get("/:id", authenticated(getCarousel));

// Execute carousel query and get scenes
router.get("/:id/execute", authenticated(executeCarouselById));

// Create new carousel
router.post("/", authenticated(createCarousel));

// Update carousel
router.put("/:id", authenticated(updateCarousel));

// Delete carousel
router.delete("/:id", authenticated(deleteCarousel));

export default router;
