import express from "express";
import { getDateDistribution } from "../controllers/timelineController.js";
import { authenticate } from "../middleware/auth.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All timeline routes require authentication
router.use(authenticate);

// Get date distribution for entity type
router.get("/:entityType/distribution", authenticated(getDateDistribution));

export default router;
