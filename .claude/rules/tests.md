---
paths:
  - "client/tests/**"
  - "server/tests/**"
  - "server/integration/**"
  - "e2e/**"
  - "playwright.config.ts"
---

# Tests

## Client (`client/tests/`)

- Vitest with happy-dom and React Testing Library. The tree mirrors `src/`; `@/` is `src/` and `@tests/` is `tests/`.
- `tests/setup.ts` stubs `matchMedia`, `IntersectionObserver`, `ResizeObserver` and `scrollIntoView`.
- `tests/testUtils.tsx` has `createQueryWrapper`, needed by anything that renders a TanStack Query hook (including `OCounterButton`). `renderWithProviders` wraps only a router, with no QueryClient. Also there: `createAuthValue` for code that calls `useAuth`, `createRouterWrapper`, `createMockApi`, `setupPresetMocks` for `useFilterState`, `flushPromises`, `waitForCondition`.
- Also in `tests/testUtils.tsx`: `actAsync(() => { ... })` replaces `await act(async () => { ... })` when the step awaits nothing (an async callback without an await fails `require-await`); React still flushes the updates, effects and promises the step started. `must(value, what)` reads index access the test relies on, as on the server.
- Input that breaks its declared type on purpose (a `null` the type rules out, a string where a number belongs) goes through `untrusted(value)` from `tests/helpers/untrusted.ts`, as on the server. Lint holds tests to the source rules: no `any`, no non-null assertion (`eslint-suppressions.json` still allows them in the files later PRs rewrite).
- Page tests mock `@/api/hooks` rather than the network.

## Server unit (`server/tests/`)

- Mock Prisma with `vi.mock("../../prisma/singleton.js", () => import("../helpers/prismaSingletonMock.js"))` before importing the module under test, then `const mockPrisma = vi.mocked(prisma, true)`. The mock (`tests/helpers/prismaMock.ts`) creates every model method as a `vi.fn()` typed against the real Prisma signature, and runs `$transaction` as Prisma does (an array with `Promise.all`, a callback with the mock). Files that still build their own Prisma factory move to it when touched.
- Build rows with `partialRow({ ... })` from the same file: only the fields the test needs, typed as the full row inferred from where it goes (a mock's `mockResolvedValue`, say), so an unknown column, a wrong value type or a bad enum value does not compile. Use it instead of `as any` or `as unknown as`. A row with relations names its payload: `partialRow<Prisma.PlaylistGetPayload<{ include: { items: true } }>>({ ..., items: [partialRow({ ... })] })`. A row the database cannot return (a null in a NOT NULL column), for a test of defensive code, goes through `malformedRow()` from `tests/helpers/untrusted.ts`.
- `tests/helpers/fixtures.ts` has complete rows for models several files mock (`userRow`, `stashInstanceRow`, `downloadRow`), the shared include payload types (`UserWithGroups`, `PlaylistWithItems`, ...) and `userPermissions()`. Add a builder there once a second file needs it. A mocked `fetch` resolves a real `Response` (`new Response(body, { status, headers })`).
- A Prisma method's `mockImplementation` takes `prismaImpl((args) => ...)` from the same file: `args` and the result are typed from the method, and a plain promise stands in for the `PrismaPromise`.
- Other mocked modules: `vi.mocked(module, true)`, so their mocks carry the real types.
- Handlers and middleware get their request and response from `tests/helpers/controllerTestUtils.ts`: `reqFor(handler, { body, params, query, user })` and `resFor(handler)`, both typed from the handler (`testUser()` builds the user). Parts left out are empty; middleware tests also set `headers` (read case-insensitively by `req.header()`), `cookies`, `remoteAddress` and `url`. On the response, `status`, `json`, `send`, `end`, `cookie`, `setHeader` and `on` are spies; `_getBody()` is the last `json()` body typed as the handler's response union, `_getOkBody()` narrows it to the success member and `_getErrorBody()` to `{ error }`, each failing the test when the body is the other kind. A route's handler comes from `findHandler(router, method, path)`.
- Input that breaks its declared type on purpose, to test runtime validation: request parts go through `malformed()`, rows through `malformedRow()`, anything else (an argument to the code under test) through `untrusted()` from `tests/helpers/untrusted.ts`. A private member is reached as `service["method"](...)`, which TypeScript types. No `as any` in tests.
- Index access the test relies on goes through `must()` from `tests/helpers/must.ts`, as in `must(result[0]).id` or `must(mock.calls[0])[0]`: a missing element fails with a message naming it, where `?.` inside `expect(...)` can pass silently.
- Files run one at a time (`fileParallelism: false`).
- `npm run lint` covers `tests/` and `integration/` with the source rules (no `any`, no non-null assertion, no floating promise) plus `@vitest/eslint-plugin`'s recommended set (no conditional or standalone `expect`, awaited async assertions). An asymmetric matcher inside an object is one of the typed wrappers in `tests/helpers/matchers.ts` (`objectContaining`, `arrayContaining`, `stringContaining`, `anyOf`), since vitest types `expect.objectContaining` and the rest as `any`.
- `tsconfig.tests.json` type-checks `tests/` and `integration/` with the source flags, `noUncheckedIndexedAccess` included, so a changed signature breaks stale calls and mocks here. `npm run typecheck` checks source, then tests; `npm run typecheck:tests` only the tests; plain `tsc --noEmit` skips them. CI runs `npm run typecheck:tests` in Server Checks.

## Server integration (`server/integration/`)

- Starts a real server on port 9999 against one of two Stashes (`helpers/stashTarget.ts`):
  - Replay, `npm run test:integration:replay` (`STASH_REPLAY=1`, from the shell or the root `.env`): global setup serves the committed synthetic fixture (`stash-replay/fixture/`) in-process, plus a second library for multi-instance. It deletes `integration/test-replay.db` (with `-wal` and `-shm`) before every run, and after the startup sync requires the test instance to hold `FIXTURE_LIBRARY`'s counts of the 7 synced types. No `.env` needed.
  - Live, `npm run test:integration`: the test Stash (`STASH_TEST_*` from the root `.env`; `STASH_URL` only with `ALLOW_PROD_STASH=1` in the shell, which also adds it as multi-instance's second instance), on `integration/test.db`. `FRESH_DB=true` deletes `test.db` first. Global setup refuses to start when `test.db` holds an enabled instance at any other URL, or a user with Sync to Stash on.
- The replay refuses mutations and requests it cannot answer. In replay mode `helpers/replayAudit.ts` (a setup file) fails the test file during which either reached it ("Stash mutations sent during this file", "requests the Stash replay cannot answer"), and global teardown fails the run for any it saw, the startup sync's included. The error names the operation and the field: `npm run fixtures:generate` fixes a query change, `npm run fixtures:record` (owner) a changed test Stash.
- Entity IDs come from `fixtures/testEntities.ts`, which re-exports `TEST_ENTITIES` from `stash-replay/fixture/manifest.ts` (picked by `fixtures:generate`): the manifest's ids in replay mode, each minus `FIXTURE_ID_OFFSET` (the test Stash's own ids) in live mode. `TEST_ADMIN` is `integration_admin`; after it changes, a live run needs `FRESH_DB=true`.
- Each test file logs in `adminClient` (from `helpers/testClient.ts`) in its own `beforeAll`. Global setup runs in a separate process, so its login doesn't carry over; a test that skips the login gets 401s. `selectTestInstanceOnly()` limits a test to the test instance.
- To test a service against real SQLite without depending on Stash data, seed rows under a made-up `stashInstanceId` and spy on the Stash client; `services/StashSyncService.cleanup.integration.test.ts` shows how.

## E2E (`e2e/`)

- Two modes, set up in `e2e/support/env.ts`:
  - Hermetic, the default locally and in CI: Playwright starts its own server and Vite client on ports 8100 and 5180, beside the dev stack, on a throwaway database in `/dev/shm/peek-e2e-8100` (`E2E_SERVER_PORT`, `E2E_CLIENT_PORT`, `E2E_TMP_DIR`). Global setup creates the database's only admin, `e2e-admin`, which is the run admin.
  - Dev-stack, for manual runs on real data: `E2E_BASE_URL=http://localhost:6969` in the shell. Nothing is started. `.env.e2e` names a bootstrap admin of that stack (`E2E_USERNAME`, `E2E_PASSWORD`), used only to create the throwaway run admin `e2e-<runId>-admin` in global setup and to delete it in global teardown, with every user and group named `e2e-<runId>...`. Setup also deletes `e2e-` users and groups left by killed runs.
- Tests run as the run admin (`E2E_ADMIN_USERNAME` and `E2E_ADMIN_PASSWORD`, set by global setup) or as users they create. No test logs in as a real account: the owner's `.env.e2e` account has Sync to Stash on, and the dev stack syncs with the production Stash, so a test that plays, rates, favorites or presses O as that account writes there.
- Helpers live in `e2e/support/`; names go through `uniqueName`; list pages go through `ListPage`.
- `auth.setup.ts` logs in through the API and injects the cookie, because filling the login form breaks on special characters in headless Chromium.
- Global setup fails when Peek does not answer (`GET /api/setup/status answered ...: is Peek running at ...?`), and each API call it makes goes through `mustOk`, which names the status and body.
- Hermetic E2E syncs item 83's replay library (`--library second`). Find subjects through the UI or API and pass them through `requireData`, which fails in hermetic mode and skips on the dev stack. A test that changes per-user state on a library entity (rating, O, hide, restriction) does it as a throwaway user from `e2e/support/users.ts`, because every other test shares the run admin. The replay refuses writes, and teardown fails on any write or unserved media path.
- CI retries once and fails on a flaky test: fix the cause, never raise retries.
- Settings tabs are `role="tab"`, not buttons.
- In dev-stack runs, a few failed logins lock the account for 15 minutes; `docker compose restart peek-server` clears it.
