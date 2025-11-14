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
