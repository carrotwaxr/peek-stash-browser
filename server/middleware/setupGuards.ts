import type { NextFunction, Request, Response } from "express";
import prisma from "../prisma/singleton.js";
import { authenticate, requireAdmin } from "./auth.js";
import { setupRateLimiter } from "./rateLimiter.js";

/**
 * Setup routes the wizard calls around admin creation. Public (rate-limited)
 * only while the database has no user and no Stash instance; from the moment
 * an admin or an instance exists, an admin session is required.
 */
export const requireAdminOnceSetupStarted = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const [userCount, instanceCount] = await Promise.all([
    prisma.user.count(),
    prisma.stashInstance.count(),
  ]);
  if (userCount === 0 && instanceCount === 0) {
    return setupRateLimiter(req, res, next);
  }
  return authenticate(req, res, () => requireAdmin(req, res, next));
};
