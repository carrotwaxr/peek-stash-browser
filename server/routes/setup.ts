import express from "express";
import {
  createFirstAdmin,
  getSetupStatus,
} from "../controllers/setup.js";

const router = express.Router();

// Public routes (no auth required - needed for initial setup wizard)
router.get("/status", getSetupStatus);
router.post("/create-admin", createFirstAdmin);

export default router;
