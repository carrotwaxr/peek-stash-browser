import express from "express";
import { getDateDistribution } from "../controllers/timelineController.js";
import { authenticate, withAllowedInstances } from "../middleware/auth.js";
import { libraryHandler } from "../utils/routeHelpers.js";

const router = express.Router();

// All timeline routes require authentication
router.use(authenticate);

// Get date distribution for entity type
router.get(
  "/:entityType/distribution",
  withAllowedInstances,
  libraryHandler(getDateDistribution)
);

export default router;
