import express from "express";
import { getUserStats } from "../controllers/userStats.js";
import { authenticate } from "../middleware/auth.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// All user stats routes require authentication
router.use(authenticate);

// Get user stats
router.get("/", authenticated(getUserStats));

export default router;
