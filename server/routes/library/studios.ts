import express from "express";
import {
  findStudios,
  findStudiosMinimal,
} from "../../controllers/library/studios.js";
import {
  authenticate,
  requireCacheReady,
  requirePickerReady,
} from "../../middleware/auth.js";
import { libraryHandler } from "../../utils/routeHelpers.js";

const router = express.Router();

// All studio routes require authentication
router.use(authenticate);

// Find studios with filters
router.post("/studios", requireCacheReady, libraryHandler(findStudios));

// Minimal data for filter dropdowns
router.post(
  "/studios/minimal",
  requirePickerReady,
  libraryHandler(findStudiosMinimal)
);

export default router;
