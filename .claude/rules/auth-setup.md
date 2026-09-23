---
paths:
  - "server/middleware/auth.ts"
  - "server/middleware/accountLockout.ts"
  - "server/middleware/rateLimiter.ts"
  - "server/routes/auth.ts"
  - "server/routes/setup.ts"
  - "server/controllers/setup.ts"
  - "server/services/StashInstanceManager.ts"
  - "server/initializers/stashInstance.ts"
---

# Auth, setup and Stash instances

- The JWT lives in an HTTP-only cookie for 2 hours. A request whose cookie is older than 1 hour gets a fresh one. Bearer tokens are accepted but never refreshed.
- When `PROXY_AUTH_HEADER` is set, that header's value is the username. An unknown username falls back to JWT auth.
- Login has two limits: `authRateLimiter` per IP (10 attempts per 15 minutes) and `accountLockout` per username (5 failures, then a 15-minute lock answered with 423 and Retry-After).
- Every Stash instance create, update or delete calls `stashInstanceManager.reload()` afterwards, or the in-memory clients keep the old URL and key.
- `STASH_URL` and `STASH_API_KEY` create a "Default" instance at startup only when no instance exists; this is the legacy setup path.

## Intentional, do not fix

- The lockout is an in-memory Map: it resets on restart and isn't shared between processes.
- The setup wizard endpoints are public and guard themselves with counts: `create-admin` needs zero users and `create-stash-instance` needs zero instances. `create-stash-instance` skips the connection test when `NODE_ENV=test`, for E2E setup.
