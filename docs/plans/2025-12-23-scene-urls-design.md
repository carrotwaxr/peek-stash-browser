# Scene URLs Display Design

**Issue:** #195 - Show URLs for scenes in details panel
**Date:** 2025-12-23
**Status:** Approved

## Problem

Users want to see URLs associated with scenes so they can purchase content from creators they enjoy. Currently, scene URLs from Stash metadata are not displayed anywhere in the Peek UI.

## Solution

Add a "Links" section to the Scene Details card, displaying scene URLs as rich link chips with site icons.

## Design Decisions

### Placement
- Add "Links" section immediately after Tags inside the existing Details card
- Only show the section if `scene.urls` exists and has items

### Visual Style
- Rich link chips matching the `PerformerDetail.jsx` pattern
- Styled buttons with site icons/colors and readable names
- Consistent with existing UI patterns

### Site Recognition
Expand site recognition to cover:

**Major studio networks:**
- Brazzers, Reality Kings, Bang Bros, Naughty America, Mofos, Digital Playground, Wicked Pictures

**Premium/artistic studios:**
- Vixen, Tushy, Blacked, Deeper, Slayed, Bellesa, X-Art, SexArt

**Existing sites (already supported):**
- Social media: Twitter/X, Instagram, Facebook, OnlyFans
- Databases: IAFD, FreeOnes, Babepedia, Data18, Indexxx, AFDB, IMDb

### Fallback for Unknown Sites
For URLs not in the curated list:
1. Extract domain name from URL
2. Attempt to load favicon from `https://domain.com/favicon.ico`
3. Display domain name as label with favicon (or generic link icon if favicon fails)

## Implementation Plan

1. Extract `getSiteInfo()` and `SectionLink` into shared utility module
2. Add new site mappings for studio networks and premium studios
3. Add favicon fallback logic with error handling
4. Add "Links" section to `SceneDetails.jsx` after Tags
5. Update `PerformerDetail.jsx` to use shared utility (removes duplication)

## Files to Modify

- `client/src/utils/siteInfo.js` (new file)
- `client/src/components/ui/SectionLink.jsx` (new file)
- `client/src/components/pages/SceneDetails.jsx`
- `client/src/components/pages/PerformerDetail.jsx` (refactor to use shared utility)
