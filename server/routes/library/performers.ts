import express from "express";
import {
  findPerformers,
  findPerformersMinimal,
  updatePerformer,
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

// Update performer
router.put("/performers/:id", authenticated(updatePerformer));

export default router;
