import type { Prisma } from "@prisma/client";
import type { JsonValue } from "@prisma/client/runtime/library";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import prisma from "../prisma/singleton.js";
import { stashEntityService } from "../services/StashEntityService.js";
import { getJwtSecret } from "../utils/jwtSecret.js";
import { shouldLogOnce } from "../utils/logThrottle.js";
import { logger } from "../utils/logger.js";
import {
  getProxyAuthTrust,
  isTrustedAddress,
  proxyPeerAddress,
} from "../utils/proxyAuthTrust.js";

// Token expires after 2 hours, but we refresh it if older than 1 hour
// This gives users a 1-hour inactivity window before session expires
// Active users (making API requests) stay logged in seamlessly
const TOKEN_EXPIRY_HOURS = 2;
const TOKEN_REFRESH_THRESHOLD_HOURS = 1;

/** A session ends this long after its password sign-in (`authTime`), even while in use. */
export const MAX_SESSION_AGE_SECONDS = 30 * 24 * 60 * 60;

const nowSeconds = () => Math.floor(Date.now() / 1000);

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
  setupCompleted?: boolean;
}

/**
 * Request type after authentication middleware has run
 * Controllers behind authenticateToken can safely use this type
 */
export interface AuthenticatedRequest extends Request {
  user: RequestUser;
}

/**
 * Sign a session token. `authTime` is the second of the password sign-in the
 * session started from; the hourly refresh passes the original one along.
 */
export const generateToken = (
  user: { id: number; username: string; role: string },
  authTime: number = nowSeconds()
) =>
  jwt.sign(
    { id: user.id, username: user.username, role: user.role, authTime },
    getJwtSecret(),
    { expiresIn: `${TOKEN_EXPIRY_HOURS}h` }
  );

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
  return jwt.verify(token, getJwtSecret()) as {
    id: number;
    username: string;
    role: string;
    iat?: number;
    authTime?: number;
  };
};

// != null, not !== null: a test mock that omits the field passes undefined, and .getTime() on it would throw into the 403 catch.
export const tokenPredatesPasswordChange = (
  iat: number | undefined,
  passwordChangedAt: Date | null | undefined
): boolean =>
  passwordChangedAt != null &&
  (iat ?? 0) < Math.floor(passwordChangedAt.getTime() / 1000);

/** Tokens issued before this release have no authTime; their iat stands in (they expire 2 h after iat, so the 30 days start at most 2 h before the upgrade). */
export const sessionPastMaxAge = (
  authTime: number | undefined,
  iat: number | undefined,
  now = nowSeconds()
): boolean => now - (authTime ?? iat ?? 0) > MAX_SESSION_AGE_SECONDS;

const TEN_MINUTES_MS = 10 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

export const authenticate = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const proxyAuthHeader = process.env.PROXY_AUTH_HEADER;
  if (proxyAuthHeader) {
    const username = req.header(proxyAuthHeader);
    if (username) {
      const peer = proxyPeerAddress(req);
      const trust = getProxyAuthTrust();
      const trusted =
        trust.mode === "any" ||
        (trust.mode === "list" && isTrustedAddress(trust.list, peer));
      if (trusted) {
        return await authenticateUser(username, peer, req, res, next);
      }
      if (shouldLogOnce(`proxy-auth-untrusted\0${peer}`, TEN_MINUTES_MS)) {
        logger.warn(
          trust.mode === "none"
            ? `Proxy auth: ignored the ${proxyAuthHeader} header from ${peer}, because PROXY_AUTH_TRUSTED_IPS has an invalid entry`
            : `Proxy auth: ignored the ${proxyAuthHeader} header from ${peer}, which is not in PROXY_AUTH_TRUSTED_IPS`
        );
      }
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
      setupCompleted: true,
      passwordChangedAt: true,
    },
  });

/** Sign in the user the trusted proxy's header names; any failure falls back to the session cookie. */
const authenticateUser = async (
  username: string,
  peer: string,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  let user: Awaited<ReturnType<typeof lookupUser>>;
  try {
    user = await lookupUser({ username });
  } catch (error) {
    logger.error("Proxy auth: user lookup failed", {
      username: username.slice(0, 64),
      peer,
      error: error instanceof Error ? error.message : String(error),
    });
    return await authenticateToken(req, res, next);
  }

  if (!user) {
    const shortName = username.slice(0, 64);
    if (
      shouldLogOnce(`proxy-auth-unknown\0${shortName}\0${peer}`, TEN_MINUTES_MS)
    ) {
      logger.warn("Proxy auth: the header names no Peek user", {
        username: shortName,
        peer,
      });
    }
    return await authenticateToken(req, res, next);
  }

  if (shouldLogOnce(`proxy-auth-signin\0${user.username}`, ONE_HOUR_MS)) {
    logger.info("Proxy auth: signed in from header", {
      username: user.username,
      peer,
    });
  }

  // The proxy owns this session's length: no token, so no 30-day cap here
  const { passwordChangedAt: _passwordChangedAt, ...requestUser } = user;

  // Cast to AuthenticatedRequest to set user property
  (req as AuthenticatedRequest).user = requestUser;
  next();
};

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const token: unknown =
    req.cookies?.token || req.header("Authorization")?.replace("Bearer ", "");

  if (!token) {
    res.status(401).json({ error: "Access denied. No token provided." });
    return;
  }

  try {
    const decoded = verifyToken(token as string);
    const user = await lookupUser({ id: decoded.id });
    if (!user) {
      res.status(401).json({ error: "Invalid token. User not found." });
      return;
    }
    const { passwordChangedAt, ...requestUser } = user;

    // A password change or reset ends every session issued before it, and a
    // session ends 30 days after its password sign-in even while in use
    if (
      tokenPredatesPasswordChange(decoded.iat, passwordChangedAt) ||
      sessionPastMaxAge(decoded.authTime, decoded.iat)
    ) {
      res.status(401).json({ error: "Session expired. Please log in again." });
      return;
    }

    // Check if token needs refresh (older than threshold)
    // Only refresh for cookie-based auth (not Bearer tokens from external clients)
    if (req.cookies?.token && decoded.iat) {
      const tokenAgeHours = (Date.now() / 1000 - decoded.iat) / 3600;
      if (tokenAgeHours > TOKEN_REFRESH_THRESHOLD_HOURS) {
        // Keep the sign-in time, so refreshing never extends the 30 days
        const newToken = generateToken(
          { id: user.id, username: user.username, role: user.role },
          decoded.authTime ?? decoded.iat
        );
        setTokenCookie(res, newToken);
      }
    }

    // Cast to AuthenticatedRequest to set user property
    (req as AuthenticatedRequest).user = requestUser;
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
    res.status(403).json({ error: "Admin access required." });
    return;
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
    res.status(503).json({
      error: "Server is initializing",
      message: "Cache is still loading. Please wait a moment and try again.",
      ready: false,
    });
    return;
  }
  next();
};
