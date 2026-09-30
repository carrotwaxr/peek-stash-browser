import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { AuthenticatedRequest } from "../middleware/auth.js";
import type { TypedLibraryRequest } from "../types/api/express.js";

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

/**
 * Marks what `libraryHandler()` returns, so the route guard test can find
 * every route whose handler reads `req.allowedInstanceIds`.
 */
export const LIBRARY_HANDLER: unique symbol = Symbol("libraryHandler");

/**
 * Registers a list handler: one that reads the instances the viewer sees
 * content from, typed `TypedLibraryRequest`. Behind `authenticate` and one
 * of `requireCacheReady`, `requirePickerReady` or `withAllowedInstances`,
 * which resolve the list once for the request and put it on
 * `req.allowedInstanceIds`. Answers 401 without a signed-in user, as
 * `authenticated()` does. A route that lost its readiness middleware has no
 * list: the returned promise rejects naming the middleware (the central
 * handler answers 500), never reading the absence as "no instances".
 *
 * @example
 * router.post("/scenes", requireCacheReady, libraryHandler(findScenes));
 */
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- generics accept narrower Request/Response subtypes via inference */
export function libraryHandler<
  TReq extends Request = Request,
  TRes extends Response = Response,
>(
  handler: (req: TReq, res: TRes, next: NextFunction) => unknown
): RequestHandler & { readonly [LIBRARY_HANDLER]: true } {
  // Three parameters: Express skips a handler declaring more as an error handler
  const routeHandler: RequestHandler = (req, res, next) => {
    const { user } = req as Partial<AuthenticatedRequest>;
    if (typeof user?.id !== "number") {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const { allowedInstanceIds } = req as Partial<TypedLibraryRequest>;
    if (!Array.isArray(allowedInstanceIds)) {
      return Promise.reject(
        new Error(
          "allowedInstanceIds missing: the route needs requireCacheReady, requirePickerReady or withAllowedInstances"
        )
      );
    }
    return handler(req as TReq, res as TRes, next);
  };
  return Object.assign(routeHandler, { [LIBRARY_HANDLER]: true as const });
}
/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */
