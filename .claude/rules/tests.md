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
- `tests/testUtils.tsx` has `createQueryWrapper`, needed by anything that renders a TanStack Query hook (including `OCounterButton`). `renderWithProviders` wraps only a router, with no QueryClient. Also there: `createRouterWrapper`, `createMockApi`, `setupPresetMocks` for `useFilterState`, `flushPromises`, `waitForCondition`.
- Page tests mock `@/api/hooks` rather than the network.

## Server unit (`server/tests/`)

- Call `vi.mock("../../prisma/singleton.js", ...)` before importing the module under test, then use `vi.mocked(prisma)`.
- Files run one at a time (`fileParallelism: false`).
- `tsc` does not check these files, so a changed service signature leaves stale calls and mocks here without an error. Grep for them.

## Server integration (`server/integration/`)

- Starts a real server on port 9999 against a real Stash (`STASH_TEST_*`, else `STASH_*`, from the root `.env`), with entity IDs from `fixtures/testEntities.ts`. `FRESH_DB=true` deletes `integration/test.db` first.
- Each test file logs in `adminClient` (from `helpers/testClient.ts`) in its own `beforeAll`. Global setup runs in a separate process, so its login doesn't carry over; a test that skips the login gets 401s. `selectTestInstanceOnly()` limits a test to the test instance.
- To test a service against real SQLite without depending on Stash data, seed rows under a made-up `stashInstanceId` and spy on the Stash client; `services/StashSyncService.cleanup.integration.test.ts` shows how.

## E2E (`e2e/`)

- `auth.setup.ts` logs in through the API and injects the cookie, because filling the login form breaks on special characters in headless Chromium. Credentials come from `.env.e2e`, parsed in `playwright.config.ts`.
- Tests must pass on both the populated dev database and the empty CI one: check which state exists, then assert.
- Settings tabs are `role="tab"`, not buttons.
- A few failed logins lock the account for 15 minutes; `docker-compose restart peek-server` clears it.
