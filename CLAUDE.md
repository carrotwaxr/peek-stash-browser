# Peek Stash Browser

Self-hosted web app for browsing and streaming media from one or more Stash servers, with playlists, ratings and per-user content restrictions. Ships as a single Docker image.

## Commands

- Dev: `docker compose up --build -d` (client on :6969, server on :8000); `docker compose logs -f peek-server`. Each container reinstalls `node_modules` when `package-lock.json` changed, and the server regenerates its Prisma client, so no `-V` is needed.
- Shared types: `cd shared && npm run build`. Needed before server `tsc`, the server dev runtime and client `typecheck`; Vite and Vitest read `shared/types` directly.
- Test: `npm run test:run` in `client/` and `server/` (`npm test` starts watch mode in a terminal)
- Coverage gate: `npm run test:coverage` in both; CI enforces the thresholds in each `vitest.config`
- Integration: `cd server && npm run test:integration`. Needs `STASH_TEST_URL` and `STASH_TEST_API_KEY` (or `STASH_URL` and `STASH_API_KEY`) in the root `.env`, and `server/integration/fixtures/testEntities.ts` copied from its example.
- E2E: `npm run test:e2e` from the root, against the running compose stack
- Lint: `npm run lint` in `client/` and `server/`
- Format: `npm run format` from the root; CI runs `npm run format:check`. `.prettierignore` leaves out `docs/`, `.claude/` and generated code.
- Types: `cd server && npx tsc --noEmit` and `cd client && npm run typecheck` (CI runs only the server one)
- Build: `cd client && npm run build`
- Release: `/pre-release`, then `/release-beta` or `/release-stable`

## Conventions that differ from defaults

- Every cached Stash entity belongs to an instance. The 8 entity tables key on `@@id([id, stashInstanceId])` and junctions on 4-part keys. Every query, lookup and cache key carries the instance; one without it mixes data across servers silently.
- One entity ID has three spellings. DB: bare `id` plus `stashInstanceId` (Peek's own per-user tables call it `instanceId`). API, URLs and filter values: `"id:instanceId"` (`InstanceAwareId` and `parseEntityRef` in `shared/types/instanceAwareId.ts`; `compositeKey.ts` in the client). In-memory Maps: `` `${id}\0${instanceId}` `` (`KEY_SEP`). Convert at the API boundary, and keep the instance after parsing.
- Libraries reach 100k+ scenes. Filter and paginate in SQL; never load or loop over the whole library per request.
- Migrations are written by hand (see `.claude/rules/prisma.md`). Never run `prisma migrate dev` or `prisma db push`.
- Tests live in `client/tests/` and `server/tests/`, mirroring the source tree, never beside the source.
- Server `tsc` excludes test files; client `typecheck` includes them. After changing a server signature, grep the server tests for its callers.
- Releases push the version-bump commit straight to main and tag it. That is the only push to main without a pull request.
- Rules for specific areas live in `.claude/rules/` and load with the files they cover. Plans and design docs go in `docs/plans/`, which is gitignored: they stay local.

## Pitfalls

- A filter or content restriction silently matches nothing, or INCLUDE mode hides everything: an `"id:instanceId"` value reached SQL unparsed (#412, #424).
- A filter or restriction also matches another instance's entities: the value was parsed to a bare ID and the instance dropped (#390, #437).
- The dev server runs code with a TypeScript error: tsx strips types without checking them, so only `cd server && npx tsc --noEmit` (also run in CI) reports it. After a schema change, a Prisma `Invalid ... invocation` error ending in `Unknown argument` is the container's stale Prisma client: `docker compose restart peek-server` regenerates it (a host `npx prisma generate` does not reach the container's `node_modules`).
- E2E logins fail for 15 minutes after a few bad attempts: the account lockout lives in server memory. `docker compose restart peek-server` clears it.
