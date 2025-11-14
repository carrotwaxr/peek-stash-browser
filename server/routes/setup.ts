import express from "express";
import {
  addPathMapping,
  createFirstAdmin,
  deletePathMapping,
  discoverStashLibraries,
  getPathMappings,
  getSetupStatus,
  testPath,
  updatePathMapping,
} from "../controllers/setup.js";
import { authenticateToken } from "../middleware/auth.js";

const router = express.Router();

// Public routes (no auth required - needed for initial setup wizard)
router.get("/status", getSetupStatus);
router.get("/discover-libraries", discoverStashLibraries);
router.post("/test-path", testPath);
router.get("/path-mappings", getPathMappings);
router.post("/path-mappings", addPathMapping);
router.post("/create-admin", createFirstAdmin);

// Protected routes (auth required - for Settings page path management)
router.put("/path-mappings/:id", authenticateToken, updatePathMapping);
router.delete("/path-mappings/:id", authenticateToken, deletePathMapping);

export default router;
