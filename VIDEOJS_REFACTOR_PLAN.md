# Video.js Refactor Plan: Mirror Stash Implementation

**Branch**: `feature/hide-captions-when-unavailable`
**Goal**: Make Peek's Video.js player look and behave EXACTLY like Stash's player

---

## Background

Peek started with custom Video.js implementations that have drifted from Stash. This refactor brings Peek back in line with Stash's battle-tested Video.js setup. Peek is essentially a new frontend for Stash with multi-user support and better playlists - the video player should be identical.

---

## Phase 1: Downgrade Video.js ✅ COMPLETED

**Reason**: Stash uses Video.js 7.21.3, Peek was on 8.23.4. Video.js 8 has breaking changes with plugin ecosystem.

**Changes**:
- Downgraded `video.js` from `8.23.4` to `7.21.3`
- Installed `videojs-seek-buttons@^3.0.1` (works with v7)
- Installed dependencies: `localforage`, `videojs-vr`, `crypto-js`

**Commit**: e1b6a4b

---

## Phase 2: Port Stash Plugins ✅ COMPLETED

Created `client/src/components/video-player/plugins/` and ported all 7 custom Stash plugins verbatim from TypeScript to JavaScript:

### Plugins Ported:

1. **source-selector.js** (270 lines)
   - Gear icon menu for Direct/Transcode quality selection
   - Auto-fallback to next source on codec errors
   - Manages text tracks (subtitles/captions)
   - Inserted before fullscreen toggle

2. **big-buttons.js** (70 lines)
   - Center overlay with 3 buttons: seek back 10s, play/pause, seek forward 10s
   - Uses `videojs-seek-buttons` package for seek functionality

3. **markers.js** (474 lines)
   - Scene markers on timeline (dot markers and range markers)
   - Complex color algorithm using SHA256 hash + HSV color spacing
   - Dynamic programming algorithm for layering overlapping markers
   - Tooltip system for marker titles

4. **persist-volume.js** (60 lines)
   - Saves volume level and mute state to localStorage via localForage
   - Restores on player initialization
   - Replaces Peek's manual localStorage logic

5. **skip-buttons.js** (109 lines)
   - Playlist prev/next navigation buttons in control bar
   - Dynamically shows/hides based on handler availability
   - Replaces Peek's custom `setupPlaylistControls()` function

6. **track-activity.js** (138 lines)
   - Watch history tracking (play duration, resume time, play count)
   - Sends activity every 10 seconds
   - Configurable callbacks for `incrementPlayCount` and `saveActivity`
   - Will replace logic in Peek's `useWatchHistory` hook

7. **vrmode.js** (187 lines)
   - VR projection mode selector (180 LR, 360 TB, 360 Mono, Off)
   - Uses `videojs-vr` package
   - Gear icon menu for VR mode selection

### Plugin Registration:

Updated `useVideoPlayer.js`:
- Imported all plugins
- Imported `videojs-seek-buttons` and its CSS
- Registered plugins in Video.js options:
  ```javascript
  plugins: {
    airPlay: {},
    chromecast: {},
    vttThumbnails: { ... },
    markers: {},
    sourceSelector: {},
    persistVolume: {},
    bigButtons: {},
    seekButtons: { forward: 10, back: 10 },
    skipButtons: {},
    trackActivity: {},
    vrMenu: {},
  }
  ```

### Config Updates:

**controlBar**:
```javascript
controlBar: {
  pictureInPictureToggle: false,
  volumePanel: {
    inline: false, // POPUP MENU like Stash/YouTube
  },
  chaptersButton: false,
}
```

**Other**:
- `playbackRates: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]`
- `inactivityTimeout: 2000`

**Removed**:
- Manual volume persistence code (lines 166-180 in useVideoPlayer.js)

**Commit**: e1b6a4b

---

## Phase 3: Refactor Source Management 🔄 IN PROGRESS

**Goal**: Replace manual `player.src()` calls with `sourceSelector` plugin.

### Current Implementation (Peek):

```javascript
const sources = isDirectPlay
  ? [{ src: `/api/scene/${scene.id}/stream`, type: `video/${format}` }]
  : [{ src: `/api/scene/${scene.id}/stream.m3u8?quality=${quality}`, type: "application/x-mpegURL" }];

player.src(sources);
player.load();
```

### Target Implementation (Stash pattern):

```javascript
const sourceSelector = player.sourceSelector();

// Build sources array with labels
const sources = [];

// Always include Direct source first
sources.push({
  src: `/api/scene/${scene.id}/stream`,
  label: "Direct",
  type: `video/${firstFile?.format}`,
});

// Add transcode qualities if not direct play
if (!isDirectPlay) {
  // Add selected quality
  sources.push({
    src: `/api/scene/${scene.id}/stream.m3u8?quality=${quality}`,
    label: quality, // "720p", "480p", etc.
    type: "application/x-mpegURL",
  });
}

// Set sources (plugin handles source switching)
sourceSelector.setSources(sources);
```

### Benefits:
- Auto-fallback between sources on codec errors
- Preserves playback position during quality switches
- Handles text track cleanup automatically
- Provides UI for source selection (gear icon menu)

### Files to Update:
- `client/src/components/video-player/useVideoPlayer.js` (lines 350-461)
  - Replace manual source setting logic
  - Use `sourceSelector.setSources()` instead of `player.src()`

---

## Phase 4: Update Subtitle Handling 📝 TODO

**Goal**: Use `sourceSelector.addTextTrack()` instead of direct `player.addRemoteTextTrack()`.

### Current Implementation (Peek):

In `videoPlayerUtils.js`:
```javascript
export const setupSubtitles = (player, sceneId, captions) => {
  // Remove existing tracks
  const existingTracks = player.remoteTextTracks();
  for (let i = existingTracks.length - 1; i >= 0; i--) {
    player.removeRemoteTextTrack(existingTracks[i]);
  }

  // Add new tracks
  captions.forEach((caption) => {
    player.addRemoteTextTrack({
      kind: "captions",
      src: `/api/scene/${sceneId}/caption?lang=${lang}&type=${type}`,
      srclang: lang,
      label: label,
      default: setAsDefault,
    }, false);
  });
};
```

### Target Implementation (Stash pattern):

```javascript
const sourceSelector = player.sourceSelector();

captions.forEach((caption) => {
  const lang = caption.language_code;
  let label = languageMap.get(lang) || lang;
  label = `${label} (${caption.caption_type})`;

  const setAsDefault = !hasDefault && defaultLanguageCode === lang;
  if (setAsDefault) hasDefault = true;

  sourceSelector.addTextTrack({
    kind: "captions",
    src: `/api/scene/${sceneId}/caption?lang=${lang}&type=${caption.caption_type}`,
    srclang: lang,
    label: label,
    default: setAsDefault,
  }, false); // false = auto-cleanup on source change
});
```

### Benefits:
- Source selector automatically cleans up text tracks when source changes
- Consistent with Stash implementation
- **Should fix caption button visibility issue** (Video.js auto-detects tracks)

### Files to Update:
- `client/src/components/video-player/videoPlayerUtils.js`
  - Update `setupSubtitles()` to use sourceSelector
- `client/src/components/video-player/useVideoPlayer.js`
  - Pass `player.sourceSelector()` to setupSubtitles instead of player

---

## Phase 5: Refactor Playlist Navigation 📝 TODO

**Goal**: Replace custom `setupPlaylistControls()` with `skipButtons` plugin.

### Current Implementation (Peek):

In `videoPlayerUtils.js`:
```javascript
export const setupPlaylistControls = (player, playlist, currentIndex, onPrevious, onNext) => {
  // Manually creates prev/next buttons
  // Inserts into controlBar DOM
  // Manages enabled/disabled state
  // ~80 lines of manual button creation
};
```

Called from `useVideoPlayer.js`:
```javascript
useEffect(() => {
  setupPlaylistControls(player, playlist, currentIndex, playPreviousInPlaylist, playNextInPlaylist);
}, [currentIndex, video, playlist]);
```

### Target Implementation (Stash pattern):

```javascript
// After player ready, configure skipButtons plugin
const skipButtonsPlugin = player.skipButtons();

// Set handlers dynamically based on playlist availability
if (playlist && playlist.scenes && playlist.scenes.length > 1) {
  skipButtonsPlugin.setForwardHandler(playNextInPlaylist);
  skipButtonsPlugin.setBackwardHandler(playPreviousInPlaylist);
} else {
  // Clear handlers if no playlist
  skipButtonsPlugin.setForwardHandler(undefined);
  skipButtonsPlugin.setBackwardHandler(undefined);
}
```

### Benefits:
- Plugin automatically creates buttons on player.ready()
- Automatically shows/hides buttons based on handler presence
- Adds CSS classes for styling: `vjs-skip-buttons`, `vjs-skip-buttons-next`, `vjs-skip-buttons-prev`
- Less code, matches Stash

### Files to Update:
- `client/src/components/video-player/useVideoPlayer.js`
  - Remove `setupPlaylistControls()` calls
  - Add skipButtons configuration effect
- `client/src/components/video-player/videoPlayerUtils.js`
  - Delete `setupPlaylistControls()` function entirely

---

## Phase 6: Refactor Watch History Tracking 📝 TODO

**Goal**: Integrate `trackActivity` plugin with existing `useWatchHistory` hook.

### Current Implementation (Peek):

Custom React hook `useWatchHistory`:
- Tracks playback manually via player event listeners
- Sends updates to `/api/watch-history/update` endpoint
- Manages state for resumeTime, playDuration, etc.

### Target Implementation (Stash pattern):

Keep the React hook for state management, but delegate tracking to plugin:

```javascript
// In useWatchHistory hook or useVideoPlayer:
useEffect(() => {
  const player = playerRef.current;
  if (!player || !scene?.id) return;

  const trackActivityPlugin = player.trackActivity();

  // Enable tracking
  trackActivityPlugin.setEnabled(true);
  trackActivityPlugin.minimumPlayPercent = 10; // Play count threshold

  // Set callbacks to Peek's API
  trackActivityPlugin.incrementPlayCount = async () => {
    try {
      await api.post(`/watch-history/${scene.id}/increment-play-count`);
    } catch (error) {
      console.error("Failed to increment play count:", error);
    }
  };

  trackActivityPlugin.saveActivity = async (resumeTime, playDuration) => {
    try {
      await api.post(`/watch-history/${scene.id}/update`, {
        resumeTime,
        playDuration,
      });
    } catch (error) {
      console.error("Failed to save activity:", error);
    }
  };

  return () => {
    trackActivityPlugin.setEnabled(false);
    trackActivityPlugin.reset();
  };
}, [scene?.id, playerRef]);
```

### Benefits:
- Leverages Stash's battle-tested tracking logic
- Automatic interval management (every 10s)
- Auto-stops on pause/waiting/stalled
- Handles resume time reset at 98% completion
- Matches Stash behavior exactly

### Files to Update:
- `client/src/hooks/useWatchHistory.js`
  - Simplify to just state management + API calls
  - Remove manual event listener logic
  - Use trackActivity plugin for actual tracking
- `client/src/components/video-player/useVideoPlayer.js`
  - Configure trackActivity plugin with callbacks

---

## Phase 7: Port Stash CSS 📝 TODO

**Goal**: Update `VideoPlayer.css` to match Stash's `styles.scss`.

### Key CSS Changes:

#### 1. Progress Bar Absolute Positioning

**Current (Peek)**:
```css
.vjs-progress-control {
  position: relative !important;
  flex: 1 !important;
  order: 7 !important; /* Positioned via flex order */
}
```

**Target (Stash)**:
```css
.vjs-progress-control {
  bottom: 2.5em !important;
  height: 3em !important;
  position: absolute !important;
  width: 100% !important;
}

.vjs-progress-holder {
  margin: 0 15px !important; /* Horizontal margins */
}
```

**Result**: Progress bar floats above control bar (YouTube style) instead of inline.

#### 2. Volume Panel (Already configured via JS)

Volume panel popup behavior is configured via `volumePanel: { inline: false }` in Video.js options. CSS just needs to ensure popup positioning works correctly (likely already fine).

#### 3. Plugin-Specific Styles

Add CSS for new plugins:

**Big Buttons**:
```css
.vjs-big-button-group {
  /* Center overlay with 3 buttons */
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  gap: 20px;
  z-index: 10;
}

.vjs-big-play-pause-button {
  /* Styling for center play/pause */
}
```

**Markers**:
```css
.vjs-marker {
  /* Dot markers on timeline */
  position: absolute;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  cursor: pointer;
}

.vjs-marker-range {
  /* Range markers (time spans) */
  position: absolute;
  height: 9px;
  cursor: pointer;
}

.vjs-marker-tooltip {
  /* Tooltip for marker hover */
  position: absolute;
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
}
```

**Source Selector (Gear Icon)**:
```css
.vjs-source-selector {
  /* Gear icon button */
  order: 8; /* Before playback rate */
}

.vjs-source-selector .vjs-menu {
  /* Dropdown menu styling */
  bottom: 48px;
  background: rgba(28, 28, 28, 0.95);
  border-radius: 8px;
}

.vjs-source-menu-item-error {
  /* Errored sources shown in red */
  color: #ff4444;
  text-decoration: line-through;
}
```

**Skip Buttons**:
```css
.vjs-skip-button {
  /* Playlist prev/next buttons */
  width: 48px;
  height: 48px;
}

.vjs-skip-buttons-prev .vjs-skip-button[direction="back"] {
  order: 0; /* First button */
}

.vjs-skip-buttons-next .vjs-skip-button[direction="forward"] {
  order: 2; /* After play button */
}
```

**Seek Buttons (from videojs-seek-buttons package)**:
```css
@import "videojs-seek-buttons/dist/videojs-seek-buttons.css";

/* Additional customization if needed */
.vjs-seek-button {
  /* Timeline skip buttons (±10s) */
}
```

#### 4. Import Stash SCSS as Reference

Copy relevant sections from:
`C:\Users\charl\code\stash\ui\v2.5\src\components\ScenePlayer\styles.scss`

Convert SCSS to plain CSS and merge into `VideoPlayer.css`.

### Files to Update:
- `client/src/components/video-player/VideoPlayer.css`
  - Update progress bar positioning
  - Add plugin-specific styles
  - Import seek-buttons CSS

---

## Phase 8: Remove Dead Code 📝 TODO

**Goal**: Clean up custom implementations replaced by plugins.

### Files to Delete/Modify:

**videoPlayerUtils.js**:
- ✅ REMOVE: `setupPlaylistControls()` function (replaced by skipButtons plugin)
- ✅ REMOVE: `setupTranscodedSeeking()` function (no longer used, stateless now)
- ✅ KEEP: `setupSubtitles()` (will be updated to use sourceSelector)
- ✅ KEEP: `togglePlaybackRateControl()` (still needed for auto-fallback logic)

**useVideoPlayer.js**:
- ✅ REMOVE: Manual volume persistence logic (lines 166-180) - ALREADY DONE
- ✅ REMOVE: `setupPlaylistControls()` calls (replaced by skipButtons)
- ✅ UPDATE: Source management logic (use sourceSelector)
- ✅ UPDATE: Subtitle setup calls (use sourceSelector.addTextTrack)

**useWatchHistory.js**:
- ✅ SIMPLIFY: Remove manual event listeners
- ✅ KEEP: API calls and state management
- ✅ UPDATE: Integrate with trackActivity plugin

**Imports to Clean**:
- Remove unused imports after refactoring

---

## Phase 9: Testing Checklist 📝 TODO

### Functionality Tests:

- [ ] **Direct Play**:
  - [ ] Direct video file plays without transcoding
  - [ ] Playback controls work (play/pause/seek)
  - [ ] Volume persists across page reloads

- [ ] **Quality Switching**:
  - [ ] Gear icon appears in control bar
  - [ ] Can switch between Direct and transcode qualities
  - [ ] Playback position preserved during quality switch
  - [ ] Paused state preserved during quality switch

- [ ] **Auto-Fallback**:
  - [ ] Codec errors trigger automatic fallback to best transcode quality
  - [ ] Playback continues seamlessly after fallback
  - [ ] Gear menu shows errored sources with strikethrough

- [ ] **Playback Rate**:
  - [ ] Playback rate menu shows all speeds (0.25x - 2x)
  - [ ] Only available for direct play (hidden during transcode)

- [ ] **Volume Control**:
  - [ ] Volume slider appears on hover (popup menu)
  - [ ] Volume changes persist across scenes
  - [ ] Mute state persists across scenes

- [ ] **Progress Bar**:
  - [ ] Progress bar positioned above control bar
  - [ ] Scrubbing works correctly
  - [ ] VTT thumbnails appear on hover

- [ ] **Seek Buttons**:
  - [ ] ±10s seek buttons work (videojs-seek-buttons)
  - [ ] Timeline skip functionality

- [ ] **Big Buttons**:
  - [ ] Center overlay appears with 3 buttons
  - [ ] Seek back 10s works
  - [ ] Play/pause works
  - [ ] Seek forward 10s works

- [ ] **Playlist Navigation**:
  - [ ] Prev/next buttons appear when in playlist
  - [ ] Buttons disabled at playlist boundaries
  - [ ] Navigation preserves autoplay state

- [ ] **Subtitles/Captions**:
  - [ ] ✅ **Caption button ONLY shows when captions available** (PRIMARY GOAL)
  - [ ] Caption button hidden when no captions
  - [ ] Default language selected automatically
  - [ ] All available languages listed in menu

- [ ] **Watch History**:
  - [ ] Play duration tracked correctly
  - [ ] Resume time saved every 10 seconds
  - [ ] Play count incremented at 10% threshold
  - [ ] Resume time reset at 98% completion

- [ ] **Timeline Markers** (when Stash markers available):
  - [ ] Markers appear on timeline
  - [ ] Marker colors based on tags
  - [ ] Tooltips show on hover
  - [ ] Clicking marker seeks to position

- [ ] **Auto-Play Next**:
  - [ ] Next video plays when current ends (if enabled)
  - [ ] Respects playlist settings (shuffle/repeat)
  - [ ] Works with Repeat One mode

- [ ] **Resume Playback**:
  - [ ] Clicking "Resume" from scene card seeks to saved position
  - [ ] Auto-plays after seeking to resume point

- [ ] **Keyboard Shortcuts**:
  - [ ] Space: play/pause
  - [ ] Left/Right: seek ±10s
  - [ ] Up/Down: volume up/down
  - [ ] F: fullscreen
  - [ ] M: mute/unmute
  - [ ] 0-9: seek to percentage
  - [ ] Media keys: track next/prev (playlist)

### Visual Tests:

- [ ] **Control Bar Layout**:
  - [ ] Buttons in correct order (skip prev, play, skip next, volume, time, progress, quality, captions, playback rate, fullscreen)
  - [ ] Progress bar above button bar (floating)
  - [ ] Volume popup appears on hover
  - [ ] All icons visible and properly sized

- [ ] **Mobile Responsiveness**:
  - [ ] Control bar scales down on mobile
  - [ ] Touch targets are adequate
  - [ ] Volume controls hidden on touch devices
  - [ ] VTT thumbnails work on mobile

- [ ] **Themes**:
  - [ ] Player works in all themes (light/dark/amoled)
  - [ ] Control bar gradient matches theme
  - [ ] Hover states visible

### Regression Tests:

- [ ] Cast support still works (AirPlay/Chromecast)
- [ ] Auto-fullscreen on orientation change (mobile)
- [ ] Playlist media keys (track next/prev)
- [ ] Loading states and error handling
- [ ] No console errors in browser DevTools

---

## Phase 10: Documentation Updates 📝 TODO

Update these files to reflect new architecture:

### CLAUDE.md

Update Video Player section:
- Remove references to custom implementations
- Document plugin architecture
- Update file structure to show plugins folder
- Add note about Video.js 7 version requirement

### README.md (if video player section exists)

Update any user-facing video player documentation.

### Code Comments

Ensure inline comments in `useVideoPlayer.js` accurately describe plugin-based architecture.

---

## Key Differences: Stash vs Peek (After Refactor)

### What Stays Different (Peek-specific):

1. **Auto-Fallback Logic**:
   - Peek has automatic fallback to best transcode quality on codec errors
   - Stash doesn't have this (single-user, admin controls quality)
   - Implementation: Keep existing auto-fallback effect in useVideoPlayer

2. **Resume Playback**:
   - Peek has per-user resume times
   - Implementation: Keep existing resume logic

3. **Multi-User Watch History**:
   - Peek tracks per-user watch history
   - Stash has single-user tracking
   - Implementation: trackActivity plugin callbacks hit Peek's multi-user API

4. **Quality Selection UI**:
   - Peek may show different quality options based on source resolution
   - Stash shows all configured qualities
   - Implementation: sourceSelector plugin is flexible enough for both

### What Becomes Identical:

1. **Control Bar Layout**: Exact match
2. **Plugin Architecture**: Identical
3. **Progress Bar Positioning**: Floating above controls
4. **Volume Control**: Popup on hover
5. **Keyboard Shortcuts**: Identical
6. **CSS Styling**: Matches Stash's YouTube-inspired design
7. **Timeline Markers**: Ready for when we add Stash marker support
8. **VR Support**: Identical (though rarely used)
9. **Seek Buttons**: ±10s timeline skip
10. **Big Center Buttons**: Seek back/play/seek forward overlay

---

## Dependencies Added

```json
{
  "dependencies": {
    "crypto-js": "latest",
    "localforage": "latest",
    "video.js": "^7.21.3",
    "videojs-seek-buttons": "^3.0.1",
    "videojs-vr": "latest"
  }
}
```

---

## File Structure After Refactor

```
client/src/components/video-player/
├── VideoPlayer.jsx                    # Main component (minimal changes)
├── VideoPlayer.css                    # Updated with Stash CSS
├── useVideoPlayer.js                  # Refactored to use plugins
├── useOrientationFullscreen.js        # Keep (Peek-specific)
├── videoPlayerUtils.js                # Simplified (setupSubtitles only)
├── vtt-thumbnails.js                  # Keep (custom implementation)
├── plugins/                           # NEW FOLDER ✅
│   ├── source-selector.js             # ✅ Ported
│   ├── big-buttons.js                 # ✅ Ported
│   ├── markers.js                     # ✅ Ported
│   ├── persist-volume.js              # ✅ Ported
│   ├── skip-buttons.js                # ✅ Ported
│   ├── track-activity.js              # ✅ Ported
│   └── vrmode.js                      # ✅ Ported
```

---

## Progress Tracker

- [x] Phase 1: Downgrade Video.js
- [x] Phase 2: Port Stash Plugins
- [ ] Phase 3: Refactor Source Management
- [ ] Phase 4: Update Subtitle Handling
- [ ] Phase 5: Refactor Playlist Navigation
- [ ] Phase 6: Refactor Watch History Tracking
- [ ] Phase 7: Port Stash CSS
- [ ] Phase 8: Remove Dead Code
- [ ] Phase 9: Testing
- [ ] Phase 10: Documentation

---

## Commit Strategy

Create logical commits at phase boundaries:
1. ✅ Downgrade + plugin ports (e1b6a4b)
2. Source management refactor
3. Subtitle handling update
4. Playlist navigation refactor
5. Watch history integration
6. CSS updates
7. Dead code removal
8. Final cleanup and docs

---

## Notes

- All plugins copied verbatim from Stash (TypeScript → JavaScript conversion only)
- No custom logic added to plugins - pure ports
- Peek-specific behavior handled in useVideoPlayer.js, not in plugins
- This refactor eliminates drift between Peek and Stash
- Future Stash plugin updates can be easily synced
