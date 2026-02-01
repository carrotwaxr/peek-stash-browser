# UI/UX Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix entity select dropdown bugs (wrong items, flicker), carousel card height inconsistency, and add per-page free-typing with preset saving.

**Architecture:** Four independent UI fixes that can be committed separately. Each fix is isolated to 1-2 files with no cross-dependencies.

**Tech Stack:** React 19, Tailwind CSS, localStorage caching

---

## Task 1: Fix Entity Select Dropdown - Reset Options on EntityType Change

**Files:**
- Modify: `client/src/components/ui/SearchableSelect.jsx:28-32` (add state)
- Modify: `client/src/components/ui/SearchableSelect.jsx:228-232` (fix useEffect)

**Problem:** When switching between filter dropdowns (e.g., performers to tags), the `options` state retains old data. The condition `options.length === 0` is false, so new options aren't loaded.

**Step 1: Add state to track previous entityType/context**

In `SearchableSelect.jsx`, add a ref after the existing state declarations (around line 42):

```jsx
// Add after line 42 (after dropdownRef)
const prevEntityTypeRef = useRef(entityType);
const prevCountFilterContextRef = useRef(countFilterContext);
```

**Step 2: Add useEffect to reset options when entityType or countFilterContext changes**

Add this new useEffect after the existing useEffects (around line 232):

```jsx
// Reset options when entityType or countFilterContext changes
useEffect(() => {
  if (
    prevEntityTypeRef.current !== entityType ||
    prevCountFilterContextRef.current !== countFilterContext
  ) {
    // Clear options to force reload
    setOptions([]);
    setSelectedItems([]);
    setSearchTerm("");

    // Update refs
    prevEntityTypeRef.current = entityType;
    prevCountFilterContextRef.current = countFilterContext;
  }
}, [entityType, countFilterContext]);
```

**Step 3: Verify the fix manually**

1. Start dev environment: `docker-compose up -d`
2. Navigate to Scenes page, open Filters
3. Open Performers dropdown, note the items
4. Close it, open Tags dropdown
5. Verify tags appear (not performers)

**Step 4: Commit**

```bash
git add client/src/components/ui/SearchableSelect.jsx
git commit -m "fix(SearchableSelect): reset options when entityType changes

Previously, switching between filter dropdowns (e.g., performers to tags)
would show stale data from the previous entity type until a search was
performed. This was because the options array wasn't being cleared when
the entityType prop changed.

Fixes the bug where performers appeared in the tags dropdown."
```

---

## Task 2: Fix Entity Select Dropdown - Fix Cache Key Mismatch

**Files:**
- Modify: `client/src/utils/filterCache.js:6-12` (update CACHE_KEYS)
- Modify: `client/src/utils/filterCache.js:30-32` (update getCache)
- Modify: `client/src/utils/filterCache.js:60-62` (update setCache)

**Problem:** `SearchableSelect` builds cache keys like `"tags_scenes"` but `filterCache.js` only knows about simple keys like `"tags"`, so context-filtered cache lookups always fail.

**Step 1: Update getCache to handle dynamic keys**

Replace the `getCache` function (lines 30-53):

```javascript
/**
 * Get cached data for an entity type
 * @param {string} cacheKey - Cache key (e.g., "tags" or "tags_scenes")
 * @returns {{data: Array, timestamp: number}|null} Cached data or null if stale/missing
 */
export const getCache = (cacheKey) => {
  try {
    // Support both simple keys (via CACHE_KEYS lookup) and composite keys (direct)
    const storageKey = CACHE_KEYS[cacheKey] || `peek-${cacheKey}-cache`;
    const cached = localStorage.getItem(storageKey);

    if (!cached) {
      return null;
    }

    const parsed = JSON.parse(cached);

    // Check if cache is still fresh
    if (!isCacheFresh(parsed.timestamp)) {
      // Remove stale cache
      localStorage.removeItem(storageKey);
      return null;
    }

    return parsed;
  } catch (error) {
    console.error(`Error reading ${cacheKey} cache:`, error);
    return null;
  }
};
```

**Step 2: Update setCache to handle dynamic keys**

Replace the `setCache` function (lines 60-76):

```javascript
/**
 * Set cache for an entity type
 * @param {string} cacheKey - Cache key (e.g., "tags" or "tags_scenes")
 * @param {Array} data - Array of {id, name} objects
 */
export const setCache = (cacheKey, data) => {
  try {
    // Support both simple keys (via CACHE_KEYS lookup) and composite keys (direct)
    const storageKey = CACHE_KEYS[cacheKey] || `peek-${cacheKey}-cache`;
    const cacheData = {
      timestamp: Date.now(),
      data,
    };

    localStorage.setItem(storageKey, JSON.stringify(cacheData));
  } catch (error) {
    console.error(`Error setting ${cacheKey} cache:`, error);
    // If quota exceeded, try to clear old caches
    if (error.name === "QuotaExceededError") {
      clearAllCaches();
    }
  }
};
```

**Step 3: Verify the fix**

1. Open browser DevTools > Application > Local Storage
2. Navigate to Scenes page, open Tags filter with scenes context
3. Verify a key like `peek-tags_scenes-cache` appears
4. Close and reopen - data should load from cache (no network request)

**Step 4: Commit**

```bash
git add client/src/utils/filterCache.js
git commit -m "fix(filterCache): support composite cache keys with context

SearchableSelect builds cache keys like 'tags_scenes' for context-filtered
dropdowns, but filterCache only knew about simple keys. Now both simple
keys (via CACHE_KEYS lookup) and composite keys (direct) are supported."
```

---

## Task 3: Fix Entity Select Dropdown - Add Loading State

**Files:**
- Modify: `client/src/components/ui/SearchableSelect.jsx:31` (add state)
- Modify: `client/src/components/ui/SearchableSelect.jsx:165-218` (update loadOptions)
- Modify: `client/src/components/ui/SearchableSelect.jsx:309-311` (update placeholder display)

**Problem:** When the component mounts with selected values, it shows the placeholder briefly before names load (flicker).

**Step 1: Add isLoadingInitial state**

After line 31 (`const [loading, setLoading] = useState(false);`), add:

```jsx
const [isLoadingInitial, setIsLoadingInitial] = useState(false);
```

**Step 2: Update the loadSelectedNames effect to use loading state**

Replace the `loadSelectedNames` async function inside the useEffect (lines 109-143):

```jsx
const loadSelectedNames = async () => {
  const valueArray = multi ? value : [value];

  // First, try to find in already-loaded options
  if (options.length > 0) {
    const selected = options.filter((opt) => valueArray.includes(opt.id));
    if (selected.length === valueArray.length) {
      setSelectedItems(selected);
      return;
    }
  }

  // Try localStorage cache
  try {
    // Build cache key including count filter context
    const cacheKey = countFilterContext
      ? `${entityType}_${countFilterContext}`
      : entityType;
    const cached = getCache(cacheKey);
    if (cached?.data) {
      const selected = cached.data.filter((opt) =>
        valueArray.includes(opt.id)
      );

      // If we found all items in cache, use them
      if (selected.length === valueArray.length) {
        setSelectedItems(selected);
        return;
      }
    }

    // Cache miss or incomplete - fetch by IDs from API
    setIsLoadingInitial(true);
    const results = await fetchItemsByIds(valueArray);
    if (results && results.length > 0) {
      setSelectedItems(results);
    }
  } catch (error) {
    console.error("Error loading selected names:", error);
  } finally {
    setIsLoadingInitial(false);
  }
};
```

**Step 3: Update placeholder display to show loading indicator**

Replace lines 309-311 (the placeholder span inside the selectedItems display):

```jsx
{selectedItems.length === 0 ? (
  isLoadingInitial ? (
    <span style={{ color: "var(--text-muted)" }}>Loading...</span>
  ) : (
    <span style={{ color: "var(--text-muted)" }}>{placeholder}</span>
  )
) : multi ? (
```

**Step 4: Verify the fix**

1. Navigate to a page with pre-selected filters (use URL params or saved preset)
2. Observe "Loading..." appears briefly instead of placeholder flicker
3. Names appear after loading completes

**Step 5: Commit**

```bash
git add client/src/components/ui/SearchableSelect.jsx
git commit -m "fix(SearchableSelect): show loading state during initial name fetch

Instead of showing the placeholder briefly before selected item names load,
now shows 'Loading...' text. This eliminates the flicker effect when
the component mounts with pre-selected values."
```

---

## Task 4: Fix Carousel Card Heights

**Files:**
- Modify: `client/src/components/ui/SceneCarousel.jsx:68` (loading skeleton)
- Modify: `client/src/components/ui/SceneCarousel.jsx:174` (main carousel)
- Modify: `client/src/components/ui/SceneCarousel.jsx:182-186` (card wrapper)

**Problem:** Carousel uses flexbox which doesn't enforce equal heights. Cards with missing metadata are shorter than neighbors.

**Step 1: Update loading skeleton to use CSS Grid**

Replace line 68:

```jsx
// Before
<div className="flex gap-4 overflow-hidden py-4">

// After
<div className="grid grid-flow-col auto-cols-[280px] gap-4 overflow-hidden py-4">
```

**Step 2: Update main carousel container to use CSS Grid**

Replace line 174:

```jsx
// Before
className="flex gap-4 overflow-x-auto scrollbar-hide py-4"

// After
className="grid grid-flow-col auto-cols-[280px] gap-4 overflow-x-auto scrollbar-hide py-4"
```

**Step 3: Simplify card wrapper (grid handles sizing)**

Replace lines 182-186 (the card wrapper div):

```jsx
// Before
<div
  key={scene.id}
  className="flex-shrink-0"
  style={{ width: "280px", minWidth: "280px" }}
>

// After
<div key={scene.id}>
```

**Step 4: Update skeleton wrapper too**

Replace lines 71-73:

```jsx
// Before
<div
  key={i}
  className="flex-shrink-0"
  style={{ width: "280px", minWidth: "280px" }}
>

// After
<div key={i}>
```

**Step 5: Verify the fix**

1. Navigate to Home page with carousels
2. Find scenes with varying metadata (some with dates/studios, some without)
3. Verify all cards in the carousel have the same height
4. Card bottoms should align horizontally

**Step 6: Commit**

```bash
git add client/src/components/ui/SceneCarousel.jsx
git commit -m "fix(SceneCarousel): use CSS Grid for consistent card heights

Changed carousel from flexbox to CSS Grid (grid-flow-col). Grid automatically
aligns all items in a row to the same height, fixing the issue where cards
with missing metadata were shorter than their neighbors."
```

---

## Task 5: Add Per Page Free-Typing

**Files:**
- Modify: `client/src/components/ui/Pagination.jsx:68` (remove perPageOptions)
- Modify: `client/src/components/ui/Pagination.jsx:184-216` (replace select with input)

**Problem:** Per Page control is a dropdown with fixed options. Users want to type custom values.

**Step 1: Add state for input value and validation**

After line 29 (after the destructured props), add:

```jsx
const [perPageInput, setPerPageInput] = useState(String(perPage));
const [perPageError, setPerPageError] = useState(false);

// Sync input when perPage prop changes
useEffect(() => {
  setPerPageInput(String(perPage));
  setPerPageError(false);
}, [perPage]);
```

**Step 2: Add handler for per page input changes**

Add after the useEffect:

```jsx
const handlePerPageChange = (value) => {
  setPerPageInput(value);

  const num = parseInt(value, 10);
  if (isNaN(num) || num < 1 || num > 500) {
    setPerPageError(true);
    return;
  }

  setPerPageError(false);
};

const handlePerPageSubmit = () => {
  const num = parseInt(perPageInput, 10);
  if (!isNaN(num) && num >= 1 && num <= 500 && num !== perPage) {
    onPerPageChange(num);
  } else {
    // Reset to current value if invalid
    setPerPageInput(String(perPage));
    setPerPageError(false);
  }
};

const handlePerPageKeyDown = (e) => {
  if (e.key === "Enter") {
    e.target.blur(); // Triggers onBlur which calls handlePerPageSubmit
  }
};
```

**Step 3: Replace per page select with input**

Replace lines 184-218 (the entire perPageSelector div):

```jsx
{showPerPageSelector && onPerPageChange && (
  <div className="flex items-center gap-2">
    <label
      htmlFor="perPage"
      className="hidden sm:block text-sm whitespace-nowrap"
      style={{ color: "var(--text-muted)" }}
    >
      Per Page:
    </label>
    <div
      data-tv-pagination-item="per-page"
      ref={(el) => paginationNav.setItemRef(5, el)}
      className={paginationNav.isFocused(5) ? "keyboard-focus" : ""}
    >
      <input
        id="perPage"
        type="number"
        min="1"
        max="500"
        value={perPageInput}
        onChange={(e) => handlePerPageChange(e.target.value)}
        onBlur={handlePerPageSubmit}
        onKeyDown={handlePerPageKeyDown}
        className="w-16 sm:w-20 px-2 sm:px-3 py-1 rounded text-sm font-medium transition-colors text-center"
        style={{
          backgroundColor: "var(--bg-card)",
          color: perPageError ? "var(--status-error)" : "var(--text-primary)",
          border: `1px solid ${perPageError ? "var(--status-error)" : "var(--border-color)"}`,
          height: "1.8rem",
        }}
      />
    </div>
  </div>
)}
```

**Step 4: Remove unused perPageOptions constant**

Delete line 68:

```jsx
// Delete this line
const perPageOptions = [12, 24, 36, 48, 60, 72, 84, 96, 108, 120];
```

**Step 5: Verify the fix**

1. Navigate to Scenes page
2. Type a custom number (e.g., 50) in the Per Page input
3. Press Enter or click away - page should reload with 50 items
4. Try invalid values (0, -5, 999) - should show error styling and reset

**Step 6: Commit**

```bash
git add client/src/components/ui/Pagination.jsx
git commit -m "feat(Pagination): allow free-typing per page value

Replaced the per-page dropdown with a number input that accepts values 1-500.
Users can type any value and submit with Enter or blur. Invalid values show
error styling and reset to the current value."
```

---

## Task 6: Add Per Page to Filter Presets

**Files:**
- Modify: `client/src/components/ui/FilterPresets.jsx:47-59` (add prop)
- Modify: `client/src/components/ui/FilterPresets.jsx:117-129` (save perPage)
- Modify: `client/src/components/ui/FilterPresets.jsx:148-167` (load perPage)

**Step 1: Add perPage prop to component**

Update the component props (around line 47):

```jsx
const FilterPresets = ({
  artifactType,
  context,
  currentFilters,
  permanentFilters = {},
  currentSort,
  currentDirection,
  currentViewMode = "grid",
  currentZoomLevel = "medium",
  currentGridDensity = "medium",
  currentTableColumns = null,
  currentPerPage = 24,  // Add this line
  onLoadPreset,
}) => {
```

**Step 2: Include perPage when saving preset**

Update the apiPost call in handleSavePreset (around line 117):

```jsx
await apiPost("/user/filter-presets", {
  artifactType,
  context: effectiveContext,
  name: presetName,
  filters: filtersToSave,
  sort: currentSort,
  direction: currentDirection,
  viewMode: currentViewMode,
  zoomLevel: currentZoomLevel,
  gridDensity: currentGridDensity,
  tableColumns: currentViewMode === "table" ? currentTableColumns : null,
  perPage: currentPerPage,  // Add this line
  setAsDefault,
});
```

**Step 3: Include perPage when loading preset**

Update the onLoadPreset call in handleLoadPreset (around line 155):

```jsx
onLoadPreset({
  filters: mergedFilters,
  sort: preset.sort,
  direction: preset.direction,
  viewMode: preset.viewMode || "grid",
  zoomLevel: preset.zoomLevel || "medium",
  gridDensity: preset.gridDensity || "medium",
  tableColumns: preset.tableColumns || null,
  perPage: preset.perPage || null,  // Add this line (null = don't change)
});
```

**Step 4: Update callers to pass currentPerPage and handle perPage in onLoadPreset**

This requires updating components that use FilterPresets. Search for FilterPresets usage:

```bash
grep -r "FilterPresets" client/src --include="*.jsx" -l
```

For each file that uses FilterPresets, add:
1. Pass `currentPerPage={perPage}` prop
2. Handle `perPage` in the `onLoadPreset` callback

Example for a typical usage:

```jsx
<FilterPresets
  artifactType="scene"
  context={filterContext}
  currentFilters={filters}
  permanentFilters={permanentFilters}
  currentSort={sort}
  currentDirection={direction}
  currentViewMode={viewMode}
  currentZoomLevel={zoomLevel}
  currentGridDensity={gridDensity}
  currentTableColumns={tableColumns}
  currentPerPage={perPage}  // Add this
  onLoadPreset={(preset) => {
    setFilters(preset.filters);
    setSort(preset.sort);
    setDirection(preset.direction);
    setViewMode(preset.viewMode);
    setZoomLevel(preset.zoomLevel);
    setGridDensity(preset.gridDensity);
    setTableColumns(preset.tableColumns);
    if (preset.perPage) {  // Add this
      setPerPage(preset.perPage);
    }
  }}
/>
```

**Step 5: Verify the fix**

1. Navigate to Clips page
2. Set per page to 50, apply some filters
3. Save as preset
4. Change per page to 24
5. Load the preset - per page should change back to 50

**Step 6: Commit**

```bash
git add client/src/components/ui/FilterPresets.jsx
# Add any other modified files that use FilterPresets
git commit -m "feat(FilterPresets): save and load perPage value

Presets now include the perPage value. When loading a preset, the perPage
is applied if present (old presets without perPage continue to work).

Addresses user request to remember per-page setting in Wall view presets."
```

---

## Summary

| Task | Files Modified | Purpose |
|------|---------------|---------|
| 1 | SearchableSelect.jsx | Reset options on entityType change |
| 2 | filterCache.js | Support composite cache keys |
| 3 | SearchableSelect.jsx | Add loading state to fix flicker |
| 4 | SceneCarousel.jsx | Use CSS Grid for equal heights |
| 5 | Pagination.jsx | Free-typing per page input |
| 6 | FilterPresets.jsx + callers | Save/load perPage in presets |

Each task results in one commit. Tasks 1-3 fix the dropdown bugs, Task 4 fixes carousel heights, Tasks 5-6 add the per-page improvements.
