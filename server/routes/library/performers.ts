import express from "express";
import {
  findPerformers,
  findPerformersMinimal,
} from "../../controllers/library/performers.js";
import { authenticate, requireCacheReady } from "../../middleware/auth.js";
import { authenticated } from "../../utils/routeHelpers.js";

const router = express.Router();

// All performer routes require authentication
router.use(authenticate);

// Find performers with filters
router.post("/performers", requireCacheReady, authenticated(findPerformers));

// Minimal data for filter dropdowns
router.post(
  "/performers/minimal",
  requireCacheReady,
  authenticated(findPerformersMinimal)
);

export default router;
