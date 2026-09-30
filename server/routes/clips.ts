import express from "express";
import { getClipById, getClips } from "../controllers/clips.js";
import { authenticate, requireCacheReady } from "../middleware/auth.js";
import { libraryHandler } from "../utils/routeHelpers.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(requireCacheReady);

router.get("/", libraryHandler(getClips));
router.get("/:id", libraryHandler(getClipById));

export default router;
