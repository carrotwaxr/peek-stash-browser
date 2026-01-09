# Tabs and Pagination URL Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make tabs and pagination URL-synced and consistent across all pages, fix the pagination bug where totalPages doesn't update when perPage changes.

**Architecture:** Extend existing `useUrlState` hook to create a `useTabState` hook for consistent tab URL management. Fix pagination by using hook state instead of URL params for totalPages calculation. Add pagination URL sync to image grids.

**Tech Stack:** React hooks, react-router-dom, existing useUrlState/useFilterState infrastructure.

---

## Summary of Changes

### Issue 1: Scene.jsx tabs use local state (inconsistent)
- Scene.jsx uses `useState('similar')` for tabs instead of URL params
- All other detail pages use `TabNavigation` component with `?tab=` URL param
- Fix: Refactor Scene.jsx to use TabNavigation component

### Issue 2: Pagination totalPages calculated from stale URL params
- List pages read `per_page` from URL to calculate totalPages: `Math.ceil(totalCount / urlPerPage)`
- When perPage changes, URL updates happen async, so calculation uses old value
- Fix: Use `pagination.perPage` from `useFilterState` hook instead of parsing URL

### Issue 3: Image grid pagination not URL-synced
- `usePaginatedLightbox` and `useImagesPagination` use internal state only
- Page changes in image grids (GalleryDetail, ImagesTab) don't persist to URL
- Fix: Add optional URL sync support to these hooks

---

## Task 1: Fix Scene.jsx tabs to use URL params

**Files:**
- Modify: `client/src/components/pages/Scene.jsx:77` (remove local state)
- Modify: `client/src/components/pages/Scene.jsx:251-283` (use TabNavigation)

**Step 1: Read the current Scene.jsx implementation**

Already done in exploration. Key lines:
- Line 77: `const [activeTab, setActiveTab] = useState('similar');`
- Lines 251-283: Custom TabButton rendering

**Step 2: Import TabNavigation and useSearchParams**

Add to imports at top of file:

```jsx
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import TabNavigation from "../ui/TabNavigation.jsx";
```

**Step 3: Replace local state with URL-derived state**

In `SceneContent` component, replace:
```jsx
const [activeTab, setActiveTab] = useState('similar');
```

With:
```jsx
const [searchParams] = useSearchParams();
const activeTab = searchParams.get('tab') || 'similar';
```

**Step 4: Replace custom tab rendering with TabNavigation**

Replace the custom tab buttons (lines 252-283) with TabNavigation:

```jsx
{/* Tab Navigation - URL-synced like other detail pages */}
<TabNavigation
  tabs={[
    { id: 'similar', label: 'Similar Scenes', count: similarScenesCount },
    ...(scene.groups && scene.groups.length > 0
      ? [{ id: 'collections', label: 'Collections', count: scene.groups.length }]
      : []),
    ...(scene.galleries && scene.galleries.length > 0
      ? [{ id: 'galleries', label: 'Galleries', count: scene.galleries.length }]
      : []),
  ]}
  defaultTab="similar"
/>
```

**Step 5: Remove TabButton component**

Delete the `TabButton` component definition (lines 28-55) as it's no longer needed.

**Step 6: Run tests to verify**

Run: `cd client && npm test -- --testPathPattern="Scene" --watchAll=false`
Expected: Tests pass (or no Scene-specific tests exist)

**Step 7: Manual verification**

1. Navigate to a scene page
2. Click "Collections" tab if available
3. Verify URL shows `?tab=collections`
4. Click back button
5. Verify returns to previous tab state

**Step 8: Commit**

```bash
git add client/src/components/pages/Scene.jsx
git commit -m "feat: sync Scene page tabs to URL params

Scene.jsx now uses TabNavigation component for tab management,
consistent with other detail pages. Tab selection persists to
URL and supports back/forward navigation."
```

---

## Task 2: Fix pagination totalPages calculation bug

**Files:**
- Modify: `client/src/components/pages/Galleries.jsx:40-41`
- Modify: `client/src/components/pages/Groups.jsx` (same pattern)
- Modify: `client/src/components/pages/Performers.jsx` (same pattern)
- Modify: `client/src/components/pages/Studios.jsx` (same pattern)
- Modify: `client/src/components/pages/Tags.jsx` (same pattern)
- Modify: `client/src/components/pages/Images.jsx` (same pattern)
- Modify: `client/src/components/scene-search/SceneSearch.jsx` (same pattern)

**Step 1: Understand the bug**

Current pattern in all list pages:
```jsx
const urlPerPage = parseInt(searchParams.get("per_page")) || 24;
const totalPages = Math.ceil(totalCount / urlPerPage);
```

Problem: When user changes perPage from 24 to 48:
1. `setPerPageAction(48)` called in SearchControls
2. URL update is async via `setSearchParams`
3. Component re-renders before URL updates
4. `searchParams.get("per_page")` still returns "24"
5. totalPages calculated incorrectly

Fix: SearchControls already has access to `pagination.perPage` from useFilterState. Pass it down.

**Step 2: Modify SearchControls to expose perPage via render props or context**

Actually, looking at the code more carefully, SearchControls already passes `perPage` to Pagination component (line 243: `const perPage = pagination.perPage`). The issue is the *parent* pages calculate totalPages incorrectly.

Better fix: Have SearchControls calculate and use totalPages internally, or pass perPage back up.

Simplest fix: Remove redundant totalPages calculation from parent pages. SearchControls already receives totalCount as a prop and has the correct perPage. Have it calculate totalPages internally.

**Step 3: Verify SearchControls can calculate totalPages**

SearchControls already has:
- `totalCount` as a prop
- `perPage` from `pagination.perPage` (correct, from hook state)

It receives `totalPages` as a prop but could calculate it itself.

**Step 4: Update SearchControls to calculate totalPages when not provided**

In SearchControls.jsx, add calculation:

```jsx
// Calculate totalPages from hook state (avoids stale URL param issue)
const calculatedTotalPages = totalCount ? Math.ceil(totalCount / perPage) : 0;
const effectiveTotalPages = totalPages ?? calculatedTotalPages;
```

Then use `effectiveTotalPages` everywhere `totalPages` is used.

**Step 5: Update all list pages to remove redundant totalPages calculation**

Each page currently does:
```jsx
const urlPerPage = parseInt(searchParams.get("per_page")) || 24;
const totalPages = Math.ceil(totalCount / urlPerPage);
```

Change to simply not pass totalPages (SearchControls will calculate it):
```jsx
// Remove: const urlPerPage = ...
// Remove: const totalPages = ...

<SearchControls
  // Remove: totalPages={totalPages}
  totalCount={totalCount}
  // ... other props
/>
```

Actually, checking the code, some pages need totalPages for TV navigation. Let's keep the prop but make SearchControls prefer its own calculation.

Better approach: Just fix the calculation in the parent pages to use a ref or callback.

**Simplest fix: Update parent pages to not calculate totalPages at all**

Since SearchControls has all the info it needs, just remove totalPages prop from parent pages entirely.

**Step 6: Update Galleries.jsx**

Remove lines 40-41 and totalPages prop:

Before:
```jsx
const urlPerPage = parseInt(searchParams.get("per_page")) || 24;
const totalPages = Math.ceil(totalCount / urlPerPage);
```

After: Remove these lines entirely.

Remove `totalPages={totalPages}` from SearchControls props (it will calculate internally).

But wait - `useGridPageTVNavigation` also needs totalPages. Let's check that.

**Step 7: Check useGridPageTVNavigation dependency**

Looking at Galleries.jsx:44-54:
```jsx
const {
  isTVMode,
  _tvNavigation,
  searchControlsProps,
  gridItemProps,
} = useGridPageTVNavigation({
  items: currentGalleries,
  columns,
  totalPages,  // <-- needs totalPages
  onItemSelect: (gallery) => navigate(`/gallery/${gallery.id}`),
});
```

So TV navigation needs totalPages too. The fix needs to provide a correctly-calculated totalPages.

**Step 8: Revised approach - use SearchControls state callback**

Add a callback to SearchControls that provides the current perPage to parent:

Actually, the cleanest fix: have SearchControls expose its pagination state.

**Step 9: Final approach - calculate totalPages from totalCount and a fixed perPage**

Looking at this more carefully, the issue is that:
1. Parent calculates totalPages from URL (stale)
2. Parent passes totalPages to SearchControls
3. SearchControls uses that totalPages for pagination

The fix should be:
1. Parent passes only totalCount
2. SearchControls calculates totalPages from totalCount and its own perPage state

**Step 10: Implement the fix in SearchControls.jsx**

Modify SearchControls to calculate totalPages internally:

At line ~242, after extracting pagination values:
```jsx
const currentPage = pagination.page;
const perPage = pagination.perPage;

// Calculate totalPages from hook state (fixes stale URL param bug)
const calculatedTotalPages = totalCount ? Math.ceil(totalCount / perPage) : 0;
```

Then in all places where `totalPages` prop is used, use `calculatedTotalPages` instead.

**Step 11: Update all list pages to remove totalPages calculation**

For each page (Galleries, Groups, Performers, Studios, Tags, Images):

Remove:
```jsx
const urlPerPage = parseInt(searchParams.get("per_page")) || 24;
const totalPages = Math.ceil(totalCount / urlPerPage);
```

Keep totalPages prop but calculate correctly:
```jsx
// Calculate totalPages correctly using the default perPage
// (SearchControls will recalculate with actual perPage internally)
const totalPages = Math.ceil(totalCount / 24);
```

Or better - have SearchControls provide totalPages back via a ref or state callback.

**Step 12: Cleanest solution - provide totalPages via ref callback**

Add to SearchControls props:
```jsx
totalPagesRef, // Optional ref to receive calculated totalPages
```

In SearchControls, after calculating:
```jsx
useEffect(() => {
  if (totalPagesRef) {
    totalPagesRef.current = calculatedTotalPages;
  }
}, [calculatedTotalPages, totalPagesRef]);
```

**Step 13: Implement in Galleries.jsx as example**

```jsx
const totalPagesRef = useRef(0);

// ... later in JSX:
<SearchControls
  totalPagesRef={totalPagesRef}
  totalCount={totalCount}
  // ...
/>

// For TV navigation, use ref value:
const { ... } = useGridPageTVNavigation({
  totalPages: totalPagesRef.current || Math.ceil(totalCount / 24),
  // ...
});
```

Hmm, but refs don't trigger re-renders. This won't work for TV navigation.

**Step 14: Simplest working solution**

The real fix is simple: instead of reading perPage from URL, read it from SearchControls' internal state. But SearchControls is a child, so parent can't access it.

**Option A:** Lift perPage state up to parent (breaking change, lots of refactoring)
**Option B:** Have SearchControls report its perPage back to parent via callback
**Option C:** Accept minor delay - totalPages will be correct after next render

Let's go with Option B - add an `onPerPageChange` callback that parents can use:

```jsx
// In parent (Galleries.jsx):
const [effectivePerPage, setEffectivePerPage] = useState(24);
const totalPages = Math.ceil(totalCount / effectivePerPage);

<SearchControls
  onPerPageStateChange={setEffectivePerPage}  // New callback
  // ...
/>
```

In SearchControls, call this whenever perPage changes:
```jsx
useEffect(() => {
  onPerPageStateChange?.(perPage);
}, [perPage, onPerPageStateChange]);
```

**Step 15: Implement the fix**

In SearchControls.jsx, add prop and effect:

```jsx
// Add to props:
onPerPageStateChange, // Optional callback when perPage changes

// Add effect after perPage is extracted:
useEffect(() => {
  if (onPerPageStateChange) {
    onPerPageStateChange(perPage);
  }
}, [perPage, onPerPageStateChange]);
```

**Step 16: Update Galleries.jsx**

```jsx
const [effectivePerPage, setEffectivePerPage] = useState(
  parseInt(searchParams.get("per_page")) || 24
);
const totalPages = totalCount ? Math.ceil(totalCount / effectivePerPage) : 0;

// ... in JSX:
<SearchControls
  onPerPageStateChange={setEffectivePerPage}
  totalCount={totalCount}
  // ... other props (can remove totalPages prop now)
/>
```

**Step 17: Apply same fix to all other list pages**

- Groups.jsx
- Performers.jsx
- Studios.jsx
- Tags.jsx
- Images.jsx
- SceneSearch.jsx

**Step 18: Run tests**

Run: `cd client && npm test -- --watchAll=false`
Expected: All tests pass

**Step 19: Manual verification**

1. Navigate to /galleries with 48+ items
2. Change per_page from 24 to 48
3. Verify: pagination shows correct number of pages immediately
4. Verify: items per page changes correctly

**Step 20: Commit**

```bash
git add client/src/components/ui/SearchControls.jsx \
        client/src/components/pages/Galleries.jsx \
        client/src/components/pages/Groups.jsx \
        client/src/components/pages/Performers.jsx \
        client/src/components/pages/Studios.jsx \
        client/src/components/pages/Tags.jsx \
        client/src/components/pages/Images.jsx \
        client/src/components/scene-search/SceneSearch.jsx
git commit -m "fix: pagination totalPages updates correctly when perPage changes

Added onPerPageStateChange callback to SearchControls that notifies
parent components when perPage changes. Parents now use this to
calculate totalPages instead of reading stale URL params.

Fixes issue where pagination controls showed wrong page count after
changing items per page."
```

---

## Task 3: Add URL sync to image grid pagination (optional enhancement)

**Files:**
- Modify: `client/src/hooks/usePaginatedLightbox.js`
- Modify: `client/src/components/pages/GalleryDetail.jsx`
- Modify: `client/src/components/grids/ImagesTab.jsx` (if exists)

**Step 1: Understand current implementation**

`usePaginatedLightbox` has `externalPage` and `onExternalPageChange` props for external state management. Currently used internally only.

**Step 2: Update GalleryDetail to use URL for page state**

In GalleryDetail.jsx, add URL-based page state:

```jsx
const [searchParams, setSearchParams] = useSearchParams();
const urlPage = parseInt(searchParams.get('page')) || 1;

const handlePageChange = useCallback((newPage) => {
  const params = new URLSearchParams(searchParams);
  if (newPage === 1) {
    params.delete('page');
  } else {
    params.set('page', String(newPage));
  }
  setSearchParams(params);
}, [searchParams, setSearchParams]);

// Pass to usePaginatedLightbox:
const lightbox = usePaginatedLightbox({
  perPage: PER_PAGE,
  totalCount,
  externalPage: urlPage,
  onExternalPageChange: handlePageChange,
});
```

**Step 3: Apply same pattern to other image grid pages**

Find and update all pages using usePaginatedLightbox or useImagesPagination.

**Step 4: Test and commit**

Run tests, manually verify, commit with appropriate message.

---

## Task 4: Write tests for the fixes

**Files:**
- Create: `client/src/hooks/__tests__/useFilterState.pagination.test.jsx`
- Modify: `client/src/hooks/__tests__/useFilterState.test.jsx` (add pagination tests)

**Step 1: Add test for perPage callback**

```jsx
describe('onPerPageStateChange callback', () => {
  it('calls callback when perPage changes', async () => {
    const onPerPageStateChange = vi.fn();
    // ... render SearchControls with callback
    // ... change perPage
    // ... expect callback to be called with new value
  });
});
```

**Step 2: Add test for totalPages calculation**

Test that totalPages is calculated correctly when perPage changes.

**Step 3: Commit tests**

```bash
git add client/src/hooks/__tests__/
git commit -m "test: add tests for pagination perPage callback"
```

---

## Execution Checklist

- [ ] Task 1: Scene.jsx tabs → URL params (Steps 1-8)
- [ ] Task 2: Fix pagination totalPages bug (Steps 1-20)
- [ ] Task 3: Image grid pagination URL sync (Optional, Steps 1-4)
- [ ] Task 4: Add tests (Steps 1-3)

---

## Notes

- All changes follow existing patterns in the codebase
- Tab changes use `push` (creates history entry) per the design doc
- Pagination changes already use `push` via useFilterState
- Image grid pagination enhancement is optional but recommended for consistency
