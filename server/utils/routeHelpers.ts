import { NextFunction, RequestHandler, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth.js";

/**
 * Wraps an authenticated route handler to satisfy Express's type requirements.
 * Use this for any route that comes after authenticateToken middleware.
 *
 * @example
 * app.get("/api/users", authenticateToken, authenticated(myHandler));
 */
export function authenticated<
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  P = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ResBody = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ReqBody = any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ReqQuery = any,
>(
  handler: (
    req: AuthenticatedRequest,
    res: Response<ResBody>,
    next?: NextFunction
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ) => any
): RequestHandler<P, ResBody, ReqBody, ReqQuery> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return handler as any;
}
