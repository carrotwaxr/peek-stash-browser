import express from "express";
import { findClips } from "../../controllers/clips.js";
import { authenticate, requireCacheReady } from "../../middleware/auth.js";
import { libraryHandler } from "../../utils/routeHelpers.js";

const router = express.Router();

// All clip routes require authentication
router.use(authenticate);

// Find clips with the clip filter body (GET /api/clips keeps the old parameters)
router.post("/clips", requireCacheReady, libraryHandler(findClips));

export default router;
