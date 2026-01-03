import express from "express";
import {
  findStudios,
  findStudiosMinimal,
  updateStudio,
} from "../../controllers/library/studios.js";
import { authenticate, requireCacheReady } from "../../middleware/auth.js";
import { authenticated } from "../../utils/routeHelpers.js";

const router = express.Router();

// All studio routes require authentication
router.use(authenticate);

// Find studios with filters
router.post("/studios", requireCacheReady, authenticated(findStudios));

// Minimal data for filter dropdowns
router.post(
  "/studios/minimal",
  requireCacheReady,
  authenticated(findStudiosMinimal)
);

// Update studio
router.put("/studios/:id", authenticated(updateStudio));

export default router;
