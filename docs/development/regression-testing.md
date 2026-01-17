# Regression Testing Guide

This guide provides comprehensive regression testing procedures for Peek Stash Browser. Use this checklist before releasing new versions to ensure core functionality remains stable.

!!! warning "Report Inaccuracies"
    If you find any errors, outdated information, or inaccurate testing steps in this document, please report them via [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues) with the label `documentation`. This helps keep the testing guide accurate and useful for everyone.

## Testing Environment Setup

Before beginning regression testing:

1. **Test Data**: Ensure your Stash library has:
   - Multiple scenes with various file formats (MP4, MKV, etc.)
   - Scenes with different durations (short <5min, medium 5-30min, long >30min)
   - Multiple performers, studios, tags
   - At least one gallery and one group/movie
2. **Network Conditions**: Test on stable network connection
3. **Browsers**: Test on at least two browsers (Chrome/Edge and Firefox recommended)
4. **Clean State**: Clear browser cache and cookies before testing critical flows

## Test Execution Guidelines

- **Mark Pass/Fail**: Check off tests as you complete them
- **Document Failures**: Note version, browser, and steps to reproduce any failures
- **Severity Levels**:
  - **Critical**: Blocks core functionality (video playback, login, etc.)
  - **High**: Major feature broken (search, playlists, filtering)
  - **Medium**: Feature degraded but usable
  - **Low**: Minor UI/UX issue

---

## Core Feature Tests

### 1. Authentication & User Management

#### 1.1 First-Time Setup

**Precondition**: Fresh installation with no existing database

- [ ] Setup wizard appears on first access
- [ ] Can configure path mappings successfully
- [ ] Path mappings are validated (invalid paths show error)
- [ ] Default admin user is created
- [ ] After setup, redirects to login page

#### 1.2 Login Flow

- [ ] Can log in with valid credentials
- [ ] Invalid credentials show error message
- [ ] Session persists after page refresh
- [ ] JWT token expires after 24 hours (requires waiting or manual token expiry)
- [ ] Expired token redirects to login page

#### 1.3 User Preferences

**Precondition**: Logged in as any user

- [ ] Settings page loads without errors
- [ ] Can change default video quality (auto, 1080p, 720p, 480p, 360p)
- [ ] Can change playback mode (auto, direct, transcode)
- [ ] Can change theme (multiple built-in themes available)
- [ ] Can change preview quality (sprite, webp, mp4)
- [ ] Can change minimum play percent (0-100% slider)
- [ ] Preferences persist after logout/login
- [ ] Preferences apply immediately (theme change, etc.)

#### 1.4 User Management (Admin Only)

**Precondition**: Logged in as admin user

- [ ] Can view list of all users
- [ ] Can create new user (Admin or User role)
- [ ] Can delete non-admin users
- [ ] Cannot delete own admin account
- [ ] Can change user passwords
- [ ] Can toggle user roles (Admin ↔ User)

---

### 2. Video Playback

#### 2.1 Direct Playback (No Transcoding)

**Precondition**: Select quality "Direct" in video player

- [ ] Video starts playing within 3 seconds
- [ ] Playback is smooth (no stuttering)
- [ ] Audio syncs with video
- [ ] Can pause and resume
- [ ] Can seek to different timestamps (beginning, middle, end)
- [ ] Volume control works
- [ ] Fullscreen toggle works
- [ ] Player shows correct duration
- [ ] Timeline/scrubber reflects current position

#### 2.2 Transcoded Playback (HLS)

**Precondition**: Select quality "720p" or lower in video player

- [ ] HLS stream starts within 5 seconds
- [ ] Quality selector shows available qualities (360p, 480p, 720p, 1080p)
- [ ] Can switch between qualities mid-playback
- [ ] Playback resumes at same position after quality change
- [ ] Seeking works correctly (forward and backward)
- [ ] Far seeks (>2 minutes ahead) restart transcoding session properly
- [ ] Segments load progressively (check Network tab)
- [ ] No missing segments or 404 errors
- [ ] Transcoding session cleans up after 90 seconds of inactivity

**Test Scenarios**:

- [ ] **Short video (<5min)**: Plays from start to finish without errors
- [ ] **Long video (>30min)**: Can seek to middle and end without issues
- [ ] **Multiple quality switches**: Switch between 360p → 720p → 480p during playback
- [ ] **Rapid seeking**: Seek multiple times in quick succession (shouldn't crash)

#### 2.3 Resume Playback

**Precondition**: Previously watched a scene partially (not to completion)

- [ ] Scene shows resume position indicator (progress bar on thumbnail)
- [ ] Clicking scene shows "Resume" and "Restart" options
- [ ] "Resume" starts playback at last position (within 5 seconds accuracy)
- [ ] "Restart" starts playback at 0:00
- [ ] Resume position updates as video plays
- [ ] Watching to completion clears resume position

#### 2.4 Watch History Tracking

- [ ] Play count increments after watching
- [ ] Play duration accumulates correctly
- [ ] O-counter increments when marking scenes
- [ ] Last played timestamp updates
- [ ] Watch history appears in "Recently Watched" carousel (if implemented)
- [ ] Watch history persists across sessions

---

### 3. Scene Search, Filtering, and Sorting

#### 3.1 Search Functionality

**Location**: Scenes page, search bar at top

- [ ] Typing in search bar shows results in real-time
- [ ] Search matches scene titles
- [ ] Search matches performer names
- [ ] Search matches studio names
- [ ] Search matches tag names
- [ ] Empty search shows all scenes
- [ ] Search results update immediately (<500ms)
- [ ] Clearing search resets to full library

#### 3.2 Filtering

**Location**: Scenes page, filter panel (sidebar or modal)

##### Basic Filters

- [ ] Filter by performer (single selection)
- [ ] Filter by multiple performers (AND logic)
- [ ] Filter by studio (single selection)
- [ ] Filter by tag (single selection)
- [ ] Filter by multiple tags (AND/OR logic based on settings)
- [ ] Filter by rating (min/max range)
- [ ] Filter by organized status (Yes/No/All)
- [ ] Filter by O-counter value (min/max range)

##### Advanced Filters

- [ ] Filter by duration (min/max range in minutes)
- [ ] Filter by resolution (SD/HD/4K/etc.)
- [ ] Filter by interactive (Yes/No if applicable)
- [ ] Combining multiple filters applies AND logic correctly
- [ ] Clearing filters resets to full library

##### Filter Presets

- [ ] Can save current filter state as preset
- [ ] Can load saved filter preset
- [ ] Can delete saved filter preset
- [ ] Presets persist across sessions
- [ ] Default presets load on page visit (if configured)

##### Hidden Items Filter

- [ ] Filter shows "Show Hidden Items" toggle
- [ ] Hidden scenes are excluded by default
- [ ] Toggling "Show Hidden Items" reveals hidden scenes
- [ ] Hidden scenes display with visual indicator (dimmed, badge, etc.)

#### 3.3 Sorting

**Location**: Scenes page, sort dropdown

- [ ] Sort by Date Added (newest first)
- [ ] Sort by Date Added (oldest first)
- [ ] Sort by Title (A-Z)
- [ ] Sort by Title (Z-A)
- [ ] Sort by Duration (longest first)
- [ ] Sort by Duration (shortest first)
- [ ] Sort by Rating (highest first)
- [ ] Sort by Rating (lowest first)
- [ ] Sort by Play Count (most played first)
- [ ] Sort by Random (different order on each load)
- [ ] Sort order persists when navigating away and back
- [ ] Sort works correctly with active filters

#### 3.4 Pagination/Infinite Scroll

**Precondition**: Library has >40 scenes (default page size)

- [ ] Initial page loads first 40 scenes
- [ ] Scrolling to bottom loads next page automatically
- [ ] Loading indicator appears while fetching
- [ ] No duplicate scenes appear
- [ ] Can scroll through entire library without errors
- [ ] Scroll position maintained when navigating back from scene details

---

### 4. Scene Grid and Preview Playback

#### 4.1 Scene Cards Display

- [ ] Scene thumbnails load correctly
- [ ] Scene titles display correctly
- [ ] Scene metadata visible (duration, rating, date, etc.)
- [ ] Performer names display (truncated if too many)
- [ ] Studio name displays (if applicable)
- [ ] Watch history indicators show (resume bar, play count, O-counter)
- [ ] Cards have hover effects (preview, actions, etc.)

#### 4.2 Preview Playback on Hover

**Precondition**: Preview feature enabled in settings

- [ ] Hovering over scene card for 2 seconds starts preview
- [ ] Preview plays short clip from scene
- [ ] Preview has no audio (or low volume)
- [ ] Preview loops continuously while hovering
- [ ] Moving mouse away stops preview immediately
- [ ] Preview quality matches user preference (Low/Medium/High)
- [ ] Preview doesn't interfere with clicking/navigation
- [ ] Multiple rapid hovers don't cause errors

#### 4.3 Scene Card Actions

**Location**: Hover over scene card or three-dot menu

- [ ] Can play scene directly (navigates to player page)
- [ ] Can add scene to playlist (opens playlist selector)
- [ ] Can mark scene as watched
- [ ] Can mark O-counter increment
- [ ] Can rate scene (opens rating modal or inline rating)
- [ ] Can hide scene (requires confirmation, scene disappears)
- [ ] Can view scene details (navigates to details page)
- [ ] Can download original file (triggers download)

---

### 5. Playlists

#### 5.1 Playlist Creation

**Location**: Playlists page or scene card menu

- [ ] Can create new playlist with name
- [ ] Can create new playlist with description (optional)
- [ ] Empty playlists are allowed
- [ ] Duplicate playlist names are allowed (or prevented based on requirements)
- [ ] New playlist appears in playlists list immediately

#### 5.2 Adding/Removing Scenes

- [ ] Can add scene to playlist from scene card menu
- [ ] Can add multiple scenes to playlist in batch
- [ ] Can remove scene from playlist (via playlist view)
- [ ] Can reorder scenes in playlist (drag-and-drop or up/down buttons)
- [ ] Playlist item count updates immediately
- [ ] Playlist thumbnail updates to first scene

#### 5.3 Playlist Playback

**Precondition**: Playlist has at least 3 scenes

- [ ] Clicking playlist plays first scene
- [ ] Auto-advances to next scene after current finishes
- [ ] "Previous" button goes to previous scene
- [ ] "Next" button goes to next scene
- [ ] Playlist progress indicator shows (e.g., "2 of 5")
- [ ] Can exit playlist playback and return later (resumes at last scene)
- [ ] Shuffle mode randomizes playback order
- [ ] Repeat mode restarts playlist after last scene
- [ ] Shuffle + Repeat combination works correctly

#### 5.4 Playlist Management

- [ ] Can rename playlist
- [ ] Can edit playlist description
- [ ] Can delete playlist (requires confirmation)
- [ ] Deleting playlist doesn't delete scenes
- [ ] Can duplicate playlist
- [ ] Can export playlist as M3U (downloads file with relative paths)
- [ ] Can clear all scenes from playlist

---

### 6. Performers, Studios, Tags, Galleries, Groups

#### 6.1 Performers Page

- [ ] Performers grid loads with thumbnails
- [ ] Can search performers by name
- [ ] Can filter performers by tag (if applicable)
- [ ] Can sort performers (name, scene count, etc.)
- [ ] Clicking performer navigates to performer details
- [ ] Performer details show bio, image, scene count
- [ ] Performer details show list of scenes
- [ ] Can filter scenes on performer page (same filters as main scenes page)
- [ ] Can rate performer (if rating feature exists)
- [ ] Can mark performer as favorite

#### 6.2 Studios Page

- [ ] Studios grid loads with logos/thumbnails
- [ ] Can search studios by name
- [ ] Can sort studios (name, scene count, etc.)
- [ ] Clicking studio navigates to studio details
- [ ] Studio details show scene count and scene list
- [ ] Can filter scenes on studio page
- [ ] Can rate studio (if rating feature exists)
- [ ] Can mark studio as favorite

#### 6.3 Tags Page

- [ ] Tags list loads (grid or list view)
- [ ] Can search tags by name
- [ ] Can sort tags (name, scene count, etc.)
- [ ] Clicking tag navigates to tag details or filters scenes
- [ ] Tag details show scene count and scene list
- [ ] Can filter scenes by tag combinations (multiple tags)
- [ ] Can hide/show tag categories (if hierarchical)

#### 6.4 Galleries Page

- [ ] Galleries grid loads with cover images
- [ ] Can search galleries by title
- [ ] Can filter galleries by performer/studio/tag
- [ ] Clicking gallery navigates to gallery viewer
- [ ] Gallery viewer shows all images in grid or slideshow
- [ ] Can navigate images with arrow keys or swipe
- [ ] Can zoom images
- [ ] Can download images
- [ ] Can rate gallery (if rating feature exists)

#### 6.5 Groups/Movies Page

- [ ] Groups grid loads with cover images
- [ ] Can search groups by name
- [ ] Can filter groups by studio/performer/tag
- [ ] Clicking group navigates to group details
- [ ] Group details show scene list in correct order
- [ ] Can play group as playlist (scenes in order)
- [ ] Can reorder scenes in group (if editing is allowed)

---

### 7. Ratings and Favorites

#### 7.1 Rating Scenes

- [ ] Can rate scene from 0-100 (or 0-5 stars)
- [ ] Rating updates immediately on scene card
- [ ] Rating persists across sessions
- [ ] Can change rating multiple times
- [ ] Can clear rating (set to null/unrated)
- [ ] Average rating shown alongside user rating (if Stash has community ratings)

#### 7.2 Favorite Scenes

- [ ] Can mark scene as favorite (heart icon)
- [ ] Favorite status toggles on/off
- [ ] Favorite indicator visible on scene card
- [ ] Can filter scenes to show only favorites
- [ ] Favorites persist across sessions

#### 7.3 Rating Other Entities

**Test for Performers, Studios, Tags, Galleries, Groups**:

- [ ] Can rate each entity type
- [ ] Can favorite each entity type
- [ ] Ratings and favorites persist
- [ ] Can filter by rating/favorite status

---

### 8. User Settings and Preferences

#### 8.1 General Settings

**Location**: Settings page → General Settings section

- [ ] Can change default video quality (auto, 1080p, 720p, 480p, 360p)
- [ ] Can change playback mode (auto, direct, transcode)
- [ ] Can change theme (multiple built-in themes available)
- [ ] Can change preview quality (sprite, webp, mp4)
- [ ] Can toggle preview autoplay on hover (On/Off)
- [ ] Can change minimum play percent (0-100% slider)
- [ ] Can change default sort order for scenes
- [ ] Can change scenes per page (if configurable)
- [ ] Settings save immediately or on "Save" button click
- [ ] Settings apply immediately (no page refresh required for most)

#### 8.2 Carousel Preferences

**Location**: Settings page → Homepage Carousels section

- [ ] Can toggle hardcoded carousels on/off (Continue Watching, High Rated, etc.)
- [ ] Can reorder carousels with up/down buttons
- [ ] Changes reflect on home page after save

#### 8.3 Custom Carousels

**Location**: Settings page → Homepage Carousels → Create Carousel

- [ ] Can create custom carousel with title and icon
- [ ] Can add filter rules (performers, tags, rating, etc.)
- [ ] Preview shows matching scenes before save
- [ ] Save is disabled until preview succeeds
- [ ] Can edit existing custom carousel
- [ ] Can delete custom carousel
- [ ] Custom carousel appears on homepage
- [ ] Maximum 15 custom carousels enforced
- [ ] Filter options are sorted alphabetically
- [ ] Scene titles use basename fallback when no title

#### 8.4 Navigation Preferences

**Location**: Settings page → Navigation Settings section

- [ ] Can toggle sidebar visibility (always visible, collapsible, hidden)
- [ ] Can toggle top bar elements (show/hide search, user menu, etc.)
- [ ] Can configure keyboard shortcuts (if customizable)

#### 8.5 Filter Presets

**Location**: Settings page → Filter Presets section

- [ ] Can view saved filter presets
- [ ] Can edit filter preset name/description
- [ ] Can delete filter preset
- [ ] Can set default filter preset (auto-loads on scenes page)
- [ ] Can export/import filter presets (JSON file)

#### 8.6 Hidden Items (User Feature)

**Location**: Settings page → link to Hidden Items page

- [ ] Can hide individual scenes, performers, studios, tags, galleries, groups
- [ ] Hidden items link in Settings navigates to Hidden Items page
- [ ] Hidden Items page shows all hidden entities grouped by type
- [ ] Can unhide items from Hidden Items page
- [ ] "Show Hidden Items" toggle on filter panels reveals hidden content
- [ ] Hidden items persist across sessions

#### 8.6 Content Restrictions (Admin Feature)

**Location**: User Management page → Content Restrictions modal (admin only)

**Note**: This is an admin-only feature for managing per-user content restrictions, separate from user-level hidden items.

- [ ] Admin can access Content Restrictions modal from User Management
- [ ] Can set INCLUDE mode (user sees only specified groups/tags/studios/galleries)
- [ ] Can set EXCLUDE mode (user doesn't see specified groups/tags/studios/galleries)
- [ ] Can select multiple groups, tags, studios, galleries for restriction
- [ ] Restrictions apply only to the selected user
- [ ] Restrictions apply immediately across all pages for that user
- [ ] Restrictions persist across sessions
- [ ] Can clear all restrictions for a user

---

### 9. Keyboard Navigation and Shortcuts

#### 9.1 Global Shortcuts

**Precondition**: Focus on main application (not in text input)

- [ ] `Space` or `K` pauses/plays video (in player)
- [ ] `F` toggles fullscreen (in player)
- [ ] `M` toggles mute (in player)
- [ ] `Left/Right` arrow keys seek video (±5 seconds)
- [ ] `Up/Down` arrow keys adjust volume (±5%)
- [ ] `J/L` keys seek video (±10 seconds)
- [ ] `Home/End` keys jump to start/end of video
- [ ] `Shift+>/Shift+<` adjust playback speed
- [ ] `Shift+N/Shift+P` next/previous scene in playlist
- [ ] Media hardware keys (Play/Pause, FastForward, Rewind, TrackNext, TrackPrevious)
- [ ] `0-9` seek to percentage (1 = 10%, 5 = 50%, etc.)
- [ ] `Esc` exits fullscreen or closes modals
- [ ] `/` focuses search bar
- [ ] `?` opens keyboard shortcuts help modal (if implemented)

#### 9.2 Scene Grid Navigation

**Precondition**: Focus on scenes grid (not in search/filter)

- [ ] Arrow keys navigate between scene cards
- [ ] `Enter` plays selected scene
- [ ] `A` adds selected scene to playlist
- [ ] `H` hides selected scene
- [ ] `R` opens rating modal for selected scene
- [ ] Tab/Shift+Tab navigates focusable elements

#### 9.3 TV Mode Navigation

**Precondition**: TV Mode enabled (if applicable)

- [ ] D-pad navigation works (arrow keys simulate remote)
- [ ] Enter/Select button activates items
- [ ] Back button exits player or modals
- [ ] Focus indicators are clearly visible
- [ ] No keyboard traps (can always navigate out)

---

### 10. Server Settings and Admin Features

#### 10.1 Server Information

**Precondition**: Logged in as admin

**Location**: Settings page → Server tab

- [ ] Server version displayed correctly (matches package.json)
- [ ] Stash server URL displayed
- [ ] Stash server version displayed (fetched from Stash API)
- [ ] Database location displayed
- [ ] Cache directory location displayed
- [ ] Uptime displayed (time since server start)

#### 10.2 Cache Management

**Location**: Settings page → Server tab → Cache section

- [ ] Can view cache status (last refresh time, entity counts)
- [ ] Can manually refresh cache (button triggers refresh)
- [ ] Cache refresh shows progress indicator
- [ ] Cache refresh completes without errors
- [ ] Scene count updates after cache refresh
- [ ] New scenes from Stash appear after cache refresh

#### 10.3 Path Mappings

**Location**: Settings page → Server tab → Path Mappings section

- [ ] Can view existing path mappings (Stash path → Peek path)
- [ ] Can add new path mapping
- [ ] Can edit existing path mapping
- [ ] Can delete path mapping (requires confirmation)
- [ ] Invalid paths show validation error
- [ ] Path mappings apply immediately (no restart required)
- [ ] Test path translation feature works (if exists)

#### 10.4 Update Checker

**Location**: Settings page → Server tab → Updates section

- [ ] Current version displayed
- [ ] "Check for updates" button queries GitHub API
- [ ] If update available, shows banner with version number and changelog link
- [ ] If no update, shows "Up to date" message
- [ ] Clicking changelog link opens GitHub release page in new tab

---

### 11. Error Handling and Edge Cases

#### 11.1 Network Errors

**Test Scenarios**:

- [ ] **Stash server offline**: App shows error message, doesn't crash
- [ ] **Stash server slow**: Loading indicators appear, requests timeout gracefully
- [ ] **Invalid Stash API key**: Setup wizard or settings page shows authentication error
- [ ] **Network interruption during playback**: Video pauses, shows buffering indicator, resumes when network recovers

#### 11.2 Invalid Data Handling

**Test Scenarios**:

- [ ] **Scene with missing file**: Shows error message instead of playing, doesn't crash app
- [ ] **Scene with invalid path mapping**: Shows error message, allows user to update path mappings
- [ ] **Corrupted video file**: FFmpeg fails gracefully, shows error message
- [ ] **Scene with no duration**: Displays "Unknown duration" or defaults to 0, doesn't crash
- [ ] **Scene with no title**: Displays filename or "Untitled" instead of crashing

#### 11.3 Permission Errors

**Test Scenarios**:

- [ ] **Non-admin tries to access admin features**: Redirected or shown "Access Denied" message
- [ ] **Expired JWT token**: Redirected to login page with message "Session expired"
- [ ] **Invalid JWT token**: Redirected to login page, doesn't crash

#### 11.4 Database Errors

**Test Scenarios** (requires simulating DB issues):

- [ ] **Database locked**: Shows error message, retries operation
- [ ] **Database migration fails**: Server logs error, shows setup wizard or maintenance page
- [ ] **Database corruption**: Server detects and shows recovery instructions

#### 11.5 Browser Compatibility

**Test on Multiple Browsers**:

- [ ] Chrome/Edge: All features work
- [ ] Firefox: All features work
- [ ] Safari: All features work (if targeting macOS/iOS)
- [ ] Mobile browsers: Responsive layout, touch controls work

---

## Performance Testing

### 12.1 Load Times

- [ ] **Initial page load**: <3 seconds on broadband connection
- [ ] **Scene grid load**: <2 seconds for first 40 scenes
- [ ] **Video player load**: <3 seconds to first frame (direct playback)
- [ ] **HLS stream start**: <5 seconds to first frame (transcoded playback)
- [ ] **Search/filter response**: <500ms for typical library (<10,000 scenes)

### 12.2 Resource Usage

**Precondition**: Monitor browser DevTools Performance tab

- [ ] **Memory usage**: No memory leaks during 30-minute session
- [ ] **CPU usage**: <20% CPU during idle browsing (not playing video)
- [ ] **Network usage**: Only necessary requests (no redundant API calls)

### 12.3 Concurrent Sessions

**Test Scenarios**:

- [ ] **Multiple browser tabs**: Can play different videos in 2+ tabs simultaneously
- [ ] **Multiple users**: 2+ users can log in and use app concurrently without interference
- [ ] **Transcoding sessions**: Multiple concurrent HLS streams don't exhaust server resources

---

## Mobile and Responsive Testing

### 13.1 Mobile Layout

**Precondition**: Test on mobile device or browser DevTools mobile emulation

- [ ] Scenes grid adapts to narrow viewport (1-2 columns)
- [ ] Navigation menu becomes hamburger or bottom nav
- [ ] Scene cards remain readable and tappable (no tiny text/buttons)
- [ ] Video player controls are touch-friendly (large buttons)
- [ ] Search bar and filters accessible on mobile
- [ ] Settings page scrollable and functional

### 13.2 Touch Controls

- [ ] Tap scene card to play
- [ ] Swipe to scroll scene grid
- [ ] Pinch to zoom images (in galleries)
- [ ] Tap player controls to pause/play/seek
- [ ] Double-tap player to toggle fullscreen
- [ ] Swipe to navigate between scenes in playlist (if applicable)

---

## Post-Release Monitoring

After deploying a new version to production:

1. **Check server logs**: Look for errors or warnings in first 24 hours
2. **Monitor user reports**: Track GitHub issues for bug reports
3. **Check update notifications**: Verify users see update banner if applicable
4. **Database migrations**: Confirm migrations ran successfully on user instances
5. **Performance**: Monitor server resource usage (CPU, memory, disk) for anomalies

---

## Test Report Template

After completing regression testing, document results:

```
**Peek Stash Browser - Regression Test Report**

**Version Tested**: 1.X.X
**Test Date**: YYYY-MM-DD
**Tester**: [Your Name]
**Environment**:
- Docker Version: X.X.X
- Browser(s): Chrome X.X, Firefox X.X
- Stash Version: X.X.X
- Test Library Size: X scenes, Y performers, Z studios

**Test Results Summary**:
- Total Tests: X
- Passed: X
- Failed: X
- Skipped: X (with reason)

**Critical Issues Found**:
1. [Issue description, steps to reproduce, severity]
2. ...

**High Priority Issues Found**:
1. [Issue description, steps to reproduce, severity]
2. ...

**Medium/Low Priority Issues**:
- [Brief list]

**Recommendation**: ✅ Ready for release / ⚠️ Release with known issues / ❌ Do not release

**Additional Notes**:
[Any observations, performance notes, or suggestions]
```

---

## Automation Recommendations

For future improvements, consider automating these tests:

- **Unit tests**: Core utility functions (path mapping, filter logic, etc.)
- **Integration tests**: API endpoints with mock data
- **End-to-end tests**: Playwright or Cypress for critical user flows (login, playback, search)
- **Visual regression tests**: Screenshot comparison for UI changes
- **Performance tests**: Lighthouse CI for page load metrics

---

## Updating This Document

As new features are added, update this regression testing guide:

1. Add new test sections for new features (e.g., "14. Social Features")
2. Update existing tests if feature behavior changes
3. Archive obsolete tests (mark as "Deprecated" if removed)
4. Keep test steps concise and actionable
5. Include preconditions and expected results for clarity

**Last Updated**: 2026-01-17 (Version 3.2)
