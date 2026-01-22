import express from "express";
import { getClips, getClipById } from "../controllers/clips.js";
import { authenticate, requireCacheReady } from "../middleware/auth.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All routes require authentication
router.use(authenticate);
router.use(requireCacheReady);

router.get("/", authenticated(getClips));
router.get("/:id", authenticated(getClipById));

export default router;
