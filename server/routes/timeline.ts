import express from "express";
import {
  getDateDistribution,
  postDateDistribution,
} from "../controllers/timelineController.js";
import { authenticate, withAllowedInstances } from "../middleware/auth.js";
import { libraryHandler } from "../utils/routeHelpers.js";

const router = express.Router();

// All timeline routes require authentication
router.use(authenticate);

// The bars of a list: the list's own request (filter, search, ids) plus the period
router.post(
  "/:entityType/distribution",
  withAllowedInstances,
  libraryHandler(postDateDistribution)
);

// The documented form: one entity parameter (performerId, tagId, ...)
router.get(
  "/:entityType/distribution",
  withAllowedInstances,
  libraryHandler(getDateDistribution)
);

export default router;
