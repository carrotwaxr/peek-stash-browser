# Video Player Improvements Design

## Problem Statement

Peek's video player has a known bug: when hovering over the volume menu while a video is playing and moving the mouse up to it, the seek bar below captures mouse events and triggers unintended seeking.

Root cause analysis comparing Peek's implementation to Stash's (which works correctly) revealed:

1. **CSS overuse of `!important`** - Peek's VideoPlayer.css uses aggressive `!important` declarations that override Video.js's natural stacking behavior
2. **Forced pointer-events** - `pointer-events: auto !important` on the progress control forces event capture even when the volume popup should take precedence
3. **Workaround plugin** - `volume-progress-fix.js` exists to patch around the CSS issue but doesn't fully solve it

Additionally, Peek is missing the `media-session` plugin that Stash uses for OS-level media control integration.

## Goals

1. Fix the volume/seek bar interaction bug
2. Align Peek's CSS with Stash's proven approach
3. Remove unnecessary workaround code
4. Add media-session plugin for OS media controls

## Non-Goals

- Adding new video player features beyond Stash parity
- Changing the visual design or theme colors
- Modifying plugin logic that already matches Stash

## Solution

### 1. CSS Refactor

Refactor `client/src/components/video-player/VideoPlayer.css` to match Stash's `styles.scss` approach:

**Remove `!important` from:**
- Control bar: `background`, `font-size`, `padding`, `display`, `align-items`
- Progress control: `position`, `bottom`, `left`, `right`, `width`, `height`, `pointer-events`, `margin`, `padding`
- Progress holder: `height`, `margin`, `padding`, `width`, `font-size`, `background`, `border-radius`
- Play progress: `background-color`, `border-radius`
- Volume control: `z-index`
- Time controls: `align-items`, `display`, `justify-content`, `min-width`, `padding`, `pointer-events`
- Duration: `margin-right`
- Control buttons: `transition`

**Keep `!important` only where Stash uses it:**
- `.vjs-slider { box-shadow: none !important; text-shadow: none !important; }` - Required to override Video.js defaults
- `.vjs-error .vjs-control-bar { display: flex !important; }` - Required to show controls during errors
- `.vjs-play-progress .vjs-time-tooltip { display: none !important; }` - Required to hide duplicate tooltip

**Fix VTT thumbnail positioning:**
- Change `bottom: 20px` to `bottom: 6em` to match Stash's em-based approach

**Add missing Stash rule:**
- `.vjs-text-track-settings select { background: #fff; }` for caption settings accessibility

### 2. Delete volume-progress-fix Plugin

Remove the workaround plugin that's no longer needed:

- Delete `client/src/components/video-player/plugins/volume-progress-fix.js`
- Remove import and registration from `client/src/components/video-player/useVideoPlayer.js`
- Remove from plugins configuration object

### 3. Port media-session Plugin

Create `client/src/components/video-player/plugins/media-session.js` based on Stash's `media-session.ts`:

**Features:**
- Set `navigator.mediaSession.metadata` with scene title, performer, and poster image
- Handle `play`, `pause`, `seekbackward`, `seekforward` actions
- Handle `previoustrack`, `nexttrack` actions tied to playlist navigation
- Update `playbackState` on play/pause events

**Integration:**
- Use same handler pattern as skip-buttons plugin
- `setForwardHandler(handler)` / `setBackwardHandler(handler)` for playlist nav
- Receive scene metadata via plugin options or setter methods

## Implementation Plan

### Phase 1: CSS Refactor
1. Create backup of current VideoPlayer.css
2. Systematically remove `!important` declarations
3. Test volume/seek bar interaction
4. Test all control bar functionality
5. Test on mobile/touch devices

### Phase 2: Plugin Cleanup
1. Remove volume-progress-fix.js
2. Remove references from useVideoPlayer.js
3. Verify no regressions

### Phase 3: Media Session Plugin
1. Create media-session.js plugin
2. Register in useVideoPlayer.js
3. Wire up playlist handlers (same as skip-buttons)
4. Wire up scene metadata updates
5. Test with keyboard media keys
6. Test on mobile (lock screen controls)

## Testing

- Manual testing of volume slider interaction
- Manual testing of seek bar functionality
- Manual testing on touch devices
- Manual testing of media keys (play/pause, next/prev)
- Verify no console errors during playback
- Verify controls hide/show correctly on inactivity

## Risks

- **CSS changes may have unintended effects** - Mitigated by systematic removal and testing after each change
- **Browser compatibility for MediaSession API** - API is well-supported in modern browsers, graceful degradation if unavailable

## References

- Stash video player: `~/code/stash/ui/v2.5/src/components/ScenePlayer/`
- Stash styles: `~/code/stash/ui/v2.5/src/components/ScenePlayer/styles.scss`
- Stash media-session plugin: `~/code/stash/ui/v2.5/src/components/ScenePlayer/media-session.ts`
- MDN MediaSession API: https://developer.mozilla.org/en-US/docs/Web/API/MediaSession
