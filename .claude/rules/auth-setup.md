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
  - "server/utils/jwtSecret.ts"
  - "server/services/PasswordService.ts"
  - "server/initializers/recoveryKeys.ts"
---

# Auth, setup and Stash instances

- The JWT lives in an HTTP-only cookie for 2 hours and is refreshed after 1 hour, keeping its `authTime` claim. A session ends 30 days after `authTime` (the last password sign-in), or when `User.passwordChangedAt` is newer than its `iat`, with 401 either way.
- The signing secret is `JWT_SECRET`, or `<CONFIG_DIR>/.jwt-secret`, generated once when the variable is unset or a published example value. Read it with `getJwtSecret()`, never at module load.
- Every password write goes through `setUserPassword()`.
- Recovery keys are stored as `recoveryKeyHash` (SHA-256) and shown once: from `complete-setup`, from `recovery-key/regenerate` (current password required), or from the admin's regenerate.
- When `PROXY_AUTH_HEADER` is set, that header's value is the username. An unknown username falls back to JWT auth, with nothing logged.
- `authRateLimiter` allows 10 failed attempts per client address per 15 minutes (successful requests don't count). Login, `/forgot-password/init` and `/forgot-password/reset` share that one budget.
- `accountLockout` locks a username from one address for 15 minutes after 5 failures from that address and answers 423 with Retry-After; the same username from another address can still sign in. It is an in-memory Map: it resets on restart and isn't shared between processes.
- `trust proxy` trusts a loopback first hop (the image's nginx), and `TRUST_PROXY=N` N more hops (`utils/trustProxy.ts`). The dev stack reaches the server through the Vite container, which is not loopback, so all dev clients share one address.
- Instance create, update and delete in `controllers/setup.ts` call `stashInstanceManager.reload()` afterwards, or the in-memory clients keep the old URL and key. `resetSetup` deletes every instance without reloading.
- `STASH_URL` and `STASH_API_KEY` create a "Default" instance at startup only when no instance exists; this is the legacy setup path.

## Setup wizard endpoints

Four endpoints in `routes/setup.ts` are public, each with its own guard:

- `create-admin`: only while there are no users.
- `create-stash-instance`: only while there are no instances. It skips the connection test when `NODE_ENV=test`, for E2E setup.
- `test-stash-connection`: no guard. The server connects to whatever URL the caller sends, even after setup.
- `reset`: a confirm string, at most one user, and setup not complete. It deletes all users and instances.
