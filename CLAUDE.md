# Peek Stash Browser

Self-hosted web app for browsing and streaming media from one or more Stash servers, with playlists, ratings and per-user content restrictions. Ships as a single Docker image.

## What Peek is

What Peek adds to Stash, and the invariants every change keeps. `.claude/rules/` has the detail per area.

- Users and access: ADMIN and USER accounts; groups grant Can Share, Download Files and Download Playlists (denied by default; a per-user override beats groups); recovery keys; trusted-header SSO; login rate limit and lockout; a setup wizard.
- Per-user data, keyed by user and instance: ratings and favorites on all 7 entity types, watch history and resume points, O counts, image views, stats, hidden items, presets, carousels, themes and other preferences. Rating, favorite, O-count and play fields in responses are the requesting user's, not Stash's.
- Content restrictions: an admin gives a user Show-only and Always-hide lists of collections, tags, studios and galleries (tags and studios include their descendants; Always-hide wins), cascading to the entities they cover; precomputed into `UserExcludedEntity`.
- Multi-instance: one Peek in front of several Stash servers. Each user picks which enabled instances to see, as a preference, not access control.
- Media: streams, captions and images go through Peek; the external player gets a personal signed link (12 h). Named playlists shareable with groups, TV mode, timeline and folder views, recommendations and similar scenes from the user's own data.
- Downloads: scene files and playlist zips with NFO, permission-gated and queued.
- Operations: a synced SQL cache of each library, merge reconciliation, per-user Sync to Stash and Sync from Stash, database backups.

Invariants:

1. No user needs, sees or receives Stash credentials. The API key never leaves the server; Stash's address reaches only admins.
2. Every request that shows or serves Stash content is authenticated as a Peek user: a session, or on the direct stream a personal signed link.
3. A user's exclusions (restrictions, hidden items, cascades) apply on every surface that lists, counts, recommends, shows or serves an entity, by-id lookups, downloads and media included.
4. Only admins set restrictions, and never on admin accounts; users cannot bypass them. Hidden items belong to the user who hid them.
5. Admins bypass restrictions; everyone's own hidden items apply to them everywhere.
6. No user sees another user's data, except shared playlists and admin exclusion counts. Deleting a user deletes all their data.
7. Everything stored about a Stash entity carries its instance.
8. Peek never edits Stash metadata. It writes to Stash only through Sync to Stash, which only an admin can switch on for a user.
9. Sharing and downloading are denied by default and enforced on the server.
10. Sharing never widens access: a recipient sees only what their own exclusions allow.
11. Instance selection only narrows what a user sees: disabled instances never show, and an empty selection means all enabled instances.

## Commands

- Dev: `docker compose up --build -d` (client on :6969, server on :8000); `docker compose logs -f peek-server`. Each container reinstalls `node_modules` when `package-lock.json` changed, and the server regenerates its Prisma client, so no `-V` is needed.
- Shared types: `cd shared && npm run build`. Needed before server `tsc`, the server dev runtime and client `typecheck`; Vite and Vitest read `shared/types` directly.
- Test: `npm run test:run` in `client/` and `server/` (`npm test` starts watch mode in a terminal)
- Coverage gate: `npm run test:coverage` in both; CI enforces the thresholds in each `vitest.config`
- Integration, in `server/`: `npm run test:integration:replay` runs against the synthetic replay of the test Stash and needs no setup. `npm run test:integration` runs against the live test Stash (`STASH_TEST_*` in the root `.env`; `STASH_URL` only with `ALLOW_PROD_STASH=1` in the shell). From the root, `npm run fixtures:generate` rebuilds the fixture offline after a query change; `npm run fixtures:record` (owner) re-records after the test Stash changes. `-- --check` reports drift.
- E2E: `npm run test:e2e` from the root. It is hermetic: it starts a Stash replay, its own server and client, and a throwaway database, on ports derived from the checkout path, beside the dev stack. `E2E_BASE_URL=http://localhost:6969` runs it against the dev stack for manual runs on real data, as a throwaway run admin deleted afterwards; `.env.e2e` then names the bootstrap admin that creates it.
- Test suites in two worktrees can run at once; each worktree gets its own ports and databases.
- Lint: `npm run lint` in `client/` and `server/`
- Format: `npm run format` from the root; CI runs `npm run format:check`. `.prettierignore` leaves out `docs/`, `.claude/` and generated code.
- Types: `cd server && npm run typecheck` (source, then tests) and `cd client && npm run typecheck` (CI runs both)
- Build: `cd client && npm run build`
- Release: `/pre-release`, then `/release-beta` or `/release-stable`

## Conventions that differ from defaults

- Every cached Stash entity belongs to an instance. The 8 entity tables key on `@@id([id, stashInstanceId])` and junctions on 4-part keys. Every query, lookup and cache key carries the instance; one without it mixes data across servers silently.
- One entity ID has three spellings. DB: bare `id` plus `stashInstanceId` (Peek's own per-user tables call it `instanceId`). API, URLs and filter values: `"id:instanceId"` (`InstanceAwareId` and `parseEntityRef` in `shared/types/instanceAwareId.ts`; `compositeKey.ts` in the client). In-memory Maps: `` `${id}\0${instanceId}` `` (`KEY_SEP`). Convert at the API boundary, and keep the instance after parsing.
- Libraries reach 100k+ scenes. Filter and paginate in SQL; never load or loop over the whole library per request.
- Migrations are written by hand (see `.claude/rules/prisma.md`). Never run `prisma migrate dev` or `prisma db push`.
- Tests live in `client/tests/` and `server/tests/`, mirroring the source tree, never beside the source.
- Server tests and `integration/` are type-checked by `server/tsconfig.tests.json` with the source flags (`npm run typecheck:tests`; plain `tsc` skips them). Client `typecheck` includes its tests. Mock Prisma in server tests with `tests/helpers/prismaMock.ts` (see `.claude/rules/tests.md`).
- Lint ratchet: `eslint-suppressions.json` holds counts that may only fall; after fixing suppressed sites run `npx eslint . --prune-suppressions`; never add entries.
- Releases push the version-bump commit straight to main and tag it. That is the only push to main without a pull request.
- Rules for specific areas live in `.claude/rules/` and load with the files they cover. Plans and design docs go in `docs/plans/`, which is gitignored: they stay local.

## Pitfalls

- A filter or content restriction silently matches nothing, or INCLUDE mode hides everything: an `"id:instanceId"` value reached SQL unparsed (#412, #424).
- A filter or restriction also matches another instance's entities: the value was parsed to a bare ID and the instance dropped (#390, #437).
- The dev server runs code with a TypeScript error: tsx strips types without checking them, so only `cd server && npx tsc --noEmit` (also run in CI) reports it. After a schema change, a Prisma `Invalid ... invocation` error ending in `Unknown argument` is the container's stale Prisma client: `docker compose restart peek-server` regenerates it (a host `npx prisma generate` does not reach the container's `node_modules`).
- A replay run fails with "stash-replay cannot answer …": the message names the operation and the field. Run the command it gives.
- In dev-stack E2E runs (`E2E_BASE_URL`), logins fail for 15 minutes after a few bad attempts: the account lockout lives in server memory. `docker compose restart peek-server` clears it.
