# Carousel "See More" Button Design

**Issue:** #192
**Branch:** `feature/192-carousel-see-more`
**Date:** 2025-12-23

## Overview

Add a "More" button to each carousel on the home page that navigates to the Scenes page with the carousel's filter pre-applied.

## Design Decisions

- **Button placement:** Header row, to the right of the scroll navigation buttons
- **Button style:** Small pill button (`size="sm"`, `variant="secondary"`)
- **Button text:** "More" on all screen sizes (simple and consistent)
- **Continue Watching:** Links to `/watch-history` instead of Scenes

## Filter-to-URL Mapping

### Hardcoded Carousels

| fetchKey | URL |
|----------|-----|
| `recentlyAddedScenes` | `/scenes?sort=created_at&dir=DESC` |
| `highRatedScenes` | `/scenes?rating_min=80` |
| `favoritePerformerScenes` | `/scenes?performerFavorite=true` |
| `favoriteTagScenes` | `/scenes?tagFavorite=true` |
| `favoriteStudioScenes` | `/scenes?studioFavorite=true` |
| `continueWatching` | `/watch-history` |

### Custom Carousels

Custom carousels store rules in API format. To build the URL:
1. Use `carouselRulesToFilterState()` to convert rules to UI filter state
2. Use `buildSearchParams()` with `SCENE_FILTER_OPTIONS` to serialize to URL params

## Files to Modify

### 1. `client/src/components/ui/SceneCarousel.jsx`

Add new prop:
- `seeMoreUrl` (string, optional) - navigation target

Changes:
- Import `Link` from `react-router-dom`
- Render "More" button to the right of scroll buttons when `seeMoreUrl` is provided
- Button uses existing `Button` component with `size="sm"`, `variant="secondary"`

### 2. `client/src/components/pages/Home.jsx`

Changes to `HomeCarousel` component:
- Create mapping function `getSeeMoreUrl(fetchKey)` that returns the URL for each carousel type
- Pass `seeMoreUrl` prop to `SceneCarousel`

Changes to `CustomCarousel` component:
- Import `carouselRulesToFilterState` from `filterConfig.js`
- Import `buildSearchParams` from `urlParams.js`
- Import `SCENE_FILTER_OPTIONS` from `filterConfig.js`
- Build URL from carousel rules and pass to `SceneCarousel`

### 3. `client/src/components/ui/ContinueWatchingCarousel.jsx`

- Pass `seeMoreUrl="/watch-history"` to its `SceneCarousel`

## Verification Checklist

During implementation, manually test each carousel's "More" button:

- [ ] `recentlyAddedScenes` - Scenes page loads sorted by created_at DESC
- [ ] `highRatedScenes` - Scenes page shows rating >= 80 filter active
- [ ] `favoritePerformerScenes` - Scenes page shows "Favorite Performers" filter active
- [ ] `favoriteTagScenes` - Scenes page shows "Favorite Tags" filter active
- [ ] `favoriteStudioScenes` - Scenes page shows "Favorite Studios" filter active
- [ ] `continueWatching` - Navigates to Watch History page
- [ ] Custom carousels - Scenes page loads with matching filters from carousel rules

## Out of Scope

- Shuffle/randomize carousel content (carousels already use `sort: "random"`, investigate separately if needed)
