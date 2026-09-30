import express from "express";
import { getUserStats } from "../controllers/userStats.js";
import { authenticate, withAllowedInstances } from "../middleware/auth.js";
import { libraryHandler } from "../utils/routeHelpers.js";

const router = express.Router();

// All user stats routes require authentication
router.use(authenticate);

// Get user stats
router.get("/", withAllowedInstances, libraryHandler(getUserStats));

export default router;
