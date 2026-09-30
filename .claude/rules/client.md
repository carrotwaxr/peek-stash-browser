---
paths:
  - "client/src/**"
---

# Client

## Data

- List pages fetch through the TanStack Query hooks in `src/api/hooks/`, keyed by `src/api/queryKeys.ts`. The key factory has an instanceId slot, but the list pages pass none, so every list key is `[entity, undefined, "list", params]`.
- Detail pages, cards and the lightbox still call `libraryApi` directly. The migration stopped after the list hooks; the detail and rating/favorite hooks have no callers yet.
- A detail tab passes its lock as `lockedFilters: { <entity>_filter: {...} }`, and `SearchableGrid` merges it into the panel's filter, the lock winning on a clash. The Include sub-studios/sub-tags toggle shows only on tabs whose field takes a depth in the contract, and sends `depth: -1` there.
- Detail pages look up their entity with `useEntityLookup` (`hooks/useEntityLookup.ts`) and show `EntityNotFound` for not found (missing, hidden or restricted alike), an id on several servers (the server's 400 with `matches`, a link per server) and errors with Retry; the Scene page maps `sceneError` through `describeLookupFailure`.
- The library-initializing state is one query, `queryKeys.library.ready`, in `api/hooks/useLibraryReady.ts`. A query answered 503 `ready: false` is not retried: the query cache's `onError` marks the library not ready, and `useLibraryReady` then asks `GET /api/library/ready` every 5 s and, once it says ready, invalidates the library's lists, details, clips and carousels. Pages render `LibraryInitializingBanner` and treat `isLibraryInitializing(error)` as loading, never as the error page; a query that should wait takes `enabled: ready` from `useLibraryReady()`. No component retries on its own. A busy 503 (Retry-After up to 10 s) is retried once after that wait; mutations never retry.
- `src/api/client.ts` holds `apiFetch`. Only a 401 (a lost session) redirects to login, and never from `AUTH_SILENT_ENDPOINTS` (background pings, which throw so they can't interrupt playback; add new fire-and-forget endpoints there), `/auth/*` endpoints or a page in `PUBLIC_ROUTES` (`constants/navigation.ts`, which `App.tsx` declares its public routes from). A 403 or any other failure throws `ApiError`; show it with `getErrorMessage(err, fallback)`, which adds the wait to a 423 or 429. The server answers 401 only for a lost session.
- TanStack Query handles cancellation of its own queries. Code that aborts a fetch itself must swallow the `AbortError`; the lightbox prefetch does it with `.catch(() => {})`.
- The hooks don't wait for auth themselves; `ProtectedRoute` holds back rendering until auth resolves. A component outside it gates its own queries.
- Entity references in URLs and filter values are `"id:instanceId"`, built by `src/utils/compositeKey.ts`; a bare id means no instance was known.
- A card's count opens a list through `getFilteredListPath` (`utils/entityLinks.ts`), built from that page's filter options: the singular param of the page's option for the entity type (`/scenes?tagId=5`) plus `instance`, which `urlParamsToFilters` joins into `id:instance`. A page with no such option gets no link.
- After a Stash instance is added, edited, enabled, disabled or deleted, or a user's Content Sources change, call `invalidateInstanceQueries(queryClient)` (`api/hooks/useLibraryReady.ts`): the setup status and the library queries (`invalidateLibraryQueries`).
- A card's `onHideSuccess(entityId, entityType, instanceId?)` carries the entity's instance, and list handlers remove the hidden item by `makeCompositeKey(id, instanceId)`, never by bare id. `useHideBulkAction` never sends a selection entry without an instance; it counts that entry as failed.
- After a hide, bulk hide, restore or Restore All, `useHiddenEntities` calls `invalidateExclusionDependents` (library queries, Recommended, stats; Hidden Items marked stale, not refetched). `invalidateInstanceQueries` calls it too. A new query that shows the user's visible set belongs under a root the library predicate matches, or in that helper.
- `logout` removes the post-login redirect, clears the query cache and does a full load of /login.
- Detail pages take their tab counts from `useRelationCounts` (the tabs show `TAB_COUNT_LOADING` and none opens until it answers) and filter, read and count on the loaded entity's `instanceId`, never the URL's `instance` param (a bare-id link has none).
- Every write component and API call takes the entity's `instanceId` as a required string (`hideEntity`, `EntityMenu`, `libraryApi.updateRating`/`updateFavorite`, `useHideBulkAction`). A cache update for a list row matches by `makeCompositeKey(id, instanceId)`, never the bare id.

## useFilterState

It reads the URL once on mount and afterwards only writes it; reading it back again loops. The debounced search reads current state through `stateRef` to avoid stale closures. Precedence between a saved preset and the URL has caused bugs: URL filters win only when the URL has params other than `page` and `per_page`; sort and direction still come from the preset unless the URL names them; a URL `per_page` always wins.

## Structure

- Provider order in `App.tsx`: Auth, Theme, QueryClient, Config, UnitPreference, TVMode, CardDisplaySettings. The root providers load user data only while `isAuthenticated`; `ConfigProvider` and the route gate (`SetupStatusGate`) read the one setup-status query, `useSetupStatus` (`queryKeys.setup.status()`), which retries every failure with back-off and never turns one into "setup not complete"; the app's routes render only from a loaded status.
- New code uses theme CSS variables (`var(--bg-card)`, `var(--accent-primary)`). About 50 Tailwind palette classes remain, mostly spinners, grays and status colors; don't copy them. The `visual-style` skill has the full system.
- `src/utils/filterConfig.ts` (3,600+ lines) defines every entity's filter options, so a change there reaches every search page. Its option keys, modifier and hierarchy keys and sort values follow `shared/types/filters` (`UI_KEYS`, `SORTS`); `tests/utils/filterContract.test.ts` fails when they drift, so a new option starts in the contract. Its `build*Filter` return the shared wire types (`SceneFilterInput`, ..., `ClipFilterParams`) through `rangeCriterion`, `dateCriterion` and `refCriterion`; `refCriterion` takes a picker's default modifier from its option and sends only modifiers the contract field takes, so a panel option cannot send what the parser refuses.
