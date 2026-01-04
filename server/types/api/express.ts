// server/types/api/express.ts
/**
 * Typed Express Request/Response Helpers
 *
 * Extends Express types to provide type safety for API handlers.
 */
import type { Request, Response } from "express";
import type { RequestUser } from "../../middleware/auth.js";

/**
 * Typed request with body, params, and query generics
 */
export interface TypedRequest<
  TBody = unknown,
  TParams extends Record<string, string> = Record<string, string>,
  TQuery extends Record<string, string | string[] | undefined> = Record<string, string | undefined>
> extends Request {
  body: TBody;
  params: TParams;
  query: TQuery;
  user?: RequestUser;
}

/**
 * Typed request that requires authentication
 * user is guaranteed to exist
 */
export interface TypedAuthRequest<
  TBody = unknown,
  TParams extends Record<string, string> = Record<string, string>,
  TQuery extends Record<string, string | string[] | undefined> = Record<string, string | undefined>
> extends TypedRequest<TBody, TParams, TQuery> {
  user: RequestUser;
}

/**
 * Typed response with json body generic
 * Note: Express Response.json returns Response, not the body type
 */
export type TypedResponse<T> = Response<T>;
