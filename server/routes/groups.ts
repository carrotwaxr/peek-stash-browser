import { Router } from "express";
import { authenticate, requireAdmin } from "../middleware/auth.js";
import { authenticated } from "../utils/routeHelpers.js";
import {
  getAllGroups,
  getGroup,
  createGroup,
  updateGroup,
  deleteGroup,
  addMember,
  removeMember,
  getUserGroups,
} from "../controllers/groups.js";

const router = Router();

router.use(authenticate);

// User-facing route (must be before /:id to avoid conflicts)
router.get("/user/mine", authenticated(getUserGroups));

// Admin routes
router.get("/", requireAdmin, authenticated(getAllGroups));
router.get("/:id", requireAdmin, authenticated(getGroup));
router.post("/", requireAdmin, authenticated(createGroup));
router.put("/:id", requireAdmin, authenticated(updateGroup));
router.delete("/:id", requireAdmin, authenticated(deleteGroup));

// Membership management (admin only)
router.post("/:id/members", requireAdmin, authenticated(addMember));
router.delete("/:id/members/:userId", requireAdmin, authenticated(removeMember));

export default router;
