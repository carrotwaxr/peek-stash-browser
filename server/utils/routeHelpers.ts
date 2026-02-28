import type { Request, Response, NextFunction, RequestHandler } from "express";

/**
 * Wraps an authenticated route handler to satisfy Express's type requirements.
 * Use this for any route that comes after authenticateToken middleware.
 * Accepts handlers typed with AuthenticatedRequest, TypedAuthRequest, or similar.
 *
 * Uses generics so callers' narrower parameter types (AuthenticatedRequest,
 * TypedAuthRequest) are accepted, while inline handlers get proper Express
 * types instead of `any`. The cast is needed because handler return types
 * don't exactly match Express's RequestHandler signature.
 *
 * @example
 * app.get("/api/users", authenticateToken, authenticated(myHandler));
 */
/* eslint-disable @typescript-eslint/no-unnecessary-type-parameters -- generics accept narrower Request/Response subtypes via inference */
export function authenticated<
  TReq extends Request = Request,
  TRes extends Response = Response,
>(
  handler: (req: TReq, res: TRes, next: NextFunction) => unknown
): RequestHandler {
  return handler as unknown as RequestHandler;
}
/* eslint-enable @typescript-eslint/no-unnecessary-type-parameters */
