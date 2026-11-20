import type { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import prisma from "../prisma/singleton.js";
import { libraryStampFor } from "../services/LibraryStamp.js";
import {
  getEnabledSyncedInstanceIds,
  getUserAllowedInstanceIds,
  getUserInstanceAccess,
  getUserInstanceScope,
} from "../services/UserInstanceService.js";
import type { LibraryReadyResponse } from "../types/api/index.js";
import { getBasePath } from "../utils/basePath.js";
import { compositeKey } from "../utils/entityRef.js";
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

/** The longest username a login, a new user or the setup wizard accepts. */
export const USERNAME_MAX_LENGTH = 255;

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
 * Options shared by setting and clearing the token cookie. A cookie clears
 * only with the path it was set under, and under BASE_PATH that is the prefix.
 */
export const tokenCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.SECURE_COOKIES === "true",
  sameSite: "strict" as const,
  path: getBasePath() || "/",
});

/**
 * Set the auth token cookie on a response
 */
export const setTokenCookie = (res: Response, token: string) => {
  res.cookie("token", token, {
    ...tokenCookieOptions(),
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

// != null, not !== null: a test mock that omits the field passes undefined, and .getTime() on it would throw to the error handler.
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
      if (
        shouldLogOnce(
          compositeKey("proxy-auth-untrusted", peer),
          TEN_MINUTES_MS
        )
      ) {
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

/** Every authenticated answer names the user's library stamp (`services/LibraryStamp.ts`). */
const setLibraryStamp = (res: Response, userId: number): void => {
  res.setHeader("X-Peek-Library", libraryStampFor(userId));
};

const lookupUser = (where: Prisma.UserWhereUniqueInput) =>
  prisma.user.findUnique({
    where,
    select: {
      id: true,
      username: true,
      role: true,
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
      shouldLogOnce(
        compositeKey("proxy-auth-unknown", shortName, peer),
        TEN_MINUTES_MS
      )
    ) {
      logger.warn("Proxy auth: the header names no Peek user", {
        username: shortName,
        peer,
      });
    }
    return await authenticateToken(req, res, next);
  }

  if (
    shouldLogOnce(compositeKey("proxy-auth-signin", user.username), ONE_HOUR_MS)
  ) {
    logger.info("Proxy auth: signed in from header", {
      username: user.username,
      peer,
    });
  }

  // The proxy owns this session's length: no token, so no 30-day cap here
  const { passwordChangedAt: _passwordChangedAt, ...requestUser } = user;

  // Cast to AuthenticatedRequest to set user property
  (req as AuthenticatedRequest).user = requestUser;
  setLibraryStamp(res, requestUser.id);
  next();
};

export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // An empty token cookie counts as absent: the header is tried next
  const cookieToken: unknown = req.cookies.token;
  const token: unknown =
    cookieToken === undefined || cookieToken === null || cookieToken === ""
      ? req.header("Authorization")?.replace("Bearer ", "")
      : cookieToken;

  if (!token) {
    res.status(401).json({ error: "Access denied. No token provided." });
    return;
  }

  // Every answer here that ends the session is a 401: the client sends a 401,
  // and only a 401, to the login page. Any other failure (the user lookup on
  // a busy database, say) goes to the error handler and leaves the session.
  let decoded: ReturnType<typeof verifyToken>;
  try {
    decoded = verifyToken(token as string);
  } catch (error) {
    // Expired, tampered with, or signed with another secret
    if (!(error instanceof jwt.JsonWebTokenError)) throw error;
    res.status(401).json({ error: "Invalid token." });
    return;
  }

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
  if (req.cookies.token && decoded.iat) {
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
  setLibraryStamp(res, requestUser.id);
  next();
};

export const requireAdmin = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  // Fails closed: a route that runs it without authenticate first has no user
  const { user } = req as Partial<AuthenticatedRequest>;
  if (user?.role !== "ADMIN") {
    res.status(403).json({ error: "Admin access required." });
    return;
  }
  next();
};

/**
 * Why a user with no instance to show has none: `noAccess` when the user is
 * limited to servers and none of them is enabled (waiting will not help
 * until an admin grants one), `initializing` otherwise (a fresh install, or
 * every instance the user sees is still on its first sync).
 */
async function notReadyReason(
  userId: number
): Promise<NonNullable<LibraryReadyResponse["reason"]>> {
  const scope = await getUserInstanceScope(userId);
  if (scope.length === 0 && (await getUserInstanceAccess(userId)) !== null) {
    return "noAccess";
  }
  return "initializing";
}

/**
 * Whether the user has an instance to show: not ready on a fresh install
 * before its first sync, while every instance the user sees is still on its
 * first sync (an instance shows once that sync's exclusions are computed),
 * or when a limited user has no enabled instance they may see (`reason`
 * tells which). `GET /api/library/ready` answers from it;
 * `requireCacheReady` applies the same rule to the list it puts on the
 * request.
 */
export const libraryReadiness = async (
  userId: number
): Promise<LibraryReadyResponse> =>
  (await getUserAllowedInstanceIds(userId)).length > 0
    ? { ready: true }
    : { ready: false, reason: await notReadyReason(userId) };

/**
 * The 503 a list route answers while the viewer has no instance to show:
 * the first-sync notice, or `noAccess` for a limited user with no server.
 * `ready: false` either way, so the client does not retry and its 5 s
 * re-check picks up a grant.
 */
async function answerNotReady(res: Response, userId: number): Promise<void> {
  const reason = await notReadyReason(userId);
  if (reason === "noAccess") {
    res.status(503).json({
      error: "No Stash servers available",
      message:
        "No Stash server is open to this account. Ask an admin for access.",
      ready: false,
      reason,
    });
    return;
  }
  res.status(503).json({
    error: "Server is initializing",
    message: "Cache is still loading. Please wait a moment and try again.",
    ready: false,
    reason,
  });
}

/**
 * The signed-in user, or a 401 answered: the readiness middleware run after
 * authenticate, and fail closed on a route that lost it
 */
function signedInUser(req: Request, res: Response): RequestUser | undefined {
  const { user } = req as Partial<AuthenticatedRequest>;
  if (!user) {
    res.status(401).json({ error: "Access denied. No token provided." });
    return undefined;
  }
  return user;
}

/**
 * Puts the request's instance list where `libraryHandler` handlers read it
 * (`TypedLibraryRequest.allowedInstanceIds`)
 */
function attachAllowedInstances(
  req: Request,
  allowedInstanceIds: readonly string[]
): void {
  (req as { allowedInstanceIds?: readonly string[] }).allowedInstanceIds =
    allowedInstanceIds;
}

/**
 * Library routes answer 503 `ready: false` while the user's library is not
 * ready: none of the instances the user sees has finished its first sync.
 * The client shows its sync notice and re-checks `GET /api/library/ready`
 * every 5 seconds instead of retrying. Otherwise the user's allowed
 * instances, read once for the request, go on `req.allowedInstanceIds` for
 * the `libraryHandler` handler after it. A failed lookup is an error, not a
 * 503: the rejection reaches the central handler (500). Runs after
 * authenticate.
 */
export const requireCacheReady = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = signedInUser(req, res);
  if (!user) return;
  const allowedInstanceIds = await getUserAllowedInstanceIds(user.id);
  if (allowedInstanceIds.length === 0) {
    await answerNotReady(res, user.id);
    return;
  }
  attachAllowedInstances(req, allowedInstanceIds);
  next();
};

/**
 * Puts the user's allowed instances on the request as `requireCacheReady`
 * does, with no 503: an empty list stays empty and every reader matches
 * nothing through `instanceClause`. For the routes whose pages have their
 * own gate: the playlist reads, user stats and the timeline. Runs after
 * authenticate.
 */
export const withAllowedInstances = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = signedInUser(req, res);
  if (!user) return;
  attachAllowedInstances(req, await getUserAllowedInstanceIds(user.id));
  next();
};

/**
 * Readiness for the five `/minimal` pickers. An admin's Content
 * Restrictions editor sends `scope: "allEnabled"`: its list is every
 * enabled instance past its first sync (`getEnabledSyncedInstanceIds`),
 * whatever the admin selected, so an admin whose own instances are all on
 * their first sync can still restrict another user. Anyone else, and an
 * admin without the scope, gets their own allowed instances. An empty list
 * answers 503 as `requireCacheReady` does. The parser still validates
 * `scope` (400 for any other value), and a USER sending it is refused (403)
 * by the query. Runs after authenticate.
 */
export const requirePickerReady = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = signedInUser(req, res);
  if (!user) return;
  const body: unknown = req.body;
  const allEnabled =
    user.role === "ADMIN" &&
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    (body as Record<string, unknown>).scope === "allEnabled";
  const allowedInstanceIds = allEnabled
    ? await getEnabledSyncedInstanceIds()
    : await getUserAllowedInstanceIds(user.id);
  if (allowedInstanceIds.length === 0) {
    await answerNotReady(res, user.id);
    return;
  }
  attachAllowedInstances(req, allowedInstanceIds);
  next();
};
