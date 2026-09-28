---
paths:
  - "client/src/**"
---

# Client

## Data

- List pages fetch through the TanStack Query hooks in `src/api/hooks/`, keyed by `src/api/queryKeys.ts`. The key factory has an instanceId slot, but the list pages pass none, so every list key is `[entity, undefined, "list", params]`.
- Detail pages, cards and the lightbox still call `libraryApi` directly. The migration stopped after the list hooks; the detail and rating/favorite hooks have no callers yet.
- `src/api/client.ts` holds `apiFetch`. Only a 401 (a lost session) redirects to login, and never from `AUTH_SILENT_ENDPOINTS` (background pings, which throw so they can't interrupt playback; add new fire-and-forget endpoints there), `/auth/*` endpoints or a page in `PUBLIC_ROUTES` (`constants/navigation.ts`, which `App.tsx` declares its public routes from). A 403 or any other failure throws `ApiError`; show it with `getErrorMessage(err, fallback)`, which adds the wait to a 423 or 429. The server answers 401 only for a lost session.
- TanStack Query handles cancellation of its own queries. Code that aborts a fetch itself must swallow the `AbortError`; the lightbox prefetch does it with `.catch(() => {})`.
- The hooks don't wait for auth themselves; `ProtectedRoute` holds back rendering until auth resolves. A component outside it gates its own queries.
- Entity references in URLs and filter values are `"id:instanceId"`, built by `src/utils/compositeKey.ts`; a bare id means no instance was known.

## useFilterState

It reads the URL once on mount and afterwards only writes it; reading it back again loops. The debounced search reads current state through `stateRef` to avoid stale closures. Precedence between a saved preset and the URL has caused bugs: URL filters win only when the URL has params other than `page` and `per_page`; sort and direction still come from the preset unless the URL names them; a URL `per_page` always wins.

## Structure

- Provider order in `App.tsx`: Auth, Theme, QueryClient, Config, UnitPreference, TVMode, CardDisplaySettings. The root providers load user data only while `isAuthenticated`; `ConfigProvider` reads only the public `/setup/status`.
- New code uses theme CSS variables (`var(--bg-card)`, `var(--accent-primary)`). About 50 Tailwind palette classes remain, mostly spinners, grays and status colors; don't copy them. The `visual-style` skill has the full system.
- `src/utils/filterConfig.ts` (3,600+ lines) defines every entity's filter options, so a change there reaches every search page. Its option keys, modifier and hierarchy keys and sort values follow `shared/types/filters` (`UI_KEYS`, `SORTS`); `tests/utils/filterContract.test.ts` fails when they drift, so a new option starts in the contract. Its `build*Filter` return the shared wire types (`SceneFilterInput`, ..., `ClipFilterParams`) through `rangeCriterion`, `dateCriterion` and `refCriterion`; `refCriterion` takes a picker's default modifier from its option and sends only modifiers the contract field takes, so a panel option cannot send what the parser refuses.
