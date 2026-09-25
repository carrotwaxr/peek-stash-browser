---
paths:
  - "server/middleware/auth.ts"
  - "server/middleware/accountLockout.ts"
  - "server/middleware/rateLimiter.ts"
  - "server/middleware/setupGuards.ts"
  - "server/routes/auth.ts"
  - "server/routes/setup.ts"
  - "server/controllers/setup.ts"
  - "server/services/StashInstanceManager.ts"
  - "server/initializers/stashInstance.ts"
  - "server/utils/jwtSecret.ts"
  - "server/utils/trustProxy.ts"
  - "server/services/PasswordService.ts"
  - "server/initializers/recoveryKeys.ts"
---

# Auth, setup and Stash instances

- The JWT lives in an HTTP-only cookie for 2 hours and is refreshed after 1 hour, keeping its `authTime` claim. A session ends 30 days after `authTime` (the last password sign-in), or when `User.passwordChangedAt` is newer than its `iat`, with 401 either way.
- The signing secret is `JWT_SECRET`, or `<CONFIG_DIR>/.jwt-secret`, generated once when the variable is unset or a published example value. Read it with `getJwtSecret()`, never at module load.
- Every password write goes through `setUserPassword()`.
- Recovery keys are stored as `recoveryKeyHash` (SHA-256) and shown once: from `complete-setup`, from `recovery-key/regenerate` (current password required), or from the admin's regenerate.
- When `PROXY_AUTH_HEADER` is set, that header's value is the username, honoured only from an address in `PROXY_AUTH_TRUSTED_IPS` (`utils/proxyAuthTrust.ts`; unset trusts any address and `validate.ts` warns at startup; any invalid entry trusts none). The address checked is the one that reached the image's nginx: `X-Real-IP` when the socket peer is loopback, else the socket address; unlike `req.ip`, `TRUST_PROXY` does not move it. An untrusted address or an unknown username falls back to cookie auth with a warning throttled by `shouldLogOnce` (`utils/logThrottle.ts`), so a request loop cannot flood the log; a failed lookup logs an error and falls back too.
- `GET /api/setup/stash-instance` and `GET /api/sync/status` are admin-only: the first carries Stash's address, the second the sync settings, and only the admin Server settings tab reads them.
- `authRateLimiter` allows 10 failed attempts per client address per 15 minutes (successful requests don't count). Login, `/forgot-password/init` and `/forgot-password/reset` share that one budget.
- `accountLockout` locks a username from one address for 15 minutes after 5 failures from that address and answers 423 with Retry-After; the same username from another address can still sign in. It is an in-memory Map: it resets on restart and isn't shared between processes.
- `trust proxy` trusts a loopback first hop (the image's nginx), and `TRUST_PROXY=N` N more hops (`utils/trustProxy.ts`). The dev stack reaches the server through the Vite container, which is not loopback, so all dev clients share one address.
- Instance create and update in `controllers/setup.ts` call `stashInstanceManager.reload()` afterwards, or the in-memory clients keep the old URL and key; delete goes through `stashSyncService.deleteInstance`, which reloads itself (see `.claude/rules/sync.md`, "Deleting an instance").
- `STASH_URL` and `STASH_API_KEY` create a "Default" instance at startup only when no instance exists; this is the legacy setup path.

## Setup wizard endpoints

`setupRateLimiter` allows 20 failed attempts per client address per 15 minutes on the public setup POSTs.

- `create-admin`: public and rate-limited, only while there are no users. It signs the new admin in (sets the session cookie).
- `create-stash-instance` and `test-stash-connection`: public and rate-limited only while there is no user and no instance; from the moment either exists they need the admin session (`requireAdminOnceSetupStarted` in `middleware/setupGuards.ts`).
- `create-stash-instance` still only works while there are no instances, and hides the connection error text. It skips the connection test when `NODE_ENV=test`, for E2E setup.
- `test-stash-connection` gives the reason for a failure, and the Stash version, only to admins; everyone else gets pass or fail. No response carries `details`; the full error goes to the log.
- There is no reset endpoint and no `/auth/first-time-password`. To start setup over, delete the database file.
