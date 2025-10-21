import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import {
  getSetupStatus,
  discoverStashLibraries,
  getPathMappings,
  addPathMapping,
  updatePathMapping,
  deletePathMapping,
  testPath,
} from "../controllers/setup.js";

const router = express.Router();

// Public routes (no auth required - needed for initial setup wizard)
router.get("/status", getSetupStatus);
router.get("/discover-libraries", discoverStashLibraries);
router.post("/test-path", testPath);
router.get("/path-mappings", getPathMappings);
router.post("/path-mappings", addPathMapping);

// Protected routes (auth required - for Settings page path management)
router.put("/path-mappings/:id", authenticateToken, updatePathMapping);
router.delete("/path-mappings/:id", authenticateToken, deletePathMapping);

export default router;
