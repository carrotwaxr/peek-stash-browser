# QA Issues for 2.0 Release

This document tracks minor issues identified during QA testing for the 2.0 release.

## Branch Strategy

Issues are grouped into logical branches:

1. **bugfix/playlist-thumbnail-scroll** - Playlist thumbnail strip auto-scroll
2. **bugfix/rating-popup-scroll-close** - Rating popup closes on scroll
3. **feature/collection-performers-tab** - Add Performers tab to CollectionDetail
4. **feature/gallery-card-indicators** - Add Performers/Tags indicators to Gallery cards
5. **bugfix/lightbox-loading-delay** - Fix Image Lightbox loading spinner delay

---

## Issue 1: Playlist Thumbnail Strip Doesn't Scroll to Current Scene

**Status:** Pending
**Branch:** `bugfix/playlist-thumbnail-scroll`
**File:** `client/src/components/playlist/PlaylistStatusCard.jsx`

**Problem:**
When navigating around in a Playlist (most evident in Shuffle mode), the playlist status thumbnail strip doesn't scroll to put the currently playing Scene in view.

**Expected Behavior:**
The thumbnail strip should automatically scroll to center the currently playing scene when navigation occurs.

**Current Implementation:**
- Uses `useEffect` with `scrollIntoView` (lines 37-45)
- Has `inline: "center"` option to center the thumbnail
- Should be working but may have issues with timing or conditions

**Investigation Notes:**
- Need to verify the `useEffect` dependency array
- Check if `currentSceneId` changes trigger the scroll
- May need to add explicit scroll on shuffle/navigation events

**Solution:**
TBD after investigation

---

## Issue 2: Rating Popup Doesn't Close on Scroll

**Status:** Pending
**Branch:** `bugfix/rating-popup-scroll-close`
**File:** `client/src/components/ui/RatingSliderDialog.jsx`

**Problem:**
The Rating popup menu that appears when clicking the rating badge on any card stays open when scrolling, which is annoying especially on mobile.

**Expected Behavior:**
The popup should close when the user scrolls the page.

**Current Implementation:**
- Listens for clicks outside to close (lines 86-107)
- No scroll event listener implemented
- Rendered as portal to `document.body`

**Solution:**
Add a scroll event listener that closes the popup when scrolling occurs. Should listen on `window` or the scrollable container.

---

## Issue 3: CollectionDetail Missing Performers Tab

**Status:** Pending
**Branch:** `feature/collection-performers-tab`
**File:** `client/src/components/pages/GroupDetail.jsx`

**Problem:**
CollectionDetail (GroupDetail) has Performers and Scenes in its Stats section, but doesn't present a Performers tab. TagDetail correctly shows a Performers tab.

**Expected Behavior:**
CollectionDetail should have a Performers tab similar to TagDetail, showing all performers that appear in the collection's scenes.

**Current Implementation:**
- No tabbed interface - all content displayed in sections
- Shows: Details, Statistics, Studio, Director, Parent Collections, Sub-Collections, Tags, Links
- Bottom section shows scenes using `SceneSearch` component
- Missing Performers section entirely

**Reference:**
Look at TagDetail.jsx for how Performers tab is implemented there.

**Solution:**
1. Add tab navigation similar to TagDetail
2. Create Performers tab that shows performers from the collection's scenes
3. May need to aggregate performers from scenes or fetch from API

---

## Issue 4: Gallery Card Missing Performers/Tags Indicators

**Status:** Pending
**Branch:** `feature/gallery-card-indicators`
**File:** `client/src/components/pages/Galleries.jsx`

**Problem:**
Gallery cards should show Performers and Tags indicators like Scene cards do, but currently only show image count.

**Expected Behavior:**
- Performers indicator: Opens popup/tooltip showing Performers with their images (same as Scene card)
- Tags indicator: Shows tags in the indicator row if there are any

**Current Implementation:**
- Uses `GridCard` component
- Only shows IMAGES count indicator
- Gallery entity likely has `.performers` and `.tags` fields but they're not displayed

**Reference:**
SceneCard.jsx lines 404-443 shows how Performers, Groups, Galleries, and Tags indicators work with tooltips.

**Solution:**
1. Add Performers indicator with tooltip showing performer grid
2. Add Tags indicator with tooltip showing tags
3. Use same pattern as SceneCard for consistency

---

## Issue 5: Image Lightbox Loading Delay

**Status:** Pending
**Branch:** `bugfix/lightbox-loading-delay`
**File:** `client/src/components/ui/Lightbox.jsx`

**Problem:**
When opening an Image Lightbox for the first time in a gallery, it appears to do nothing for several seconds, then the loading spinner shows up briefly, then the image loads immediately after. This creates a confusing UX where nothing appears to be happening.

**Expected Behavior:**
If something is loading, the UI should immediately show it as loading. The spinner should appear instantly when the lightbox opens.

**Current Implementation:**
- State: `imageLoaded` tracks when current image has loaded
- On index change: `setImageLoaded(false)` resets loading state
- Shows loading spinner while `!imageLoaded`
- Image has `onLoad={() => setImageLoaded(true)}` handler
- Uses opacity transition (0.2s) - image hidden via `opacity: 0` during load

**Investigation Required:**
- Need to add logging to understand the delay
- Possible causes:
  - API call to fetch image data before rendering
  - Image proxy delay
  - State initialization timing
  - React rendering delay

**Solution:**
TBD after debugging - need to identify where the delay occurs.

---

## Progress Tracking

| Issue | Branch | Status | Notes |
|-------|--------|--------|-------|
| 1. Playlist thumbnail scroll | `bugfix/playlist-thumbnail-scroll` | Pending | |
| 2. Rating popup scroll close | `bugfix/rating-popup-scroll-close` | Pending | |
| 3. Collection performers tab | `feature/collection-performers-tab` | Pending | |
| 4. Gallery card indicators | `feature/gallery-card-indicators` | Pending | |
| 5. Lightbox loading delay | `bugfix/lightbox-loading-delay` | Pending | Needs debugging |

---

## Session Notes

*Add notes here as we work through issues*

### 2024-XX-XX
- Created this tracking document
- Explored codebase to locate relevant files
- Documented current implementations and planned solutions
