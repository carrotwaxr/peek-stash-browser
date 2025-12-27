# Random Sort Randomization Fix - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix random sort so users see different random orders on each page visit while maintaining pagination stability within a session, following Stash's proven implementation pattern.

**Architecture:** Client generates an 8-digit random seed when sort changes to "random", embeds it in the sort parameter as `random_<seed>`. Server parses the seed and uses it for deterministic ordering. Same seed = same order across pagination and direction toggles.

**Tech Stack:** React (client), Express/TypeScript (server), SQLite (database)

---

## Summary

The current implementation uses `randomSeed: userId` which produces identical "random" orders every time. Stash solves this elegantly by embedding the seed in the sort parameter itself (`random_12345678`). This plan follows their proven pattern.

## Stash's Approach (Reference)

From `~/code/stash`:
- **Client:** `filter.ts` - generates seed as `Math.floor(Math.random() * 10 ** 8)`
- **API format:** Sort parameter is `"random_12345678"` instead of just `"random"`
- **Server:** `sql.go` - parses seed from sort string, uses formula for deterministic order
- **Direction toggle:** Same seed, just ASC/DESC changes - reversed order of same results
- **Reshuffle:** Reset seed to -1, regenerate on next query

## Files to Modify

### Server
- `server/controllers/library/scenes.ts` - Parse `random_<seed>` from sort parameter
- `server/services/SceneQueryBuilder.ts` - Update buildSortClause to accept seed separately

### Client
- `client/src/components/ui/SearchControls.jsx` - Generate seed, embed in sort parameter

### Tests
- `server/tests/services/SceneQueryBuilder.integration.test.ts` - Test different seeds

---

## Task 1: Update Server to Parse random_<seed> Format

**Files:**
- Modify: `server/controllers/library/scenes.ts:860-920`

**Step 1: Read the current implementation**

Review lines 860-920 to understand current sort handling.

**Step 2: Add seed parsing logic**

Before calling sceneQueryBuilder, parse the sort parameter:

```typescript
// Around line 875, after extracting sortField
let randomSeed: number | undefined;
let actualSortField = sortField;

// Parse random_<seed> format (e.g., "random_12345678")
if (sortField.startsWith('random_')) {
  const seedStr = sortField.slice(7); // Remove "random_" prefix
  const parsedSeed = parseInt(seedStr, 10);
  if (!isNaN(parsedSeed)) {
    randomSeed = parsedSeed % 1e8; // Cap at 10^8 like Stash does
    actualSortField = 'random';
  }
} else if (sortField === 'random') {
  // Plain "random" without seed - generate time-based seed
  randomSeed = (userId + Date.now()) % 1e8;
}

// Then use actualSortField and randomSeed in the query
```

**Step 3: Update the sceneQueryBuilder.execute call**

```typescript
const result = await sceneQueryBuilder.execute({
  userId,
  filters,
  excludedSceneIds: excludedIds,
  sort: actualSortField,  // Use "random" not "random_12345"
  sortDirection: sortDirection.toUpperCase() as "ASC" | "DESC",
  page,
  perPage,
  randomSeed: actualSortField === 'random' ? randomSeed : userId,
});
```

**Step 4: Build and verify**

Run: `cd server && npm run build`
Expected: TypeScript compiles successfully

**Step 5: Commit**

```bash
git add server/controllers/library/scenes.ts
git commit -m "feat: parse random_<seed> format from sort parameter"
```

---

## Task 2: Update SceneQueryBuilder Random Formula

**Files:**
- Modify: `server/services/SceneQueryBuilder.ts:1100-1102`

**Step 1: Read current random sort implementation**

The current formula at line 1101:
```typescript
random: `((CAST(substr(s.id, 1, 8) AS INTEGER) * 1103515245 + ${randomSeed || 12345}) % 2147483647) ${dir}`,
```

**Step 2: Update to match Stash's formula**

Stash uses a more robust formula that handles string IDs better:
```typescript
// Stash formula: ((id+seed)*(id+seed)*52959209 + (id+seed)*1047483763) % 2147483647
random: `(((CAST(substr(s.id, 1, 8) AS INTEGER) + ${randomSeed || 12345}) * (CAST(substr(s.id, 1, 8) AS INTEGER) + ${randomSeed || 12345}) * 52959209 + (CAST(substr(s.id, 1, 8) AS INTEGER) + ${randomSeed || 12345}) * 1047483763) % 2147483647) ${dir}`,
```

This formula:
- Adds seed to ID first (better distribution)
- Uses multiplication for better randomization
- Matches Stash's proven algorithm

**Step 3: Build and verify**

Run: `cd server && npm run build`
Expected: TypeScript compiles successfully

**Step 4: Commit**

```bash
git add server/services/SceneQueryBuilder.ts
git commit -m "refactor: use Stash's random sort formula for better distribution"
```

---

## Task 3: Generate and Embed Seed in Client SearchControls

**Files:**
- Modify: `client/src/components/ui/SearchControls.jsx`

**Step 1: Add randomSeed state**

Near the top of the component, after other useState declarations (around line 98):

```javascript
// Random seed for stable pagination when sorting by random
// -1 means uninitialized, will be generated when needed
const [randomSeed, setRandomSeed] = useState(-1);
```

**Step 2: Create helper to get sort with seed**

Add a helper function inside the component:

```javascript
// Get sort value, embedding random seed when needed
const getSortWithSeed = useCallback((sort) => {
  if (sort === 'random') {
    let seed = randomSeed;
    if (seed === -1) {
      // Generate new 8-digit seed
      seed = Math.floor(Math.random() * 1e8);
      setRandomSeed(seed);
    }
    return `random_${seed}`;
  }
  return sort;
}, [randomSeed]);
```

**Step 3: Update handleSortChange to reset seed on sort type change**

Modify handleSortChange (around line 618):

```javascript
const handleSortChange = (field) => {
  let newSortDirection = "DESC";
  let newSortField = sortField;

  // If same field, toggle direction (keep same seed for random)
  if (field === sortField) {
    newSortDirection = sortDirection === "ASC" ? "DESC" : "ASC";
  } else {
    // New field, default to DESC
    newSortField = field;

    // Reset random seed when changing TO or FROM random sort
    if (field === 'random' || sortField === 'random') {
      setRandomSeed(-1);
    }
  }
  setSort([newSortField, newSortDirection]);

  // Build query with seed-embedded sort
  const query = {
    filter: {
      direction: newSortDirection,
      page: currentPage,
      per_page: perPage,
      q: searchText,
      sort: getSortWithSeed(newSortField),
    },
    ...buildFilter(artifactType, filters, unitPreference),
  };

  onQueryChange(query);
};
```

**Step 4: Update all query building to use getSortWithSeed**

There are multiple places where queries are built. Each needs to use `getSortWithSeed(sortField)` instead of just `sortField`:

1. `initializeState()` - line ~342
2. `clearFilters()` - line ~408
3. `handleFilterSubmit()` - line ~436
4. `handleRemoveFilter()` - line ~464
5. `handleLoadPreset()` - line ~538
6. `handlePageChange()` - line ~561
7. `handleChangeSearchText()` - line ~604
8. `handleSortChange()` - line ~633 (already done above)
9. `handlePerPageChange()` - line ~656

For each, change:
```javascript
sort: sortField,
```
to:
```javascript
sort: getSortWithSeed(sortField),
```

**Step 5: Handle preset loading - reset seed**

In handleLoadPreset (around line 531), reset the seed when loading a preset:

```javascript
const handleLoadPreset = useCallback(
  (preset) => {
    setCurrentPage(1);
    setFilters({ ...permanentFilters, ...preset.filters });
    setSort([preset.sort, preset.direction]);

    // Reset random seed when loading preset (like Stash does)
    setRandomSeed(-1);

    // ... rest of function
  },
  [/* deps */]
);
```

**Step 6: Test locally**

Run: `cd client && npm run dev`
Test:
- Navigate to scenes, select random sort
- Check network tab - sort should be `random_XXXXXXXX`
- Navigate pages - same seed used
- Toggle direction - same seed, just direction changes
- Change to different sort, then back to random - new seed

**Step 7: Commit**

```bash
git add client/src/components/ui/SearchControls.jsx
git commit -m "feat: embed random seed in sort parameter for stable pagination"
```

---

## Task 4: Add Integration Tests

**Files:**
- Modify: `server/tests/services/SceneQueryBuilder.integration.test.ts`

**Step 1: Add test for different seeds producing different orders**

```typescript
it("should return different results with different random seeds", async () => {
  const seed1 = 11111111;
  const seed2 = 99999999;

  const result1 = await sceneQueryBuilder.execute({
    userId: 1,
    sort: "random",
    sortDirection: "DESC",
    page: 1,
    perPage: 10,
    randomSeed: seed1,
  });

  const result2 = await sceneQueryBuilder.execute({
    userId: 1,
    sort: "random",
    sortDirection: "DESC",
    page: 1,
    perPage: 10,
    randomSeed: seed2,
  });

  // Different seeds should give different orders
  if (result1.scenes.length >= 3 && result2.scenes.length >= 3) {
    const order1 = result1.scenes.map((s) => s.id).join(",");
    const order2 = result2.scenes.map((s) => s.id).join(",");
    expect(order1).not.toEqual(order2);
  }
});

it("should reverse order when direction changes with same seed", async () => {
  const seed = 12345678;

  const ascResult = await sceneQueryBuilder.execute({
    userId: 1,
    sort: "random",
    sortDirection: "ASC",
    page: 1,
    perPage: 10,
    randomSeed: seed,
  });

  const descResult = await sceneQueryBuilder.execute({
    userId: 1,
    sort: "random",
    sortDirection: "DESC",
    page: 1,
    perPage: 10,
    randomSeed: seed,
  });

  // Same seed with opposite directions should give reversed order
  if (ascResult.scenes.length >= 2 && descResult.scenes.length >= 2) {
    const ascIds = ascResult.scenes.map((s) => s.id);
    const descIds = descResult.scenes.map((s) => s.id);
    expect(ascIds).toEqual(descIds.reverse());
  }
});
```

**Step 2: Run tests**

Run: `cd server && npm test -- --run SceneQueryBuilder.integration`
Expected: All tests pass

**Step 3: Commit**

```bash
git add server/tests/services/SceneQueryBuilder.integration.test.ts
git commit -m "test: add tests for random seed variation and direction reversal"
```

---

## Task 5: Run Full Test Suite and Lint

**Step 1: Run server tests**

Run: `cd server && npm test`
Expected: All tests pass

**Step 2: Run client tests**

Run: `cd client && npm test -- --run`
Expected: All tests pass

**Step 3: Run linting**

Run: `cd server && npm run lint && cd ../client && npm run lint`
Expected: No lint errors

**Step 4: Build both projects**

Run: `cd server && npm run build && cd ../client && npm run build`
Expected: Both build successfully

---

## Task 6: Manual Testing Checklist

1. **Random sort produces different orders on page refresh:**
   - Navigate to Scenes page with random sort
   - Note the order of first few scenes
   - Refresh the page (F5)
   - Verify order has changed (new seed generated on mount)

2. **Pagination remains stable within session:**
   - Set random sort
   - Note scene IDs on page 1
   - Go to page 2
   - Go back to page 1
   - Verify same scenes appear

3. **Direction toggle reverses same results:**
   - Set random sort, note order: A, B, C
   - Toggle direction (click sort direction button)
   - Verify order is reversed: C, B, A (same scenes, reversed)

4. **Changing sort type generates new seed:**
   - Set random sort, note order
   - Change to date sort
   - Change back to random sort
   - Verify order is different (new seed)

5. **Loading preset resets seed:**
   - Set random sort, note order
   - Save as preset
   - Change pages
   - Load the preset
   - Verify order is different (seed was reset)

---

## Future Enhancement: Shuffle Button

Following Stash's pattern, a future PR could add a shuffle button when random sort is active:

```jsx
{sortField === 'random' && (
  <Button
    onClick={() => {
      setRandomSeed(-1);
      // Trigger refetch
    }}
    variant="ghost"
    size="sm"
    title="Shuffle"
  >
    <ShuffleIcon className="w-4 h-4" />
  </Button>
)}
```

This is out of scope for the initial fix.
