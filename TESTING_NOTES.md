# Testing Notes - Stash Stream Proxying & Video Player Styling

## Overview

This document contains testing notes for the **Stash Stream Proxying** implementation and **Video Player CSS Refactoring** to match Stash's styling.

**Date**: 2025-11-24
**Features**:
- Stash stream proxying architecture (sceneStreams from Stash GraphQL)
- Video player CSS cleanup to match Stash exactly
- Fixed menu behavior, focus states, and button sizing

---

## Test Environment

- **Browser**: Chrome/Firefox (test both)
- **Stash Version**: Latest (with sceneStreams support)
- **stashapp-api Version**: 0.3.20 (includes sceneStreams field)

---

## 1. Stream Proxying Tests

### 1.1 Direct Stream Playback
**Goal**: Verify Direct stream plays without transcoding

- [ ] Click on any scene card to open video player
- [ ] Check browser console - should log: `[VideoPlayer] Using X streams from Stash`
- [ ] Verify video plays immediately without buffering
- [ ] Test seeking - scrub to different positions, should be instant
- [ ] Check Network tab - should see `/api/scene/:id/proxy-stream/stream` requests

**Expected Behavior**:
- Video plays Direct stream (original quality)
- Seeking is instant (no transcoding delay)
- Network requests go to Peek proxy, not directly to Stash

**Known Issues**:
- ⚠️ If `sceneStreams` is empty, falls back to legacy `/api/scene/:id/stream`

---

### 1.2 Quality Switching
**Goal**: Verify Stash's quality selector shows all available streams

- [ ] Open video player
- [ ] Click the **gear icon** (⚙) in control bar
- [ ] Verify menu shows all available streams from Stash:
  - Direct stream
  - HLS (if configured)
  - 1080p, 720p, 480p, 360p (or whatever Stash provides)
  - MP4/WEBM variants (if configured)
- [ ] Select a different quality (e.g., 720p)
- [ ] Verify playback position is preserved
- [ ] Verify paused state is preserved
- [ ] Check Network tab - should see new stream URL

**Expected Behavior**:
- Gear menu shows **only** streams that Stash provides (dynamic list)
- Switching qualities maintains playback position
- No errors in console

**Known Issues**:
- ⚠️ Menu should appear instantly on click (not hover)
- ⚠️ Menu should stick to gear button properly

---

### 1.3 HLS Transcoding
**Goal**: Verify HLS streams from Stash work correctly

- [ ] Open a scene
- [ ] Switch to HLS quality (720p/480p) via gear menu
- [ ] Verify video plays smoothly
- [ ] Test seeking in HLS stream - should work correctly
- [ ] Check Network tab - should see:
  - `/api/scene/:id/proxy-stream/stream.m3u8?resolution=...` (manifest)
  - `/api/scene/:id/proxy-stream/hls/:segment.ts?resolution=...` (segments)

**Expected Behavior**:
- HLS streams play smoothly
- Seeking works (may have slight delay for segment generation)
- Network requests proxied through Peek

**Known Issues**:
- ⚠️ Stash's HLS transcoding may take a moment to start

---

### 1.4 Error Handling & Auto-Fallback
**Goal**: Verify codec errors trigger fallback to next source

- [ ] Open a scene with multiple streams
- [ ] If Direct stream has codec issues (e.g., AV1), Video.js should auto-fallback to next source
- [ ] Check console - should see: `Source 'Direct' is unsupported` and `Trying next source in playlist`
- [ ] Verify errored source shows in gear menu with strikethrough or dimmed
- [ ] Verify playback continues with fallback source

**Expected Behavior**:
- Auto-fallback to next available source
- Errored sources marked in gear menu
- No manual intervention required

**Known Issues**:
- ⚠️ Safari has codec compatibility issues with some transcoded formats

---

## 2. Video Player CSS & Styling Tests

### 2.1 Control Bar Layout
**Goal**: Verify control bar matches Stash's appearance

- [ ] Button order (left to right):
  - Previous scene (◄)
  - Next scene (►)
  - Seek back 10s (⟲)
  - Play/Pause (▶)
  - Seek forward 10s (⟳)
  - Volume (🔊)
  - Time (0:00 / 5:32)
  - Gear icon (⚙)
  - Fullscreen (⛶)
- [ ] All buttons have **consistent size** (scaled by `font-size: 15px`)
- [ ] Buttons have **consistent spacing** (no gaps or overlap)
- [ ] Control bar has **gradient background** (dark at bottom, transparent at top)

**Expected Appearance**:
- Buttons sized proportionally using em units (not fixed pixels)
- Clean, uniform spacing
- Gradient visible behind controls

**Known Issues**:
- ⚠️ Mobile buttons use `width: 2.5em` (smaller than desktop)

---

### 2.2 Big Play Button
**Goal**: Verify big play button matches Stash

- [ ] Load a scene (paused state)
- [ ] Verify big play button (▶) in center of video
- [ ] Button should have:
  - No background (transparent)
  - No border
  - Large icon (`font-size: 10em`)
  - Centered position
- [ ] Click button - video should start playing
- [ ] Button should disappear when playing

**Expected Appearance**:
- Simple, large play icon
- No rectangular background or border
- Scales naturally on all screen sizes

**Known Issues**:
- None currently

---

### 2.3 Focus States
**Goal**: Verify focus behavior doesn't show ugly borders

- [ ] Click on play button - should **not** show large rectangular accent-colored border
- [ ] Tab through controls with keyboard - should show minimal focus indication
- [ ] Progress bar focus should show subtle accent ring on slider

**Expected Behavior**:
- No intrusive focus borders on buttons
- Progress bar slider shows accent box-shadow when focused
- Accessibility maintained without visual clutter

**Known Issues**:
- None currently

---

### 2.4 Popup Menus
**Goal**: Verify menus appear correctly and are clickable

- [ ] Click gear icon (⚙)
- [ ] Menu should appear **instantly** (no delay)
- [ ] Menu should appear **directly above** the gear button
- [ ] Menu should be **clickable** without mouse movement
- [ ] Select a quality - menu should close, quality should change
- [ ] Repeat with playback speed menu (if visible)

**Expected Behavior**:
- Menus appear instantly on click
- Positioned correctly (not offset or floating)
- z-index ensures menus appear above progress bar
- Mouse can move into menu without it disappearing

**Known Issues**:
- ⚠️ Previously: Menu required mouse movement to appear (FIXED)
- ⚠️ Previously: Progress bar blocked menu clicks (FIXED with z-index: 10)

---

### 2.5 Volume Control
**Goal**: Verify volume opens vertically (popup, not horizontal slider)

- [ ] Click volume button (🔊)
- [ ] Volume slider should appear **vertically above** the button (popup style)
- [ ] Should **not** appear horizontally to the right
- [ ] Drag slider - volume should change
- [ ] Click outside - menu should close

**Expected Behavior**:
- Vertical popup (like YouTube)
- Configured via JS: `volumePanel: { inline: false }`
- Matches Stash's volume control exactly

**Known Issues**:
- ⚠️ Hidden on touch devices (CSS media query)

---

### 2.6 Progress Bar
**Goal**: Verify progress bar styling and behavior

- [ ] Progress bar positioned **above** controls (absolute, bottom: 2.5em)
- [ ] Full width with 15px margins on sides (matches Stash)
- [ ] On hover:
  - Bar should enlarge slightly
  - Scrubber handle (circle) should appear at playhead
- [ ] Accent color on played portion (CSS var --accent-primary)
- [ ] Buffered portion shows as lighter gray

**Expected Appearance**:
- Thin bar (6px height) when not hovering
- Scrubber circle appears on hover
- VTT thumbnail preview shows when hovering (if available)

**Known Issues**:
- None currently

---

### 2.7 Mobile Responsiveness
**Goal**: Verify controls scale properly on small screens

- [ ] Resize browser to 576px width or less
- [ ] Verify button size: `width: 2.5em` (Stash mobile pattern)
- [ ] Verify icon size: `font-size: 1.5em`, `line-height: 2`
- [ ] Verify playback rate button hidden (if screen too small)
- [ ] Verify menu font size: `10px`

**Expected Behavior**:
- Controls scale proportionally using em units
- No overlap or layout breakage
- Playback speed hidden on very small screens

**Known Issues**:
- None currently

---

## 3. Console Warnings & Errors

### 3.1 Firefox Deprecation Warnings
**Expected**: `MouseEvent.mozPressure is deprecated` and `MouseEvent.mozInputSource is deprecated`

- **Cause**: Video.js 7.21.3 uses deprecated Firefox APIs
- **Impact**: None - warnings only, no functional issues
- **Fix**: Will resolve when upgrading to Video.js 8 (future work)
- **Action**: Ignore warnings for now

---

### 3.2 No Other Console Errors
**Goal**: Verify clean console output

- [ ] Open browser console (F12)
- [ ] Play a video
- [ ] Switch qualities
- [ ] Seek around
- [ ] Verify **no errors** in console (warnings OK)

**Expected Console Output**:
```
[VideoPlayer] Using 5 streams from Stash: [...]
[VideoPlayer] Proxied sources: [...]
[PROXY] Proxying stream: /api/scene/123/proxy-stream/stream -> http://stash:9999/scene/123/stream
```

**Known Issues**:
- ⚠️ Firefox: mozPressure/mozInputSource warnings (harmless)

---

## 4. Regression Tests

### 4.1 Captions/Subtitles
**Goal**: Ensure caption support still works

- [ ] Open scene with captions
- [ ] Click CC button in control bar
- [ ] Select a caption language
- [ ] Verify captions display correctly
- [ ] Verify captions sync with video

**Known Issues**:
- None expected

---

### 4.2 Playlist Navigation
**Goal**: Ensure previous/next scene buttons work

- [ ] Open scene from a playlist
- [ ] Click next scene button (►)
- [ ] Verify player loads next scene
- [ ] Click previous scene button (◄)
- [ ] Verify player loads previous scene

**Known Issues**:
- None expected

---

### 4.3 Resume Playback
**Goal**: Ensure resume time works

- [ ] Watch a video partway through (e.g., 1 minute)
- [ ] Navigate away from player
- [ ] Return to same scene
- [ ] Verify video resumes from last position

**Known Issues**:
- None expected

---

### 4.4 Keyboard Shortcuts
**Goal**: Ensure keyboard navigation works

- [ ] Space - Play/pause
- [ ] Arrow keys - Seek forward/back
- [ ] M - Mute/unmute
- [ ] F - Fullscreen
- [ ] 0-9 - Jump to percentage

**Known Issues**:
- None expected

---

## 5. Performance Tests

### 5.1 Stream Startup Time
**Goal**: Verify streams start quickly

- [ ] Click on scene card
- [ ] Measure time to first frame
- [ ] Should be < 2 seconds for Direct stream
- [ ] HLS may take longer (Stash transcoding)

**Expected Performance**:
- Direct stream: < 2s startup
- HLS 720p/480p: < 5s startup (depends on Stash)

---

### 5.2 Seeking Performance
**Goal**: Verify seeking is responsive

- [ ] Scrub progress bar rapidly
- [ ] Direct stream: Should seek instantly
- [ ] HLS stream: May have slight delay (segment boundaries)

**Expected Performance**:
- Direct: < 100ms seek response
- HLS: < 1s seek response

---

## 6. Edge Cases

### 6.1 No sceneStreams Available
**Goal**: Verify fallback to legacy system

- [ ] If Stash doesn't provide sceneStreams (old Stash version or missing field)
- [ ] Check console: `[VideoPlayer] No sceneStreams available, falling back to legacy Direct stream`
- [ ] Verify video still plays via `/api/scene/:id/stream`

**Expected Behavior**:
- Graceful fallback to legacy Direct stream
- Warning in console
- Video still plays

---

### 6.2 Network Errors
**Goal**: Verify error handling for network issues

- [ ] Disconnect from Stash (stop Stash server)
- [ ] Try to play a video
- [ ] Verify error message shown to user
- [ ] Verify console shows meaningful error

**Expected Behavior**:
- User-friendly error message
- Console logs error details

---

## 7. Known Limitations

1. **Video.js 7 Deprecation Warnings** (Firefox only)
   - `MouseEvent.mozPressure` and `mozInputSource` warnings
   - Harmless - will fix in future Video.js 8 upgrade

2. **Stash Stream Format Dependency**
   - Peek now depends on Stash's sceneStreams format
   - If Stash changes stream URLs, Peek proxy logic may need updates

3. **Safari Codec Compatibility**
   - Safari may not support all Stash transcode formats
   - Auto-fallback should handle this

---

## 8. Summary of Fixes Applied

### CSS Cleanup
- ✅ Removed ~150 lines of custom control sizing
- ✅ Changed to em-based units (matches Stash)
- ✅ Fixed big play button (no background/border)
- ✅ Fixed focus borders (removed intrusive outlines)
- ✅ Fixed menu positioning (z-index: 10)
- ✅ Fixed menu appearance delay (removed transition)
- ✅ Simplified click-only menu CSS (matches Stash pattern)

### Stream Proxying
- ✅ Added `sceneStreams` to stashapp-api GraphQL query
- ✅ Implemented `/api/scene/:id/proxy-stream/*` endpoint
- ✅ Frontend rewrites Stash URLs to Peek proxy
- ✅ Graceful fallback if sceneStreams unavailable
- ✅ Auto-fallback on codec errors

---

## Next Steps

1. **Test thoroughly** using checklist above
2. **Report any visual issues** with screenshots
3. **Verify all stream types** work (Direct, HLS, MP4, etc.)
4. **Check mobile/tablet** layouts
5. **Test with different Stash configurations** (various transcode settings)

---

## Reporting Issues

When reporting issues, please include:
- **Browser version** (Chrome 120, Firefox 121, etc.)
- **Screenshot** showing the issue
- **Console output** (errors/warnings)
- **Network tab** (if stream loading issues)
- **Steps to reproduce**
