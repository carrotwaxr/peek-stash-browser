# Peek v1.1.0 - Major Feature Release

## Overview

This release represents a massive leap forward for Peek with comprehensive new features, dramatic performance improvements, and dozens of quality-of-life enhancements.

**Key Highlights:**

- 📊 **Server Statistics Dashboard** - Real-time monitoring of system resources, cache, and transcoding
- ⭐ **Per-User Ratings & Favorites** - Complete rating system with filtering, sorting, and sync
- ⚡ **Performance Boost** - 97% faster with in-memory caching (<500ms vs 15-20s)
- 🎬 **Continue Watching** - Resume recently viewed scenes from Home page
- 💀 **Better Loading UX** - Skeleton cards prevent layout shift
- 🔒 **Public Media Proxy** - Share images without exposing Stash API keys
- 🎥 **Video Player Improvements** - Dynamic aspect ratios, modular architecture, faster cleanup
- 📥 **Stash Sync** - One-way sync with selective import (70% faster)
- 📈 **Watch History Enhancements** - Per-user sorting, filtering, and O counter tracking

---

## What's New

### 1. Server Statistics Dashboard 📊

Real-time monitoring UI showing server health and performance metrics.

**Features:**

- **System Resources** - Uptime, CPU cores, memory usage with color-coded progress bars
- **Cache Statistics** - Entity counts, cache size, initialization status, last refresh time
- **Database Info** - SQLite file size tracking
- **Transcoding Sessions** - Active session monitoring with session details table (Scene ID, Quality, Age, Status)
- **Auto-refresh** - Updates every 10 seconds with manual refresh button
- **Clean UI** - Responsive grid layout with stat cards and icons

**Location:** Server Settings → Server Statistics

---

### 2. Per-User Ratings & Favorites ⭐

Complete rating system allowing users to rate and favorite all entity types with full filtering and sorting support.

**Database Schema:**

- Per-user rating tables for Scenes, Performers, Studios, Tags
- 5-star ratings with half-star precision (0.5 increments)
- Favorite toggle (boolean)
- Unique constraints on (entityId, userId) pairs

**UI Components:**

- Interactive star rating component with hover preview
- Favorite heart icon toggle
- Integrated into all entity grid cards
- Integrated into video player controls
- Click propagation prevention (rating doesn't trigger card navigation)

**Filtering & Sorting:**

- **Filter by favorites** - ✅ checkbox on all entity types
- **Filter by rating** - Min/max sliders (0-100) on all entity types
- **Combined filters** - Intersection logic (favorite AND rating work together)
- **Sort by rating** - ASC/DESC on all entity types
- **Peek-side processing** - Rating filters don't go to Stash (handled locally)

**Per-User O Counter:**

- Peek tracks per-user O counts (not Stash global counts)
- Display on performer cards (💦 icon with count)
- Read-only display on cards
- Interactive increment in video player

**Stash Integration:**

- **No sync to Stash** - Ratings/favorites are Peek-only (documented policy)
- **One-way import** - Can import Stash ratings during sync
- **Preserves Stash data** - Peek doesn't modify Stash ratings

---

### 3. Performance & Caching System ⚡

In-memory caching infrastructure delivering 97% performance improvement on repeat queries.

**Implementation:**

- NodeCache with 1-hour TTL
- Separate caches for Stash data and user ratings
- ~55 MB memory footprint for full library (50K scenes, 20K performers)
- Automatic expiration with stats logging every 30 minutes
- Cache hit/miss logging for debugging

**Performance Results:**

| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| Scenes rating sort (first) | 15-20s | 10-15s | ~25% faster |
| Scenes rating sort (repeat) | 15-20s | <500ms | **97% faster** ⚡ |
| Performers O count (first) | 10-15s | 5-10s | ~33% faster |
| Performers O count (repeat) | 10-15s | <500ms | **97% faster** ⚡ |
| Stash sync | 2-3 min | 30-60s | **70% faster** ⚡ |

**Visibility:**

- Cache statistics in Server Statistics dashboard
- Real-time monitoring of cache size and hit rates

---

### 4. Continue Watching 🎬

Resume recently viewed scenes with automatic position tracking.

**Features:**

- New carousel on Home page showing recent partial playback
- "Resume at XX:XX" timestamp displayed on scene cards
- Sorted by most recent first (last_viewed_at DESC)
- Limited to 24 most recent scenes
- Only shows scenes with partial playback (not fully watched)

**Configuration:**

- Toggle on/off in Carousel Settings
- Reorder within carousel list
- Default: enabled, positioned after "New Scenes"

---

### 5. Skeleton Loading Cards 💀

Animated placeholder cards that match actual content dimensions, preventing layout shift during loading.

**Applied to:**

- **Scenes** - 25rem height portrait cards
- **Scene Carousels** - 17.5rem × 25rem carousel cards
- **Performers** - 20rem height portrait cards
- **Studios** - 8rem height horizontal cards
- **Tags** - 8rem height horizontal cards

**Benefits:**

- No more tiny loading spinners
- Zero layout shift when images load
- Shimmer animation provides visual feedback
- Consistent UX across entire app

---

### 6. Video Player Improvements 🎥

Major video player enhancements including architecture refactor, dynamic aspect ratios, and faster transcoding cleanup.

**Modular Architecture Refactor:**

- **VideoPlayerContext** - Centralized state management for player
- **Custom Hooks:**
  - `useVideoPlayer.js` - Core Video.js integration
  - `usePlaybackTracking.js` - Watch history and O counter tracking
  - `usePlaylistNavigation.js` - Playlist next/prev/autoplay logic
  - `useOrientationFullscreen.js` - Mobile fullscreen on orientation change
- **Video.js Plugin Integration** - Quality selector plugin
- **Modular, testable code** - Separation of concerns

**Dynamic Aspect Ratios:**

- Calculates aspect ratio from actual video dimensions (width/height)
- Supports all formats:
  - 16:9 widescreen (most common)
  - 4:3 standard (pillarboxed with black bars on sides)
  - 9:16 portrait (vertical videos, letterboxed)
  - Any custom ratio
- Max-width 1920px with centering on ultra-wide displays
- No more stretched or cut-off videos

**Transcoding Cleanup:**

- Reduced session timeout from 30 minutes to 90 seconds
- Sessions kept alive by segment requests during playback
- When user navigates away, FFmpeg stops after 90s of inactivity
- Prevents orphaned processes consuming server resources

---

### 7. Stash Media Proxy 🔒

Server-side proxy for media files that hides Stash API keys from clients, enabling public sharing.

**Features:**

- Public endpoint: `/api/proxy/stash?path=/scene/123/screenshot`
- Supports images (JPEG, PNG, WebP), sprites, VTT files
- Streams media with proper cache headers (1-year immutable)
- No authentication required on proxy endpoint
- Hides Stash API keys from client browsers

**Use Cases:**

- Share scene screenshots publicly without Stash credentials
- Embed Peek images in external sites
- Browse Peek without direct Stash network access
- Reverse proxy setups (Nginx, Caddy, etc.)

---

### 8. Stash Sync with Selective Import 📥

One-way sync from Stash with GraphQL filtering to reduce data transfer by 70-80%.

**Selective Sync Options:**

- **Scenes:** Rating only, Favorite only, O Counter only, combinations, or All
- **Performers:** Rating only, Favorite only, combinations, or All
- **Studios:** Rating only, Favorite only, combinations, or All
- **Tags:** Favorite only or All

**Performance:**

- GraphQL filtering at source reduces transfer dramatically
- Example: 21K total scenes → ~4.5K rated scenes transferred
- Progress reporting with created/updated/checked counts
- Automatic cache invalidation after sync completes

**One-Way Policy:**

- Peek → Local database only
- Does not modify Stash data
- Safe for testing without affecting Stash

---

### 9. Watch History Enhancements 📈

Per-user watch history with sorting, filtering, and tracking improvements.

**Sorting:**

- Sort by O counter (ASC/DESC) - per-user values
- Sort by play count (ASC/DESC) - per-user values
- Correct ASC sorting (zeros first, non-zeros on last page)

**Filtering:**

- Filter by O counter min/max - per-user values
- Filter by play count min/max - per-user values

**Tracking Improvements:**

- Fixed playback delta calculations to prevent massive jumps
- Detect new viewing sessions (prevents counting resume as new session)
- Cap playback delta to reasonable values
- Better Stash sync logging

---

### 10. Entity Detail Page Fixes 🐛

Fixed critical filtering bugs on Performer, Studio, and Tag detail pages.

**Issues Fixed:**

- Detail pages now correctly filter scenes by entity ID
- URL parameters properly converted to integers (not strings)
- Scene lists on detail pages show accurate results

**Example:**

- **Before:** `/performers/123` showed ALL scenes (filter ignored)
- **After:** `/performers/123` shows only scenes with performer ID 123

---

### 11. Scene Filtering & Sorting Enhancements 🔍

Comprehensive improvements to scene filtering, sorting, and filter UI.

**Filter Processing:**

- Combined filter intersection logic (favorite AND rating work together)
- Peek-side processing for rating filters (doesn't query Stash)
- Proper handling of favorite filters in custom sort functions
- Preserve pagination when filtering

**Filter UI:**

- Filter chips display active filters
- Multi-select shows "X selected"
- Chips removable via X button
- URL parameters persist filters across page loads
- Sync filter field names between frontend/backend

---

### 12. UI/UX Improvements 🎨

Mobile optimizations and general usability enhancements.

**Mobile:**

- Prevent page scroll during carousel drag on mobile
- Mobile fullscreen on orientation change

**General UI:**

- Simplified pagination select styling
- Removed conflicting height constraints
- Better carousel queries for improved experience
- Show all entities regardless of scene count (removed scene_count > 0 filters)

---

### 13. Admin & User Management 👥

Multi-user support improvements.

**Features:**

- Admin can update other users' settings (not just their own)
- Proper role comparison (uppercase 'ADMIN')
- Admin-only routes with middleware protection

---

### 14. Bug Fixes & Polish 🔧

Dozens of bug fixes across filtering, sorting, routing, and more:

- Fixed ASC sorting for watch history fields
- Fixed O counter endpoint routing mismatches
- Fixed rating injection in custom sort functions
- Fixed favorite filter pagination preservation
- Fixed tag rating sort processing
- Removed duplicate rating filter functions
- Fixed logger imports
- Fixed scene count sort field names
- Fixed TypeScript errors in sync and cache
- Reverted incorrect fixes where needed
- Cleaned up unused code and dead files

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

## Testing Highlights

### Server Statistics Dashboard

Navigate to Server Settings → Server Statistics and verify:

- System resources display with color-coded progress bars
- Cache counts show your library size
- Database size displayed
- Transcoding sessions table (if any active)
- Auto-refresh works every 10 seconds

### Ratings & Favorites

Test on Scenes, Performers, Studios, and Tags:

- Click stars to rate (updates immediately)
- Click heart to favorite (fills red)
- Filter by favorites (✅ checkbox)
- Filter by rating (min/max sliders)
- Combined filters (favorite AND rating work together)
- Sort by rating (ASC/DESC)
- Rating controls in video player

### Continue Watching

1. Watch a video for ~30 seconds, navigate away
2. Go to Home page
3. See "Continue Watching" carousel
4. Scene shows "Resume at 00:30"
5. Click scene, resumes from 30-second mark

### Skeleton Loading

1. Clear browser cache
2. Navigate to Scenes page
3. See skeleton cards (animated shimmer, full size)
4. No layout shift when images load

### Video Player

1. Play 16:9 video (fills width properly up to 1920px)
2. Play 4:3 video (pillarboxed with black bars on sides)
3. Play 9:16 portrait video (letterboxed)
4. Test on ultra-wide monitor (centered with gutters)

### Cache Performance

1. Restart server
2. Sort Scenes by Rating DESC (10-15s first load)
3. Flip to Rating ASC (<500ms instant!)
4. Navigate pages (<500ms each)

---

## Upgrading to v1.1.0

### Check for Updates (Built-in)

Peek includes a built-in update checker:

1. Navigate to **Settings → Server Settings**
2. Scroll to the **Version Information** section
3. Click **Check for Updates**

The system will check GitHub for new releases and notify you if an update is available.

### Update to Latest Version

**Step 1: Stop and remove the current container**

```bash
docker stop peek-stash-browser
docker rm peek-stash-browser
```

**Step 2: Pull the latest image**

```bash
docker pull carrotwaxr/peek-stash-browser:latest
```

**Step 3: Start the new container**

Use the same `docker run` command you used for initial installation. Your data persists in the `peek-data` volume.

**Linux/macOS example:**

```bash
docker run -d \
  --name peek-stash-browser \
  -p 6969:80 \
  -v /path/to/stash/media:/app/media:ro \
  -v peek-data:/app/data \
  -e STASH_URL="http://your-stash-server:9999/graphql" \
  -e STASH_API_KEY="your_stash_api_key" \
  -e JWT_SECRET="${JWT_SECRET}" \
  carrotwaxr/peek-stash-browser:latest
```

**Windows example:**

```powershell
docker run -d `
  --name peek-stash-browser `
  -p 6969:80 `
  -v peek-media:/app/media:ro `
  -v peek-data:/app/data `
  -e STASH_URL=http://192.168.1.100:9999/graphql `
  -e STASH_API_KEY=your_api_key `
  -e JWT_SECRET=$jwt `
  carrotwaxr/peek-stash-browser:latest
```

**unRAID users:** Simply click **Force Update** in the Docker tab to pull the latest image and restart.

**Note:** Your database, user settings, path mappings, and playlists are stored in the `peek-data` volume and will persist across updates. Database schema updates automatically (Prisma migrations).

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

## What's Next (v1.2.0 Preview)

Planned for next release:

- Per-user content inclusion/exclusions
- Custom user themes
- Groups, Galleries, and Images
- Animated previews instead of only using sprites/vtt
- Ability for users to download Scenes and Playlists to their device. Admins to be able to control this per-user
- Analytics and Scene Recommendations

Stay tuned! 🚀

---

## Credits

**Developed with:** Claude Code (Anthropic)
**Contributions:** Beta testers and community feedback

---

**Enjoy Peek v1.1.0!** 🎉

Questions? Feedback? Join the discussion:

- GitHub Issues: https://github.com/carrotwaxr/peek-stash-browser/issues
- Discord: [Your Discord link]
