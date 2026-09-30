---
name: express5-api-patterns
description: Express 5 and typed-handler patterns for the peek-stash-browser server. Use when writing or changing Express route handlers, routers, middleware or error handling in server/.
---

# Express 5 API Patterns (peek-stash-browser)

The server runs Express ^5.1 with TypeScript strict mode. Express 4 habits break here in quiet ways. Proxy, streaming and auth specifics live in `.claude/rules/video-proxy.md` and `.claude/rules/auth-setup.md`.

## 1. Express 5 changes from v4

### Async errors

Express 5 forwards a rejected promise from an async handler to the error middleware. No `asyncHandler` wrapper, and no try/catch just to call `next(err)`.

```typescript
router.get("/thing/:id", async (req, res) => {
  const thing = await findThing(req.params.id); // a rejection reaches errorHandler
  if (!thing) throw new NotFoundError("Thing not found");
  res.json({ thing });
});
```

### path-to-regexp v8

- Wildcards need a name: `/*` becomes `/*splat` (or `/{*splat}` to also match the root).
- Optional parts use braces: `/:file.:ext?` becomes `/:file{.:ext}`.
- No regex in path strings: `'/[discussion|page]/:slug'` becomes `['/discussion/:slug', '/page/:slug']`.
- Escape reserved characters `()[]?+!` with a backslash.
- An unmatched optional param is absent from `req.params`, not `undefined`.
- A wildcard param is an array: `req.params.splat` is `['foo', 'bar']` for `/foo/bar`.

### Request

- `req.query` is a getter: it cannot be reassigned. The default query parser is "simple", not "extended".
- `req.host` includes the port.
- `req.body` is `undefined` when no body parser ran (v4 gave `{}`).

### Removed and changed APIs

- Removed: `app.del()`, `req.param(name)`, `res.redirect('back')`, `res.send(status)` with a number, `express.static.mime`.
- `res.redirect(301, url)`: status first. `res.json(obj, status)` is gone; use `res.status(201).json(obj)`.
- `res.status()` accepts only integers from 100 to 999.
- `express.urlencoded` defaults to `extended: false`; `express.static` defaults to `dotfiles: 'ignore'`.
- `res.clearCookie()` ignores `maxAge` and `expires`; `res.vary()` throws without a field.

## 2. Error handling

`server/middleware/errorHandler.ts` defines the error classes and the handler, which `server/initializers/api.ts` registers after every route.

```typescript
throw new NotFoundError("Scene not found"); // 404, errorType NOT_FOUND
throw new ValidationError("Invalid request", { issues }); // 400, VALIDATION_ERROR; also { details }
throw new ForbiddenError(); // 403, FORBIDDEN
throw new ConflictError("A playlist has that name"); // 409, CONFLICT
throw new ServiceUnavailableError("Sync is running", { retryAfterSeconds: 30 }); // 503, Retry-After
throw new AppError("Stash unreachable", 502); // any status
```

The handler maps what reaches it:

| Error | Status | Body |
|---|---|---|
| `AppError` and subclasses | its own | `{ error: message, errorType?, issues?, details? }` |
| `isDatabaseBusy` (Prisma P1008, P2010 with SQLite code 5) | 503, `Retry-After: 1` | "The database is busy, try again", `SERVICE_UNAVAILABLE` |
| Prisma P2002 (unique) and P2003 (foreign key) | 409 | fixed text, `CONFLICT` |
| Prisma P2025 (row not found) | 404 | "Not found", `NOT_FOUND` |
| express.json's refusal (`type` `entity.parse.failed`, ...) | its 4xx | "Invalid request body" (413: "Request body too large") |
| another middleware 4xx (`status` 4xx, `expose` not false) | its 4xx | the status's reason phrase |
| anything else | 500 | "Internal server error" |

A handler does not try/catch to log and answer 500: the rejection reaches the central handler, which logs it and answers "Internal server error". A service's own error class extends one of the typed errors above (`UnknownInstanceError` extends `NotFoundError`, `MergeTargetError` extends `ValidationError`). Never put a caught error's `message` in `res.json` or `res.send`: lint rejects it (`ERROR_TEXT_RULE` in `server/eslint.config.js`; `middleware/errorHandler.ts` is exempt). Keep a catch only where it must act before the response ends (release a slot, check `headersSent`).

Only an `AppError`'s message reaches the client, so write it for them and never pass a caught error's message into one. The handler logs 5xx at ERROR ("Request failed") and the rest at WARN ("Request refused"), with the method, the path (no query string), the user id and the whole error (`{ error }`, which the logger expands to name, message, stack, code and cause); a refused request body is logged by its `type` only, since its message quotes the body. After headers are sent it destroys the response and writes nothing. Use an explicit try/catch only for cleanup or a custom response shape, and check `res.headersSent` before responding from a catch block or a stream event handler.

A list, clip, picker, carousel, similar-scenes or recommended request goes through the parser in `utils/listRequest.ts` before the handler's `try`, so its `ValidationError` reaches the central handler (a `catch` that answers 500 would swallow it). Only a stored carousel rule parses leniently (`parseStoredSceneQuery`); log its `ignored` with `logIgnoredStoredRule(carouselId, ignored)`.

## 3. Typed handlers

`server/types/api/express.ts` provides `TypedRequest<TBody, TParams, TQuery>`, `TypedAuthRequest<...>` (where `req.user` is guaranteed: `authenticated()` answers 401 `Unauthorized` without a signed-in user and never calls the handler, so a handler reads `req.user.id` with no check of its own; an admin handler checks no role, because `requireAdmin` runs first on each admin route, all listed in `server/tests/helpers/adminRoutes.ts`) and `TypedResponse<T>`. Request and response types live in `shared/types/api/` and are re-exported from `server/types/api/`.

```typescript
export async function updateSceneRating(
  req: TypedAuthRequest<UpdateRatingRequest, { sceneId: string }>,
  res: TypedResponse<UpdateRatingResponse | ApiErrorResponse>
) {
  const userId = req.user.id;
  const { sceneId } = req.params;
  // ...
}
```

Express's `RequestHandler` type doesn't accept these signatures, so routers register them through `authenticated()` from `server/utils/routeHelpers.ts`:

```typescript
const router = express.Router();
router.use(authenticate);
router.put("/scene/:sceneId", authenticated(updateSceneRating));
```

## 4. Responses

- Errors are `{ error: string }`, optionally with `errorType`, `message`, `details` and `issues` (`ApiErrorResponse`). Produce them by throwing an `AppError` subclass (section 2), not by hand; controllers that still write `res.status(4xx).json({ error })` move to throwing as they're touched. Success bodies are plain `res.json(...)` (`res.status(201).json(...)`, `res.sendStatus(204)`).
- A 503 with `ready: false` means none of the user's instances has finished its first sync (`requireCacheReady`, answering from `isLibraryReady`). The client shows its sync notice and re-checks `GET /api/library/ready` every 5 s; it does not retry the request itself. Every list route, the carousel preview and execute routes included, sits behind `requireCacheReady`; the base query builder also matches nothing for an empty `allowedInstanceIds`.
- Handlers and middleware never return the response: send it, then `return;` on its own line (`res.status(404).json({ error: "Not found" }); return;`). `noImplicitReturns` rejects a handler that returns `res` on some paths and falls off the end on others; older handlers that `return res` on every path move to this form when touched.

## 5. Middleware order (`server/initializers/api.ts`)

1. `trust proxy` from `TRUST_PROXY`, so rate limiting sees client IPs behind a reverse proxy
2. CORS with credentials, `express.json()`, `cookieParser()`
3. Public routes: health, version, the media proxy
4. `/api/auth` and `/api/setup`; setup mixes public wizard endpoints with admin ones
5. Protected routers, each applying `authenticate` itself, and `requireAdmin` where needed
6. The video routes on `/api`, last, because their patterns are broad
7. `errorHandler`
