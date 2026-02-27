# Dead Code Cleanup Tracker

Findings from knip + depcheck run on 2026-02-11. Each item verified by grepping the codebase.

## Category 1: Unused Dependencies

| # | Package | Location | Status | Decision |
|---|---------|----------|--------|----------|
| 1 | `@trivago/prettier-plugin-sort-imports` | client + server | KEEP | Used in root .prettierrc.json plugin config |
| 2 | `@graphql-codegen/cli` | server | KEEP | Used by npm run stash:codegen + codegen.yml |
| 3 | `@graphql-codegen/typescript` | server | KEEP | codegen.yml plugin |
| 4 | `@graphql-codegen/typescript-graphql-request` | server | KEEP | codegen.yml plugin |
| 5 | `@graphql-codegen/typescript-operations` | server | KEEP | codegen.yml plugin |
| 5b | `@types/bcryptjs` | server | DELETED | bcryptjs v3 bundles own types |

## Category 2: Unused Files

| # | File | Notes | Status | Decision |
|---|------|-------|--------|----------|
| 6 | `client/src/components/settings/UserGroupsModal.jsx` | No imports anywhere | DELETED | Obsolete; functionality in UserEditModal + GroupModal |
| 7 | `client/src/components/timeline/index.js` | Barrel file, all consumers import directly | DELETED | Dead indirection |
| 8 | `client/src/components/wall/index.js` | Barrel file, all consumers import directly | DELETED | Dead indirection |
| 9 | `client/src/components/carousel-builder/index.js` | Barrel file, all consumers import directly | DELETED | Dead indirection |
| 10 | `server/controllers/library/index.ts` | Barrel file, routes import directly | DELETED | Dead indirection |
| 11 | `server/services/DeduplicationService.ts` | No imports anywhere | DELETED | Replaced with issue #355 |
| 12 | `server/types/nested.ts` | No imports anywhere | DELETED | Unused type defs |
| 13 | `server/utils/carouselDefaults.ts` | No imports anywhere | DELETED | Superseded by inline defs in setup.ts + user.ts |
| 14 | `server/utils/queryBuilders.ts` | No imports anywhere | DELETED | Wrong architecture (Prisma ORM); duplication tracked in #356 |
| 15 | `server/scripts/benchmark-performance.ts` | Standalone dev script, no package.json entry | DELETED | Replaced with issue #357 for proper perf suite |
| 16 | `server/scripts/check-peek-db.ts` | Standalone dev script | DELETED | One-off debug script |
| 17 | `server/scripts/compute-rankings.ts` | Standalone dev script | DELETED | One-off debug script |
| 18 | `server/scripts/investigate-sync.ts` | Standalone dev script | DELETED | One-off debug script |

## Category 3: Unused Exports

| # | Export | File | Notes | Status | Decision |
|---|--------|------|-------|--------|----------|
| 19 | `getClipById` | `client/src/services/api.js` | Never called | DELETED | Dead function removed |
| 20 | `showInfo`, `showPromise` | `client/src/utils/toast.jsx` | Named exports never imported (also on default obj) | DONE | Removed unnecessary `export` keyword |
| 21 | `userInstanceService` | `server/services/UserInstanceService.ts` | Object bundle unused; named functions are used | DELETED | Removed unused bundled object |
| 22 | `DateStringSchema` | `server/schemas/base.ts` | Never imported | DELETED | Dead code removed |
| 23 | `transformGallery`, `transformImage` | `server/utils/stashUrlProxy.ts` | Never imported (different methods with same name in StashEntityService) | DELETED | Dead functions + unused Gallery import removed |

## Category 4: Redundant Default Exports (lower priority)

Hooks that exported both named + default, but only named was ever imported:
- `useGlobalNavigation.js` - DONE (removed default export)
- `useHiddenEntities.js` - DONE (removed default export)
- `useImagesPagination.js` - DONE (removed default export)
- `usePaginatedLightbox.js` - DONE (removed default export)
- `useScrollToCurrentItem.js` - DONE (removed default export)
- `useRatingHotkeys.js` - DONE (removed default export, fixed default import in PlaybackControls.jsx)
- `useKeyboardShortcuts.js` - DONE (removed default export, fixed default import in TopBar.jsx)

## Bonus: CI/Docker Cleanup

- Removed stale compiled scripts from `server/dist/scripts/` (4 orphaned .js files)

## Skipped (noise/false positives)
- 259 unused exported types from `graphql/generated/graphql.ts` (auto-generated)
- Integration test helpers (test infrastructure entry points)
- 13 unused enum members from generated GraphQL (auto-generated)
