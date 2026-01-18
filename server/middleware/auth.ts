import { Prisma } from "@prisma/client";
import type { JsonValue } from "@prisma/client/runtime/library";
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import prisma from "../prisma/singleton.js";
import { stashEntityService } from "../services/StashEntityService.js";

const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

// Token expires after 24 hours, but we refresh it if older than 20 hours
// This gives users a 4-hour inactivity window before session expires
const TOKEN_EXPIRY_HOURS = 24;
const TOKEN_REFRESH_THRESHOLD_HOURS = 20;

/**
 * User information attached to request by auth middleware
 */
export interface RequestUser {
  id: number;
  username: string;
  role: string;
  preferredQuality?: string | null;
  preferredPlaybackMode?: string | null;
  preferredPreviewQuality?: string | null;
  enableCast?: boolean;
  theme?: string | null;
  hideConfirmationDisabled?: boolean;
  landingPagePreference?: JsonValue;
}

/**
 * Request type after authentication middleware has run
 * Controllers behind authenticateToken can safely use this type
 */
export interface AuthenticatedRequest extends Request {
  user: RequestUser;
}

export const generateToken = (user: {
  id: number;
  username: string;
  role: string;
}) => {
  return jwt.sign(user, JWT_SECRET, { expiresIn: `${TOKEN_EXPIRY_HOURS}h` });
};

/**
 * Set the auth token cookie on a response
 */
export const setTokenCookie = (res: Response, token: string) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: process.env.SECURE_COOKIES === "true",
    sameSite: "strict",
    maxAge: TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
  });
};

export const verifyToken = (token: string) => {
  return jwt.verify(token, JWT_SECRET) as {
    id: number;
    username: string;
    role: string;
    iat?: number;
  };
};

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const proxyAuthHeader = process.env.PROXY_AUTH_HEADER;
  if (proxyAuthHeader) {
    const username = req.header(proxyAuthHeader);
    if (username) {
      return await authenticateUser(username, req, res, next);
    }
  }

  return await authenticateToken(req, res, next);
};

const lookupUser = (where: Prisma.UserWhereUniqueInput) =>
  prisma.user.findUnique({
    where,
    select: {
      id: true,
      username: true,
      role: true,
      preferredQuality: true,
      preferredPlaybackMode: true,
      preferredPreviewQuality: true,
      enableCast: true,
      theme: true,
      hideConfirmationDisabled: true,
      landingPagePreference: true,
    },
  });

const authenticateUser = async (
  username: string,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await lookupUser({ username });
    if (!user) {
      throw new Error(
        "Unable to locate user. Falling back to authenticateToken"
      );
    }

    // Cast to AuthenticatedRequest to set user property
    (req as AuthenticatedRequest).user = user;
    next();
  } catch {
    return await authenticateToken(req, res, next);
  }
};

export const authenticateToken = async (
  req: Request,
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
    const user = await lookupUser({ id: decoded.id });
    if (!user) {
      return res.status(401).json({ error: "Invalid token. User not found." });
    }

    // Check if token needs refresh (older than threshold)
    // Only refresh for cookie-based auth (not Bearer tokens from external clients)
    if (req.cookies?.token && decoded.iat) {
      const tokenAgeHours = (Date.now() / 1000 - decoded.iat) / 3600;
      if (tokenAgeHours > TOKEN_REFRESH_THRESHOLD_HOURS) {
        const newToken = generateToken({
          id: user.id,
          username: user.username,
          role: user.role,
        });
        setTokenCookie(res, newToken);
      }
    }

    // Cast to AuthenticatedRequest to set user property
    (req as AuthenticatedRequest).user = user;
    next();
  } catch {
    res.status(403).json({ error: "Invalid token." });
  }
};

export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authReq = req as AuthenticatedRequest;
  if (!authReq.user || authReq.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
};

export const requireCacheReady = async (
  _req: Request,
  res: Response,
  next: NextFunction
) => {
  const isReady = await stashEntityService.isReady();
  if (!isReady) {
    return res.status(503).json({
      error: "Server is initializing",
      message: "Cache is still loading. Please wait a moment and try again.",
      ready: false,
    });
  }
  next();
};
