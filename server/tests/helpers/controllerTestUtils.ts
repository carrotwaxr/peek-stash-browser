/**
 * Request and response builders for unit tests of Express handlers and
 * middleware.
 *
 * `reqFor(handler, parts)` and `resFor(handler)` build the request and
 * response a handler takes, typed from the handler itself: the body, params
 * and query a test passes are checked against what the handler declares, and
 * `res._getBody()` is typed as what it may send.
 */
import type {
  CookieOptions,
  NextFunction,
  Request,
  Response,
  Router,
} from "express";
import { inspect } from "node:util";
import { type Mock, vi } from "vitest";
import type { RequestUser } from "../../middleware/auth.js";
import type { ApiErrorResponse } from "../../types/api/index.js";

/** A signed-in user as the auth middleware attaches it; override any field. */
export function testUser(overrides: Partial<RequestUser> = {}): RequestUser {
  return { id: 1, username: "testuser", role: "USER", ...overrides };
}

declare const malformedInput: unique symbol;

/**
 * Request input outside the handler's declared types, sent on purpose: to
 * check the handler rejects it, or ignores fields it does not declare.
 */
export interface Malformed {
  readonly [malformedInput]: true;
}

/**
 * Mark a body, params, query or user as outside the handler's types on
 * purpose (a missing or wrongly typed field, or one it does not declare), so
 * it skips them. Only for tests of how the handler treats such input.
 */
export function malformed(input: unknown): Malformed {
  return input as Malformed;
}

type RouteMethod = "get" | "post" | "put" | "patch" | "delete";
type RouteHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => unknown;

/**
 * The handler `router` runs for `method` and `path`: the last one registered
 * on that route, after any middleware of its own (`requireAdmin`, say).
 * Throws when the router has no such route, so a renamed route fails the test
 * instead of leaving it nothing to call.
 */
export function findHandler(
  router: Router,
  method: RouteMethod,
  path: string
): RouteHandler {
  for (const layer of router.stack) {
    if (layer.route?.path !== path) continue;
    const handler = [...layer.route.stack]
      .reverse()
      .find((l) => l.method === method);
    if (handler) return handler.handle;
  }
  throw new Error(`No ${method.toUpperCase()} ${path} route`);
}

/** Any Express handler or middleware, whatever its request and response types. */
type Handler = (req: never, res: never, ...rest: never[]) => unknown;

/** The request type `handler` declares. */
type ReqOf<H extends Handler> = Parameters<H>[0];

/** The type of `req[K]` in the request `handler` declares. */
type ReqPart<H extends Handler, K extends string> =
  ReqOf<H> extends Record<K, infer V> ? V : never;

/**
 * What `handler` may pass to `res.json()`: the body its `TypedResponse`
 * declares, or `unknown` for a plain `Response`.
 */
export type ResBody<H extends Handler> =
  Parameters<H>[1] extends Response<infer B>
    ? 0 extends 1 & B
      ? unknown
      : B
    : unknown;

/**
 * The parts of a request a handler test sets. Body, params and query are
 * checked against the handler's own types unless wrapped in `malformed()`;
 * the ones left out are empty objects (a body given as `undefined` stays
 * undefined, as when a client sends none). `user` may be left out to test the
 * handler's own sign-in check, or be `malformed()` (a user without an id).
 * Middleware tests also set the headers, cookies and peer address it reads.
 */
export interface ReqParts<H extends Handler> {
  body?: ReqPart<H, "body"> | Malformed;
  params?: ReqPart<H, "params"> | Malformed;
  query?: ReqPart<H, "query"> | Malformed;
  user?: RequestUser | Malformed;
  /** Read by `req.header()` and `req.get()` case-insensitively, as in Express. */
  headers?: Record<string, string>;
  cookies?: Record<string, string>;
  /** `req.socket.remoteAddress`; without it the request has no socket. */
  remoteAddress?: string;
  /** `req.url`, for handlers that read the path they were called on. */
  url?: string;
}

/**
 * The request `handler` declares, plus the `user` the auth middleware
 * attaches (`reqFor` sets it, even when undefined).
 */
export type ReqFor<H extends Handler> = ReqOf<H> & { user?: RequestUser };

/**
 * The request for `handler`, typed as the request it declares:
 * `reqFor(updateUserSettings, { body: { theme: "dark" }, user: USER })`.
 */
export function reqFor<H extends Handler>(
  _handler: H,
  parts: NoInfer<ReqParts<H>> = {}
): ReqFor<H> {
  const { params = {}, query = {}, user, cookies = {} } = parts;
  const body = "body" in parts ? parts.body : {};
  const headers = Object.fromEntries(
    Object.entries(parts.headers ?? {}).map(([name, value]) => [
      name.toLowerCase(),
      value,
    ])
  );
  const header = (name: string): string | undefined =>
    headers[name.toLowerCase()];
  const socket =
    parts.remoteAddress === undefined
      ? {}
      : { socket: { remoteAddress: parts.remoteAddress } };
  const url = parts.url === undefined ? {} : { url: parts.url };
  // The one cast: a test request carries only the parts a handler reads
  return {
    body,
    params,
    query,
    user,
    headers,
    cookies,
    header,
    get: header,
    ...socket,
    ...url,
  } as ReqFor<H>;
}

/**
 * The mock response `resFor` builds: a `Response` whose `status`, `json`,
 * `send`, `end`, `cookie`, `setHeader` and `on` are spies (chainable, as in
 * `res.status(400).json(...)`), with no headers sent yet, plus readers for
 * what the handler sent with `json()`.
 */
export type MockRes<B> = Response<B> & {
  status: Mock<(code: number) => MockRes<B>>;
  json: Mock<(body: B) => MockRes<B>>;
  send: Mock<(body?: B) => MockRes<B>>;
  end: Mock<() => MockRes<B>>;
  cookie: Mock<
    (name: string, value: string, options?: CookieOptions) => MockRes<B>
  >;
  setHeader: Mock<
    (name: string, value: number | string | readonly string[]) => MockRes<B>
  >;
  on: Mock<
    (event: string, listener: (...args: unknown[]) => void) => MockRes<B>
  >;
  /** The first status the handler set, or 200 when it set none. */
  _getStatus(): number;
  /** The last body passed to `res.json()`; fails the test when there was none. */
  _getBody(): B;
  /** The last body when it is an error (`{ error: string }`); fails the test otherwise. */
  _getErrorBody(): ApiErrorResponse;
  /** The last body when it is not an error; fails the test otherwise. */
  _getOkBody(): Exclude<B, ApiErrorResponse>;
};

function isErrorBody(body: unknown): body is ApiErrorResponse {
  return (
    typeof body === "object" &&
    body !== null &&
    "error" in body &&
    typeof body.error === "string"
  );
}

/** The response for `handler`, with `_getBody()` typed as what it may send. */
export function resFor<H extends Handler>(_handler: H): MockRes<ResBody<H>> {
  return mockResponse<ResBody<H>>();
}

function mockResponse<B>(): MockRes<B> {
  const status = vi.fn((_code: number) => res);
  const json = vi.fn((_body: B) => res);
  const send = vi.fn((_body?: B) => res);
  const end = vi.fn(() => res);
  const cookie = vi.fn(
    (_name: string, _value: string, _options?: CookieOptions) => res
  );
  const setHeader = vi.fn(
    (_name: string, _value: number | string | readonly string[]) => res
  );
  const on = vi.fn(
    (_event: string, _listener: (...args: unknown[]) => void) => res
  );
  const getBody = (): B => {
    const calls = json.mock.calls;
    const last = calls[calls.length - 1];
    if (!last) throw new Error("res.json() was not called");
    return last[0];
  };
  const readers = {
    _getStatus: () => status.mock.calls[0]?.[0] ?? 200,
    _getBody: getBody,
    _getErrorBody: () => {
      const body: unknown = getBody();
      if (!isErrorBody(body)) {
        throw new Error(`Expected an error body, got ${inspect(body)}`);
      }
      return body;
    },
    _getOkBody: () => {
      const body = getBody();
      if (isErrorBody(body)) {
        throw new Error(`Expected a success body, got ${inspect(body)}`);
      }
      // Checked above: the body is not the error member of B
      return body as Exclude<B, ApiErrorResponse>;
    },
  };
  // The mock implements only what handlers call on `res`
  const res = {
    status,
    json,
    send,
    end,
    cookie,
    setHeader,
    on,
    headersSent: false,
    ...readers,
  } as MockRes<B>;
  return res;
}
