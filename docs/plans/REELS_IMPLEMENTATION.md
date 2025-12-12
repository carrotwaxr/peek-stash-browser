# TikTok/Reels Implementation Analysis

## Overview

This document analyzes what it would take to implement a TikTok/Reels-like experience in Peek, based on user requests referencing [Stash TV](https://discourse.stashapp.cc/t/stash-tv/3627) and [StashReels](https://github.com/Valkyr-JS/StashReels).

**Important**: This would be a **separate page/view**, not replacing any existing functionality.

## What Users Want

Based on StashReels and Stash TV implementations:

### Core Experience
- Vertical swipe/scroll through videos
- Auto-play when video comes into view
- Tap to pause/play
- Minimal, non-intrusive UI
- Filter-based playlists (use saved Stash filters)
- Infinite scrolling to load more content

### Key Features
- Mute/unmute toggle
- Quality selector
- Fullscreen mode
- O-counter button
- Rating stars
- Video scrubbing with thumbnails
- Performer/tag links
- Scene info overlay (hideable)
- Landscape rotation support

## Technical Architecture

### Route & Page Structure

```
/reels (new page)
  - Query params: ?filter=xyz&index=123
  - Separate from scene browse/grid view
  - Can deep-link to specific position
```

### Navigation Integration

```
Current Navigation:
- Home
- Scenes (grid view)
- Performers
- Studios
- Tags
- Playlists
- Watch History
- Settings

With Reels Added:
- Home
- Scenes (grid view) ← unchanged
- Reels ← NEW PAGE
- Performers
- Studios
- Tags
- Playlists
- Watch History
- Settings
```

### Core Components

**ReelsPage Component:**
- Main container with vertical scroll
- Manages playlist state (current filter, scenes)
- Handles pagination/infinite scroll
- Filter selection UI

**ReelItem Component:**
- Simplified video player for each scene
- Auto-play when in viewport (Intersection Observer)
- Pause when scrolled away
- Minimal overlay controls
- Scene metadata display

**ReelsControls Component:**
- Floating UI for global controls
- Filter/playlist selector
- Settings panel
- Exit button

## Critical Technical Challenges

### 1. Memory Management (MOST IMPORTANT)

Video.js players consume significant RAM. Cannot have 50 players initialized at once.

**Solution**: Only render 3-5 video elements at a time
- Current video (playing)
- Next video (pre-buffering)
- Previous video (for smooth back-scroll)
- Dispose players that scroll out of range

**StashReels Approach:**
> "Loads only 11 scenes at once—current scene plus five before and after—to optimize browser memory"

**Recommended Strategy:**

```
Viewport:
  [Video -2] ← disposed, removed from DOM
  [Video -1] ← rendered but paused, player initialized
  [Video  0] ← CURRENT, playing, HLS session active
  [Video +1] ← rendered, pre-buffering, HLS starting
  [Video +2] ← rendered element, no player yet
  [Video +3] ← disposed, removed from DOM
```

**Rules:**
- Only 3-4 Video.js players initialized
- Only 1-2 active transcoding sessions
- Dispose players >2 positions away
- Use Intersection Observer threshold for triggering

### 2. Transcoding Session Management

Each video creates HLS transcoding session. Can't have 20+ FFmpeg processes running.

**Solution:**
- Cleanup sessions immediately on scroll away
- Pre-start transcoding for next video
- Limit to 2-3 active sessions max
- Extend `TranscodingManager` with session priority system

### 3. Auto-Play Restrictions

Mobile browsers block autoplay without user interaction. iOS Safari is particularly restrictive.

**Solution:**
- First video requires user tap
- After that, can auto-play with muted default
- Unmute button shows when needed
- Fallback UI: "Tap to play" message

### 4. Scroll Performance

Need smooth 60fps scrolling with videos.

**Solution:**
- CSS scroll-snap-type
- Intersection Observer (not scroll events)
- GPU-accelerated transforms
- Virtual scrolling if needed

## Implementation Advantages

### What Peek Already Has ✅

- **Video.js integration** - Can reuse player setup
- **HLS transcoding system** - TranscodingManager ready
- **Quality selection** - Already implemented
- **O-counter + rating** - Existing buttons/tracking
- **Watch history** - Track viewed reels
- **Scene metadata** - Performers, tags, descriptions
- **Theme system** - Dark/light modes work
- **Auth system** - User preferences
- **Mobile responsive** - Touch-friendly UI
- **Saved filters from Stash** - Can fetch via GraphQL

### What's New (Need to Build) 🆕

- **Vertical scroll container** - With snap points
- **Intersection Observer logic** - Trigger play/pause
- **Player lifecycle management** - Create/dispose on scroll
- **Gesture handling** - Swipe up/down, double-tap
- **Prefetch strategy** - Pre-buffer next video
- **Memory monitoring** - Track and cleanup aggressively
- **Playlist management** - Filter selection, pagination
- **Minimal UI overlay** - Different from full player
- **Infinite scroll pagination** - Load more scenes

## Implementation Effort Estimate

### Phase 1: MVP (5-7 days)
- Basic vertical scroll with 3 videos
- Simple auto-play/pause on scroll
- Minimal controls (mute, close, O-counter)
- Single filter (e.g., "Recently Added")
- Desktop + mobile basic support

**Deliverable**: Can swipe through videos with basic playback

### Phase 2: Full Features (5-7 days)
- Filter selection modal
- Infinite scroll pagination
- Full controls (quality, scrubber, fullscreen)
- Rating integration
- Scene info overlay
- Memory optimization
- Prefetch next video

**Deliverable**: Feature-complete reels experience

### Phase 3: Polish (3-5 days)
- Mobile gesture improvements (double-tap, swipe velocity)
- Keyboard shortcuts (arrow keys, space)
- Performance tuning (virtual scrolling if needed)
- iOS Safari fixes (autoplay, fullscreen)
- User preferences (default filter, default quality, mute state)
- Analytics/tracking
- Error states (network issues, empty playlists)

**Deliverable**: Production-ready, polished experience

**Total Estimate: 13-19 days**

## Key Technical Decisions

### Scroll Implementation

**Option A: Native CSS Scroll Snap** (Recommended)
```css
.reels-container {
  scroll-snap-type: y mandatory;
  overflow-y: scroll;
}

.reel-item {
  scroll-snap-align: start;
  height: 100vh;
}
```

**Pros**: Native, smooth, performant
**Cons**: Less control over snap behavior

**Option B: Custom Scroll Logic**
Use wheel/touch events with programmatic scrolling

**Pros**: Full control
**Cons**: Complex, hard to get right, performance issues

**Recommendation**: Start with Option A, fall back to B if needed

### Video Player Approach

**Option A**: Reuse existing `VideoPlayer` component
- **Pros**: Less code duplication
- **Cons**: Component is complex, has unused features for reels

**Option B**: Create simplified `ReelVideoPlayer`
- **Pros**: Optimized for reels, cleaner, lighter
- **Cons**: Some code duplication

**Recommendation**: Option B - Create `ReelVideoPlayer` that shares core Video.js setup but removes unnecessary UI (playlist controls, chapter markers, etc.)

### State Management

Relatively simple state:
```javascript
{
  filter: currentFilterId,
  scenes: [...scene IDs...],
  currentIndex: 123,
  hasMore: true,
  loading: false,
  muted: true,
  quality: "720p"
}
```

**Recommendation**: React Context or simple useState, no need for Redux/Zustand yet

### Transcoding Quality

Users on mobile may want lower quality for data usage.

**Options:**
1. Default to 480p for reels
2. Remember user's last quality selection
3. Auto-select based on connection speed
4. Allow per-reel quality override

**Recommendation**: Start with user's last selected quality, add auto-select later if needed

## Risks & Challenges

### High Risk
1. **Memory leaks** - Video.js players not properly disposed
2. **Transcoding overload** - Too many FFmpeg sessions crash server
3. **iOS autoplay** - Safari blocks autoplay, breaks experience
4. **Janky scroll** - Videos lag during scroll

### Medium Risk
1. **Network handling** - Slow connections, failed loads
2. **Empty states** - No scenes match filter
3. **Battery drain** - Continuous video playback on mobile
4. **User getting "lost"** - Infinite scroll, no clear endpoint

### Mitigation Strategies
- Extensive memory profiling during development
- TranscodingManager session limits
- Fallback UI for autoplay failures ("Tap to play")
- Virtual scrolling if performance issues
- "You've reached the end" message after X videos
- Exit button always visible

## User Experience Considerations

### Must-Haves
- ⚡ Fast response - Video plays within 500ms of scroll
- 🎯 Clear controls - Obvious how to mute, exit, etc.
- 📱 Touch-friendly - Large tap targets, intuitive gestures
- 🔁 Smooth transitions - No blank frames between videos
- 🚪 Easy exit - Back button, close button work intuitively

### Nice-to-Haves
- ⌨️ Keyboard shortcuts - Space (pause), arrows (next/prev)
- 🖱️ Mouse wheel - Desktop users can scroll with wheel
- 📊 Progress indicator - "Video 5 of 47" or similar
- 🔖 Remember position - Resume where you left off
- 🎨 Visual polish - Transitions, animations

## Integration with Existing Features

### Reuse Existing Components
- `SceneStats` component (O-counter, rating)
- `SceneMetadata` component (performers, tags)
- `libraryApi` service (fetch scenes)
- `watchHistoryApi` (track views)
- `TranscodingManager` (HLS sessions)
- Quality selector UI
- Auth/theme contexts

### New Components
- `ReelsPage.jsx` - Main page container
- `ReelVideoPlayer.jsx` - Simplified player based on `VideoPlayer`
- `ReelItem.jsx` - Individual reel in scroll container
- `ReelsControls.jsx` - Floating control UI
- `useReelsPlayer.js` - Player lifecycle hook

### Modifications Needed
- Extend `TranscodingManager` with session priority (reels vs regular playback)
- Add reels-specific watch tracking (mark as viewed after X seconds)
- Add user preferences for reels (default filter, mute state, quality)

## Benefits of Being a Separate Page

### Zero Risk to Existing Features
- All current pages (Scenes, Scene Detail, Playlists, etc.) remain untouched
- If reels page has bugs, doesn't affect main browsing
- Can be feature-flagged or hidden behind settings if needed
- Easy to disable if issues arise

### Simpler Implementation
- Don't need to refactor existing components
- Can use completely different layout/structure
- Can ignore desktop optimizations if mobile-focused
- Different routing, different state management

### Gradual Rollout
- Can release as "beta" feature
- Add nav link only when ready
- Can gather feedback without disrupting existing workflows
- Easy to A/B test

### Resource Isolation
- Reels page uses its own Video.js players (separate from scene detail)
- Can set different transcoding limits for reels vs regular playback
- Memory cleanup when navigating away (unmount entire page)
- No shared state conflicts

### Mobile-First Design
- Can optimize entirely for mobile without breaking desktop scene browsing
- Different UI paradigms (vertical vs grid) don't conflict
- Touch gestures won't interfere with click interactions elsewhere

## Rollback Safety

If reels page has critical bugs:
```javascript
// In navigation or route config
const REELS_ENABLED = import.meta.env.VITE_ENABLE_REELS === 'true';

// Or user setting
if (user.preferences.showReels) {
  // Show reels nav link
}
```

Can disable without affecting anything else.

## Recommended Implementation Path

### Option A: MVP First (Recommended)
1. **Validate Demand** - Confirm multiple users requesting this
2. **Build MVP** (3-5 days):
   - Single hardcoded filter ("Recently Added")
   - No infinite scroll (just load 20 videos)
   - Basic controls only
   - Desktop-first (mobile later)
3. **User Testing** - Get feedback before full build
4. **Iterate** - Build out full features based on feedback

### Option B: Full Build
Skip MVP, build complete feature over 2-3 weeks. Higher risk but faster time-to-complete if MVP would be approved anyway.

## Success Criteria

**Technical:**
- Memory usage stays under 500MB even after 50+ videos viewed
- Max 2-3 concurrent transcoding sessions
- Smooth 60fps scroll on mobile devices
- Video starts within 500ms of scroll

**User Experience:**
- 80%+ of users can navigate without instructions
- <5% bounce rate on reels page
- Average session length >5 minutes
- Positive feedback in Discord/GitHub

## Conclusion

**Arguments For:**
- 👍 High user engagement (TikTok proves the UX works)
- 👍 Differentiates Peek from Stash
- 👍 Mobile-first feature (Peek's strength)
- 👍 Peek has good infrastructure already (video player, transcoding)
- 👍 Can be isolated page (low risk to existing features)

**Arguments Against:**
- 👎 Significant effort (2-3 weeks full-time)
- 👎 Performance risks (memory, transcoding load)
- 👎 Ongoing maintenance (iOS Safari bugs, etc.)
- 👎 StashReels already exists for Stash users
- 👎 May encourage mindless consumption

**Recommendation:**
If you have 2-3 weeks of development time and users are actively requesting this, it's worth building. Start with a minimal MVP to validate the approach, then iterate based on feedback.

The key to success will be:
1. **Aggressive memory management** - Only 3-5 players max
2. **Transcoding limits** - Max 2 concurrent sessions
3. **Mobile testing early** - iOS Safari will be the pain point
4. **Performance profiling** - Measure memory/CPU continuously

---

**Last Updated**: 2025-10-30
**Status**: Analysis complete, awaiting decision to proceed
