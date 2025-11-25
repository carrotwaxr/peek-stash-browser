# Video.js Refactor Plan: Mirror Stash Implementation

**Branch**: `feature/hide-captions-when-unavailable`
**Goal**: Make Peek's Video.js player look and behave EXACTLY like Stash's player
**Status**: ✅ ALL PHASES COMPLETE - Ready for user testing

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

## Phase 6: Refactor Watch History Tracking ✅ COMPLETED

**Goal**: Integrate `trackActivity` plugin with existing `useWatchHistory` hook.

**Commit**: 67bee09

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

## Phase 7: Port Stash CSS ✅ COMPLETED

**Goal**: Update `VideoPlayer.css` to match Stash's `styles.scss`.

**Commit**: 67bee09

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

## Phase 8: Remove Dead Code ✅ COMPLETED

**Goal**: Clean up custom implementations replaced by plugins.

**Commit**: 67bee09

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

## Phase 9: Testing 🧪 IN PROGRESS

**Status**: Docker environment running, ready for user testing

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

## Phase 10: Implement Stash Stream Proxying 🎯 IN PROGRESS

**Goal**: Replace Peek's entire transcoding system with simple proxy architecture that forwards all stream requests to Stash. Let Stash handle ALL codec detection, transcoding, and quality selection.

**Status**: Research complete, implementation in progress

### Background & Motivation

**Current Architecture (Peek)**:
- Peek manages its own FFmpeg-based transcoding system (TranscodingManager.ts, 800+ lines)
- Manually constructs stream URLs for Direct/HLS qualities
- Requires path mapping to access video files on disk
- Duplicates Stash's battle-tested transcoding logic

**Target Architecture (Stash Proxying)**:
- Peek queries Stash's GraphQL `sceneStreams` field for all available stream endpoints
- Proxies all stream requests to Stash's URLs (rewrites URLs to go through Peek)
- Stash handles all transcoding, codec detection, quality selection, and format conversion
- Peek never needs to know where video files are stored
- Removes 800+ lines of complex transcoding code

**Benefits**:
- ✅ Simpler architecture (proxy vs manage transcoding)
- ✅ More reliable (leverage Stash's battle-tested transcoding)
- ✅ No FFmpeg dependency in Peek container
- ✅ No path mapping needed for video files
- ✅ Automatic support for all Stash's stream formats (Direct, HLS, MP4, WEBM, DASH, MKV)
- ✅ Automatic support for all Stash's resolution levels (240p, 480p, 720p, 1080p, 2160p, ORIGINAL)
- ✅ Easier deployment (smaller container, fewer dependencies)
- ✅ Future Stash updates automatically propagate to Peek

### Stash's Stream Generation System

**GraphQL Type** (from Stash schema):
```graphql
type SceneStreamEndpoint {
  url: String!
  mime_type: String
  label: String
}

type Scene {
  # ... other fields
  sceneStreams: [SceneStreamEndpoint!]!
}
```

**How Stash Generates Streams** (from `internal/manager/scene.go:78-220`):

Stash's `GetSceneStreamPaths()` function generates all available stream endpoints based on:
1. **Direct stream**: Always available if video file exists
2. **Transcoded streams**: Generated for each configured format and resolution
3. **Resolution levels**: ORIGINAL, FOUR_K (2160p), FULL_HD (1080p), STANDARD_HD (720p), STANDARD (480p), LOW (240p)
4. **Stream types**: HLS (.m3u8), MP4, WEBM, DASH (.mpd), MKV

**Example sceneStreams array** (from Stash):
```json
[
  {
    "url": "http://stash:9999/scene/123/stream",
    "mime_type": "video/mp4",
    "label": "Direct stream"
  },
  {
    "url": "http://stash:9999/scene/123/stream.m3u8",
    "mime_type": "application/vnd.apple.mpegurl",
    "label": "HLS"
  },
  {
    "url": "http://stash:9999/scene/123/stream.m3u8?resolution=STANDARD_HD",
    "mime_type": "application/vnd.apple.mpegurl",
    "label": "720p"
  },
  {
    "url": "http://stash:9999/scene/123/stream.m3u8?resolution=STANDARD",
    "mime_type": "application/vnd.apple.mpegurl",
    "label": "480p"
  },
  {
    "url": "http://stash:9999/scene/123/stream.mp4?resolution=STANDARD",
    "mime_type": "video/mp4",
    "label": "480p MP4"
  }
]
```

**Stash's React Implementation** (from `ui/v2.5/src/components/ScenePlayer/ScenePlayer.tsx:609-628`):

```typescript
// Stash directly uses sceneStreams in Video.js
sourceSelector.setSources(
  scene.sceneStreams
    .filter((stream) => {
      const src = new URL(stream.url);
      const isFileTranscode = !isDirect(src);
      // Skip file transcodes on Safari (codec issues)
      return !(isFileTranscode && isSafari);
    })
    .map((stream) => {
      const src = new URL(stream.url);
      return {
        src: stream.url,
        type: stream.mime_type ?? undefined,
        label: stream.label ?? undefined,
        offset: !isDirect(src), // Apply time offset for transcoded streams
        duration,
      };
    })
);
```

### Implementation Plan

#### Step 1: Add sceneStreams to stashapp-api ✅ COMPLETE

**File**: `c:\Users\charl\code\stashapp-api\src\operations\findScenes.graphql`

**Changes**: Added `sceneStreams` field to GraphQL query (lines 121-125):
```graphql
sceneStreams {
  url
  mime_type
  label
}
```

**Next**: Rebuild and publish stashapp-api, then update Peek's dependency.

#### Step 2: Create Proxy Endpoint in Peek Backend

**File**: `peek-stash-browser/server/controllers/video.ts` (or new `server/controllers/stash-proxy.ts`)

**New endpoint**: `GET /api/scene/:sceneId/proxy-stream/*`

**Implementation**:
```typescript
import { Router } from 'express';
import axios from 'axios';
import { getStash } from '../services/stashApp.js';

const router = Router();

/**
 * Proxy all stream requests to Stash
 * Rewrites URLs from Stash's internal URLs to Peek's proxy URLs
 *
 * Examples:
 * - /api/scene/123/proxy-stream/stream -> forwards to Stash /scene/123/stream
 * - /api/scene/123/proxy-stream/stream.m3u8?resolution=STANDARD_HD -> forwards to Stash /scene/123/stream.m3u8?resolution=STANDARD_HD
 * - /api/scene/123/proxy-stream/stream.mp4?resolution=STANDARD -> forwards to Stash /scene/123/stream.mp4?resolution=STANDARD
 */
router.get('/scene/:sceneId/proxy-stream/*', async (req, res) => {
  try {
    const { sceneId } = req.params;
    const streamPath = req.params[0]; // Everything after proxy-stream/ (e.g., "stream.m3u8")
    const queryString = req.url.split('?')[1] || '';

    // Build Stash URL
    const stash = getStash();
    const stashBaseUrl = process.env.STASH_URL.replace('/graphql', ''); // http://stash:9999
    const stashUrl = `${stashBaseUrl}/scene/${sceneId}/${streamPath}${queryString ? '?' + queryString : ''}`;

    console.log(`[Stream Proxy] Proxying: ${req.url} -> ${stashUrl}`);

    // Forward request to Stash
    const response = await axios.get(stashUrl, {
      headers: {
        'ApiKey': process.env.STASH_API_KEY,
      },
      responseType: 'stream', // Stream response directly to client
      validateStatus: () => true, // Don't throw on non-200 status
    });

    // Forward headers from Stash
    res.status(response.status);
    Object.keys(response.headers).forEach(header => {
      res.setHeader(header, response.headers[header]);
    });

    // Pipe response stream to client
    response.data.pipe(res);

  } catch (error) {
    console.error('[Stream Proxy] Error:', error);
    res.status(500).json({ error: 'Stream proxy failed' });
  }
});

export default router;
```

**Register route** in `server/api.ts`:
```typescript
import stashProxyRouter from './controllers/stash-proxy.js';
app.use('/api', authenticateToken, requireCacheReady, stashProxyRouter);
```

#### Step 3: Update Frontend to Use sceneStreams

**File**: `peek-stash-browser/client/src/components/video-player/useVideoPlayer.js`

**Current implementation** (lines 400-419, WRONG):
```javascript
// Manually constructing URLs - WRONG!
const sources = [];

sources.push({
  src: `/api/scene/${scene.id}/stream`,
  label: "Direct",
});

const qualities = ["1080p", "720p", "480p", "360p"];
qualities.forEach((q) => {
  sources.push({
    src: `/api/scene/${scene.id}/stream.m3u8?quality=${q}`,
    label: q,
    type: "application/x-mpegURL",
  });
});
```

**Target implementation** (mimic Stash exactly):
```javascript
// Build sources from scene.sceneStreams (Stash pattern)
const sourceSelector = player.sourceSelector();

if (!scene.sceneStreams || scene.sceneStreams.length === 0) {
  console.error('[VideoPlayer] No sceneStreams available for scene', scene.id);
  return;
}

// Rewrite Stash URLs to use Peek's proxy
const sources = scene.sceneStreams.map((stream) => {
  const url = new URL(stream.url);

  // Extract path after /scene/{id}/
  // e.g., "stream.m3u8?resolution=STANDARD_HD" from "http://stash:9999/scene/123/stream.m3u8?resolution=STANDARD_HD"
  const pathParts = url.pathname.split(`/scene/${scene.id}/`);
  const streamPath = pathParts[1] || 'stream'; // "stream.m3u8" or "stream"
  const queryString = url.search; // "?resolution=STANDARD_HD" or ""

  // Rewrite to Peek's proxy endpoint
  const proxiedUrl = `/api/scene/${scene.id}/proxy-stream/${streamPath}${queryString}`;

  return {
    src: proxiedUrl,
    type: stream.mime_type || undefined,
    label: stream.label || undefined,
  };
});

console.log('[VideoPlayer] Setting sources from sceneStreams:', sources);

// Set sources using sourceSelector plugin
sourceSelector.setSources(sources);

// Optional: Filter out file transcodes on Safari (like Stash does)
// const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
// if (isSafari) {
//   sources = sources.filter(s => !s.src.includes('stream.mp4') && !s.src.includes('stream.webm'));
// }
```

**Remove all manual source construction logic** - let Stash define sources via sceneStreams.

#### Step 4: Remove Peek's Transcoding System

**Files to DELETE** (800+ lines total):
- `server/services/TranscodingManager.ts` - Entire file (793 lines)
- `server/controllers/video.ts` - Keep proxy endpoint, DELETE all transcoding logic
- Any HLS session management code
- Any FFmpeg spawn/management code

**Environment variables to REMOVE**:
- `STASH_MEDIA_PATH` - No longer needed (Peek never accesses video files)
- `STASH_INTERNAL_PATH` - No longer needed
- Path mapping system can be simplified (only needed for images, not videos)

**Docker changes**:
- Remove FFmpeg from `Dockerfile.production` (smaller container!)
- Remove HLS cache volume mount (no longer needed)

#### Step 5: Update User Preferences

**Database changes** (Prisma schema):

Current `User.preferredQuality` enum may be outdated. Since Stash now provides the quality labels dynamically, we can:

1. **Option A**: Remove `preferredQuality` entirely and let users select quality per-session
2. **Option B**: Store last-selected quality label as String (e.g., "720p", "Direct stream")

**Recommendation**: Keep it simple - remove preferredQuality preference. Users select quality via sourceSelector gear menu, and Video.js remembers their choice via localStorage (sourceSelector plugin handles this).

**Migration**: Remove `preferredQuality` field from User model (or mark as deprecated).

#### Step 6: Testing Matrix

Test all stream types and resolutions:

**Direct Stream**:
- [ ] Direct stream plays without errors
- [ ] Codec auto-detected correctly
- [ ] Seeking works correctly

**HLS Streams**:
- [ ] HLS 1080p plays
- [ ] HLS 720p plays
- [ ] HLS 480p plays
- [ ] HLS 240p plays
- [ ] Seeking works in HLS streams

**MP4 Streams** (if Stash provides):
- [ ] MP4 streams play
- [ ] All resolutions work

**WEBM Streams** (if Stash provides):
- [ ] WEBM streams play
- [ ] All resolutions work

**Quality Switching**:
- [ ] Gear icon shows all available streams from sceneStreams
- [ ] Can switch between qualities
- [ ] Playback position preserved during switch
- [ ] Paused state preserved during switch

**Error Handling**:
- [ ] Codec errors trigger auto-fallback to next source
- [ ] Errored sources shown in gear menu with strikethrough
- [ ] Network errors handled gracefully

**Performance**:
- [ ] No buffering issues
- [ ] Seeking is fast
- [ ] Stream startup is quick

### Code Removal Summary

**Files to DELETE**:
1. `server/services/TranscodingManager.ts` (793 lines)
2. HLS session management code in `server/controllers/video.ts`

**Lines to DELETE** (approximate):
- TranscodingManager: 793 lines
- Video controller transcoding logic: ~200 lines
- Path mapping for videos: ~50 lines
- FFmpeg utilities: ~100 lines
- **Total**: ~1150 lines REMOVED

**Lines to ADD**:
- Proxy endpoint: ~40 lines
- Frontend sceneStreams usage: ~20 lines (replacing ~40 lines)
- **Total**: ~60 lines ADDED

**Net code reduction**: ~1090 lines removed! 📉

### Migration Path for Existing Users

**For users upgrading from old Peek versions**:

1. **Database migration**: Remove obsolete `preferredQuality` values
2. **Clear HLS cache**: Old HLS segments no longer used
3. **Update Docker**: Pull new image without FFmpeg
4. **Environment cleanup**: Remove `STASH_MEDIA_PATH` and `STASH_INTERNAL_PATH` (optional, backward compatible)

**Backward compatibility**:
- Existing installations continue to work
- Path mappings for images still functional
- No breaking changes to API endpoints (old `/api/scene/:id/stream` now proxies to Stash)

### Implementation Order

1. ✅ **Add sceneStreams to stashapp-api** (DONE)
2. **Rebuild and publish stashapp-api** → Update Peek's server/package.json
3. **Create proxy endpoint** in Peek backend
4. **Update frontend** to use sceneStreams
5. **Test thoroughly** with all stream types
6. **Remove transcoding system** (TranscodingManager, etc.)
7. **Remove FFmpeg from Docker** (smaller container)
8. **Update documentation** (CLAUDE.md, README.md)
9. **Create migration guide** for existing users
10. **Final testing** and user approval

### Notes

- This is a MAJOR architectural simplification
- Removes most complex code in Peek (transcoding management)
- Makes Peek a true "thin client" for Stash
- All stream intelligence stays in Stash where it belongs
- Peek focuses on multi-user, playlists, and UI improvements

---

## Phase 11: Documentation Updates 📝 TODO

Update these files to reflect new architecture:

### CLAUDE.md

Update Video Player section:
- Remove references to custom implementations
- Document plugin architecture
- Update file structure to show plugins folder
- Add note about Video.js 7 version requirement
- **Update Video Transcoding section** to document proxy architecture (no more TranscodingManager)

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
