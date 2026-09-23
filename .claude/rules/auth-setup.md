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
- When `PROXY_AUTH_HEADER` is set, that header's value is the username. An unknown username falls back to JWT auth, with nothing logged.
- `authRateLimiter` allows 10 failed attempts per IP per 15 minutes (successful requests don't count). Login, `/forgot-password/init` and `/forgot-password/reset` share that one budget.
- `accountLockout` locks a username for 15 minutes after 5 failures and answers 423 with Retry-After. It is an in-memory Map: it resets on restart and isn't shared between processes.
- Instance create, update and delete in `controllers/setup.ts` call `stashInstanceManager.reload()` afterwards, or the in-memory clients keep the old URL and key. `resetSetup` deletes every instance without reloading.
- `STASH_URL` and `STASH_API_KEY` create a "Default" instance at startup only when no instance exists; this is the legacy setup path.

## Setup wizard endpoints

Four endpoints in `routes/setup.ts` are public, each with its own guard:

- `create-admin`: only while there are no users.
- `create-stash-instance`: only while there are no instances. It skips the connection test when `NODE_ENV=test`, for E2E setup.
- `test-stash-connection`: no guard. The server connects to whatever URL the caller sends, even after setup.
- `reset`: a confirm string, at most one user, and setup not complete. It deletes all users and instances.
