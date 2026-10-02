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
  TQuery extends Record<string, string | string[] | undefined> = Record<
    string,
    string | undefined
  >,
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
  TQuery extends Record<string, string | string[] | undefined> = Record<
    string,
    string | undefined
  >,
> extends TypedRequest<TBody, TParams, TQuery> {
  user: RequestUser;
}

/**
 * Typed request for a list handler (`libraryHandler`): the signed-in user,
 * and the instances the user sees content from, resolved once for the
 * request by `requireCacheReady`, `requirePickerReady` or
 * `withAllowedInstances`. An empty list matches nothing in every reader.
 * `timeZone` is the viewer's IANA zone (`middleware/requestTimeZone.ts`,
 * "UTC" without a valid header), which the list builders read date
 * filters in.
 */
export type TypedLibraryRequest<
  TBody = unknown,
  TParams extends Record<string, string> = Record<string, string>,
  TQuery extends Record<string, string | string[] | undefined> = Record<
    string,
    string | undefined
  >,
> = TypedAuthRequest<TBody, TParams, TQuery> & {
  readonly allowedInstanceIds: readonly string[];
  readonly timeZone: string;
};

/**
 * Typed response with json body generic
 * Note: Express Response.json returns Response, not the body type
 */
export type TypedResponse<T> = Response<T>;
