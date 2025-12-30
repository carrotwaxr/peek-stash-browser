# Lightbox Enhancements Design

## Overview

Transform Peek's lightbox into a modern, multi-platform image viewer with touch gestures, immersive fullscreen, and accessible metadata.

### Goals

- Mobile-first touch navigation (swipe to navigate, swipe up for info)
- True fullscreen mode using Browser Fullscreen API
- Metadata drawer showing performers, tags, studio, and image details
- Tap-to-toggle controls for immersive viewing
- Consistent experience across mobile and desktop

### User Feedback Sources

- [Discourse thread](https://discourse.stashapp.cc/t/peek-stash-browser/4018) - TikTok-style viewing requests
- [GitHub Issue #193](https://github.com/carrotwaxr/peek-stash-browser/issues/193) - Images page (implemented)
- Discord feedback from honeypotfields:
  - Swipe instead of tap for navigation
  - Hide titlebar/chrome in fullscreen
  - Prevent orientation jump issues
  - Gallery-relevant tags visible without menus

---

## Feature 1: Touch Gesture Navigation

### Gesture Behaviors

| Gesture | Action |
|---------|--------|
| Swipe left | Next image |
| Swipe right | Previous image |
| Swipe up | Open metadata drawer |
| Swipe down | Close drawer (if open) or close lightbox |
| Tap | Toggle controls visibility |

### Thresholds

- Horizontal swipe: 50px minimum, velocity > 0.3
- Swipe up (drawer): 80px minimum (prevents accidental triggers)
- Swipe down (close): 100px when drawer closed, 50px when drawer open
- Diagonal swipes: Use dominant axis (greater delta wins)

### Edge Cases

- Multi-touch ignored (reserved for future pinch-to-zoom)
- Scroll within drawer: Native scroll; swipe-to-dismiss only at scroll top
- Drawer open: Swipe down closes drawer first, not lightbox

### Library

Use `react-swipeable` (~3KB gzipped) for touch handling.

---

## Feature 2: Metadata Drawer

### Layout

```
┌─────────────────────────────────────────────────┐
│  ═══════════  (drag handle indicator)           │
├─────────────────────────────────────────────────┤
│  [Title]                    [Rating] [O] [❤]    │
│  Studio Name • Jan 15, 2024 • 3840×2160         │
├─────────────────────────────────────────────────┤
│  PERFORMERS ─────────────────────────────       │
│  [avatar] [avatar] [avatar] → (horizontal scroll)│
│   Name     Name     Name                        │
├─────────────────────────────────────────────────┤
│  TAGS ───────────────────────────────────       │
│  [Tag Chip] [Tag Chip] [Tag Chip] [+3 more]     │
├─────────────────────────────────────────────────┤
│  DETAILS ────────────────────────────────       │
│  Description text if present...                 │
└─────────────────────────────────────────────────┘
```

### Styling (consistent with existing patterns)

- **Container**: Bottom sheet, max-height 60vh mobile / 50vh desktop
- **Background**: `var(--bg-card)` with `rounded-t-lg`
- **Section headers**: `text-sm font-semibold uppercase tracking-wide mb-3 pb-2` with `border-b-2 border-[var(--accent-primary)]`
- **Performers**: Horizontal scroll, `w-[120px]` cards, `aspect-[2/3]` thumbnails, `gap-4`
- **Tags**: `TagChips` component (colored pills, alphabetically sorted)
- **Studio link**: `hover:underline hover:text-blue-400`

### Triggers

- Swipe up on image (mobile)
- `i` hotkey (all platforms)
- Info button in controls (all platforms)

### Dismiss

- Swipe down on drawer
- Tap outside drawer
- `i` key (toggle)
- Escape key

### Interactivity

- Performers, tags, studio are clickable links (navigates to detail page, closes lightbox)
- Rating, O-counter, favorite are interactive within drawer

---

## Feature 3: Controls Overlay

### Layout

```
┌─────────────────────────────────────────┐
│  [✕]                            [⛶] [i] │  ← Top bar
│                                         │
│   ◄                               ►     │  ← Side nav (desktop)
│                                         │
│                                         │
│  1 / 24    Title of Image    ⌨ hints   │  ← Bottom bar
│        [▶ 5s ▼]  [★ 7.2] [💧 3] [❤]    │  ← Controls row
└─────────────────────────────────────────┘
```

### Visibility States

| Context | Default State | Behavior |
|---------|---------------|----------|
| Desktop | Visible | Auto-hide after 3s of no mouse movement |
| Mobile | Hidden | Tap image to toggle |
| Slideshow | Hidden | Auto-hide after 2s |
| Interacting | Visible | Resets auto-hide timer |

### New Buttons

- **Fullscreen [⛶]**: Top-right, toggles Browser Fullscreen API
- **Info [i]**: Top-right, opens metadata drawer

### Button Styling

- Background: `rgba(0, 0, 0, 0.5)`, `hover:bg-opacity-70`
- Icons: 24px (`w-6 h-6`), white with text shadow for contrast
- Consistent with existing lightbox controls

---

## Feature 4: Fullscreen Mode

### Behavior

- Uses `document.documentElement.requestFullscreen()` API
- Toggle via `f` key or fullscreen button
- Icon switches between expand/compress states
- Hides browser chrome entirely (address bar, tabs)

### Escape Key Cascade

1. If drawer open → close drawer
2. Else if fullscreen → exit fullscreen
3. Else → close lightbox

### Fallback

- Hide fullscreen button on unsupported browsers
- Log warning to console

### Platform Notes

- iOS Safari: Uses `webkitRequestFullscreen`, different behavior on iPhone vs iPad
- Test on real devices before release

---

## Keyboard Shortcuts

### Complete List

| Key | Action |
|-----|--------|
| ← | Previous image |
| → | Next image |
| Space | Toggle slideshow |
| Escape | Close (cascading: drawer → fullscreen → lightbox) |
| `i` | Toggle info drawer |
| `f` | Toggle fullscreen |
| `r` then `1-5` | Set rating (1-5 stars mapped to 20-100) |
| `r` then `0` | Clear rating |
| `r` then `f` | Toggle favorite |

---

## Implementation

### New Dependencies

```json
{
  "react-swipeable": "^7.0.0"
}
```

### Files to Modify

- `client/src/components/ui/Lightbox.jsx` - Add gestures, new controls, state management
- `client/package.json` - Add react-swipeable dependency

### New Files

| File | Purpose |
|------|---------|
| `client/src/components/ui/MetadataDrawer.jsx` | Bottom sheet component |
| `client/src/hooks/useSwipeGestures.js` | Custom hook wrapping react-swipeable |
| `client/src/hooks/useFullscreen.js` | Fullscreen API hook with state sync |

### Component Structure

```jsx
<Lightbox>
  <SwipeableContainer>
    <ControlsOverlay visible={controlsVisible}>
      <TopBar>
        <CloseButton />
        <FullscreenButton />
        <InfoButton />
      </TopBar>
      <SideNav />           {/* Desktop only */}
      <BottomBar>
        <ImageCounter />
        <ImageTitle />
        <SlideshowControls />
        <RatingBadge />
        <OCounterButton />
        <FavoriteButton />
      </BottomBar>
    </ControlsOverlay>
    <ImageContainer />
  </SwipeableContainer>
  <MetadataDrawer
    open={drawerOpen}
    image={currentImage}
    onClose={() => setDrawerOpen(false)}
  />
</Lightbox>
```

### State Management

```javascript
// New state
const [controlsVisible, setControlsVisible] = useState(true);
const [drawerOpen, setDrawerOpen] = useState(false);
const { isFullscreen, toggleFullscreen } = useFullscreen();

// Existing state (preserved)
const [currentIndex, setCurrentIndex] = useState(initialIndex);
const [isPlaying, setIsPlaying] = useState(autoPlay);
const [intervalDuration, setIntervalDuration] = useState(5000);
```

### Testing Notes

- Gesture thresholds need real device testing
- Fullscreen API requires user gesture (cannot auto-trigger)
- iOS Safari fullscreen behaves differently than Chrome/Firefox
- Test orientation changes don't cause layout jumps

---

## Future Enhancements (Out of Scope)

These were discussed but deferred for later consideration:

- **Pinch-to-zoom**: Multi-touch gesture for image zoom/pan
- **Smart sidebar**: Desktop-only side panel using pillarbox space for metadata
- **Persistent defaults**: User preferences for grid layout, sort order, items per page
- **Tag quick-filters**: Tap tag in drawer to filter gallery by that tag
