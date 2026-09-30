import express from "express";
import {
  findPerformers,
  findPerformersMinimal,
} from "../../controllers/library/performers.js";
import {
  authenticate,
  requireCacheReady,
  requirePickerReady,
} from "../../middleware/auth.js";
import { libraryHandler } from "../../utils/routeHelpers.js";

const router = express.Router();

// All performer routes require authentication
router.use(authenticate);

// Find performers with filters
router.post("/performers", requireCacheReady, libraryHandler(findPerformers));

// Minimal data for filter dropdowns
router.post(
  "/performers/minimal",
  requirePickerReady,
  libraryHandler(findPerformersMinimal)
);

export default router;
