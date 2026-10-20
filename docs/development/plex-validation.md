# Plex server connection validation

Validated on Windows/PowerShell on 20 October 2026, branch `feature/plex-login`, extending the initial Plex login implementation at `d4ce9579`. Local runtime: Node `v24.16.0`, npm `11.13.0`. The production Dockerfile targets Node **22**. The initial sign-in image previously built successfully on Unraid with Node 22, as confirmed by the user's build output; the new server-sync image still needs its own Unraid build and live check.

## Commands

From `shared`:

```powershell
npm.cmd run build
```

From `server`:

```powershell
npm.cmd exec -- prisma generate
$env:DATABASE_URL='file:./validation.db'; npm.cmd exec -- prisma validate
npm.cmd run typecheck
$env:NODE_OPTIONS='--max-old-space-size=8192'; npm.cmd run lint
npm.cmd run test:run -- tests/services/PlexServerService.test.ts tests/services/PlexAuthService.test.ts tests/jobs/plexSync.test.ts tests/controllers/user.test.ts tests/controllers/userFeatures.test.ts tests/middleware/authMiddleware.test.ts tests/middleware/auth.test.ts tests/middleware/streamAuth.test.ts tests/routes/auth.test.ts tests/initializers/processHandlers.test.ts tests/initializers/migrations.test.ts tests/prisma/migrationFiles.test.ts
npm.cmd run build
```

From `client`:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test:run -- tests/components/auth/PlexSignIn.test.tsx tests/components/settings/PlexAdminSection.test.tsx tests/components/settings/PlexServerSection.test.tsx tests/components/pages/Login.test.tsx tests/components/settings/UserManagementSection.test.tsx tests/contexts/AuthContext.test.tsx
npm.cmd run build
```

Results:

| Check                                  | Result                                           |
| -------------------------------------- | ------------------------------------------------ |
| Shared build                           | Passed                                           |
| Prisma generation/schema validation    | Passed                                           |
| Backend and frontend typechecks        | Passed, including backend test types             |
| Backend and frontend lint              | Passed; backend uses the larger heap shown above |
| Selected backend tests                 | 460 passed across 12 files                       |
| Selected frontend tests                | 44 passed across six files                       |
| Backend and frontend production builds | Passed                                           |
| `git diff --check`                     | Passed                                           |

The frontend build retains the existing large-chunk warning for video/VR bundles. Prisma retains its `package.json#prisma` deprecation warning. XML import uses the locked `fast-xml-parser` and `fast-xml-validator` packages; no Plex SDK or native dependency is required. Dependency downloads needed sandbox network approval; no live Plex credential was used.

## What the tests establish

The two Plex service suites create separate temporary SQLite databases and apply the repository's real migrations. Plex HTTP responses are mocked. They cover:

- Browser-bound PIN verification, expiry, cancellation, replay, invalid tokens, and concurrent login/provisioning.
- Protected owner connection that verifies a current administrator, retains only an encrypted token, and excludes credentials from browser responses and URLs.
- AES-GCM encryption with randomized nonces, tampering detection, and the need for the correct separate persistent key.
- Owned-server selection and accepted full-account membership; managed profiles, pending invitations, other-server users, and duplicate IDs are excluded or rejected appropriately.
- New inactive, non-admin profiles created before first login; no matching local usernames are linked automatically.
- Activation, existing role preservation, repeat/concurrent synchronization, and preservation of playlists and preferences.
- Member removal, denial on existing authentication paths, manual reactivation on return, and disconnect protection against stale in-flight imports.
- Failed/incomplete/malformed snapshots preserving the previous membership state rather than bulk-deactivating users.
- Password-verified linking of an untouched inactive placeholder to an existing local profile; no profile data is deleted.
- Backward-compatible upgrades of existing users, playlists, Plex identity links, and manual approvals.
- Thirty-minute scheduling, disabled-feature behavior, retries, graceful shutdown, and protection against deleting or demoting the last local administrator.
- Existing local login/recovery, JWT refresh source, signed-media authorization, user settings, and role-change regressions.

Frontend tests cover the login-screen Plex button, the separate protected owner-connection flow, pending/cancel/expiry/error states, server selection/import, sync/disconnect, active/inactive controls, explicit role changes, and existing login/auth-context behavior.

## Checks still needed on Unraid

Docker is unavailable on the development PC, so the refreshed container has not been built or run here. Build the new archive with `Dockerfile.production`, recreate the existing test container against its separate appdata directory, and verify through the test HTTPS proxy:

1. Local administrator recovery still works.
2. Connect the Plex owner, select the intended server, and confirm the imported list matches accepted full accounts.
3. Inactive accounts cannot sign in; activated accounts can.
4. An explicitly promoted account receives administrator access; the owner never receives it automatically.
5. Repeat sync keeps identities, roles and data; removed/restored membership follows the documented inactive/reactivation behavior.
6. Disconnect/reconnect and a container restart preserve encryption/key behavior and local recovery.

The Stash-dependent full integration and browser E2E suites were not run. Membership reflects the last successful sync; during an upstream outage, previous membership is retained and an error is shown. Removing Plex access can therefore take until the next successful sync; deactivate in Peek for immediate denial at the next request.

See [Plex server connection and deployment](../getting-started/plex-authentication.md).

## UI setup revision ? 21 October 2026

Plex setup now lives in the administrator UI. No database migration is added for this revision. `plex-settings.json` persists the generated installation identifier and enabled flag; the previous environment values seed this file once. Local HTTP and reverse-proxy HTTPS use the same server-side PIN flow.

Additional validation commands, run from `server`:

```powershell
npm.cmd run test:run -- tests/services/PlexAuthService.test.ts tests/services/PlexServerService.test.ts tests/jobs/plexSync.test.ts tests/middleware/auth.test.ts tests/middleware/streamAuth.test.ts tests/routes/auth.test.ts
npm.cmd run test:run -- tests/services/PlexSettings.test.ts tests/utils/secureRequestCookie.test.ts
npm.cmd run test:run -- tests/services/PlexServerService.test.ts tests/utils/secureRequestCookie.test.ts tests/controllers/user.test.ts tests/controllers/userFeatures.test.ts tests/middleware/authMiddleware.test.ts tests/initializers/processHandlers.test.ts
npm.cmd run typecheck
npm.cmd run build
```

These runs passed, covering 437 distinct backend tests across 12 files (the server service and cookie tests appear in more than one command). This includes generated identifier persistence, legacy configuration import, UI enable/disable persistence, protected administrator settings, origin/port checks, and automatic cookie security.

From `client`, `npm.cmd run test:run -- tests/components/settings/PlexServerSection.test.tsx tests/components/auth/PlexSignIn.test.tsx` passed all 11 tests. Client typecheck and production build passed. ESLint passed on all changed backend and frontend TypeScript files. The existing frontend video/VR chunk-size warning remains.

The UI setup revision still requires a live Unraid check: first enable and connect over the LAN HTTP address, restart/recreate with the same appdata, then repeat login through the HTTPS proxy. Docker is unavailable on this development PC. No live Plex credentials were used in automated tests.
