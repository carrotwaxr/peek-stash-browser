import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.js";

/**
 * Registers a handler that reads the signed-in user, behind `authenticate`
 * (or `authenticateStreamRequest`), and guarantees it one: when no middleware
 * set `req.user` it answers 401 and never calls the handler. So a route that
 * lost its session middleware fails closed, and handlers typed with
 * `TypedAuthRequest` or `AuthenticatedRequest` read `req.user.id` without a
 * check of their own. Admin routes put `requireAdmin` before it; the handler
 * checks no role.
 *
 * Generic so handlers typed with narrower requests and responses are
 * accepted; the cast is needed because their signatures don't match Express's
 * `RequestHandler`. The handler's promise is returned, so Express 5 hands a
 * rejection to the error handler.
 *
 * @example
 * router.get("/settings", authenticate, authenticated(getUserSettings));
 */
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- generics accept narrower Request/Response subtypes via inference */
export function authenticated<
  TReq extends Request = Request,
  TRes extends Response = Response,
>(
  handler: (req: TReq, res: TRes, next: NextFunction) => unknown
): RequestHandler {
  // Three parameters: Express skips a handler declaring more as an error handler
  return (req, res, next) => {
    const { user } = req as Partial<AuthenticatedRequest>;
    if (typeof user?.id !== "number") {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    return handler(req as TReq, res as TRes, next);
  };
}
/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */
