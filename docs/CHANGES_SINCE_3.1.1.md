# Changes Since v3.1.1

Summary of all changes merged since v3.1.1 (January 5, 2026).

## Scalability (500k+ Scene Libraries)

The biggest focus has been making Peek work with very large Stash libraries.

- **Phase 1 (#258)**: Fixed sync crashes via paginated fetching (1000 scenes per page) and bulk upserts (500 per batch). Fixed INCLUDE mode restrictions. Removed ~600 lines of dead code.
- **Phase 2 (#260)**: Paginated cleanup fetching, pre-computed tag counts in DB, SQL-based similar scene filtering (max 500 candidates), added performance logging.
- **Phase 3 (#261)**: SQL query builders for all entity types (performers, studios, tags, galleries, groups). Replaces memory-based filtering. ~50MB+ memory reduction per request.

## URL State Management

Navigation and browser history now work properly.

- **URL State Hooks (#266)**: New `useUrlState` and `useFilterState` hooks centralize URL parameter handling. Back button now correctly restores filters, pagination, and sort state. Clicking indicators no longer overrides navigation intent with default presets.
- **Tabs & Pagination (#267)**: Scene page tabs sync to URL. Fixed pagination totalPages not updating when changing perPage. Detail page image grids now sync pagination to URL.
- **Contextual Back Navigation (#271)**: Back buttons show "Back to {Page Title}" instead of generic "Back". Uses browser history navigation.

## UI Improvements

- **Mobile-Friendly Cards (#262)**: Rich entity popovers now close on click-outside (not mouse leave). Added expandable descriptions with "...more" button. New unified card architecture with reusable hooks.
- **UI Relationship Consistency (#257)**: Scene page relationship tabs moved to bottom. Added rich tooltip indicators on cards with entity preview grids. Gallery titles fall back to folder/file basename.
- **Component Refactor (#256)**: All 7 entity cards now use shared BaseCard (28% code reduction in SceneCard). New pluggable layout system. Added displayPreferences infrastructure.
- **Centralized Indicator Config (#265)**: Fixed conflicting onClick handlers on card indicators. All cards now consistently use `getIndicatorBehavior()`.

## Authentication & Sessions

- **Session Improvements (#272)**: Sliding session expiry (tokens auto-refresh after 20 hours). Auth failures redirect to login with URL preservation. Users return to original page after login.

## Bug Fixes

- **Server-side Title Fallback (#274)**: Scenes, galleries, and images with null titles now show filename without extension. SQL sorting correctly interleaves fallback titles.
- **Parent Tag Names (#270)**: Fixed empty parent tag chip names. Names now hydrated in TagQueryBuilder.
- **Lightbox Flicker (#269)**: Fixed first image of page 1 briefly flashing when navigating between pages.
- **Tmp Directory (#264)**: Fixed server crash on startup when `/app/data/tmp` directory missing.

## Testing & Infrastructure

- **Test Infrastructure (#273)**: Migrated 37 test files to centralized `tests/` directory. Added 76 new tests for critical UI components. New test utilities.
- **Docker Optimization (#263)**: Image size reduced from 997MB to 719MB (28% reduction). Standardized Node 22. BuildKit cache mounts for faster rebuilds.

---

**PRs included**: #256, #257, #258, #260, #261, #262, #263, #264, #265, #266, #267, #269, #270, #271, #272, #273, #274
