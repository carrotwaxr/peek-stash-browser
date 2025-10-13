import express from "express";
import bcrypt from "bcryptjs";
import {
  generateToken,
  authenticateToken,
  AuthenticatedRequest,
} from "../middleware/auth.js";
import prisma from "../prisma/singleton.js";

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
    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

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
router.get("/me", authenticateToken, (req: AuthenticatedRequest, res) => {
  res.json({
    user: req.user,
  });
});

// Check if authenticated
router.get("/check", authenticateToken, (req: AuthenticatedRequest, res) => {
  res.json({ authenticated: true, user: req.user });
});

export default router;
