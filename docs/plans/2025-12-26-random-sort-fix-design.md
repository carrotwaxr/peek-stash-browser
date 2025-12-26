# Random Sort Randomization Fix

**Issue:** #200 (Part 3) - Random sort not actually random
**Date:** 2025-12-26
**Status:** Draft

## Problem

Despite configuring "Random" as the default sort order, scenes display in identical order on repeated visits. The "random" order is deterministic per user, producing the same results every time.

User reports:
> "Identical query logs with identical 'sort':'random' parameter produce consistent results across separate calls"

## Root Cause Analysis

In the scenes controller, the random seed is set to just the user ID:

```typescript
// scenes.ts:906
randomSeed: userId, // Stable random per user
```

This makes the random order deterministic - the same user always sees the same "random" order because the seed never changes.

The carousel controller does this correctly:

```typescript
// carousel.ts:327
randomSeed: sort === 'random' ? userId + Date.now() : userId,
```

By adding `Date.now()`, carousels get different random orders on each request.

## Design Considerations

### The Pagination Problem

True randomness on every request breaks pagination. If the order changes between page 1 and page 2 requests, users would see duplicate or missing items.

### Session-Based Randomness

The solution is to make randomness stable within a browsing session but different across sessions:
- Same session = same random order (pagination works)
- New session = new random order (users see variety)

### What Defines a "Session"?

Options:
1. **Time-based window** - Seed changes every N minutes
2. **Client-provided seed** - Client sends a seed that persists during browsing
3. **Request parameter** - Client explicitly requests "reshuffle"

## Design Decision

**Use client-provided session seed with automatic refresh**

The client will:
1. Generate a random seed on page load (stored in component state or URL)
2. Pass this seed with all scene requests
3. Generate a new seed when user explicitly clicks "Shuffle" or revisits the page

This gives users control while maintaining pagination stability.

## Implementation Plan

### 1. Add randomSeed query parameter to API

Update the scenes endpoint to accept an optional `randomSeed` parameter:

```typescript
// scenes.ts - in findScenes handler
const randomSeed = req.query.randomSeed
  ? parseInt(String(req.query.randomSeed), 10)
  : undefined;

// When building query options
randomSeed: sortField === 'random'
  ? (randomSeed ?? userId + Date.now())  // Use provided seed or generate new
  : userId,
```

### 2. Update SceneQueryBuilder for better randomization

The current random formula is:
```typescript
((CAST(substr(s.id, 1, 8) AS INTEGER) * 1103515245 + ${randomSeed}) % 2147483647)
```

This assumes scene IDs are numeric strings. If IDs are UUIDs or alphanumeric, the CAST may fail or produce collisions.

Improve with a hash-based approach:
```typescript
// Use a simple string hash of the full ID
((CAST(
  (unicode(substr(s.id, 1, 1)) * 31 +
   unicode(substr(s.id, 2, 1)) * 17 +
   unicode(substr(s.id, 3, 1)) * 13 +
   unicode(substr(s.id, 4, 1)) * 7 +
   unicode(substr(s.id, 5, 1))) AS INTEGER
) * 1103515245 + ${randomSeed}) % 2147483647)
```

### 3. Client-side: Generate and persist random seed

In the scenes browse component:

```typescript
// Generate seed on mount or when user requests shuffle
const [randomSeed, setRandomSeed] = useState(() =>
  Math.floor(Math.random() * 2147483647)
);

// Pass to API
const fetchScenes = async (page: number) => {
  const params = new URLSearchParams({
    sort: 'random',
    randomSeed: String(randomSeed),
    page: String(page),
  });
  // ...
};

// Shuffle button handler
const handleShuffle = () => {
  setRandomSeed(Math.floor(Math.random() * 2147483647));
  // Refetch will happen via useEffect dependency
};
```

### 4. Optional: Add Shuffle button to UI

Add a shuffle button when random sort is active:

```jsx
{sort === 'random' && (
  <Button onClick={handleShuffle} variant="ghost" size="sm">
    <ShuffleIcon className="w-4 h-4 mr-1" />
    Shuffle
  </Button>
)}
```

## Files to Modify

### Server
- `server/controllers/library/scenes.ts`
  - Accept `randomSeed` query parameter
  - Use provided seed or generate time-based default

### Client
- `client/src/components/pages/ScenesBrowse.jsx` (or equivalent)
  - Generate random seed on mount
  - Pass seed to API calls
  - Add optional Shuffle button
- `client/src/hooks/useScenes.ts` (if exists)
  - Pass randomSeed parameter through

## Alternative: Minimal Fix (Server-Only)

If client changes are not desired, a simpler server-only fix:

```typescript
// scenes.ts:906
randomSeed: sortField === 'random'
  ? userId + Math.floor(Date.now() / (5 * 60 * 1000))  // Changes every 5 minutes
  : userId,
```

This gives new random orders every 5 minutes while maintaining pagination stability within that window.

**Trade-off:** Users can't control when to shuffle, and pagination may break at the 5-minute boundary.

## Testing

1. Browse scenes with random sort
2. Navigate to page 2, verify no duplicates from page 1
3. Refresh the page or wait for seed timeout
4. Verify order has changed from previous session
5. If Shuffle button implemented, verify it triggers re-randomization

## Rollback Plan

If issues arise, revert to the stable `userId` seed. Users will have deterministic "random" order, which is the current behavior.
