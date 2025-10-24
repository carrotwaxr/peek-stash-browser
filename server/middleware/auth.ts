import jwt from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";
import prisma from "../prisma/singleton.js";
import { stashCacheManager } from "../services/StashCacheManager.js";

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

export interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    username: string;
    role: string;
  };
}

export const generateToken = (user: {
  id: number;
  username: string;
  role: string;
}) => {
  return jwt.sign(user, JWT_SECRET, { expiresIn: "24h" });
};

export const verifyToken = (token: string) => {
  return jwt.verify(token, JWT_SECRET) as {
    id: number;
    username: string;
    role: string;
  };
};

export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const token =
    req.cookies?.token || req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    return res.status(401).json({ error: "Access denied. No token provided." });
  }

  try {
    const decoded = verifyToken(token);
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, username: true, role: true },
    });

    if (!user) {
      return res.status(401).json({ error: "Invalid token. User not found." });
    }

    req.user = user;
    next();
  } catch {
    res.status(403).json({ error: "Invalid token." });
  }
};

export const requireAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
};

export const requireCacheReady = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (!stashCacheManager.isReady()) {
    return res.status(503).json({
      error: "Server is initializing",
      message: "Cache is still loading. Please wait a moment and try again.",
      ready: false,
    });
  }
  next();
};
