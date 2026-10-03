import express from "express";
import { countHandler } from "../../controllers/library/listCount.js";
import { authenticate, requireCacheReady } from "../../middleware/auth.js";
import { libraryHandler } from "../../utils/routeHelpers.js";

const router = express.Router();

// All count routes require authentication
router.use(authenticate);

// How many rows a list's request matches (the filter sheet's live count).
// One explicit route per list: Express 5's path syntax takes no regex parameter.
router.post(
  "/scenes/count",
  requireCacheReady,
  libraryHandler(countHandler("scene"))
);
router.post(
  "/performers/count",
  requireCacheReady,
  libraryHandler(countHandler("performer"))
);
router.post(
  "/studios/count",
  requireCacheReady,
  libraryHandler(countHandler("studio"))
);
router.post(
  "/tags/count",
  requireCacheReady,
  libraryHandler(countHandler("tag"))
);
router.post(
  "/groups/count",
  requireCacheReady,
  libraryHandler(countHandler("group"))
);
router.post(
  "/galleries/count",
  requireCacheReady,
  libraryHandler(countHandler("gallery"))
);
router.post(
  "/images/count",
  requireCacheReady,
  libraryHandler(countHandler("image"))
);
router.post(
  "/clips/count",
  requireCacheReady,
  libraryHandler(countHandler("clip"))
);

export default router;
