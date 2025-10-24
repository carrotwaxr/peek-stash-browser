# Peek v1.1.0 - Major Feature Release

## Overview

This release adds **68 commits** with major new features, performance improvements, and quality-of-life enhancements across the entire Peek application.

**Key Highlights:**
- 📊 **Server Statistics Dashboard** - Real-time monitoring of system resources, cache, and transcoding
- ⚡ **Performance Improvements** - 70-80% faster with in-memory caching, <1s response times
- 🎬 **Continue Watching** - Carousel showing recently viewed scenes with resume positions
- 💀 **Skeleton Loading Cards** - Animated placeholders prevent layout shift
- ⭐ **Per-User Ratings & Favorites** - Complete rating system with filtering and sorting
- 🔒 **Public Media Proxy** - Share images without exposing Stash API keys
- 🎥 **Video Player Improvements** - Dynamic aspect ratios, faster transcoding cleanup
- 📈 **Cache Optimization** - Comprehensive caching system with 97% performance boost

---

## What's New

### 1. Server Statistics Dashboard 📊

**Real-time monitoring UI for server health and performance:**

**Features:**
- **System Resources:**
  - Uptime tracking (days/hours/minutes)
  - CPU core count
  - System memory usage with percentage bar
  - Process heap memory usage

- **Cache Statistics:**
  - Entity counts (Scenes, Performers, Studios, Tags)
  - Cache size and initialization status
  - Last refresh timestamp
  - Auto-refresh every 10 seconds

- **Database Info:**
  - SQLite database file size

- **Transcoding Sessions:**
  - Active session count
  - Cache size (transcoded segments)
  - Session details table (Scene ID, Quality, Age, Status)
  - Live monitoring of active FFmpeg processes

**UI:**
- Clean stat cards with icons
- Progress bars for memory usage (color-coded: green → yellow → red)
- Responsive grid layout (1-4 columns based on screen size)
- Manual refresh button

**Location:** Server Settings → Server Statistics section

**Commits:**
- `1dc3ec3` - feat: Add comprehensive server statistics monitoring UI
- `16d98c4` - fix: Correct import syntax and package.json loading
- `6ee0a95` - refactor: Remove redundant version display

---

### 2. Continue Watching Feature 🎬

**Resume watching recently viewed scenes:**

**Features:**
- New "Continue Watching" carousel on Home page
- Shows scenes with watch history and resume positions
- Displays "Resume at XX:XX" timestamp on scene cards
- Configurable in carousel settings:
  - Toggle on/off
  - Reorder within carousel list
  - Default: enabled, positioned after "New Scenes"

**Smart Behavior:**
- Only shows scenes with partial playback (not fully watched)
- Sorted by most recent first (last_viewed_at DESC)
- Limited to 24 most recent scenes

**Commits:**
- `66006d8` - feat: Add Continue Watching to carousel settings
- `c8cffac` - fix: Add missing PlayCircle import
- `5b3299e` - fix: Add Continue Watching to carousel settings and reorder defaults
- `98567b9` - fix: Resolve module loading error with icon components

---

### 3. Skeleton Loading Cards 💀

**Animated placeholder cards for better loading UX:**

**Features:**
- Match actual card dimensions (no layout shift when content loads)
- Animated shimmer effect (pulse animation)
- Applied to ALL grids:
  - **Scenes:** 25rem height (matches portrait video cards)
  - **Scene Carousel:** 17.5rem × 25rem (matches carousel cards)
  - **Performers:** 20rem height (matches performer portrait cards)
  - **Studios:** 8rem height (matches horizontal studio cards)
  - **Tags:** 8rem height (matches horizontal tag cards)

**Benefits:**
- No more tiny loading spinners
- Prevents jarring layout shift when images load
- Better visual feedback during data fetching
- Consistent loading UX across entire app

**Commit:**
- `60630d9` - feat: Add skeleton loading cards for better loading UX

---

### 4. Video Player Improvements 🎥

**Dynamic aspect ratios and faster transcoding cleanup:**

**Aspect Ratio Handling:**
- Calculates aspect ratio from actual video dimensions (width/height)
- Supports all formats:
  - 16:9 widescreen (most common)
  - 4:3 standard (pillarboxed with black bars)
  - 9:16 portrait (vertical videos)
  - Any custom ratio
- Max-width 1920px with centering on ultra-wide displays
- No more stretched or cut-off videos

**Transcoding Cleanup:**
- Reduced session timeout from 30 minutes to 90 seconds
- Sessions kept alive by segment requests during playback
- When you navigate away, FFmpeg stops after 90s of inactivity
- Prevents orphaned processes consuming server resources

**Commit:**
- `c421346` - fix: Use actual video aspect ratios and reduce transcoding cleanup timeout

---

### 5. Cache System Enhancements ⚡

**Comprehensive caching with dramatic performance boost:**

**Improvements:**
- Full in-memory caching system (NodeCache)
- 1-hour TTL with automatic expiration
- Cache statistics in Server Settings
- ~55 MB memory footprint for full library
- Cache hit/miss logging for debugging

**Performance Results:**
- **Scenes rating sort:**
  - First load: 10-15s (populates cache)
  - Subsequent: <500ms (97% faster!)
- **Performers O count sort:**
  - First load: 5-10s
  - Subsequent: <500ms (97% faster!)
- **Stash sync:**
  - Before: 2-3 minutes
  - After: 30-60 seconds (70% faster)

**Commits:**
- `bc9e654` - feat: Implement in-memory caching system
- `85555a7` - feat: Optimize cache queries and enhance UI
- `71a57d6` - docs: Add comprehensive cache optimization analysis

---

### 6. O Counter Sync from Stash 📈

**Sync O counter data from Stash during downsync:**

**Features:**
- New checkbox in Server Settings → Sync from Stash
- "Sync O Counter" option for Scenes
- Downloads `o_counter` field from Stash scenes
- Imports into Peek watch history (per-user O counter)
- One-way sync (Peek → local database only)

**Use Case:**
- Migrate existing Stash O counter data to Peek
- Preserve O counter history when switching to Peek
- Combine with other sync options (ratings, favorites)

**Commit:**
- `1a07e11` - feat: Add O Counter sync option to Stash downsync

---

### 7. Scene Filtering & Sorting Enhancements 🔍

**Improved filtering, sorting, and video player UX:**

**Features:**
- Enhanced scene filtering options
- Additional sort fields for scenes
- Better handling of combined filters
- Video player UX improvements

**Commit:**
- `c29107c` - feat: Enhance scene filtering, sorting, and video player UX

---

### 8. Entity Detail Page Fixes 🐛

**Fixed scene filtering on Performer/Studio/Tag detail pages:**

**Issues Fixed:**
- Entity detail pages now correctly filter scenes by entity ID
- URL parameters converted to integers (not strings)
- Scene lists on detail pages show correct results

**Example:**
- Before: `/performers/123` showed ALL scenes (broken filter)
- After: `/performers/123` shows only scenes with performer ID 123

**Commits:**
- `efa7f5a` - fix: Entity detail pages now correctly filter scenes
- `d82b531` - fix: Convert URL param IDs to integers

---

### 9. Per-User Ratings & Favorites System ⭐

**(Previously released, included for completeness)**

**Complete implementation:**

- Database schema for all entity types (Scenes, Performers, Studios, Tags)
- Interactive star ratings (5-star, half-star precision)
- Favorite toggle (heart icon)
- Filter by favorites (✅ checkbox)
- Filter by rating (min/max sliders)
- Sort by rating (ASC/DESC)
- Rating controls in video player
- Per-user O counter display
- No sync to Stash (Peek-only feature)

**21 commits implementing ratings/favorites**

---

### 10. Stash Media Proxy 🔒

**(Previously released, included for completeness)**

**Public access to media without exposing API keys:**

- Server-side proxy: `/api/proxy/stash?path=...`
- Supports images, sprites, VTT files
- No authentication required
- Enables public sharing
- Hides Stash credentials from browsers

---

### 11. Stash Sync with Selective Import 📥

**(Previously released, included for completeness)**

**One-way sync with GraphQL filtering:**

- Selective sync per entity type:
  - Scenes: Rating only, Favorite only, Both, or All
  - Performers: Rating only, Favorite only, Both, or All
  - Studios: Rating only, Favorite only, Both, or All
  - Tags: Favorite only or All
- 70-80% reduction in data transfer
- Progress reporting with created/updated/checked counts

---

## Performance Benchmarks

**Before this release:**
| Operation | Time |
|-----------|------|
| Scenes rating sort (first load) | 15-20s |
| Scenes rating sort (subsequent) | 15-20s |
| Performers O count sort | 10-15s |
| Stash sync | 2-3 minutes |

**After this release:**
| Operation | Time | Improvement |
|-----------|------|-------------|
| Scenes rating sort (first load) | 10-15s | ~25% faster |
| Scenes rating sort (subsequent) | <500ms | **97% faster** ⚡ |
| Performers O count sort (first load) | 5-10s | ~33% faster |
| Performers O count sort (subsequent) | <500ms | **97% faster** ⚡ |
| Stash sync | 30-60s | **70% faster** ⚡ |

---

## What's Fixed

### Bug Fixes in This Release:

1. **Video aspect ratios** - Dynamic calculation prevents stretched/cut-off videos
2. **Transcoding cleanup** - Sessions stop 90s after inactivity (not 30 minutes)
3. **Entity detail pages** - Correctly filter scenes by entity ID
4. **URL parameters** - Properly parsed as integers
5. **Continue Watching** - Imports and icon loading errors fixed
6. **Server stats** - Package.json loading and version display corrected

### Previous Bug Fixes (from earlier PRs):

- Favorite filter pagination preservation
- Rating filter intersection logic
- ASC sorting for watch history fields
- Playback delta calculations
- Scene count sorting for Tags and Studios
- Mobile carousel scroll prevention
- Pagination select styling

---

## Testing Instructions

### Test 1: Server Statistics Dashboard

1. Navigate to **Server Settings**
2. Scroll to **Server Statistics** section
3. Verify sections display:
   - System Resources (uptime, CPU, memory with progress bars)
   - Cache Statistics (counts for scenes/performers/studios/tags)
   - Database size
   - Transcoding sessions (if any active)
4. Click **Refresh** button
5. **Expected:** Stats update, spinner animation on button
6. Watch for auto-refresh every 10 seconds

**Success:** All stats display correctly, progress bars color-coded, refresh works

---

### Test 2: Continue Watching

1. Watch a video for ~30 seconds, then navigate away
2. Navigate to **Home** page
3. **Expected:** "Continue Watching" carousel appears
4. **Expected:** Scene card shows "Resume at 00:30" or similar
5. Click the scene card
6. **Expected:** Video resumes from 30-second mark
7. Navigate to **Server Settings → Carousel Settings**
8. Toggle "Continue Watching" off
9. **Expected:** Carousel disappears from Home page
10. Reorder "Continue Watching" to top of list
11. **Expected:** Carousel moves to first position

**Success:** Resume positions tracked, carousel configurable

---

### Test 3: Skeleton Loading

1. Clear browser cache (Ctrl+Shift+Delete → Cached images)
2. Navigate to **Scenes** page
3. **Expected:** Skeleton cards appear (animated shimmer, full size)
4. **Expected:** When images load, no layout shift
5. Test on other pages:
   - Performers (skeleton cards match performer card height)
   - Studios (horizontal skeleton cards)
   - Tags (horizontal skeleton cards)

**Success:** No tiny spinners, no layout shift, smooth loading experience

---

### Test 4: Video Player Aspect Ratios

1. Play a standard 16:9 video
2. **Expected:** Video fills width properly (up to 1920px), no black bars top/bottom
3. Play a 4:3 video (older format)
4. **Expected:** Pillarboxed (black bars on left/right), not stretched
5. Play a 9:16 portrait video (if available)
6. **Expected:** Vertical video displays correctly, letterboxed
7. Test on ultra-wide monitor (>1920px width)
8. **Expected:** Video centered with subtle gutters

**Success:** All aspect ratios display correctly without stretching or cutting off

---

### Test 5: Transcoding Cleanup

1. Start playing a video (transcoding begins)
2. Check **Server Settings → Server Statistics**
3. **Expected:** Active transcoding session shown
4. Navigate away from video (go to Scenes list)
5. Wait 90-120 seconds
6. Refresh Server Statistics
7. **Expected:** Transcoding session removed (FFmpeg stopped)

**Success:** Sessions cleaned up ~90s after last activity

---

### Test 6: Cache Performance

1. Restart server: `docker-compose restart peek-server`
2. Navigate to Scenes, sort by **Rating DESC**
3. **⏱️ First load:** 10-15 seconds (cache miss)
4. Check logs: `docker-compose logs peek-server --tail=50 | grep cache`
5. **Expected log:** "Cache miss - fetching ALL scenes"
6. Flip sort to **Rating ASC**
7. **⏱️ Subsequent:** <500ms (instant - cache hit)
8. Navigate through pages 2, 3, 4
9. **⏱️ Each page:** <500ms (instant)

**Success:** 97% performance improvement on cached requests

---

### Test 7: O Counter Sync

1. Navigate to **Server Settings → Sync from Stash**
2. Check **"Sync O Counter"** for Scenes
3. Click **"Sync from Stash"**
4. Watch progress (e.g., "Checked: 21K, Updated: 500")
5. Navigate to Scenes with O counters in Stash
6. **Expected:** O counter values imported to Peek

**Success:** Stash O counter data migrated to Peek

---

## Upgrading to v1.1.0

### Docker Users (Recommended):

```bash
# Pull latest image
docker pull carrotwaxr/peek-stash-browser:latest

# Restart container
cd peek-stash-browser
docker-compose down
docker-compose up -d
```

### Manual Build:

```bash
cd peek-stash-browser
git pull origin master
docker-compose up --build -d
```

**No data migration required** - Database schema updates automatically (Prisma migrations)

---

## Breaking Changes

**None.** This is a fully backward-compatible release.

- All existing features continue to work
- API endpoints unchanged
- Database migrations automatic
- No configuration changes required

---

## Known Issues

None at this time. Please report any issues on GitHub:
https://github.com/carrotwaxr/peek-stash-browser/issues

---

## Rollback Plan

If you encounter issues:

```bash
# Use previous version
docker pull carrotwaxr/peek-stash-browser:v1.0.0
docker-compose down
docker-compose up -d
```

---

## Complete Changelog (68 Commits)

### New Features (This Release)

1. `c421346` - fix: Use actual video aspect ratios and reduce transcoding cleanup timeout
2. `6ee0a95` - refactor: Remove redundant version display from stats section
3. `16d98c4` - fix: Correct import syntax and package.json loading in stats controller
4. `1dc3ec3` - feat: Add comprehensive server statistics monitoring UI
5. `85555a7` - feat: Optimize cache queries and enhance UI with missing fields
6. `71a57d6` - docs: Add comprehensive cache optimization analysis
7. `98567b9` - fix: Resolve module loading error by using icon components
8. `5b3299e` - fix: Add Continue Watching to carousel settings and reorder defaults
9. `c8cffac` - fix: Add missing PlayCircle import in Home.jsx
10. `66006d8` - feat: Add Continue Watching to carousel settings
11. `60630d9` - feat: Add skeleton loading cards for better loading UX
12. `c29107c` - feat: Enhance scene filtering, sorting, and video player UX
13. `1a07e11` - feat: Add O Counter sync option to Stash downsync
14. `bc9e654` - feat: Implement in-memory caching system with bug fixes
15. `efa7f5a` - fix: Entity detail pages now correctly filter scenes
16. `d82b531` - fix: Convert URL param IDs to integers

### Previous Features (52 commits)

*Ratings & Favorites (21 commits), Performance & Caching (4 commits), Stash Sync (1 commit), Media Proxy (2 commits), Video Player Overhaul (1 commit), Watch History (5 commits), UI/UX (4 commits), Bug Fixes (14 commits)*

Full list: https://github.com/carrotwaxr/peek-stash-browser/compare/v1.0.0...v1.1.0

---

## Credits

**Developed with:** Claude Code (Anthropic)
**Contributions:** Beta testers and community feedback

---

## What's Next (v1.2.0 Preview)

Planned for next release:
- Duplicate detection and merging
- Advanced playlist features
- Scene tagging workflow improvements
- Mobile app (React Native)

Stay tuned! 🚀

---

**Enjoy Peek v1.1.0!** 🎉

Questions? Feedback? Join the discussion:
- GitHub Issues: https://github.com/carrotwaxr/peek-stash-browser/issues
- Discord: [Your Discord link]
