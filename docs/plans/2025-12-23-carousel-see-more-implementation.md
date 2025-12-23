# Carousel "See More" Button Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add "More" buttons to home page carousels that navigate to filtered Scenes views.

**Architecture:** Add optional `seeMoreUrl` prop to SceneCarousel, build URLs in Home.jsx based on carousel type (hardcoded mapping for built-in carousels, dynamic URL building for custom carousels using existing filter utilities).

**Tech Stack:** React, react-router-dom, existing filterConfig.js and urlParams.js utilities

---

## Task 1: Add seeMoreUrl prop to SceneCarousel

**Files:**
- Modify: `client/src/components/ui/SceneCarousel.jsx`

**Step 1: Add Link import and seeMoreUrl prop**

At line 1, update imports:
```jsx
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Button from "./Button.jsx";
```

At line 6, add `seeMoreUrl` to destructured props:
```jsx
const SceneCarousel = ({
  title,
  titleIcon,
  scenes,
  loading = false,
  onSceneClick,
  selectedScenes = [],
  onToggleSelect,
  seeMoreUrl,
}) => {
```

**Step 2: Add "More" button after scroll buttons**

At line 157-158, after the right scroll button's closing tag and before the `</div>` that closes the button container, add the More button:

```jsx
          />
          {seeMoreUrl && (
            <Link to={seeMoreUrl}>
              <Button
                variant="secondary"
                size="sm"
                className="ml-2"
              >
                More
              </Button>
            </Link>
          )}
        </div>
```

**Step 3: Verify hot reload shows no errors**

Check browser console for any React errors. The button won't appear yet since no carousels pass `seeMoreUrl`.

**Step 4: Commit**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser
git add client/src/components/ui/SceneCarousel.jsx
git commit -m "feat: add seeMoreUrl prop to SceneCarousel component"
```

---

## Task 2: Add URL mapping for hardcoded carousels in Home.jsx

**Files:**
- Modify: `client/src/components/pages/Home.jsx`

**Step 1: Add getSeeMoreUrl helper function**

After line 33 (after the `isCustomCarousel` function), add this mapping function:

```jsx
/**
 * Get the "See More" URL for a hardcoded carousel based on its fetchKey
 */
const getSeeMoreUrl = (fetchKey) => {
  const urlMap = {
    recentlyAddedScenes: "/scenes?sort=created_at&dir=DESC",
    highRatedScenes: "/scenes?rating_min=80",
    favoritePerformerScenes: "/scenes?performerFavorite=true",
    favoriteTagScenes: "/scenes?tagFavorite=true",
    favoriteStudioScenes: "/scenes?studioFavorite=true",
    continueWatching: "/watch-history",
  };
  return urlMap[fetchKey] || null;
};
```

**Step 2: Pass seeMoreUrl to HomeCarousel's SceneCarousel**

In the `HomeCarousel` component (around line 325-334), update the SceneCarousel call to include `seeMoreUrl`:

```jsx
  return (
    <SceneCarousel
      loading={loading || isInitializing}
      title={title}
      titleIcon={icon}
      scenes={scenes || []}
      onSceneClick={createSceneClickHandler(scenes || [], title)}
      selectedScenes={selectedScenes}
      onToggleSelect={onToggleSelect}
      seeMoreUrl={getSeeMoreUrl(fetchKey)}
    />
  );
```

**Step 3: Add fetchKey prop to HomeCarousel signature**

The `HomeCarousel` component already receives `fetchKey` as a prop (line 275), so no change needed there.

**Step 4: Verify in browser**

- Navigate to home page
- Hardcoded carousels (Recently Added, High Rated, Favorite Performers, etc.) should show "More" button
- Click "More" on each and verify:
  - Recently Added: `/scenes?sort=created_at&dir=DESC`
  - High Rated: `/scenes?rating_min=80`
  - Favorite Performers: `/scenes?performerFavorite=true`
  - Favorite Tags: `/scenes?tagFavorite=true`
  - Favorite Studios: `/scenes?studioFavorite=true`

**Step 5: Commit**

```bash
git add client/src/components/pages/Home.jsx
git commit -m "feat: add See More URLs for hardcoded carousels"
```

---

## Task 3: Add seeMoreUrl to ContinueWatchingCarousel

**Files:**
- Modify: `client/src/components/ui/ContinueWatchingCarousel.jsx`

**Step 1: Add seeMoreUrl prop to SceneCarousel call**

At line 178-188, update the SceneCarousel call to include `seeMoreUrl`:

```jsx
  return (
    <SceneCarousel
      loading={loading || isInitializing}
      title="Continue Watching"
      titleIcon={<PlayCircle className="w-6 h-6" color="#10b981" />}
      scenes={scenes}
      onSceneClick={handleSceneClick}
      showProgress={true}
      selectedScenes={selectedScenes}
      onToggleSelect={onToggleSelect}
      seeMoreUrl="/watch-history"
    />
  );
```

**Step 2: Verify in browser**

- Navigate to home page
- Continue Watching carousel should show "More" button
- Click "More" and verify it navigates to `/watch-history`

**Step 3: Commit**

```bash
git add client/src/components/ui/ContinueWatchingCarousel.jsx
git commit -m "feat: add See More link to Continue Watching carousel"
```

---

## Task 4: Add URL building for custom carousels

**Files:**
- Modify: `client/src/components/pages/Home.jsx`

**Step 1: Add imports for filter utilities**

At the top of Home.jsx, add imports after existing imports (around line 13):

```jsx
import {
  carouselRulesToFilterState,
  SCENE_FILTER_OPTIONS,
} from "../../utils/filterConfig.js";
import { buildSearchParams } from "../../utils/urlParams.js";
```

**Step 2: Add helper function to build custom carousel URL**

After the `getSeeMoreUrl` function (around line 45), add:

```jsx
/**
 * Build a "See More" URL for a custom carousel from its rules
 */
const buildCustomCarouselUrl = (rules, sort, direction) => {
  if (!rules || typeof rules !== "object") {
    return "/scenes";
  }

  // Convert API rules format to UI filter state
  const filterState = carouselRulesToFilterState(rules);

  // Build URL params using existing utility
  const params = buildSearchParams({
    searchText: "",
    sortField: sort || "random",
    sortDirection: direction || "DESC",
    currentPage: 1,
    perPage: 24,
    filters: filterState,
    filterOptions: SCENE_FILTER_OPTIONS,
  });

  const queryString = params.toString();
  return queryString ? `/scenes?${queryString}` : "/scenes";
};
```

**Step 3: Update CustomCarousel to fetch full carousel data and pass seeMoreUrl**

The `CustomCarousel` component needs access to the carousel's rules. Currently it only gets `carouselId`, but the full carousel data is available in `customCarousels` state from the parent.

First, update where `CustomCarousel` is rendered (around line 206-217) to pass the full carousel:

```jsx
          return (
            <CustomCarousel
              key={carousel.prefId}
              carouselId={id}
              carousel={customCarousels.find((c) => c.id === id)}
              title={title}
              icon={icon}
              createSceneClickHandler={createSceneClickHandler}
              selectedScenes={selectedScenes}
              onToggleSelect={handleToggleSelect}
              onInitializing={handleInitializing}
            />
          );
```

**Step 4: Update CustomCarousel component to accept and use carousel prop**

Update the CustomCarousel component signature (around line 342) to accept the new prop:

```jsx
const CustomCarousel = ({
  carouselId,
  carousel,
  title,
  icon,
  createSceneClickHandler,
  selectedScenes,
  onToggleSelect,
  onInitializing,
}) => {
```

Then update the SceneCarousel call at the end of CustomCarousel (around line 415-424) to include `seeMoreUrl`:

```jsx
  return (
    <SceneCarousel
      loading={loading || isInitializing}
      title={title}
      titleIcon={icon}
      scenes={scenes}
      onSceneClick={createSceneClickHandler(scenes, title)}
      selectedScenes={selectedScenes}
      onToggleSelect={onToggleSelect}
      seeMoreUrl={carousel ? buildCustomCarouselUrl(carousel.rules, carousel.sort, carousel.direction) : null}
    />
  );
```

**Step 5: Verify in browser**

- Navigate to home page
- If you have custom carousels, they should show "More" button
- Click "More" and verify it navigates to `/scenes` with appropriate filter params
- Verify the filters are correctly applied on the Scenes page

**Step 6: Commit**

```bash
git add client/src/components/pages/Home.jsx
git commit -m "feat: add See More URLs for custom carousels"
```

---

## Task 5: Manual verification of all carousel types

**No code changes - verification only**

**Step 1: Test each hardcoded carousel**

For each carousel, click "More" and verify:

| Carousel | Expected URL | Verify Filter Active |
|----------|--------------|---------------------|
| Recently Added | `/scenes?sort=created_at&dir=DESC` | Sort dropdown shows "Created At", direction DESC |
| High Rated | `/scenes?rating_min=80` | Rating filter shows min 80 |
| Favorite Performers | `/scenes?performerFavorite=true` | "Favorite Performers" checkbox checked in filters |
| Favorite Tags | `/scenes?tagFavorite=true` | "Favorite Tags" checkbox checked in filters |
| Favorite Studios | `/scenes?studioFavorite=true` | "Favorite Studios" checkbox checked in filters |
| Continue Watching | `/watch-history` | Watch History page loads |

**Step 2: Test custom carousels (if available)**

- Create a custom carousel with specific filters (e.g., rating > 60, specific performer)
- Go to home page, find the custom carousel
- Click "More"
- Verify the Scenes page loads with matching filters

**Step 3: Test edge cases**

- Carousel with no scenes still shows "More" button (links work even if empty)
- Mobile viewport: verify "More" button is visible and tappable
- Verify no console errors

**Step 4: Final commit (if any fixes needed)**

If any fixes were needed during verification, commit them:

```bash
git add -A
git commit -m "fix: address issues found during carousel See More verification"
```

---

## Task 6: Run linting and tests

**Step 1: Run ESLint**

```bash
cd c:/Users/carrotwaxr/code/peek-stash-browser/client
npm run lint
```

Expected: No new errors (fix any that appear)

**Step 2: Run existing tests**

```bash
npm test
```

Expected: All tests pass

**Step 3: Commit any lint fixes**

```bash
git add -A
git commit -m "fix: address linting issues"
```

---

## Summary

After completing all tasks:

1. `SceneCarousel` accepts optional `seeMoreUrl` prop and renders "More" button when provided
2. All hardcoded carousels pass appropriate URLs via `getSeeMoreUrl()` mapping
3. `ContinueWatchingCarousel` links to `/watch-history`
4. Custom carousels dynamically build URLs from their rules using existing filter utilities
5. All carousel types verified working
6. Linting and tests pass
