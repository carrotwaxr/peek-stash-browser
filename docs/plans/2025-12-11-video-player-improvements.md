# Video Player Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix the volume/seek bar interaction bug, clean up CSS, remove workaround plugin, and add media-session plugin for OS media controls.

**Architecture:** Refactor CSS to match Stash's proven approach (minimal `!important` usage), delete the unnecessary volume-progress-fix plugin, and port the media-session plugin from Stash that integrates with the existing skip-buttons plugin for playlist navigation.

**Tech Stack:** Video.js 8, React, CSS, MediaSession API

---

## Task 1: CSS Refactor - Control Bar Section

**Files:**
- Modify: `client/src/components/video-player/VideoPlayer.css:23-66`

**Step 1: Remove !important from control bar styles**

Replace lines 23-66 with:

```css
/* ============================================================================
   CONTROL BAR - Transparent background with gradient (Stash pattern)
   ============================================================================ */

.video-js .vjs-control-bar {
  background: none;
  font-size: 15px; /* Scales all control sizes */
  padding: 0;
  display: flex;
  align-items: center;
}

/* Gradient overlay behind controls (Stash pattern) */
.video-js .vjs-control-bar::before {
  background: linear-gradient(
    0deg,
    rgba(0, 0, 0, 0.4) 0%,
    rgba(0, 0, 0, 0) 100%
  );
  bottom: 0;
  content: "";
  height: 10rem;
  pointer-events: none;
  position: absolute;
  width: 100%;
  z-index: -1;
}

/* Hide control bar when user is inactive (YouTube behavior) */
.video-js.vjs-user-inactive.vjs-playing .vjs-control-bar {
  opacity: 0;
  visibility: visible;
  pointer-events: none;
  transition:
    opacity 0.3s ease,
    visibility 0s 0.3s;
}

.video-js.vjs-user-active .vjs-control-bar,
.video-js.vjs-paused .vjs-control-bar,
.video-js:hover .vjs-control-bar {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transition:
    opacity 0.3s ease,
    visibility 0s 0s;
}
```

**Step 2: Verify the change**

Run: `cd client && npm run lint`
Expected: No lint errors related to CSS

**Step 3: Commit**

```bash
git add client/src/components/video-player/VideoPlayer.css
git commit -m "refactor(video-player): remove !important from control bar CSS"
```

---

## Task 2: CSS Refactor - Progress Bar Section

**Files:**
- Modify: `client/src/components/video-player/VideoPlayer.css:68-178`

**Step 1: Remove !important from progress bar styles**

Replace lines 68-178 with:

```css
/* ============================================================================
   PROGRESS BAR - Absolute positioned above controls (Stash pattern)
   ============================================================================ */

.video-js .vjs-progress-control {
  position: absolute;
  bottom: 2.5em; /* Float above controls */
  left: 0;
  right: 0;
  width: 100%;
  height: 3em;
  margin: 0;
  padding: 0;
}

.video-js .vjs-progress-holder {
  height: 6px;
  margin: 0 15px; /* Side margins like Stash */
  padding: 0;
  width: auto;
  font-size: inherit;
}

/* Progress bar rail */
.video-js .vjs-progress-holder {
  background: rgba(255, 255, 255, 0.2);
  border-radius: 0;
}

/* Loaded progress (buffered) */
.video-js .vjs-load-progress {
  background: rgba(255, 255, 255, 0.4);
}

.video-js .vjs-load-progress div {
  background: rgba(255, 255, 255, 0.4);
}

/* Play progress (watched portion) */
.video-js .vjs-play-progress {
  background-color: var(--accent-primary);
  border-radius: 0;
}

/* Progress bar scrubber/handle */
.video-js .vjs-play-progress:before {
  display: none; /* Hide by default */
}

/* Show handle on hover */
.video-js .vjs-progress-control:hover .vjs-play-progress:before,
.video-js .vjs-progress-control:focus-within .vjs-play-progress:before {
  display: block;
  content: "";
  position: absolute;
  right: -6px;
  top: 50%;
  transform: translateY(-50%);
  width: 12px;
  height: 12px;
  background-color: var(--accent-primary);
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(0, 0, 0, 0.4);
}

/* Enlarge progress bar on hover */
.video-js .vjs-progress-control:hover .vjs-progress-holder,
.video-js .vjs-progress-control:focus-within .vjs-progress-holder {
  height: 6px;
  transition: height 0.1s ease;
}

/* VTT Thumbnails - matching Stash's styling */
.video-js .vjs-vtt-thumbnail-display {
  position: absolute;
  left: 0;
  bottom: 6em; /* Stash uses em-based positioning */
  border: 2px solid white;
  border-radius: 2px;
  box-shadow: 0 0 7px rgba(0, 0, 0, 0.6);
  opacity: 0; /* No !important - allow JS to override */
  transition: opacity 0.2s;
  pointer-events: none;
  z-index: 100;
}

/* Ensure thumbnails show on touch/mobile interaction */
.video-js .vjs-progress-control:active .vjs-vtt-thumbnail-display,
.video-js .vjs-slider:active .vjs-vtt-thumbnail-display,
.video-js.vjs-scrubbing .vjs-vtt-thumbnail-display,
.video-js .vjs-mouse-display:hover .vjs-vtt-thumbnail-display {
  opacity: 1 !important;
  transition: opacity 0s; /* Instant show, no fade delay */
}

/* Time tooltip (appears on hover over progress bar) */
.video-js .vjs-mouse-display .vjs-time-tooltip {
  font-size: 13px;
  padding: 6px 10px;
  line-height: 1.4;
  font-family: var(--font-body);
  font-weight: 500;
  background: rgba(28, 28, 28, 0.95);
  border-radius: 4px;
}

/* Hide tooltip on play progress (current position) - only show on hover */
.video-js .vjs-play-progress .vjs-time-tooltip {
  display: none !important;
}
```

**Step 2: Verify the change**

Run: `cd client && npm run lint`
Expected: No lint errors

**Step 3: Commit**

```bash
git add client/src/components/video-player/VideoPlayer.css
git commit -m "refactor(video-player): remove !important from progress bar CSS"
```

---

## Task 3: CSS Refactor - Volume and Time Controls

**Files:**
- Modify: `client/src/components/video-player/VideoPlayer.css:180-244`

**Step 1: Remove !important from volume and time control styles**

Replace lines 180-244 with:

```css
/* ============================================================================
   CONTROL BUTTONS - Let Video.js and font-size: 15px handle sizing naturally
   ============================================================================ */

/* No custom control sizing - inherit from control bar's font-size: 15px */

/* Volume control (Stash pattern - uses popup, configured via JS inline: false) */
.video-js .vjs-volume-control {
  z-index: 1;
}

/* Hide volume on touch devices */
@media (hover: none) and (pointer: coarse) {
  .video-js .vjs-volume-panel {
    display: none;
  }
}

/* ============================================================================
   TIME CONTROLS (Stash pattern)
   ============================================================================ */

.video-js .vjs-time-control {
  align-items: center;
  display: flex;
  justify-content: center;
  min-width: 0;
  padding: 0 4px;
  pointer-events: none;
}

.video-js .vjs-time-control .vjs-control-text {
  display: none;
}

.video-js .vjs-duration {
  margin-right: auto; /* Push right-side controls to the right (Stash pattern) */
}

.video-js .vjs-remaining-time {
  display: none;
}

/* ============================================================================
   POPUP MENUS - Playback Speed, Captions, etc. (Stash pattern)
   ============================================================================ */

.video-js .vjs-menu-button-popup .vjs-menu {
  width: 8em; /* Stash width for popup menus */
  z-index: 10; /* Above progress bar */
}

.video-js .vjs-menu-button-popup .vjs-menu .vjs-menu-content {
  max-height: 10em; /* Stash max height */
}

.video-js .vjs-menu-button-popup .vjs-menu li {
  font-size: 0.8em; /* Stash font size */
}
```

**Step 2: Verify the change**

Run: `cd client && npm run lint`
Expected: No lint errors

**Step 3: Commit**

```bash
git add client/src/components/video-player/VideoPlayer.css
git commit -m "refactor(video-player): remove !important from volume/time controls CSS"
```

---

## Task 4: CSS Refactor - Big Play Button and Loading Spinner

**Files:**
- Modify: `client/src/components/video-player/VideoPlayer.css:246-278`

**Step 1: Remove !important from big play button and spinner styles**

Replace lines 246-278 with:

```css
/* ============================================================================
   BIG PLAY BUTTON (Stash pattern - no background, no border, large icon)
   ============================================================================ */

.video-js .vjs-big-play-button,
.video-js .vjs-big-play-button:hover,
.video-js .vjs-big-play-button:focus,
.video-js:hover .vjs-big-play-button {
  background: none;
  border: none;
  font-size: 10em;
}

/* ============================================================================
   LOADING SPINNER - YouTube style, properly centered
   ============================================================================ */

.video-js .vjs-loading-spinner {
  border-color: rgba(255, 255, 255, 0.2);
  border-top-color: white;
  width: 60px;
  height: 60px;
  border-width: 4px;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  margin: 0;
}

/* Big play button only shows before video has started (initial load) */
/* Loading spinner handles all buffering/waiting states after that */
```

**Step 2: Verify the change**

Run: `cd client && npm run lint`
Expected: No lint errors

**Step 3: Commit**

```bash
git add client/src/components/video-player/VideoPlayer.css
git commit -m "refactor(video-player): remove !important from big play button/spinner CSS"
```

---

## Task 5: CSS Refactor - Mobile Optimizations

**Files:**
- Modify: `client/src/components/video-player/VideoPlayer.css:280-329`

**Step 1: Remove !important from mobile styles**

Replace lines 280-329 with:

```css
/* ============================================================================
   MOBILE OPTIMIZATIONS
   ============================================================================ */

/* Compact controls on smaller screens (Stash pattern) */
@media (max-width: 576px) {
  .video-js .vjs-control {
    width: 2.5em;
  }

  .video-js .vjs-progress-control {
    height: 2em;
    width: 100%;
  }

  .video-js .vjs-playback-rate {
    width: 3em;
  }

  .video-js .vjs-button > .vjs-icon-placeholder::before,
  .video-js .vjs-skip-button::before {
    font-size: 1.5em;
    line-height: 2;
  }

  /* Smaller cast buttons */
  .video-js .vjs-airplay-button .vjs-icon-placeholder,
  .video-js .vjs-chromecast-button .vjs-icon-placeholder {
    height: 1.4em;
    width: 1.4em;
  }

  /* Menu adjustments */
  .video-js .vjs-menu-button-popup .vjs-menu {
    width: 8em;
  }

  .video-js .vjs-menu-button-popup .vjs-menu .vjs-menu-content {
    max-height: 10em;
  }

  .video-js .vjs-menu li {
    font-size: 10px;
  }

  /* Playback rate value */
  .video-js .vjs-playback-rate .vjs-playback-rate-value {
    font-size: 1em;
    line-height: 2.97;
  }

  /* Time control font size (Stash pattern) */
  .video-js .vjs-time-control {
    font-size: 12px;
  }

  /* Current time margin (Stash pattern) */
  .video-js .vjs-current-time {
    margin-left: 1em;
  }
}
```

**Step 2: Verify the change**

Run: `cd client && npm run lint`
Expected: No lint errors

**Step 3: Commit**

```bash
git add client/src/components/video-player/VideoPlayer.css
git commit -m "refactor(video-player): remove !important from mobile CSS"
```

---

## Task 6: CSS Refactor - Hidden Controls and Animations

**Files:**
- Modify: `client/src/components/video-player/VideoPlayer.css:331-419`

**Step 1: Remove !important and add missing Stash styles**

Replace lines 331-419 with:

```css
/* ============================================================================
   HIDE UNSUPPORTED/UNWANTED CONTROLS
   ============================================================================ */

/* Hide live display (we only do VOD) */
.video-js .vjs-live-control,
.video-js .vjs-seek-to-live-control {
  display: none;
}

/* ============================================================================
   CLICK-ONLY MENUS - Disable hover behavior (Stash pattern)
   ============================================================================ */

/* Source selector menu - click only, no hover (matches Stash's approach) */
.video-js .vjs-source-selector.vjs-hover .vjs-menu {
  display: none;
}

/* Captions/subtitles button - inherits from standard menu styling */

/* Hide chapters button (not supported) */
.video-js .vjs-chapters-button {
  display: none;
}

/* Hide audio track button (not needed) */
.video-js .vjs-audio-button {
  display: none;
}

/* Hide descriptions button (accessibility feature we don't use) */
.video-js .vjs-descriptions-button {
  display: none;
}

/* Hide picture-in-picture (already disabled in config but extra safety) */
.video-js .vjs-picture-in-picture-control {
  display: none;
}

/* Hide remaining time display (we only show current time / duration) */
.video-js .vjs-remaining-time {
  display: none;
}

/* Hide spacer element */
.video-js .vjs-custom-control-spacer {
  display: none;
}

/* Hide skip buttons (not used) */
.video-js .vjs-skip-backward-undefined,
.video-js .vjs-skip-forward-undefined {
  display: none;
}

/* ============================================================================
   SMOOTH ANIMATIONS
   ============================================================================ */

.video-js .vjs-control,
.video-js .vjs-progress-control,
.video-js .vjs-volume-control {
  transition: all 0.2s ease;
}

/* No transition on menus - should appear instantly on click (Stash pattern) */

/* ============================================================================
   FOCUS STATES - Accessibility (Stash pattern - minimal outlines)
   ============================================================================ */

.video-js .vjs-button {
  outline: none; /* Stash pattern */
}

.video-js .vjs-progress-control:focus-within {
  outline: none;
}

.video-js .vjs-slider {
  box-shadow: none !important;
  text-shadow: none !important;
}

.video-js .vjs-slider:focus {
  box-shadow: 0 0 0 2px var(--accent-primary);
}

/* Show controls on error (Stash pattern) */
.video-js.vjs-error .vjs-control-bar {
  display: flex !important;
}

/* Caption settings accessibility (Stash pattern) */
.video-js .vjs-text-track-settings select {
  background: #fff;
}
```

**Step 2: Verify the change**

Run: `cd client && npm run lint`
Expected: No lint errors

**Step 3: Commit**

```bash
git add client/src/components/video-player/VideoPlayer.css
git commit -m "refactor(video-player): clean up hidden controls and add Stash patterns"
```

---

## Task 7: CSS Refactor - Plugin Styles (Big Buttons, Markers, etc.)

**Files:**
- Modify: `client/src/components/video-player/VideoPlayer.css:421-597`

**Step 1: Remove !important from plugin styles**

Replace lines 421-597 with:

```css
/* ============================================================================
   STASH PLUGIN STYLES - Markers, Big Buttons, Source Selector, Skip Buttons
   ============================================================================ */

/* Big Buttons - Center overlay with seek and play/pause */
.video-js .vjs-big-button-group {
  display: none;
  height: 80px;
  justify-content: space-around;
  opacity: 0;
  position: absolute;
  top: calc(50% - 40px);
  width: 100%;
  z-index: 1;
}

.video-js .vjs-big-button-group .vjs-button {
  font-size: 4em;
  height: 100%;
  width: 80px;
}

.video-js .vjs-big-button-group .vjs-button .vjs-icon-placeholder::before {
  height: 100%;
  line-height: 80px;
}

@media (pointer: coarse) {
  .video-js.vjs-touch-enabled.vjs-has-started .vjs-big-button-group {
    display: flex;
    opacity: 1;
    visibility: visible;
  }

  .video-js.vjs-touch-enabled.vjs-has-started.vjs-user-inactive.vjs-playing .vjs-big-button-group {
    opacity: 0;
    pointer-events: none;
    transition: visibility 1s, opacity 1s;
    visibility: visible;
  }

  .video-js.vjs-touch-enabled .vjs-big-play-pause-button .vjs-icon-placeholder::before {
    content: "\f101";
    font-family: VideoJS;
  }

  .video-js.vjs-touch-enabled.vjs-playing .vjs-big-play-pause-button .vjs-icon-placeholder::before {
    content: "\f103";
  }

  /* Hide regular seek buttons on touch screens */
  .video-js.vjs-touch-enabled .vjs-control-bar .vjs-seek-button {
    display: none;
  }

  /* VTT thumbnail position on touch */
  .video-js.vjs-touch-enabled .vjs-vtt-thumbnail-display {
    bottom: 2.8em;
  }
}

/* Markers - Timeline markers with tooltips */
.video-js .vjs-marker {
  background-color: rgba(33, 33, 33, 0.8);
  bottom: 0;
  height: 100%;
  left: 0;
  opacity: 1;
  position: absolute;
  transition: opacity 0.2s ease;
  visibility: hidden;
  width: 6px;
  z-index: 100;
}

.video-js .vjs-marker:hover {
  cursor: pointer;
  transform: scale(1.3, 1.3);
}

.video-js .vjs-marker-range {
  background-color: rgba(255, 255, 255, 0.4);
  border-radius: 2px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  height: 8px;
  min-width: 8px;
  position: absolute;
  transform: translateY(-28px);
  transition: none;
}

.video-js .vjs-marker-tooltip {
  background-color: rgba(255, 255, 255, 0.8);
  border-radius: 0.3em;
  color: #000;
  float: right;
  font-family: Arial, Helvetica, sans-serif;
  font-size: 0.6em;
  padding: 6px 8px 8px 8px;
  pointer-events: none;
  position: absolute;
  top: -3.4em;
  visibility: hidden;
  white-space: nowrap;
  z-index: 1;
}

/* Source Selector - Gear icon for Direct/Transcode */
.video-js .vjs-source-selector .vjs-button > .vjs-icon-placeholder::before {
  content: "\f110"; /* VideoJS gear icon */
  font-family: VideoJS;
}

.video-js .vjs-source-selector.vjs-hover .vjs-menu {
  display: none; /* Click-only behavior */
}

.video-js .vjs-source-selector .vjs-menu li {
  font-size: 0.8em;
}

.video-js .vjs-source-selector .vjs-menu-item.vjs-source-menu-item-error:not(.vjs-selected) {
  color: rgba(255, 255, 255, 0.5);
}

.video-js .vjs-source-selector .vjs-menu-item.vjs-source-menu-item-error {
  font-style: italic;
}

/* Skip Buttons - Playlist navigation */
.video-js .vjs-skip-button::before {
  font-size: 1.8em;
  line-height: 1.67;
}

.video-js.vjs-skip-buttons .vjs-icon-next-item,
.video-js.vjs-skip-buttons .vjs-icon-previous-item {
  display: none;
}

.video-js.vjs-skip-buttons-prev .vjs-icon-previous-item,
.video-js.vjs-skip-buttons-next .vjs-icon-next-item {
  display: inline-block;
}

/* VR Selector - VR mode toggle */
.video-js .vjs-vr-selector .vjs-menu li {
  font-size: 0.8em;
}

.video-js .vjs-vr-selector .vjs-button {
  background: url("/vr.svg") center center no-repeat;
  width: 50%;
}

/* Seek Buttons - videojs-seek-buttons styling */
.video-js .vjs-seek-button.skip-back span.vjs-icon-placeholder::before {
  transform: none;
}

.video-js .vjs-seek-button.skip-forward span.vjs-icon-placeholder::before {
  transform: scale(-1, 1);
}

/* Mobile/Touch Optimizations for Stash Plugins */
@media (max-width: 576px) {
  .video-js .vjs-big-button-group .vjs-button {
    font-size: 2em;
    width: 50px;
  }

  .video-js .vjs-source-selector .vjs-menu {
    z-index: 9999;
  }

  .video-js .vjs-source-selector .vjs-menu li {
    font-size: 10px;
  }
}
```

**Step 2: Verify the change**

Run: `cd client && npm run lint`
Expected: No lint errors

**Step 3: Commit**

```bash
git add client/src/components/video-player/VideoPlayer.css
git commit -m "refactor(video-player): remove !important from plugin styles CSS"
```

---

## Task 8: Delete volume-progress-fix Plugin

**Files:**
- Delete: `client/src/components/video-player/plugins/volume-progress-fix.js`
- Modify: `client/src/components/video-player/useVideoPlayer.js:19,176`

**Step 1: Delete the plugin file**

```bash
rm client/src/components/video-player/plugins/volume-progress-fix.js
```

**Step 2: Remove import from useVideoPlayer.js**

In `client/src/components/video-player/useVideoPlayer.js`, delete line 19:

```javascript
import "./plugins/volume-progress-fix.js";
```

**Step 3: Remove plugin from configuration**

In `client/src/components/video-player/useVideoPlayer.js`, find the plugins object (around line 158-178) and delete this line:

```javascript
        volumeProgressFix: {},
```

**Step 4: Verify the change**

Run: `cd client && npm run lint`
Expected: No lint errors, no missing import errors

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(video-player): remove volume-progress-fix plugin

No longer needed after CSS refactor removed forced pointer-events."
```

---

## Task 9: Create media-session Plugin

**Files:**
- Create: `client/src/components/video-player/plugins/media-session.js`

**Step 1: Create the media-session plugin**

Create `client/src/components/video-player/plugins/media-session.js`:

```javascript
import videojs from "video.js";

/**
 * MediaSessionPlugin
 *
 * Integrates with the MediaSession API to provide OS-level media controls.
 * Enables keyboard media keys (play/pause/next/prev) and mobile lock screen controls.
 *
 * Ported from Stash's media-session.ts plugin.
 */
class MediaSessionPlugin extends videojs.getPlugin("plugin") {
  constructor(player, options) {
    super(player, options);

    player.ready(() => {
      player.addClass("vjs-media-session");
      this.setActionHandlers();
    });

    player.on("play", () => {
      this.updatePlaybackState();
    });

    player.on("pause", () => {
      this.updatePlaybackState();
    });

    this.updatePlaybackState();
  }

  /**
   * Set metadata for the current media (title, artist, artwork)
   * Called when scene changes to update OS media display
   *
   * @param {string} title - Scene title
   * @param {string} artist - Performer name(s)
   * @param {string} poster - Poster/screenshot URL
   */
  setMetadata(title, artist, poster) {
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: title || "Unknown",
        artist: artist || "",
        artwork: [
          {
            src: poster || this.player.poster() || "",
            type: "image/jpeg",
          },
        ],
      });
    }
  }

  /**
   * Update the playback state (playing/paused) in the OS
   * @private
   */
  updatePlaybackState() {
    if ("mediaSession" in navigator) {
      const playbackState = this.player.paused() ? "paused" : "playing";
      navigator.mediaSession.playbackState = playbackState;
    }
  }

  /**
   * Set up MediaSession action handlers
   * Integrates with skipButtons plugin for playlist navigation
   * @private
   */
  setActionHandlers() {
    if (!("mediaSession" in navigator)) {
      return;
    }

    navigator.mediaSession.setActionHandler("play", () => {
      this.player.play();
    });

    navigator.mediaSession.setActionHandler("pause", () => {
      this.player.pause();
    });

    navigator.mediaSession.setActionHandler("nexttrack", () => {
      // Use skipButtons plugin's forward handler (playlist integration)
      const skipButtons = this.player.skipButtons?.();
      if (skipButtons) {
        skipButtons.handleForward();
      }
    });

    navigator.mediaSession.setActionHandler("previoustrack", () => {
      // Use skipButtons plugin's backward handler (playlist integration)
      const skipButtons = this.player.skipButtons?.();
      if (skipButtons) {
        skipButtons.handleBackward();
      }
    });

    // Optional: seekbackward/seekforward for 10s skip via media keys
    navigator.mediaSession.setActionHandler("seekbackward", () => {
      this.player.currentTime(Math.max(0, this.player.currentTime() - 10));
    });

    navigator.mediaSession.setActionHandler("seekforward", () => {
      this.player.currentTime(
        Math.min(this.player.duration(), this.player.currentTime() + 10)
      );
    });
  }

  dispose() {
    // Clear action handlers on dispose
    if ("mediaSession" in navigator) {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("seekbackward", null);
      navigator.mediaSession.setActionHandler("seekforward", null);
    }
    super.dispose();
  }
}

// Register the plugin with video.js
videojs.registerPlugin("mediaSession", MediaSessionPlugin);

export default MediaSessionPlugin;
```

**Step 2: Verify the file syntax**

Run: `cd client && npm run lint`
Expected: No lint errors in the new file

**Step 3: Commit**

```bash
git add client/src/components/video-player/plugins/media-session.js
git commit -m "feat(video-player): add media-session plugin for OS media controls

Ported from Stash. Enables:
- Keyboard media keys (play/pause/next/prev)
- Mobile lock screen controls
- Seek forward/backward via media keys"
```

---

## Task 10: Register media-session Plugin

**Files:**
- Modify: `client/src/components/video-player/useVideoPlayer.js:19-20,176`

**Step 1: Add import for media-session plugin**

In `client/src/components/video-player/useVideoPlayer.js`, add after line 20 (after the vrmode import):

```javascript
import "./plugins/media-session.js";
```

**Step 2: Add plugin to configuration**

In the plugins object (around line 175-178), add `mediaSession` before `vrMenu`:

```javascript
        trackActivity: {},
        mediaSession: {},
        vrMenu: {},
```

**Step 3: Verify the change**

Run: `cd client && npm run lint`
Expected: No lint errors

**Step 4: Commit**

```bash
git add client/src/components/video-player/useVideoPlayer.js
git commit -m "feat(video-player): register media-session plugin"
```

---

## Task 11: Wire Up Media Session Metadata

**Files:**
- Modify: `client/src/components/video-player/useVideoPlayer.js` (add new useEffect)

**Step 1: Add useEffect to update media session metadata on scene change**

Add this new useEffect after the VTT thumbnails update effect (around line 218):

```javascript
  // ============================================================================
  // MEDIA SESSION METADATA (OS media controls - title, artist, poster)
  // ============================================================================

  useEffect(() => {
    const player = playerRef.current;
    if (!player || !scene) return;

    const mediaSessionPlugin = player.mediaSession?.();
    if (!mediaSessionPlugin) return;

    // Build performer string from scene performers
    const performers = scene.performers?.map((p) => p.name).join(", ") || "";

    // Set metadata for OS media controls
    mediaSessionPlugin.setMetadata(
      scene.title || "Untitled Scene",
      performers,
      scene.paths?.screenshot || ""
    );
  }, [scene?.id, scene?.title, scene?.performers, scene?.paths?.screenshot, playerRef]);
```

**Step 2: Verify the change**

Run: `cd client && npm run lint`
Expected: No lint errors

**Step 3: Commit**

```bash
git add client/src/components/video-player/useVideoPlayer.js
git commit -m "feat(video-player): wire up media session metadata on scene change"
```

---

## Task 12: Manual Testing

**Files:** None (manual testing only)

**Step 1: Start the dev environment**

```bash
docker-compose up --build -d
```

**Step 2: Test volume/seek bar interaction**

1. Navigate to a scene and start playback
2. Hover over the volume icon
3. Move mouse up to the volume slider popup
4. Verify: No seek event is triggered while moving to volume slider
5. Adjust volume and verify it works correctly

**Step 3: Test control bar functionality**

1. Verify play/pause button works
2. Verify seek bar works (click to seek, drag to scrub)
3. Verify time display updates correctly
4. Verify fullscreen toggle works
5. Verify playback rate menu works (direct play only)
6. Verify source selector menu works

**Step 4: Test media keys**

1. Play a video
2. Press keyboard media play/pause key (if available)
3. Verify: Video pauses/resumes
4. Navigate to a playlist
5. Press keyboard media next/prev keys
6. Verify: Navigates to next/prev scene in playlist

**Step 5: Test on touch device (if available)**

1. Open on mobile browser or touch-enabled device
2. Verify big button overlay appears on tap
3. Verify volume panel is hidden (touch devices don't have hover)
4. Verify seek bar works with touch drag

**Step 6: Document results**

If all tests pass, proceed to final commit. If issues found, document and address.

---

## Task 13: Final Verification and Commit

**Files:** None

**Step 1: Run full lint check**

```bash
cd client && npm run lint
```

Expected: No errors

**Step 2: Check git status**

```bash
git status
```

Expected: Clean working tree (all changes committed)

**Step 3: Review commits**

```bash
git log --oneline -10
```

Expected: See all the commits from this implementation

**Step 4: Push to remote**

```bash
git push -u origin feature/video-player-improvements
```

---

## Summary

This implementation plan covers:

1. **Tasks 1-7:** CSS refactor removing ~40 unnecessary `!important` declarations
2. **Task 8:** Delete the volume-progress-fix plugin workaround
3. **Tasks 9-11:** Port and integrate the media-session plugin from Stash
4. **Tasks 12-13:** Manual testing and verification

Total estimated changes:
- ~400 lines of CSS refactored
- 1 file deleted (volume-progress-fix.js)
- 1 file created (media-session.js, ~100 lines)
- ~20 lines added to useVideoPlayer.js
