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
- `tsconfig.tests.json` type-checks `tests/` and `integration/` with the source flags, `noUncheckedIndexedAccess` included, so a changed signature breaks stale calls and mocks here. `npm run typecheck` checks source, then tests; `npm run typecheck:tests` only the tests; plain `tsc --noEmit` skips them. CI runs `npm run typecheck:tests` in Server Checks. It needs `integration/fixtures/testEntities.ts`: copy `testEntities.example.ts` if you have none.

## Server integration (`server/integration/`)

- Starts a real server on port 9999 against a real Stash (`STASH_TEST_*` from the root `.env`; `STASH_URL` only with `ALLOW_PROD_STASH=1` in the shell, which also adds it as multi-instance's second instance; `helpers/stashTarget.ts`), with entity IDs from `fixtures/testEntities.ts`. `FRESH_DB=true` deletes `integration/test.db` first. Global setup refuses to start when `test.db` holds an enabled instance at any other URL, or a user with Sync to Stash on.
- Each test file logs in `adminClient` (from `helpers/testClient.ts`) in its own `beforeAll`. Global setup runs in a separate process, so its login doesn't carry over; a test that skips the login gets 401s. `selectTestInstanceOnly()` limits a test to the test instance.
- To test a service against real SQLite without depending on Stash data, seed rows under a made-up `stashInstanceId` and spy on the Stash client; `services/StashSyncService.cleanup.integration.test.ts` shows how.

## E2E (`e2e/`)

- `auth.setup.ts` logs in through the API and injects the cookie, because filling the login form breaks on special characters in headless Chromium. Credentials come from `.env.e2e`, parsed in `playwright.config.ts`.
- Tests must pass on both the populated dev database and the empty CI one: check which state exists, then assert.
- Settings tabs are `role="tab"`, not buttons.
- A few failed logins lock the account for 15 minutes; `docker compose restart peek-server` clears it.
