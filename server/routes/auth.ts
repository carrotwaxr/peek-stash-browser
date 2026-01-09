import bcrypt from "bcryptjs";
import express, { Response } from "express";
import {
  AuthenticatedRequest,
  authenticate,
  generateToken,
  setTokenCookie,
} from "../middleware/auth.js";
import prisma from "../prisma/singleton.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// Login endpoint
router.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }

    const user = await prisma.user.findUnique({
      where: { username },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    // Set HTTP-only cookie
    setTokenCookie(res, token);

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Logout endpoint
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.json({ success: true, message: "Logged out successfully" });
});

// Get current user
router.get(
  "/me",
  authenticate,
  authenticated((req: AuthenticatedRequest, res: Response) => {
    res.json({
      user: req.user,
    });
  })
);

// Check if authenticated
router.get(
  "/check",
  authenticate,
  authenticated((req: AuthenticatedRequest, res: Response) => {
    res.json({ authenticated: true, user: req.user });
  })
);

// First-time password setup (for setup wizard)
// SECURITY: Only works during initial setup (before setup is complete)
router.post("/first-time-password", async (req, res) => {
  try {
    // SECURITY CHECK: Only allow during initial setup
    const userCount = await prisma.user.count();
    const stashCount = await prisma.stashInstance.count();
    const setupComplete = userCount > 0 && stashCount > 0;

    if (setupComplete) {
      return res.status(403).json({
        error:
          "Setup is complete. Use account settings to change your password.",
      });
    }

    const { username, newPassword } = req.body;

    if (!username || !newPassword) {
      return res
        .status(400)
        .json({ error: "Username and new password are required" });
    }

    // Only allow changing admin password during initial setup
    if (username !== "admin") {
      return res
        .status(403)
        .json({ error: "This endpoint is only for admin password setup" });
    }

    // Find admin user
    const user = await prisma.user.findUnique({
      where: { username: "admin" },
    });

    if (!user) {
      return res.status(404).json({ error: "Admin user not found" });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("First-time password error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
