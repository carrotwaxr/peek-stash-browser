import bcrypt from "bcryptjs";
import express, { Response } from "express";
import {
  checkAccountLockout,
  clearFailedAttempts,
  recordFailedAttempt,
} from "../middleware/accountLockout.js";
import {
  AuthenticatedRequest,
  authenticate,
  generateToken,
  setTokenCookie,
} from "../middleware/auth.js";
import { authRateLimiter } from "../middleware/rateLimiter.js";
import prisma from "../prisma/singleton.js";
import { setUserPassword } from "../services/PasswordService.js";
import rankingComputeService from "../services/RankingComputeService.js";
import { logger } from "../utils/logger.js";
import { validatePassword } from "../utils/passwordValidation.js";
import { recoveryKeyMatches } from "../utils/recoveryKey.js";
import { authenticated } from "../utils/routeHelpers.js";

const router = express.Router();

// Login endpoint
router.post("/login", authRateLimiter, async (req, res) => {
  try {
    const { username, password } = req.body as {
      username: string;
      password: string;
    };

    if (!username || !password) {
      return res
        .status(400)
        .json({ error: "Username and password are required" });
    }

    // Lockout is per username and client address
    const clientIp = req.ip ?? req.socket.remoteAddress ?? "unknown";

    // Check if account is locked out
    const lockoutStatus = checkAccountLockout(username, clientIp);
    if (lockoutStatus.locked) {
      const retryAfterSeconds = Math.ceil(
        (lockoutStatus.remainingMs || 0) / 1000
      );
      res.setHeader("Retry-After", retryAfterSeconds.toString());
      return res.status(423).json({
        error: "Account temporarily locked due to too many failed attempts",
        retryAfterSeconds,
      });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        password: true,
        role: true,
        landingPagePreference: true,
        setupCompleted: true,
      },
    });

    if (!user) {
      recordFailedAttempt(username, clientIp);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      recordFailedAttempt(username, clientIp);
      return res.status(401).json({ error: "Invalid credentials" });
    }

    // Clear failed attempts on successful login
    clearFailedAttempts(username, clientIp);

    // A password sign-in: the token's authTime starts the 30-day session
    const token = generateToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    // Set HTTP-only cookie
    setTokenCookie(res, token);

    // Recompute rankings asynchronously on login (fire-and-forget)
    rankingComputeService.recomputeAllRankings(user.id).catch((err) => {
      logger.error("Failed to recompute rankings on login", {
        error: err instanceof Error ? err.message : "Unknown error",
      });
    });

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        landingPagePreference: user.landingPagePreference || {
          pages: ["home"],
          randomize: false,
        },
        setupCompleted: user.setupCompleted,
      },
    });
  } catch (error) {
    logger.error("Login error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
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
router.post("/forgot-password/init", authRateLimiter, async (req, res) => {
  try {
    const { username } = req.body as { username: string };

    if (!username) {
      return res.status(400).json({ error: "Username is required" });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, recoveryKeyHash: true },
    });

    if (!user) {
      // Don't reveal if user exists
      return res.json({ hasRecoveryKey: false });
    }

    res.json({ hasRecoveryKey: !!user.recoveryKeyHash });
  } catch (error) {
    logger.error("Forgot password init error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ error: "Server error" });
  }
});

// Forgot password - verify recovery key and set new password
router.post("/forgot-password/reset", authRateLimiter, async (req, res) => {
  try {
    const { username, recoveryKey, newPassword } = req.body as {
      username: string;
      recoveryKey: string;
      newPassword: string;
    };

    if (!username || !recoveryKey || !newPassword) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.valid) {
      return res
        .status(400)
        .json({ error: passwordValidation.errors.join(". ") });
    }

    const user = await prisma.user.findUnique({
      where: { username },
      select: { id: true, recoveryKeyHash: true },
    });

    // Compared by hash: dashes and case in the input don't matter
    if (
      !user?.recoveryKeyHash ||
      !recoveryKeyMatches(recoveryKey, user.recoveryKeyHash)
    ) {
      return res
        .status(401)
        .json({ error: "Invalid username or recovery key" });
    }

    // Also signs out every existing session of this user
    await setUserPassword(user.id, newPassword);

    res.json({ success: true });
  } catch (error) {
    logger.error("Forgot password reset error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
