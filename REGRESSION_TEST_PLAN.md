# Regression Test Plan - Stash Stream Proxying & Video.js Refactor

**Branch**: `feature/hide-captions-when-unavailable`
**Date**: 2025-11-24
**Scope**: Comprehensive regression testing after major Video.js refactor and Stash stream proxying implementation

---

## Test Environment Setup

- [ ] Docker Compose running (`docker-compose up -d`)
- [ ] Browser DevTools console open (F12)
- [ ] Test with multiple browsers (Chrome, Firefox, Safari if available)
- [ ] Test with different screen sizes (desktop, tablet, mobile)
- [ ] Stash server accessible and configured
- [ ] Database has test users, playlists, watch history data

---

## 1. Video Player Core Functionality

### 1.1 Basic Playback
- [ ] **Test**: Click on any scene card
- [ ] **Verify**: Video loads and plays immediately
- [ ] **Verify**: Duration displays correctly (not incrementing)
- [ ] **Verify**: Timeline scrubber shows correct total duration
- [ ] **Verify**: No console errors

### 1.2 Play/Pause Controls
- [ ] **Test**: Click play/pause button in control bar
- [ ] **Verify**: Video pauses and resumes correctly
- [ ] **Test**: Press spacebar
- [ ] **Verify**: Video pauses and resumes correctly
- [ ] **Test**: Click big play button (centered icon when paused)
- [ ] **Verify**: Video starts playing
- [ ] **Verify**: Big play button disappears when playing

### 1.3 Seeking
- [ ] **Test**: Drag timeline scrubber to different positions
- [ ] **Verify**: Video seeks correctly to selected time
- [ ] **Verify**: Playback continues from new position
- [ ] **Test**: Click on timeline bar at different positions
- [ ] **Verify**: Video jumps to clicked position
- [ ] **Test**: Seek far ahead (beyond buffered segments for HLS)
- [ ] **Verify**: Stream reloads with ?start parameter (check Network tab)
- [ ] **Verify**: Playback continues from new position

### 1.4 Volume Controls
- [ ] **Test**: Click volume button
- [ ] **Verify**: Vertical volume slider appears above button (not horizontal)
- [ ] **Test**: Drag volume slider
- [ ] **Verify**: Volume changes accordingly
- [ ] **Test**: Set volume to 50%, refresh page
- [ ] **Verify**: Volume persists at 50% (localStorage)
- [ ] **Test**: Mute via volume button
- [ ] **Verify**: Volume muted, icon changes
- [ ] **Test**: Press M key
- [ ] **Verify**: Volume toggles mute/unmute

### 1.5 Fullscreen
- [ ] **Test**: Click fullscreen button
- [ ] **Verify**: Video enters fullscreen mode
- [ ] **Test**: Press F key
- [ ] **Verify**: Video enters fullscreen mode
- [ ] **Test**: Press Escape
- [ ] **Verify**: Video exits fullscreen mode
- [ ] **Verify**: Controls remain functional in fullscreen

---

## 2. Quality Selection (Stash Source Selector Plugin)

### 2.1 Quality Menu
- [ ] **Test**: Click gear icon (⚙) in control bar
- [ ] **Verify**: Quality menu appears **instantly** (no delay)
- [ ] **Verify**: Menu positioned directly above gear button
- [ ] **Verify**: Menu shows all available streams from Stash
  - Direct stream
  - HLS options (if configured in Stash)
  - MP4/WEBM variants (if available)
- [ ] **Verify**: Currently selected quality is checked/highlighted

### 2.2 Switching Qualities
- [ ] **Test**: Select a different quality (e.g., 720p)
- [ ] **Verify**: Playback position is preserved
- [ ] **Verify**: Paused state is preserved (if paused)
- [ ] **Verify**: New stream loads and plays
- [ ] **Verify**: Network tab shows new stream URL
- [ ] **Test**: Switch back to Direct stream
- [ ] **Verify**: Direct stream plays without transcoding
- [ ] **Verify**: Seeking is instant (no HLS segment generation delay)

### 2.3 Auto-Fallback on Codec Errors
- [ ] **Test**: Open scene with multiple streams (requires AV1/codec that may fail in some browsers)
- [ ] **Verify**: If Direct stream fails, Video.js auto-fallback to next source
- [ ] **Verify**: Console shows: "Source 'Direct' is unsupported" and "Trying next source"
- [ ] **Verify**: Errored source shows dimmed/strikethrough in gear menu
- [ ] **Verify**: Playback continues with fallback source

---

## 3. Video Player Keyboard Shortcuts

### 3.1 Playback Control Hotkeys
- [ ] **Space**: Play/pause
- [ ] **K**: Play/pause (YouTube-style)
- [ ] **Arrow Left**: Seek back 5 seconds
- [ ] **Arrow Right**: Seek forward 5 seconds
- [ ] **J**: Seek back 10 seconds
- [ ] **L**: Seek forward 10 seconds
- [ ] **0-9 keys**: Jump to 0%, 10%, 20%, ... 90% of video
- [ ] **Home**: Jump to beginning
- [ ] **End**: Jump to end

### 3.2 Volume Hotkeys
- [ ] **M**: Mute/unmute
- [ ] **Arrow Up**: Increase volume by 5%
- [ ] **Arrow Down**: Decrease volume by 5%

### 3.3 Fullscreen Hotkeys
- [ ] **F**: Toggle fullscreen
- [ ] **Escape**: Exit fullscreen (when in fullscreen)

### 3.4 Custom Peek Hotkeys (Rating, etc.)
- [ ] **R then 1-5**: Set rating (1 star to 5 stars)
- [ ] **R then 0**: Clear rating
- [ ] **R then F**: Toggle favorite
- [ ] **Verify**: Hotkeys work only when video player focused
- [ ] **Verify**: Hotkeys do NOT trigger when typing in text inputs

---

## 4. Playlist Functionality

### 4.1 Playlist Creation
- [ ] **Test**: Create new playlist from Playlists page
- [ ] **Verify**: Playlist appears in sidebar
- [ ] **Test**: Add scenes to playlist
- [ ] **Verify**: Scenes appear in playlist with correct order

### 4.2 Playlist Playback
- [ ] **Test**: Click on first scene in playlist
- [ ] **Verify**: Video player opens with scene
- [ ] **Verify**: "Previous" and "Next" buttons appear in control bar
- [ ] **Test**: Click "Next" button (►)
- [ ] **Verify**: Next scene loads and plays
- [ ] **Test**: Click "Previous" button (◄)
- [ ] **Verify**: Previous scene loads and plays
- [ ] **Test**: Let scene play to end naturally
- [ ] **Verify**: Next scene auto-plays (if not at end of playlist)

### 4.3 Shuffle Mode
- [ ] **Test**: Enable shuffle on playlist
- [ ] **Verify**: Shuffle icon becomes active/highlighted
- [ ] **Test**: Play scene, click "Next"
- [ ] **Verify**: Random scene plays (not sequential)
- [ ] **Test**: Click "Next" multiple times
- [ ] **Verify**: Scenes play in shuffled order
- [ ] **Verify**: Each scene plays only once before reshuffling
- [ ] **Test**: Disable shuffle
- [ ] **Verify**: Playback returns to sequential order

### 4.4 Repeat Mode
- [ ] **Test**: Set repeat to "Repeat All"
- [ ] **Verify**: Repeat icon shows "all" state
- [ ] **Test**: Play to end of playlist
- [ ] **Verify**: First scene plays again (loops back)
- [ ] **Test**: Set repeat to "Repeat One"
- [ ] **Verify**: Current scene loops infinitely
- [ ] **Test**: Set repeat to "Off"
- [ ] **Verify**: Playback stops at end of playlist

### 4.5 Playlist Persistence
- [ ] **Test**: Create playlist, add scenes, enable shuffle + repeat
- [ ] **Test**: Refresh page
- [ ] **Verify**: Playlist still exists with same scenes
- [ ] **Verify**: Shuffle and repeat modes persist
- [ ] **Test**: Start playback, navigate away from player
- [ ] **Test**: Return to playlist
- [ ] **Verify**: Playlist context preserved (current position, shuffle, repeat)

---

## 5. Watch History & Resume Playback

### 5.1 Watch History Tracking
- [ ] **Test**: Watch a scene for 30 seconds
- [ ] **Test**: Navigate away from player
- [ ] **Test**: Go to Watch History page
- [ ] **Verify**: Scene appears in watch history with progress bar
- [ ] **Verify**: Progress bar shows ~30 seconds watched

### 5.2 Resume Playback
- [ ] **Test**: Watch scene partway through (e.g., 2 minutes of 10-minute video)
- [ ] **Test**: Navigate away from player
- [ ] **Test**: Return to same scene (click card again)
- [ ] **Verify**: Video resumes from ~2 minutes
- [ ] **Verify**: No manual seeking required
- [ ] **Test**: Watch to very end of scene (last 5 seconds)
- [ ] **Test**: Return to scene
- [ ] **Verify**: Scene starts from beginning (completed scenes reset)

### 5.3 Play Count Tracking
- [ ] **Test**: Watch scene to completion
- [ ] **Test**: Check scene details
- [ ] **Verify**: Play count incremented by 1
- [ ] **Test**: Watch same scene again
- [ ] **Verify**: Play count incremented again

### 5.4 O-Counter Button
- [ ] **Test**: Click O-Counter button in PlaybackControls card
- [ ] **Verify**: Counter increments by 1
- [ ] **Test**: Click multiple times
- [ ] **Verify**: Counter increments each time
- [ ] **Test**: Refresh page and return to scene
- [ ] **Verify**: O-Counter value persists

---

## 6. Rating & Favorite System

### 6.1 Rating Slider in PlaybackControls
- [ ] **Test**: Drag rating slider in PlaybackControls card (below video)
- [ ] **Verify**: Rating updates in real-time
- [ ] **Test**: Set rating to 3 stars
- [ ] **Test**: Refresh page and return to scene
- [ ] **Verify**: Rating persists at 3 stars
- [ ] **Test**: Click clear button (X) on rating slider
- [ ] **Verify**: Rating cleared

### 6.2 Favorite Button in PlaybackControls
- [ ] **Test**: Click favorite button (heart icon) in PlaybackControls card
- [ ] **Verify**: Button becomes filled/active
- [ ] **Test**: Refresh page and return to scene
- [ ] **Verify**: Favorite status persists
- [ ] **Test**: Click favorite button again
- [ ] **Verify**: Favorite removed

### 6.3 Rating Hotkeys
- [ ] **Test**: Press R then 5
- [ ] **Verify**: Rating set to 5 stars
- [ ] **Test**: Press R then 2
- [ ] **Verify**: Rating changes to 2 stars
- [ ] **Test**: Press R then 0
- [ ] **Verify**: Rating cleared
- [ ] **Test**: Press R then F
- [ ] **Verify**: Favorite toggled

---

## 7. Captions/Subtitles

### 7.1 Caption Button Visibility
- [ ] **Test**: Open scene with captions
- [ ] **Verify**: CC button visible in control bar
- [ ] **Test**: Open scene WITHOUT captions
- [ ] **Verify**: CC button hidden (or disabled/greyed out)

### 7.2 Caption Selection
- [ ] **Test**: Click CC button (scene with captions)
- [ ] **Verify**: Caption menu appears with available languages
- [ ] **Test**: Select a caption language
- [ ] **Verify**: Captions display on video
- [ ] **Verify**: Captions sync correctly with video
- [ ] **Test**: Select "Off"
- [ ] **Verify**: Captions disappear

### 7.3 Caption Seeking Sync
- [ ] **Test**: Enable captions, seek to different positions
- [ ] **Verify**: Captions remain synced after seeking
- [ ] **Verify**: Correct captions display for each time position

---

## 8. Navigation & Previous/Next Scene Buttons

### 8.1 Scene Navigation in Playlists
- [ ] **Test**: Open scene from playlist
- [ ] **Verify**: Previous (◄) and Next (►) buttons appear in control bar
- [ ] **Test**: Click Next button
- [ ] **Verify**: Next scene in playlist loads
- [ ] **Test**: Click Previous button
- [ ] **Verify**: Previous scene loads

### 8.2 Scene Navigation Outside Playlists
- [ ] **Test**: Open scene from main library (not from playlist)
- [ ] **Verify**: Previous/Next buttons either hidden OR navigate through library search results
- [ ] **Verify**: Expected behavior documented (check user preference)

### 8.3 Keyboard Navigation
- [ ] **Test**: Press N key (if implemented)
- [ ] **Verify**: Next scene loads
- [ ] **Test**: Press Shift+N or P key (if implemented)
- [ ] **Verify**: Previous scene loads

---

## 9. Responsive Layout & Breakpoints

### 9.1 Desktop (XL+ Breakpoint)
- [ ] **Test**: Resize browser to 1280px+ width
- [ ] **Verify**: PlaybackControls show single row layout
- [ ] **Verify**: Rating slider on left, action buttons on right
- [ ] **Verify**: All controls visible and accessible

### 9.2 Tablet (SM to XL Breakpoint)
- [ ] **Test**: Resize browser to 576px-1279px width
- [ ] **Verify**: PlaybackControls show two-row layout
  - Row 1: Rating slider + O Counter + Favorite
  - Row 2: Add to Playlist button (right-aligned)
- [ ] **Verify**: Controls don't overlap or break layout

### 9.3 Mobile (< SM Breakpoint)
- [ ] **Test**: Resize browser to < 576px width
- [ ] **Verify**: PlaybackControls show three-row layout
  - Row 1: O Counter + Favorite (centered)
  - Row 2: Rating slider (full width)
  - Row 3: Add to Playlist (centered)
- [ ] **Verify**: All controls remain usable
- [ ] **Verify**: Touch interactions work correctly

### 9.4 Video Player Controls Scaling
- [ ] **Test**: Resize browser to different widths
- [ ] **Verify**: Video player control buttons scale proportionally (em units)
- [ ] **Verify**: Buttons remain consistent size and spacing at all breakpoints
- [ ] **Verify**: Menu font size adjusts at mobile breakpoint (10px)

---

## 10. Theme System

### 10.1 Theme Selection
- [ ] **Test**: Open Settings → Theme
- [ ] **Verify**: All available themes listed (Plex, Stash, Nord, etc.)
- [ ] **Test**: Select different theme
- [ ] **Verify**: App re-renders with new theme colors
- [ ] **Verify**: Video player controls adopt theme colors (progress bar accent, etc.)
- [ ] **Test**: Refresh page
- [ ] **Verify**: Theme persists

### 10.2 Dark/Light Mode (if applicable)
- [ ] **Test**: Toggle dark/light mode (if theme supports it)
- [ ] **Verify**: Video player background and controls update accordingly
- [ ] **Verify**: Text remains readable in all modes

---

## 11. Performance & Stability

### 11.1 Memory Leaks
- [ ] **Test**: Play 10 scenes in sequence (via Next button)
- [ ] **Test**: Check browser Task Manager (Shift+Esc in Chrome)
- [ ] **Verify**: Memory usage remains stable (no continuous growth)
- [ ] **Verify**: No video player instances left in memory after navigation

### 11.2 Network Performance
- [ ] **Test**: Play Direct stream
- [ ] **Verify**: Network tab shows single stream request (no retries)
- [ ] **Test**: Play HLS transcoded stream
- [ ] **Verify**: Segments load progressively without excessive requests
- [ ] **Verify**: No failed segment requests (or if failed, retried successfully)

### 11.3 Seeking Performance
- [ ] **Test**: Rapidly seek back and forth multiple times
- [ ] **Verify**: Video player remains responsive
- [ ] **Verify**: No crashes or freezes
- [ ] **Verify**: TranscodingManager sessions reused when appropriate (check server logs)

### 11.4 Long Session Stability
- [ ] **Test**: Play multiple scenes over 30+ minutes
- [ ] **Verify**: Playback remains stable
- [ ] **Verify**: No degradation in performance
- [ ] **Verify**: Transcoding sessions cleaned up after inactivity (check server logs)

---

## 12. Edge Cases & Error Handling

### 12.1 Network Interruption
- [ ] **Test**: Start playing scene, disconnect network
- [ ] **Verify**: Video.js shows error message
- [ ] **Test**: Reconnect network
- [ ] **Verify**: Playback can resume (may require manual retry)

### 12.2 Invalid Scene ID
- [ ] **Test**: Navigate to `/player/:invalidSceneId`
- [ ] **Verify**: Error message shown (scene not found)
- [ ] **Verify**: No console errors or crashes

### 12.3 Missing Media File
- [ ] **Test**: Open scene with missing/moved file
- [ ] **Verify**: Error message shown (file not accessible)
- [ ] **Verify**: User can navigate away gracefully

### 12.4 Stash Server Offline
- [ ] **Test**: Stop Stash server
- [ ] **Test**: Try to play scene
- [ ] **Verify**: Error message shown (Stash unreachable)
- [ ] **Verify**: App remains functional (navigation, other features)

### 12.5 No sceneStreams Available (Legacy Fallback)
- [ ] **Test**: Use older Stash version without sceneStreams field
- [ ] **Verify**: Console shows: "No sceneStreams available, falling back to legacy Direct stream"
- [ ] **Verify**: Video still plays via `/api/scene/:id/stream`

---

## 13. Browser Compatibility

### 13.1 Chrome/Chromium
- [ ] **Test**: All core functionality in Chrome
- [ ] **Verify**: No console errors
- [ ] **Verify**: HLS playback works
- [ ] **Verify**: Keyboard shortcuts work

### 13.2 Firefox
- [ ] **Test**: All core functionality in Firefox
- [ ] **Verify**: Playback works correctly
- [ ] **Verify**: Known warnings (mozPressure, mozInputSource) are present but harmless
- [ ] **Verify**: All features functional despite warnings

### 13.3 Safari (if available)
- [ ] **Test**: All core functionality in Safari
- [ ] **Verify**: HLS playback works (Safari native HLS)
- [ ] **Verify**: Codec fallback works for unsupported formats
- [ ] **Verify**: All hotkeys work (Safari has some key restrictions)

---

## 14. Console Output Validation

### 14.1 Expected Console Messages
- [ ] **Verify**: `[VideoPlayer] Using X streams from Stash: [...]`
- [ ] **Verify**: `[VideoPlayer] Proxied sources: [...]`
- [ ] **Verify**: `[PROXY] Proxying stream: /api/scene/:id/proxy-stream/stream -> http://stash:9999/scene/:id/stream`

### 14.2 No Unexpected Errors
- [ ] **Test**: Play scene, switch qualities, seek, navigate
- [ ] **Verify**: No console errors (red messages)
- [ ] **Verify**: Firefox mozPressure/mozInputSource warnings are OK (harmless)
- [ ] **Verify**: No "Failed to fetch" or network errors

### 14.3 No Debug Logging Left Behind
- [ ] **Search codebase**: `console.log`, `console.debug`
- [ ] **Verify**: No debug logs committed to branch (except intentional logging in production)

---

## 15. Database Integrity

### 15.1 User Preferences Persistence
- [ ] **Test**: Change preferences (theme, default quality, preview quality)
- [ ] **Test**: Refresh page
- [ ] **Verify**: Preferences persist correctly
- [ ] **Verify**: Database `User` table updated

### 15.2 Watch History Persistence
- [ ] **Test**: Watch multiple scenes
- [ ] **Test**: Check `WatchHistory` table in database (Prisma Studio)
- [ ] **Verify**: Each scene has entry with correct `userId`, `sceneId`, `resumeTime`

### 15.3 Playlist Persistence
- [ ] **Test**: Create playlist, add scenes, set shuffle/repeat
- [ ] **Test**: Check `Playlist` and `PlaylistItem` tables
- [ ] **Verify**: Playlist data stored correctly
- [ ] **Verify**: Scene order preserved

### 15.4 Rating Persistence
- [ ] **Test**: Rate multiple scenes and toggle favorites
- [ ] **Test**: Check `SceneRating` table
- [ ] **Verify**: Ratings stored correctly with `userId` and `sceneId`

---

## 16. Path Mapping & Stash Integration

### 16.1 Path Mapping Functionality
- [ ] **Test**: Query `/api/library/scenes`
- [ ] **Verify**: Scene objects contain valid `path` values
- [ ] **Verify**: Paths translated from Stash internal paths to Peek paths
- [ ] **Test**: Play scene
- [ ] **Verify**: FFmpeg (for HLS) or direct stream can access file at translated path

### 16.2 Stash GraphQL Queries
- [ ] **Test**: Navigate through library
- [ ] **Verify**: Scenes, performers, studios, tags load correctly
- [ ] **Verify**: Filtering works (search by performer, studio, tag)
- [ ] **Test**: Check server logs
- [ ] **Verify**: No GraphQL errors

### 16.3 Stash Stream Proxying
- [ ] **Test**: Play scene, check Network tab
- [ ] **Verify**: Requests go to `/api/scene/:id/proxy-stream/*`
- [ ] **Verify**: Requests proxied to Stash (check server logs)
- [ ] **Verify**: Range requests handled correctly (for seeking)

---

## 17. Known Issues & Expected Behavior

### 17.1 Firefox Deprecation Warnings
- **Expected**: `MouseEvent.mozPressure is deprecated` and `MouseEvent.mozInputSource is deprecated`
- **Cause**: Video.js 7.21.3 uses deprecated Firefox APIs
- **Impact**: None - warnings only, no functional issues
- **Action**: Ignore warnings (will be fixed in future Video.js 8 upgrade)

### 17.2 Safari Codec Compatibility
- **Expected**: Some transcoded formats may not play in Safari
- **Behavior**: Video.js auto-fallback to next available source
- **Verify**: Fallback works correctly

### 17.3 HLS Seeking Delay
- **Expected**: Seeking in HLS transcoded streams may have slight delay (1-2 seconds)
- **Cause**: Stash FFmpeg segment generation
- **Verify**: Seeking eventually completes successfully

---

## Summary Checklist

**Critical Path** (must pass before merge):
- [ ] Video playback works (Direct and HLS)
- [ ] Duration displays correctly (not incrementing)
- [ ] Seeking works (both in-buffer and far seeks with ?start)
- [ ] Quality selection via gear icon works
- [ ] Previous/Next scene buttons work in playlists
- [ ] Shuffle and Repeat modes work correctly
- [ ] Volume persistence works
- [ ] Resume playback works
- [ ] Rating, favorite, O-Counter work
- [ ] Keyboard shortcuts all functional
- [ ] No quality dropdown in PlaybackControls (removed)
- [ ] Responsive layouts work at all breakpoints
- [ ] No console errors (except known Firefox warnings)
- [ ] No debug logging left in code

**Nice to Have** (test if time permits):
- [ ] All edge cases covered
- [ ] All three browsers tested
- [ ] Performance validated over long session
- [ ] Database integrity verified

---

## Reporting Issues

When reporting issues found during testing:

**Include**:
1. Browser version (Chrome 120, Firefox 121, Safari 17, etc.)
2. Screenshot showing the issue
3. Console output (errors/warnings) - copy full stack trace
4. Network tab (if streaming/loading issue) - show failed requests
5. Exact steps to reproduce
6. Expected vs actual behavior

**Example**:
```
Issue: Seeking in HLS stream causes video to freeze

Browser: Chrome 120.0.6099.129
Steps:
1. Open scene with ID 123
2. Switch to 720p quality via gear menu
3. Seek to 5:00 mark by dragging scrubber
4. Video freezes, does not resume playback

Expected: Video should seek to 5:00 and continue playing
Actual: Video frozen at old position, controls unresponsive

Console Error:
[Error] Failed to load segment: /api/scene/123/proxy-stream/hls/segment_306.ts?quality=720p
[Error] net::ERR_CONNECTION_REFUSED

Network Tab: Screenshot attached showing 503 errors on segment requests
```

---

**End of Regression Test Plan**
