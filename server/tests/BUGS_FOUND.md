# Bugs Found During Filter Testing

This document tracks bugs discovered through unit testing of the filter logic.

## Bug #1: Empty Array Filter Values Return Empty Results

**Status**: Found
**Severity**: Medium
**Affected Filters**: All array-based filters (performers, tags, studios, groups)
**File**: `server/controllers/library/scenes.ts` (and likely other entity controllers)

### Description

When a filter is provided with an empty array as the value (e.g., `performers: { value: [], modifier: "INCLUDES" }`), the filter returns an empty result set instead of ignoring the filter and returning all scenes.

### Expected Behavior

Empty filter arrays should be treated as "no filter" - meaning all scenes should pass through. This is the expected behavior because:
1. An empty array means "filter by nothing"
2. Filtering by nothing should match everything
3. This is consistent with how `null` or `undefined` filters are handled

### Actual Behavior

Empty arrays cause the filter to return `[]` (empty result set).

### Test Case

```typescript
it("should handle empty arrays in filter values", () => {
  const filter: PeekSceneFilter = {
    performers: { value: [], modifier: "INCLUDES" },
  };

  const result = applyQuickSceneFilters(mockScenes, filter);

  // Empty performer filter should be ignored
  expect(result).toEqual(mockScenes);
});
```

**Test Result**: ❌ FAILED
**Expected**: 50 scenes
**Actual**: 0 scenes

### Root Cause

Looking at the implementation in `applyQuickSceneFilters`:

```typescript
if (filters.performers) {
  const { value: performerIds, modifier } = filters.performers;
  if (!performerIds) return filtered; // This checks for null/undefined
  filtered = filtered.filter((s) => {
    // Filter logic runs even when performerIds is []
    const scenePerformerIds = (s.performers || []).map((p) => String(p.id));
    const filterPerformerIds = performerIds.map((id) => String(id)); // [] maps to []
    if (modifier === "INCLUDES") {
      return filterPerformerIds.some((id: string) => // [].some() always returns false
        scenePerformerIds.includes(id)
      );
    }
    // ...
  });
}
```

The check `if (!performerIds)` only catches `null` or `undefined`, not empty arrays `[]`.

### Proposed Fix

Add length check before applying array-based filters:

```typescript
if (filters.performers) {
  const { value: performerIds, modifier } = filters.performers;
  if (!performerIds || performerIds.length === 0) return filtered; // Add length check
  filtered = filtered.filter((s) => {
    // ... rest of logic
  });
}
```

This fix should be applied to ALL array-based filters:
- `performers`
- `tags`
- `studios`
- `groups`

### Impact

**User Impact**: Low to Medium
- Users are unlikely to intentionally pass empty arrays
- However, if client-side code generates filters dynamically (e.g., from URL params), empty arrays could occur
- This would result in unexpectedly empty grids/lists

**Testing Impact**: This bug was caught by unit tests before reaching production

### Additional Notes

This same bug likely exists in other entity filter controllers:
- `controllers/library/performers.ts`
- `controllers/library/studios.ts`
- `controllers/library/tags.ts`
- `controllers/library/galleries.ts`
- `controllers/library/groups.ts`

All array-based filters in these files should be checked and fixed.

## Bug #2: Empty Range Filter Objects in Frontend Filter Builders

**Status**: Found
**Severity**: Low
**Affected Filters**: All range-based filters in frontend `buildPerformerFilter()`, `buildSceneFilter()`, etc.
**File**: `client/src/utils/filterConfig.js`

### Description

When a range filter (like `oCounter`, `playCount`, `rating`, etc.) is provided with empty values (e.g., `{ min: "", max: "" }` or `{ min: undefined, max: undefined }`), the filter builder creates an empty object `{}` in the result instead of omitting the filter entirely.

### Expected Behavior

Range filters with no actual values should be omitted from the result object. An empty object `{}` should never be sent to the backend because:
1. It has no `modifier` or `value` properties
2. The backend expects either a complete filter object or `undefined`
3. Empty objects waste bandwidth and could confuse backend validation

### Actual Behavior

The code creates `performerFilter.o_counter = {}` (empty object) when both `min` and `max` are empty strings or have no meaningful values.

### Test Case

```javascript
it("should not include count filters when min and max are empty strings", () => {
  const uiFilters = {
    oCounter: { min: "", max: "" },
    playCount: { min: "", max: "" },
    sceneCount: { min: "", max: "" },
  };
  const result = buildPerformerFilter(uiFilters);
  expect(result.o_counter).toEqual({}); // CURRENT: Empty object
  expect(result.play_count).toEqual({}); // CURRENT: Empty object
  expect(result.scene_count).toEqual({}); // CURRENT: Empty object

  // EXPECTED: All should be undefined
  expect(result.o_counter).toBeUndefined();
  expect(result.play_count).toBeUndefined();
  expect(result.scene_count).toBeUndefined();
});
```

**Test Result**: ✅ Test currently expects empty objects (documents current behavior)
**Expected**: Filters should be `undefined`
**Actual**: Filters are `{}` (empty objects)

### Root Cause

Looking at `buildPerformerFilter` in `client/src/utils/filterConfig.js` (lines 1526-1547):

```javascript
if (
  filters.oCounter?.min !== undefined ||
  filters.oCounter?.max !== undefined
) {
  performerFilter.o_counter = {}; // Empty object created immediately
  const hasMin =
    filters.oCounter.min !== undefined && filters.oCounter.min !== "";
  const hasMax =
    filters.oCounter.max !== undefined && filters.oCounter.max !== "";

  if (hasMin && hasMax) {
    performerFilter.o_counter.modifier = "BETWEEN";
    performerFilter.o_counter.value = parseInt(filters.oCounter.min);
    performerFilter.o_counter.value2 = parseInt(filters.oCounter.max);
  } else if (hasMin) {
    performerFilter.o_counter.modifier = "GREATER_THAN";
    performerFilter.o_counter.value = parseInt(filters.oCounter.min) - 1;
  } else if (hasMax) {
    performerFilter.o_counter.modifier = "LESS_THAN";
    performerFilter.o_counter.value = parseInt(filters.oCounter.max) + 1;
  }
  // If neither hasMin nor hasMax, the empty object remains
}
```

**Problem**: The outer `if` condition checks `!== undefined`, but `hasMin` and `hasMax` also check `!== ""`. This means:
- `{ min: "", max: "" }` passes the outer check (values are defined, just empty strings)
- But both `hasMin` and `hasMax` are false (empty strings)
- Result: Empty object `{}` is created but never populated

### Proposed Fix

**Option 1**: Add check at the end to delete empty objects
```javascript
if (
  filters.oCounter?.min !== undefined ||
  filters.oCounter?.max !== undefined
) {
  performerFilter.o_counter = {};
  const hasMin = filters.oCounter.min !== undefined && filters.oCounter.min !== "";
  const hasMax = filters.oCounter.max !== undefined && filters.oCounter.max !== "";

  if (hasMin && hasMax) {
    performerFilter.o_counter.modifier = "BETWEEN";
    performerFilter.o_counter.value = parseInt(filters.oCounter.min);
    performerFilter.o_counter.value2 = parseInt(filters.oCounter.max);
  } else if (hasMin) {
    performerFilter.o_counter.modifier = "GREATER_THAN";
    performerFilter.o_counter.value = parseInt(filters.oCounter.min) - 1;
  } else if (hasMax) {
    performerFilter.o_counter.modifier = "LESS_THAN";
    performerFilter.o_counter.value = parseInt(filters.oCounter.max) + 1;
  } else {
    // Neither hasMin nor hasMax - delete the empty object
    delete performerFilter.o_counter;
  }
}
```

**Option 2**: Check for empty values in outer condition
```javascript
const hasOCounterMin = filters.oCounter?.min !== undefined && filters.oCounter.min !== "";
const hasOCounterMax = filters.oCounter?.max !== undefined && filters.oCounter.max !== "";

if (hasOCounterMin || hasOCounterMax) {
  performerFilter.o_counter = {};

  if (hasOCounterMin && hasOCounterMax) {
    performerFilter.o_counter.modifier = "BETWEEN";
    performerFilter.o_counter.value = parseInt(filters.oCounter.min);
    performerFilter.o_counter.value2 = parseInt(filters.oCounter.max);
  } else if (hasOCounterMin) {
    performerFilter.o_counter.modifier = "GREATER_THAN";
    performerFilter.o_counter.value = parseInt(filters.oCounter.min) - 1;
  } else if (hasOCounterMax) {
    performerFilter.o_counter.modifier = "LESS_THAN";
    performerFilter.o_counter.value = parseInt(filters.oCounter.max) + 1;
  }
}
```

**Recommendation**: Option 2 is cleaner and prevents the empty object from ever being created.

### Affected Filters

This pattern affects ALL range-based filters in frontend filter builders:

**In `buildPerformerFilter()`**:
- `rating100` (lines 1404-1422)
- `o_counter` (lines 1526-1547)
- `play_count` (lines 1549-1570)
- `scene_count` (lines 1572-1593)

**In `buildSceneFilter()`**:
- `rating100` (lines ~1058+)
- `o_counter` (lines ~1137+)
- Other range filters

**In other filter builders**: `buildStudioFilter()`, `buildTagFilter()`, `buildGroupFilter()`, etc.

### Impact

**User Impact**: Very Low
- Empty objects `{}` are likely ignored by the backend (no `modifier` property)
- Wastes minimal bandwidth
- Could cause confusion or errors if backend validates filter structure strictly
- No functional bugs in production observed

**Code Quality Impact**: Low to Medium
- Creates unnecessary properties in filter objects
- Makes debugging harder (seeing `{ o_counter: {} }` is confusing)
- Violates clean code principles (objects should be meaningful or not exist)

**Testing Impact**: This bug was discovered through comprehensive frontend unit testing

### Fix Priority

**Priority**: Low
- Not causing user-facing issues currently
- Backend likely handles empty objects gracefully
- Should be fixed for code cleanliness and to prevent potential future issues
- Can be batched with other filter improvements
