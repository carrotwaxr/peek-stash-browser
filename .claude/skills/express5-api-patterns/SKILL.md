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
throw new ValidationError("rating must be 0-100"); // 400, VALIDATION_ERROR
throw new ForbiddenError(); // 403, FORBIDDEN
throw new AppError("Stash unreachable", 502); // any status
```

An `AppError` becomes `{ error, errorType? }` with its status. Anything else becomes a sanitized 500. Use an explicit try/catch only for cleanup or a custom response shape, and check `res.headersSent` before responding from a catch block or a stream event handler.

## 3. Typed handlers

`server/types/api/express.ts` provides `TypedRequest<TBody, TParams, TQuery>`, `TypedAuthRequest<...>` (where `req.user` is guaranteed) and `TypedResponse<T>`. Request and response types live in `shared/types/api/` and are re-exported from `server/types/api/`.

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

- Errors are `{ error: string }`, optionally with `message` and `details` (`ApiErrorResponse`). `sendError`, `sendSuccess`, `sendCreated` and `sendNoContent` in `server/utils/responses.ts` produce these shapes; controllers adopt them as they're touched.
- A 503 with `ready: false` means the cache is still warming (`requireCacheReady`). The client shows its initializing state for it.
- Handlers and middleware never return the response: send it, then `return;` on its own line (`res.status(404).json({ error: "Not found" }); return;`). `noImplicitReturns` rejects a handler that returns `res` on some paths and falls off the end on others; older handlers that `return res` on every path move to this form when touched.

## 5. Middleware order (`server/initializers/api.ts`)

1. `trust proxy` from `TRUST_PROXY`, so rate limiting sees client IPs behind a reverse proxy
2. CORS with credentials, `express.json()`, `cookieParser()`
3. Public routes: health, version, the media proxy
4. `/api/auth` and `/api/setup`; setup mixes public wizard endpoints with admin ones
5. Protected routers, each applying `authenticate` itself, and `requireAdmin` where needed
6. The video routes on `/api`, last, because their patterns are broad
7. `errorHandler`
