# URL State Management Redesign

## Problem Statement

URL "sync" and "history" behavior in Peek has several issues that degrade user experience:

1. **Back button doesn't restore state** - Filter, sort, and page changes don't create browser history entries, so the back button doesn't work as expected
2. **Default preset filters override navigation intent** - When clicking a card indicator (e.g., performers count on a scene card), the user's default preset filters get applied on top of the intended filter, polluting the results
3. **No centralized abstraction** - URL sync logic is embedded in a 1,070-line component, making it hard to maintain consistent behavior

## Current Architecture

### How It Works Today

**SearchControls.jsx** (~1,070 lines) handles all URL state management inline:

1. On mount, fetches default presets via API
2. Determines if URL has params (`needsDefaultPreset` check)
3. Merges URL params with default preset (both sort AND filters)
4. Sets React state from merged result
5. On any state change, syncs back to URL with `replace: true`

**Key Files:**
- `client/src/components/ui/SearchControls.jsx` - Core search state management
- `client/src/components/ui/TabNavigation.jsx` - Tab URL sync (separate implementation)
- `client/src/utils/urlParams.js` - Serialize/deserialize filters to/from URL

### Root Causes

**Issue 1: History not preserved**
- Location: `SearchControls.jsx:416`
- `setSearchParams(params, { replace: true })` overwrites history instead of pushing
- Every filter/page/sort change replaces the current history entry

**Issue 2: Default preset filters applied incorrectly**
- Location: `SearchControls.jsx:303-327`
- When URL has params, code creates `baseState` from default preset (sort AND filters)
- Then merges URL params on top
- Result: navigating to `/performers?sceneId=123` with a default preset that has `favorite=true` gives you both filters

**Issue 3: Inconsistent implementations**
- `TabNavigation` uses `setSearchParams()` without `replace: true` (creates history)
- `SearchControls` uses `replace: true` (no history)
- No shared abstraction to enforce consistency

## Proposed Solution

### Architecture Overview

Create a centralized URL state management system with clear separation of concerns:

```
client/src/hooks/
  useUrlState.js          # Core hook for bidirectional URL sync
  useFilterState.js       # High-level hook combining URL state + presets + query building

client/src/utils/
  urlParams.js            # (existing) Keep serialization logic here
```

### Core Principle: Read Once, Write Silently

A key goal of this redesign is to **minimize and isolate URL interactions**. The current implementation likely has sync issues because of too much two-way communication between React state and the URL.

The correct pattern:
- **Read from URL once** on component mount to initialize state
- **Write to URL silently** as user interacts (sort, filter, paginate, tab changes)
- **Never read URL again** after initialization - trust that state stays in sync via writes

This is fundamentally different from a "reactive" approach where URL changes trigger state updates. We want:

```
MOUNT:
  URL ──────► React State (one-time read)

USER INTERACTION:
  React State ──────► URL (silent write, no read-back)

NAVIGATION (back/forward):
  Browser restores URL ──────► Component remounts ──────► Fresh read
```

The browser's back/forward navigation naturally handles state restoration because it triggers a component remount (or at minimum, a fresh initialization cycle), which reads the restored URL.

### History Strategy

Different actions warrant different history behaviors:

| Action | History | Rationale |
|--------|---------|-----------|
| Page change | `push` | User expects back to return to previous page |
| Filter add/remove | `push` | User expects to undo filter changes |
| Sort change | `push` | User expects to undo sort changes |
| Search text (debounced) | `replace` | Avoid polluting history with keystrokes |
| Tab change | `push` | Already works this way |
| Initial load sync | `replace` | Don't create duplicate entry on mount |

### Default Preset Logic

The key insight: **URL filter params represent explicit user intent**. When present, they should not be overridden by preset filters. However, the user's preferred sort should still apply.

```
URL has filter params (excluding page/per_page)?
  YES → Apply preset SORT only, use URL FILTERS as-is
  NO  → Apply preset SORT and FILTERS (direct navigation)
```

This means:
- Clicking `/performers` directly → uses full default preset (sort + filters)
- Clicking indicator → `/performers?sceneId=123` → uses preset sort, but only `sceneId` filter

## Hook API Design

### useUrlState (Low-level)

Core hook for URL parameter synchronization with configurable history behavior.

```javascript
const useUrlState = (options) => {
  // options: {
  //   params: string[],        // Which params to manage
  //   defaults: object,        // Default values
  //   historyMode: 'push' | 'replace' | 'auto'  // 'auto' uses rules above
  // }

  return {
    values,           // Current parsed values
    setValue,         // (key, value, options?) => void
    setValues,        // (updates, options?) => void
    resetToDefaults,  // () => void
  };
};
```

### useFilterState (High-level)

Combines URL state with preset loading and query building.

```javascript
const useFilterState = (options) => {
  // options: {
  //   artifactType: string,
  //   context: string,
  //   initialSort: string,
  //   permanentFilters: object,
  //   syncToUrl: boolean,
  // }

  return {
    // State
    filters,
    sort: { field, direction },
    pagination: { page, perPage },
    searchText,

    // Actions
    setFilter,        // (key, value) => void
    setFilters,       // (filters) => void
    removeFilter,     // (key) => void
    clearFilters,     // () => void
    setSort,          // (field, direction?) => void
    setPage,          // (page) => void
    setPerPage,       // (perPage) => void
    setSearchText,    // (text) => void
    loadPreset,       // (preset) => void

    // Query building
    buildQuery,       // () => GraphQL query object

    // Status
    isInitialized,
    isLoadingPresets,
  };
};
```

## Migration Strategy

### Phase 1: Create New Hooks (Non-breaking)

1. Implement `useUrlState` with comprehensive tests
2. Implement `useFilterState` using `useUrlState` internally
3. Both hooks exist alongside current implementation

### Phase 2: Migrate SearchControls

1. Refactor `SearchControls` to use `useFilterState`
2. Remove inline URL management logic
3. Verify all existing functionality preserved

### Phase 3: Migrate Other Components

1. Update `TabNavigation` to use `useUrlState` for consistency
2. Audit any other components doing URL manipulation

### Phase 4: Cleanup

1. Remove deprecated code paths
2. Update documentation
3. Add integration tests for URL behavior

## Testing Considerations

### Unit Tests

- `useUrlState`: param parsing, history modes, defaults
- `useFilterState`: preset logic, query building, state transitions

### Integration Tests

- Back button behavior across different actions
- Indicator navigation with/without default presets
- Tab + filter interaction on detail pages
- Deep linking with various param combinations

### Manual Test Scenarios

1. Navigate to `/scenes`, change page to 3, click back → should return to page 1
2. Set default preset with `favorite=true` filter on performers
3. Click performer count indicator on scene card
4. Verify: arrives at `/performers?sceneId=X` with sceneId filter only (not favorite)
5. Verify: sort matches default preset preference

## Design Decisions

1. **Search text debounce** - Yes, add 500ms debounce (matching Stash) to avoid polluting history with keystrokes.

2. **Preset sort vs URL sort precedence** - URL wins. Explicit params always take precedence over implicit defaults.

3. **Detail page nested searches** - Confirmed no truly nested URL state needs. Tabs (`?tab=scenes`) and filter params coexist cleanly on the same URL without conflict.

## References

- Stash implementation: `stash/ui/v2.5/src/components/List/util.ts`
- Stash filter model: `stash/ui/v2.5/src/models/list-filter/filter.ts`
- Current Peek implementation: `peek-stash-browser/client/src/components/ui/SearchControls.jsx`
