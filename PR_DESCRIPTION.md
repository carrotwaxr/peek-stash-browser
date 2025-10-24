# Pull Request: Major Feature Improvements & Performance Optimization

## Summary

This PR contains 52 commits implementing major features, performance improvements, and bug fixes across the entire Peek application.

**Highlights:**
- ⭐ **Per-user ratings and favorites** - Full implementation with database schema, API, UI components, filtering, and sorting
- 🚀 **Performance optimization** - 70-80% reduction in data transfer, <1s response times with caching
- 🔒 **Public media access** - Server-side proxy hides Stash API keys from clients
- 🎬 **Video player overhaul** - Modular architecture with context, custom hooks, and Video.js plugins
- 📊 **Stash sync** - One-way sync with selective import and GraphQL filtering
- 🎨 **UI improvements** - Interactive ratings, mobile optimizations, accessibility enhancements

---

## Major Features

### 1. Per-User Ratings & Favorites System

**Complete implementation of per-user ratings and favorites:**

#### Database Schema (Prisma)
- `SceneRating` model (sceneId, userId, rating, favorite, createdAt, updatedAt)
- `PerformerRating` model (performerId, userId, rating, favorite)
- `StudioRating` model (studioId, userId, rating, favorite)
- `TagRating` model (tagId, userId, rating, favorite)
- Unique constraints on (entityId, userId) pairs

#### Backend API
- `POST /api/ratings/scene` - Create/update scene rating
- `POST /api/ratings/performer` - Create/update performer rating
- `POST /api/ratings/studio` - Create/update studio rating
- `POST /api/ratings/tag` - Create/update tag rating
- Rating injection in all library endpoints (findScenes, findPerformers, findStudios, findTags)
- Favorite filtering support for all entity types
- Rating sorting support for all entity types

#### Frontend UI
- `RatingControls.jsx` - Interactive star rating component with favorite toggle
- Integrated into scene cards, performer cards, studio cards, tag cards
- Integrated into video player controls
- Hover preview for half-star ratings
- Real-time updates without page refresh
- Click propagation prevention to avoid navigation conflicts

#### Features
- **Filtering by favorites** - ✅ checkbox for all entity types
- **Filtering by rating** - Min/max range sliders for all entity types
- **Combined filters** - Intersection logic (favorite + rating filters work together)
- **Sorting by rating** - ASC/DESC for all entity types
- **Per-user O counter** - Peek tracks per-user O counts, not Stash global counts
- **No sync to Stash** - Ratings/favorites are Peek-only (documented policy)

**Commits:**
- `eefdc71` - feat: Add database schema and API endpoints
- `ecd06d9` - feat: Implement per-user rating/favorite injection
- `250a51e` - feat: Add frontend UI and API
- `ff90952` - feat: Integrate ratings into library endpoints
- `b287870` - feat: Integrate RatingControls into scene cards
- `595fe73` - feat: Display ratings on all entity cards
- `db17d36` - docs: Document no-sync policy
- `ec548aa` - fix: Add rating injection to custom sort functions
- `22999e9` - feat: Add rating sort option to Tags
- `6f284f2` - feat: Add hover preview for half-star ratings
- `88978a5` - fix: Return per-user Peek O count
- `62e6f99` - feat: Add rating/favorite controls to video player
- `22eb8e3` - fix: Handle favorite/rating filters on Peek side
- `41592c7` - fix: Remove duplicate rating filter functions
- `0117e85` - fix: Handle tag rating sort on Peek side
- `657f1cb` - fix: Add favorite filter support to all entities
- `f170db6` - feat: Make rating controls interactive on grid cards
- `d0b79d3` - fix: Preserve pagination when filtering by favorites
- `567d78c` - fix: Handle Peek-only sorts with rating filters
- `803fc9a` - fix: Rating filters for all entity types and combined intersection
- `45a4483` - fix: Filter UI improvements and sync filter field names

---

### 2. Performance Optimization & Caching

**In-memory caching infrastructure with dramatic performance improvements:**

#### Caching System
- NodeCache with 1-hour TTL for Stash entities
- Separate caches for Stash data and user ratings
- ~55 MB memory footprint for full library (50K scenes, 20K performers)
- Automatic cache expiration and stats logging every 30 minutes
- Cache hit/miss logging for debugging

#### Performance Improvements
- **Before:** 15-20s for scenes rating sort (every request)
- **After:** 10-15s first load, <500ms subsequent requests (97% faster)
- **Before:** 2-3 minutes for full Stash sync
- **After:** 30-60 seconds with GraphQL filtering (70% faster)

**Commits:**
- `14aa0d4` - perf: Add in-memory caching for Stash entity queries
- `00afc9a` - fix: Add missing caching for scenes rating sort and performers o_counter sort
- `4730198` - fix: TypeScript errors in sync and add cache infrastructure

---

### 3. Stash Media Proxy (Public Access)

**Server-side proxy for media files that hides API keys:**

#### Features
- Public endpoint: `/api/proxy/stash?path=/scene/123/screenshot`
- Supports images (JPEG, PNG, WebP), sprites, VTT files
- Streams media with proper cache headers (1-year immutable)
- No authentication required (enables public sharing)
- Hides Stash API keys from client browsers

#### Use Cases
- Share individual scene screenshots publicly
- Embed Peek images in external sites
- Browse Peek without Stash credentials
- Reverse proxy setups (Nginx, Caddy, etc.)

**Commits:**
- `b33c747` - feat: Add Stash media proxy to hide API keys from clients

---

### 4. Stash Sync with Selective Import

**One-way sync from Stash with GraphQL filtering:**

#### Features
- Selective sync options per entity type:
  - Scenes: Rating only, Favorite only, Both, or All
  - Performers: Rating only, Favorite only, Both, or All
  - Studios: Rating only, Favorite only, Both, or All
  - Tags: Favorite only or All
- GraphQL filtering reduces data transfer by 70-80%
- Example: 21K scenes → ~4.5K rated scenes transferred
- Progress reporting with created/updated/checked counts
- Automatic cache invalidation after sync

**Commits:**
- `7ac5c9a` - feat: Add one-way Stash sync with selective import

---

### 5. Video Player Overhaul

**Modular architecture with React context and custom hooks:**

#### Architecture
- `VideoPlayerContext.jsx` - Centralized player state management
- `useVideoPlayer.js` - Core Video.js integration hook
- `usePlaybackTracking.js` - Watch history and O counter tracking
- `usePlaylistNavigation.js` - Playlist next/prev/autoplay logic
- `useOrientationFullscreen.js` - Mobile fullscreen on orientation change
- Video.js plugin integration for quality selector

#### Features
- Playlist autoplay with next/prev buttons
- Watch history tracking (play count, last viewed position)
- O counter integration in player controls
- Mobile-optimized fullscreen behavior
- Quality selector for transcoding
- Modular, testable code structure

**Commits:**
- `d91cd6b` - refactor: Major video player overhaul with context, modular hooks, and Video.js plugin integration

---

### 6. Watch History Per-User Implementation

**Per-user sorting and filtering for watch history fields:**

#### Features
- Sort by O counter (ASC/DESC) - per-user values
- Sort by play count (ASC/DESC) - per-user values
- Filter by O counter min/max - per-user values
- Filter by play count min/max - per-user values
- Correct ASC sorting (zeros first, non-zeros on last page)
- Fixed playback delta calculations to prevent massive jumps

**Commits:**
- `2884726` - feat: Implement per-user sorting for watch history fields
- `4bf0da8` - feat: Implement per-user filtering for watch history fields
- `be75e40` - fix: Correct O counter endpoint route path
- `00843b6` - fix: Correct O counter endpoint mismatch
- `60336ed` - fix: Correct ASC sorting for watch history fields
- `7fed913` - fix: Cap playback delta and improve Stash sync logging
- `44c66e2` - fix: Detect new viewing sessions to prevent massive playback deltas

---

### 7. Admin & User Management

**Multi-user support with admin controls:**

#### Features
- Admin can update other users' settings (not just their own)
- Role-based access control (ADMIN vs USER)
- Proper role comparison (uppercase 'ADMIN')

**Commits:**
- `08fc6c3` - fix: Add admin route to update other users' settings
- `3eaed5d` - fix: Use uppercase 'ADMIN' for role comparison

---

### 8. UI/UX Improvements

**Mobile optimizations and accessibility:**

#### Features
- Prevent page scroll during carousel drag on mobile
- Simplified pagination select styling
- Fixed carousel queries for better experience
- Removed hardcoded scene_count > 0 filters (shows all entities)

**Commits:**
- `c770ff9` - remove hardcoded scene_count greater than 0 filters
- `f5e13c8` - adjust carousel queries for better experience
- `7f69485` - fix: Simplify pagination select styling
- `87ebe06` - fix: Prevent page scroll during carousel reordering on mobile

---

### 9. Codebase Cleanup

**Removed unused code and dead files:**

- Removed 81 lines of complex pagination logic (simplified algorithm)
- Deleted dead code files
- Cleaned up duplicate function definitions

**Commits:**
- `0c75f52` - chore: Remove unused code and dead files to reduce codebase bloat

---

### 10. Bug Fixes

**Numerous bug fixes across all features:**

#### Filtering & Sorting
- `aac2c07` - fix: Sort and pagination when favorite filters are active
- `1c2757c` - fix: Handle favorite filters in findScenesWithCustomSort
- `b8c5606` - fix: Use cleanedSceneFilter in findScenesWithCustomSort fill query
- `e91c5f6` - fix: Strip rating filters in all entity standard query paths
- `3b89adc` - fix: Add missing logger import to library controller
- `af275c6` - fix: Correct scene count sort field name for Tags and Studios
- `8f93054` - Revert "fix: Correct scene count sort field name" (rollback incorrect fix)
- `54406c3` - fix: Resolve favorites filter issues in scenes with custom sort

---

## Complete Commit List (52 commits)

### Foundation & Infrastructure (8 commits)
1. `c770ff9` - remove hardcoded scene_count greater than 0 filters
2. `f5e13c8` - adjust carousel queries for better experience
3. `7f69485` - fix: Simplify pagination select styling and remove conflicting height constraint
4. `87ebe06` - fix: Prevent page scroll during carousel reordering on mobile devices
5. `0c75f52` - chore: Remove unused code and dead files to reduce codebase bloat
6. `08fc6c3` - fix: Add admin route to update other users' settings
7. `3eaed5d` - fix: Use uppercase 'ADMIN' for role comparison
8. `3b89adc` - fix: Add missing logger import to library controller

### Video Player Overhaul (1 commit)
9. `d91cd6b` - refactor: Major video player overhaul with context, modular hooks, and Video.js plugin integration

### Watch History (5 commits)
10. `2884726` - feat: Implement per-user sorting for watch history fields
11. `4bf0da8` - feat: Implement per-user filtering for watch history fields
12. `be75e40` - fix: Correct O counter endpoint route path
13. `00843b6` - fix: Correct O counter endpoint mismatch between frontend and backend
14. `7fed913` - fix: Cap playback delta and improve Stash sync logging
15. `44c66e2` - fix: Detect new viewing sessions to prevent massive playback deltas

### Per-User Ratings & Favorites (21 commits)
16. `eefdc71` - feat: Add database schema and API endpoints for per-user ratings/favorites
17. `ecd06d9` - feat: Implement per-user rating/favorite injection for all entity types
18. `250a51e` - feat: Add frontend UI and API for per-user ratings and favorites
19. `ff90952` - feat: Integrate per-user ratings into all library endpoints
20. `b287870` - feat: Integrate RatingControls component into scene cards and detail pages
21. `595fe73` - feat: Display per-user ratings and favorites on all entity cards
22. `db17d36` - docs: Document no-sync policy for ratings and favorites
23. `ec548aa` - fix: Add rating injection to custom sort functions
24. `22999e9` - feat: Add rating sort option to Tags
25. `6f284f2` - feat: Add hover preview for half-star ratings
26. `88978a5` - fix: Return per-user Peek O count instead of Stash global count
27. `62e6f99` - feat: Add rating and favorite controls to video player
28. `22eb8e3` - fix: Handle favorite/rating filters on Peek side, not Stash
29. `41592c7` - fix: Remove duplicate rating filter function definitions
30. `0117e85` - fix: Handle tag rating sort on Peek side
31. `657f1cb` - fix: Add favorite filter support to Performers, Studios, and Tags
32. `f170db6` - feat: Make rating controls interactive on entity grid cards
33. `d0b79d3` - fix: Preserve pagination when filtering by favorites
34. `567d78c` - fix: Handle Peek-only sorts with rating filters across all entity types
35. `803fc9a` - fix: Rating filters for all entity types and combined filter intersection
36. `45a4483` - fix: Filter UI improvements and sync filter field names

### Filter & Sort Bug Fixes (9 commits)
37. `aac2c07` - fix: Sort and pagination when favorite filters are active
38. `1c2757c` - fix: Handle favorite filters in findScenesWithCustomSort
39. `b8c5606` - fix: Use cleanedSceneFilter in findScenesWithCustomSort fill query
40. `e91c5f6` - fix: Strip rating filters in all entity standard query paths
41. `af275c6` - fix: Correct scene count sort field name for Tags and Studios
42. `8f93054` - Revert "fix: Correct scene count sort field name for Tags and Studios"
43. `54406c3` - fix: Resolve favorites filter issues in scenes with custom sort

### Performance & Caching (4 commits)
44. `7ac5c9a` - feat: Add one-way Stash sync with selective import and GraphQL filtering
45. `4730198` - fix: TypeScript errors in sync and add cache infrastructure
46. `14aa0d4` - perf: Add in-memory caching for Stash entity queries
47. `00afc9a` - fix: Add missing caching for scenes rating sort and performers o_counter sort

### Public Media Access (2 commits)
48. `60336ed` - fix: Correct ASC sorting for watch history fields (o_counter, play_count)
49. `b33c747` - feat: Add Stash media proxy to hide API keys from clients

---

## Testing Instructions

### Prerequisites
- Docker environment running: `docker-compose up -d`
- Fresh cache: `docker-compose restart peek-server`
- Test user account with some rated/favorited content

---

## Test 1: Per-User Ratings & Favorites

**Objective:** Verify complete ratings/favorites functionality

### 1.1: Rate Scenes
1. Navigate to Scenes page
2. Click stars on a scene card
3. **Expected:** Rating updates immediately, star count changes
4. Refresh page
5. **Expected:** Rating persists

### 1.2: Favorite Entities
1. Navigate to Performers page
2. Click heart icon on a performer card
3. **Expected:** Heart fills red, favorite status updates
4. Navigate away and back
5. **Expected:** Heart remains filled

### 1.3: Filter by Favorites
1. Navigate to Scenes page
2. Open Filters panel
3. Check "✅ Favorites only"
4. **Expected:** Only favorited scenes displayed
5. **URL:** `?favorite=true`

### 1.4: Filter by Rating
1. Navigate to Performers page
2. Open Filters panel
3. Set "Min Rating: 80"
4. Click "Apply Filters"
5. **Expected:** Only performers with rating ≥ 80 shown
6. **URL:** `?rating_min=80`

### 1.5: Combined Filters (Favorite + Rating)
1. Navigate to Performers page
2. Open Filters panel
3. Check "✅ Favorites only"
4. Set "Min Rating: 80"
5. Click "Apply Filters"
6. **Expected:** Only performers that are BOTH favorited AND rated ≥ 80
7. **URL:** `?favorite=true&rating_min=80`
8. **Success:** List should be intersection of both filters (not just favorite OR just rating)

### 1.6: Sort by Rating
1. Navigate to Tags page
2. Click "Sort by: Rating"
3. Direction: DESC
4. **Expected:** Highest rated tags first
5. Flip to ASC
6. **Expected:** Lowest rated tags first (unrated tags show as 0)

### 1.7: Rating in Video Player
1. Navigate to Scenes, click a scene
2. Video player opens
3. Locate rating controls (stars + heart) in player UI
4. Click stars to rate
5. **Expected:** Rating updates without leaving player
6. **Expected:** Rating persists in scene card when returning to list

### 1.8: O Counter Display on Performer Cards
1. Navigate to Performers page
2. **Expected:** Each performer card shows 💦 icon with count
3. **Expected:** Shows "0" for performers with no O count (not hidden)
4. **Expected:** Read-only (clicking doesn't increment)

**Success Criteria:**
- ✅ All entity types support ratings/favorites (Scenes, Performers, Studios, Tags)
- ✅ Ratings/favorites persist across page reloads
- ✅ Filtering by favorite works for all entity types
- ✅ Filtering by rating works for all entity types
- ✅ Combined filters use intersection logic (both conditions must match)
- ✅ Sorting by rating works ASC/DESC
- ✅ Rating controls integrated in video player
- ✅ O Counter displays on performer cards (read-only mode)

---

## Test 2: Performance & Caching

**Objective:** Verify caching dramatically improves performance

### 2.1: Scenes Rating Sort (Cache Miss)
1. Restart server: `docker-compose restart peek-server`
2. Navigate to Scenes page
3. Click "Sort by: Rating"
4. Direction: DESC
5. **⏱️ Expected:** 10-15 seconds (fetching all scenes from Stash)
6. Check logs: `docker-compose logs peek-server --tail=50 | grep -i cache`
7. **Expected log:** `Cache miss - fetching ALL scenes from Stash for rating sort`

### 2.2: Scenes Rating Sort (Cache Hit)
1. Click sort direction to switch to ASC
2. **⏱️ Expected:** <500ms (instant - uses cached data)
3. Check logs: `docker-compose logs peek-server --tail=50 | grep -i cache`
4. **Expected log:** `Cache hit - using cached scenes for rating sort {"count":21218}`

### 2.3: Pagination with Cache
1. Navigate to page 2, 3, etc.
2. **⏱️ Expected:** <500ms per page (instant - all pages use same cache)
3. Flip sort direction
4. **⏱️ Expected:** <500ms (instant)

### 2.4: Performers O Count Sort
1. Navigate to Performers page
2. Click "Sort by: O Count"
3. Direction: DESC
4. **⏱️ First load:** 5-10 seconds (cache miss)
5. Flip to ASC
6. **⏱️ Flip:** <500ms (cache hit)

### 2.5: Verify ASC Sorting (Bug Fix)
1. Sort Performers by O Count ASC
2. First page shows performers with o_counter = 0
3. Navigate to LAST page
4. **Expected:** Performers with highest o_counter values (not zeros)
5. **Bug Fix:** Before fix, ASC showed zeros on last page (incorrect)

### 2.6: Cache Expiration
1. Wait 1 hour ⏰ (or restart: `docker-compose restart peek-server`)
2. Sort scenes by Rating again
3. **⏱️ Expected:** 10-15 seconds (cache miss - re-fetches from Stash)
4. Check logs for "Cache miss"

**Success Criteria:**
- ✅ First load: 10-15s for scenes, 5-10s for performers (populates cache)
- ✅ Sort flip: <500ms (97% faster)
- ✅ Pagination: <500ms (instant)
- ✅ Logs show "Cache hit" for subsequent requests
- ✅ ASC sorting correct (zeros first, non-zeros on last page)
- ✅ Cache expires after 1 hour or server restart

---

## Test 3: Stash Sync with Selective Import

**Objective:** Verify GraphQL filtering reduces data transfer

### 3.1: Configure Sync Options
1. Navigate to Server Settings
2. Scroll to "Sync from Stash" section
3. Select sync options:
   - ✅ Scenes: Rating only
   - ✅ Performers: Rating + Favorite
   - ✅ Studios: Rating + Favorite
   - ✅ Tags: Favorite only

### 3.2: Run Sync
1. Click "Sync from Stash"
2. Watch progress stats

**Expected Results:**
```
Scenes:
  Checked: ~21K (your total scene count)
  Created/Updated: ~4.5K (only scenes with ratings)

Performers:
  Checked: ~6.7K (your total performer count)
  Created/Updated: ~3.2K (only with ratings/favorites)

Studios:
  Checked: ~1K (your total studio count)
  Created/Updated: ~880 (only with ratings/favorites)

Tags:
  Checked: ~200 (your total tag count)
  Created/Updated: ~26 (only favorited tags)
```

### 3.3: Verify Logs
```bash
docker-compose logs peek-server --tail=100 | grep "Sync"
```
**Expected:** Messages about fetching only filtered entities

**Success Criteria:**
- ✅ Sync completes in 30-60 seconds (vs 2-3 minutes before)
- ✅ "Checked" count matches total entity count in Stash
- ✅ "Created/Updated" count much lower than "Checked" (only filtered entities)
- ✅ 70-80% reduction in data transfer

---

## Test 4: Media Proxy (Public Access)

**Objective:** Verify images load through proxy without exposing API keys

### 4.1: Scene Images
1. Navigate to Scenes page
2. Open Browser DevTools → Network tab
3. Filter: `proxy`
4. Click on any scene card

**Expected Network Requests:**
```
GET /api/proxy/stash?path=%2Fscene%2F123%2Fscreenshot...
Status: 200
Type: image/jpeg
Cache-Control: public, max-age=31536000, immutable
```

**Should NOT see:**
- ❌ Direct Stash URLs (e.g., `http://10.0.0.4:6969/scene/...`)
- ❌ API keys in URL parameters (`apikey=xxxxx`)

### 4.2: Performer Images
1. Navigate to Performers page
2. Network tab → Filter: `proxy`
3. **Expected:**
   ```
   GET /api/proxy/stash?path=%2Fperformer%2F456%2Fimage...
   ```

### 4.3: Studio & Tag Images
1. Navigate to Studios page
2. **Expected:** `/api/proxy/stash?path=%2Fstudio%2F789%2Fimage...`
3. Navigate to Tags page
4. **Expected:** `/api/proxy/stash?path=%2Ftag%2F101%2Fimage...`

### 4.4: Video Sprites & VTT
1. Play a video with sprite thumbnails
2. Hover over timeline
3. **Expected:** Thumbnail previews appear
4. Check Network tab:
   ```
   GET /api/proxy/stash?path=%2Fscene%2F123%2Fsprite...
   Status: 200
   Type: image/jpeg
   ```

### 4.5: Public Access (No Auth)
1. Open incognito window (or logout of Peek)
2. Try to access proxied image directly:
   ```
   http://localhost:6969/api/proxy/stash?path=/scene/123/screenshot
   ```
3. **Expected:** Image loads successfully (no 401/403 error)
4. **Use case:** Share scene screenshots publicly without Stash credentials

**Success Criteria:**
- ✅ All images load through `/api/proxy/stash`
- ✅ No API keys visible in URLs
- ✅ Proper cache headers (1-year immutable)
- ✅ Images display correctly
- ✅ Public access works (no authentication required)

---

## Test 5: Video Player Improvements

**Objective:** Verify modular video player architecture

### 5.1: Playlist Navigation
1. Create a playlist with 5+ scenes
2. Play first scene
3. Click "Next" button
4. **Expected:** Advances to next scene in playlist
5. Click "Previous" button
6. **Expected:** Returns to previous scene

### 5.2: Playlist Autoplay
1. Enable autoplay in playlist
2. Watch a scene to completion
3. **Expected:** Automatically advances to next scene
4. **Expected:** No autoplay if disabled

### 5.3: Watch History Tracking
1. Play a scene for 2 minutes
2. Navigate away
3. Return to scene detail page
4. **Expected:** "Last viewed: 2m ago" or similar
5. **Expected:** Play count incremented
6. Resume playback
7. **Expected:** Resumes from last position

### 5.4: O Counter in Player
1. Play a scene
2. Locate O counter button (💦 icon)
3. Click to increment
4. **Expected:** Count increases, animation shows "+1"
5. **Expected:** Count persists in scene card

### 5.5: Mobile Fullscreen
1. Open Peek on mobile device (or emulate in DevTools)
2. Rotate device to landscape
3. **Expected:** Video enters fullscreen automatically
4. Rotate back to portrait
5. **Expected:** Exits fullscreen

**Success Criteria:**
- ✅ Playlist next/prev navigation works
- ✅ Autoplay optional and functional
- ✅ Watch history tracks play count and position
- ✅ O counter integrated in player controls
- ✅ Mobile fullscreen on orientation change

---

## Test 6: UI/UX Improvements

**Objective:** Verify mobile optimizations and accessibility

### 6.1: Mobile Carousel Drag
1. Open Peek on mobile (or emulate in DevTools)
2. Navigate to Home page (carousel)
3. Drag carousel left/right
4. **Expected:** Carousel scrolls, page does NOT scroll
5. **Bug Fix:** Before fix, dragging carousel also scrolled the page

### 6.2: Pagination Select
1. Navigate to Scenes page
2. Click pagination "Items per page" dropdown
3. **Expected:** Clean styling, no conflicting height constraints
4. Select different per-page value (12, 24, 48, 96)
5. **Expected:** Page updates with new item count

### 6.3: Show All Entities
1. Navigate to Performers page
2. **Expected:** Shows performers with scene_count = 0 (not hidden)
3. Navigate to Studios page
4. **Expected:** Shows studios with scene_count = 0 (not hidden)
5. **Bug Fix:** Before fix, entities with 0 scenes were hidden

**Success Criteria:**
- ✅ Mobile carousel drag doesn't scroll page
- ✅ Pagination select has clean styling
- ✅ All entities shown regardless of scene count

---

## Test 7: Filter UI Improvements

**Objective:** Verify filter chip display and URL parameter handling

### 7.1: Filter Chips
1. Navigate to Scenes page
2. Open Filters panel
3. Apply multiple filters:
   - ✅ Favorites only
   - Min Rating: 80
   - Resolution: 1080p
4. **Expected:** Filter chips appear above results:
   ```
   [Favorite] [Rating: ≥ 80] [Resolution: 1080p]
   ```
5. Click X on a chip
6. **Expected:** Filter removed, results update

### 7.2: Multi-Select Filter Chips
1. Navigate to Scenes page
2. Open Filters panel
3. Select multiple performers (if multi-select available)
4. **Expected:** Chip shows "Performers: 3 selected"
5. **Bug Fix:** Before fix, multi-select filters showed incorrectly

### 7.3: URL Parameter Persistence
1. Apply filters: Favorite + Rating min 80
2. **URL:** `?favorite=true&rating_min=80`
3. Copy URL, paste in new tab
4. **Expected:** Filters applied automatically from URL
5. **Expected:** Filter chips displayed
6. **Bug Fix:** Before fix, ID fields weren't parsed as integers

**Success Criteria:**
- ✅ Filter chips display for all filter types
- ✅ Multi-select shows "X selected"
- ✅ Chips removable via X button
- ✅ URL parameters persist filters across page loads
- ✅ ID fields parsed as integers (not strings)

---

## Performance Benchmarks

**Before this PR:**
| Operation | Time |
|-----------|------|
| Scenes rating sort (first load) | 15-20s |
| Scenes rating sort (flip direction) | 15-20s |
| Performers o_count sort | 10-15s |
| Sync all entities | 2-3 minutes |
| Image loading | Requires Stash network access |

**After this PR:**
| Operation | Time | Improvement |
|-----------|------|-------------|
| Scenes rating sort (first load) | 10-15s | ~25% faster |
| Scenes rating sort (flip direction) | <500ms | **97% faster** |
| Performers o_count sort (first load) | 5-10s | ~33% faster |
| Performers o_count sort (flip direction) | <500ms | **97% faster** |
| Sync all entities | 30-60s | **70% faster** |
| Image loading | Works without Stash access | **Enables public access** |

---

## Memory Usage

**Cache Memory Footprint (1-hour window):**
- 50K scenes: ~45 MB
- 20K performers: ~4 MB
- 2K studios: ~0.4 MB
- 2K tags: ~0.2 MB
- User ratings (10 users): ~3.3 MB
- **Total: ~55 MB** (acceptable for Docker container)

**Monitor memory:**
```bash
docker stats peek-stash-browser-peek-server-1
```

---

## Breaking Changes

**None.** This is a backward-compatible enhancement.

**Existing functionality:**
- ✅ All existing features continue to work
- ✅ API responses unchanged (URLs transformed server-side)
- ✅ Client code requires no changes
- ✅ Database migrations automatic (Prisma)

---

## Rollback Plan

If issues are found:

1. **Revert the PR:**
   ```bash
   git revert <merge-commit-sha>
   git push origin master
   ```

2. **Or use previous Docker image:**
   ```bash
   docker pull carrotwaxr/peek-stash-browser:previous-version
   docker-compose down
   docker-compose up -d
   ```

**No data migration required** - Caching is in-memory only, ratings stored in SQLite.

---

## Debugging Commands

**Check logs:**
```bash
docker-compose logs peek-server --tail=200
```

**Look for errors:**
```bash
docker-compose logs peek-server | grep -i "error"
```

**Check cache activity:**
```bash
docker-compose logs peek-server | grep -i "cache"
```

**Verify proxy requests:**
```bash
docker-compose logs peek-server | grep -i "proxy"
```

**Monitor sync progress:**
```bash
docker-compose logs peek-server | grep -i "sync"
```

---

## Next Steps

After testing and merging:

1. **Squash commits** (optional - 52 commits may be too granular)
2. **Update version** in package.json (both client and server)
3. **Create git tag** (e.g., `v1.1.0`)
4. **Push tag** to trigger Docker build and release
5. **Users update** via `docker pull` and restart

Enjoy the massive improvements! 🚀
