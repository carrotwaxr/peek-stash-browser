import bcrypt from "bcryptjs";
import express, { Response } from "express";
import {
  AuthenticatedRequest,
  authenticate,
  generateToken,
  setTokenCookie,
} from "../middleware/auth.js";
import prisma from "../prisma/singleton.js";
import rankingComputeService from "../services/RankingComputeService.js";
import { generateRecoveryKey } from "../utils/recoveryKey.js";
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
      select: {
        id: true,
        username: true,
        password: true,
        role: true,
        landingPagePreference: true,
        recoveryKey: true,
      },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Generate recovery key if user doesn't have one
    if (!user.recoveryKey) {
      const recoveryKey = generateRecoveryKey();
      await prisma.user.update({
        where: { id: user.id },
        data: { recoveryKey },
      });
      user.recoveryKey = recoveryKey;
    }

    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    // Set HTTP-only cookie
    setTokenCookie(res, token);

    // Recompute rankings asynchronously on login (fire-and-forget)
    rankingComputeService.recomputeAllRankings(user.id).catch((err) => {
      console.error("Failed to recompute rankings on login:", err);
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        landingPagePreference: user.landingPagePreference || { pages: ["home"], randomize: false },
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

// Forgot password - check username and get recovery method
router.post("/forgot-password/init", async (req, res) => {
  try {
    const { username } = req.body;

    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, recoveryKey: true },
    });

    if (!user) {
      // Don't reveal if user exists
      return res.json({ hasRecoveryKey: false });
    }

    res.json({ hasRecoveryKey: !!user.recoveryKey });
  } catch (error) {
    console.error("Forgot password init error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Forgot password - verify recovery key and set new password
router.post("/forgot-password/reset", async (req, res) => {
  try {
    const { username, recoveryKey, newPassword } = req.body;

    if (!username || !recoveryKey || !newPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ error: "Password must be at least 6 characters" });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, recoveryKey: true },
    });

    if (!user || !user.recoveryKey) {
      return res
        .status(401)
        .json({ error: "Invalid username or recovery key" });
    }

    // Normalize and compare recovery key
    const normalizedInput = recoveryKey.replace(/-/g, "").toUpperCase();
    if (normalizedInput !== user.recoveryKey) {
      return res
        .status(401)
        .json({ error: "Invalid username or recovery key" });
    }

    // Hash new password and update
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Forgot password reset error:", error);
    res.status(500).json({ error: "Server error" });
  }
});

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
