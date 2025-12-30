# Lightbox Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add touch gestures, metadata drawer, fullscreen mode, and tap-to-toggle controls to the Lightbox component.

**Architecture:** Extend existing Lightbox.jsx with new hooks for gestures and fullscreen. Create a MetadataDrawer component for the bottom sheet. Use react-swipeable for touch handling.

**Tech Stack:** React 19, react-swipeable, Tailwind CSS, lucide-react icons

---

## Task 1: Add react-swipeable dependency

**Files:**
- Modify: `client/package.json`

**Step 1: Install react-swipeable**

Run:
```bash
cd client && npm install react-swipeable
```

Expected: Package added to dependencies

**Step 2: Verify installation**

Run:
```bash
cd client && npm ls react-swipeable
```

Expected: Shows react-swipeable@7.x.x

**Step 3: Commit**

```bash
git add client/package.json client/package-lock.json
git commit -m "chore: add react-swipeable dependency"
```

---

## Task 2: Create useFullscreen hook

**Files:**
- Create: `client/src/hooks/useFullscreen.js`

**Step 1: Write the hook**

```javascript
import { useCallback, useEffect, useState } from "react";

/**
 * Hook to manage browser fullscreen state
 * @returns {{ isFullscreen: boolean, toggleFullscreen: () => void, supportsFullscreen: boolean }}
 */
export function useFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  const supportsFullscreen = Boolean(
    document.fullscreenEnabled ||
      document.webkitFullscreenEnabled ||
      document.mozFullScreenEnabled ||
      document.msFullscreenEnabled
  );

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    document.addEventListener("webkitfullscreenchange", handleFullscreenChange);
    document.addEventListener("mozfullscreenchange", handleFullscreenChange);
    document.addEventListener("MSFullscreenChange", handleFullscreenChange);

    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
      document.removeEventListener("webkitfullscreenchange", handleFullscreenChange);
      document.removeEventListener("mozfullscreenchange", handleFullscreenChange);
      document.removeEventListener("MSFullscreenChange", handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        const elem = document.documentElement;
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
          await elem.webkitRequestFullscreen();
        } else if (elem.mozRequestFullScreen) {
          await elem.mozRequestFullScreen();
        } else if (elem.msRequestFullscreen) {
          await elem.msRequestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          await document.webkitExitFullscreen();
        } else if (document.mozCancelFullScreen) {
          await document.mozCancelFullScreen();
        } else if (document.msExitFullscreen) {
          await document.msExitFullscreen();
        }
      }
    } catch (err) {
      console.warn("Fullscreen toggle failed:", err);
    }
  }, []);

  return { isFullscreen, toggleFullscreen, supportsFullscreen };
}
```

**Step 2: Verify file exists**

Run:
```bash
ls -la client/src/hooks/useFullscreen.js
```

Expected: File exists

**Step 3: Commit**

```bash
git add client/src/hooks/useFullscreen.js
git commit -m "feat: add useFullscreen hook for browser fullscreen API"
```

---

## Task 3: Create MetadataDrawer component

**Files:**
- Create: `client/src/components/ui/MetadataDrawer.jsx`

**Step 1: Write the component**

```jsx
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import TagChips from "./TagChips.jsx";
import RatingBadge from "./RatingBadge.jsx";
import OCounterButton from "./OCounterButton.jsx";
import FavoriteButton from "./FavoriteButton.jsx";

/**
 * Bottom sheet drawer displaying image metadata
 */
const MetadataDrawer = ({
  open,
  onClose,
  image,
  rating,
  isFavorite,
  oCounter,
  onRatingClick,
  onFavoriteChange,
  onOCounterChange,
}) => {
  if (!open || !image) return null;

  const studio = image.studio;
  const performers = image.performers || [];
  const tags = image.tags || [];
  const date = image.date
    ? new Date(image.date).toLocaleDateString()
    : null;
  const resolution =
    image.width && image.height ? `${image.width}×${image.height}` : null;

  // Build subtitle parts
  const subtitleParts = [studio?.name, date, resolution].filter(Boolean);
  const subtitle = subtitleParts.join(" • ");

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-lg overflow-hidden"
        style={{
          backgroundColor: "var(--bg-card)",
          maxHeight: "60vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-3">
          <div
            className="w-10 h-1 rounded-full"
            style={{ backgroundColor: "var(--text-muted)" }}
          />
        </div>

        {/* Scrollable content */}
        <div
          className="overflow-y-auto px-4 pb-6"
          style={{ maxHeight: "calc(60vh - 40px)" }}
        >
          {/* Header row: Title + controls */}
          <div className="flex items-start justify-between gap-4 mb-2">
            <h2
              className="text-lg font-semibold line-clamp-2 flex-1"
              style={{ color: "var(--text-primary)" }}
            >
              {image.title || "Untitled"}
            </h2>
            <div className="flex items-center gap-2 flex-shrink-0">
              <RatingBadge
                rating={rating}
                onClick={onRatingClick}
                size="medium"
              />
              <OCounterButton
                imageId={image.id}
                initialCount={oCounter}
                onChange={onOCounterChange}
                size="medium"
                variant="card"
                interactive={true}
              />
              <FavoriteButton
                isFavorite={isFavorite}
                onChange={onFavoriteChange}
                size="medium"
                variant="card"
              />
            </div>
          </div>

          {/* Subtitle: Studio • Date • Resolution */}
          {subtitle && (
            <p
              className="text-sm mb-4"
              style={{ color: "var(--text-secondary)" }}
            >
              {studio ? (
                <Link
                  to={`/studio/${studio.id}`}
                  className="hover:underline hover:text-blue-400"
                  onClick={onClose}
                >
                  {studio.name}
                </Link>
              ) : null}
              {studio && (date || resolution) ? " • " : null}
              {date}
              {date && resolution ? " • " : null}
              {resolution}
            </p>
          )}

          {/* Performers section */}
          {performers.length > 0 && (
            <div className="mb-4">
              <h3
                className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
                style={{
                  color: "var(--text-primary)",
                  borderBottom: "2px solid var(--accent-primary)",
                }}
              >
                Performers
              </h3>
              <div
                className="flex gap-4 overflow-x-auto pb-2 scroll-smooth"
                style={{ scrollbarWidth: "thin" }}
              >
                {performers.map((performer) => (
                  <Link
                    key={performer.id}
                    to={`/performer/${performer.id}`}
                    className="flex flex-col items-center flex-shrink-0 group w-[120px]"
                    onClick={onClose}
                  >
                    <div
                      className="aspect-[2/3] rounded-lg overflow-hidden mb-2 w-full border-2 border-transparent group-hover:border-[var(--accent-primary)] transition-all"
                      style={{ backgroundColor: "var(--border-color)" }}
                    >
                      {performer.image_path ? (
                        <img
                          src={performer.image_path}
                          alt={performer.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span
                            className="text-4xl"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {performer.gender === "MALE" ? "♂" : "♀"}
                          </span>
                        </div>
                      )}
                    </div>
                    <span
                      className="text-xs font-medium text-center w-full line-clamp-2 group-hover:underline"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {performer.name}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Tags section */}
          {tags.length > 0 && (
            <div className="mb-4">
              <h3
                className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
                style={{
                  color: "var(--text-primary)",
                  borderBottom: "2px solid var(--accent-primary)",
                }}
              >
                Tags
              </h3>
              <TagChips tags={tags} />
            </div>
          )}

          {/* Details section (if description exists) */}
          {image.details && (
            <div>
              <h3
                className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
                style={{
                  color: "var(--text-primary)",
                  borderBottom: "2px solid var(--accent-primary)",
                }}
              >
                Details
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--text-primary)" }}
              >
                {image.details}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default MetadataDrawer;
```

**Step 2: Verify file exists**

Run:
```bash
ls -la client/src/components/ui/MetadataDrawer.jsx
```

Expected: File exists

**Step 3: Commit**

```bash
git add client/src/components/ui/MetadataDrawer.jsx
git commit -m "feat: add MetadataDrawer component for image metadata display"
```

---

## Task 4: Add swipe gestures to Lightbox

**Files:**
- Modify: `client/src/components/ui/Lightbox.jsx`

**Step 1: Add imports at top of file**

Add after existing imports:

```javascript
import { useSwipeable } from "react-swipeable";
import { Info, Maximize, Minimize } from "lucide-react";
import { useFullscreen } from "../../hooks/useFullscreen.js";
import MetadataDrawer from "./MetadataDrawer.jsx";
```

**Step 2: Add new state variables after existing state**

Add after `const [isRatingPopoverOpen, setIsRatingPopoverOpen] = useState(false);`:

```javascript
// New state for enhanced features
const [controlsVisible, setControlsVisible] = useState(true);
const [drawerOpen, setDrawerOpen] = useState(false);
const { isFullscreen, toggleFullscreen, supportsFullscreen } = useFullscreen();
const controlsTimeoutRef = useRef(null);
```

**Step 3: Add controls auto-hide logic**

Add after the controlsTimeoutRef declaration:

```javascript
// Auto-hide controls after inactivity
const showControls = useCallback(() => {
  setControlsVisible(true);
  if (controlsTimeoutRef.current) {
    clearTimeout(controlsTimeoutRef.current);
  }
  controlsTimeoutRef.current = setTimeout(() => {
    if (!drawerOpen && !isRatingPopoverOpen) {
      setControlsVisible(false);
    }
  }, 3000);
}, [drawerOpen, isRatingPopoverOpen]);

// Reset auto-hide on mouse movement (desktop)
const handleMouseMove = useCallback(() => {
  showControls();
}, [showControls]);

// Toggle controls on tap (mobile)
const handleTap = useCallback(() => {
  setControlsVisible((prev) => !prev);
}, []);
```

**Step 4: Add swipe handlers**

Add after handleTap:

```javascript
// Swipe gesture handlers
const swipeHandlers = useSwipeable({
  onSwipedLeft: () => goToNext(),
  onSwipedRight: () => goToPrevious(),
  onSwipedUp: () => setDrawerOpen(true),
  onSwipedDown: () => {
    if (drawerOpen) {
      setDrawerOpen(false);
    } else {
      onClose();
    }
  },
  onTap: handleTap,
  delta: 50,
  preventScrollOnSwipe: true,
  trackMouse: false,
});
```

**Step 5: Update keyboard handler for new shortcuts**

Replace the existing keyboard handler `useEffect` (lines 206-231) with:

```javascript
// Keyboard controls
useEffect(() => {
  if (!isOpen) return;

  const handleKeyDown = (e) => {
    // Ignore if typing in an input
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

    switch (e.key) {
      case "Escape":
        if (drawerOpen) {
          setDrawerOpen(false);
        } else if (isFullscreen) {
          // Browser handles fullscreen exit, but we track state
        } else {
          onClose();
        }
        break;
      case "ArrowLeft":
        goToPrevious();
        break;
      case "ArrowRight":
        goToNext();
        break;
      case " ":
        e.preventDefault();
        toggleSlideshow();
        break;
      case "i":
      case "I":
        setDrawerOpen((prev) => !prev);
        break;
      case "f":
      case "F":
        toggleFullscreen();
        break;
      default:
        break;
    }
    showControls();
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}, [isOpen, onClose, goToPrevious, goToNext, toggleSlideshow, drawerOpen, isFullscreen, toggleFullscreen, showControls]);
```

**Step 6: Clean up timeout on unmount**

Add after the keyboard useEffect:

```javascript
// Cleanup controls timeout
useEffect(() => {
  return () => {
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
  };
}, []);
```

**Step 7: Wrap the main container with swipe handlers**

Replace the opening `<div` (line 253-258) with:

```jsx
<div
  {...swipeHandlers}
  className="fixed inset-0 z-50 flex items-center justify-center"
  style={{
    backgroundColor: "rgba(0, 0, 0, 0.95)",
  }}
  onMouseMove={handleMouseMove}
  onClick={onClose}
>
```

**Step 8: Add controls visibility wrapper and new buttons**

Replace the close button section (lines 261-271) with:

```jsx
{/* Top controls bar */}
<div
  className={`absolute top-4 left-4 right-4 z-50 flex justify-between items-center transition-opacity duration-300 ${
    controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
  }`}
>
  {/* Left side - empty for balance */}
  <div />

  {/* Right side controls */}
  <div className="flex items-center gap-2">
    {/* Info button */}
    <button
      onClick={(e) => {
        e.stopPropagation();
        setDrawerOpen(true);
      }}
      className="p-2 rounded-full transition-colors"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        color: "var(--text-primary)",
      }}
      aria-label="Show image info"
    >
      <Info size={24} />
    </button>

    {/* Fullscreen button */}
    {supportsFullscreen && (
      <button
        onClick={(e) => {
          e.stopPropagation();
          toggleFullscreen();
        }}
        className="p-2 rounded-full transition-colors"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.5)",
          color: "var(--text-primary)",
        }}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
      >
        {isFullscreen ? <Minimize size={24} /> : <Maximize size={24} />}
      </button>
    )}

    {/* Close button */}
    <button
      onClick={onClose}
      className="p-2 rounded-full transition-colors"
      style={{
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        color: "var(--text-primary)",
      }}
      aria-label="Close lightbox"
    >
      <X size={24} />
    </button>
  </div>
</div>
```

**Step 9: Wrap existing bottom controls with visibility**

Wrap the image counter (lines 273-282), compact controls (lines 284-403), and keyboard hints (lines 494-505) with the visibility class.

For the image counter, change to:

```jsx
{/* Image counter - bottom left */}
<div
  className={`absolute bottom-4 left-4 z-50 px-4 py-2 rounded-lg text-lg font-medium transition-opacity duration-300 ${
    controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
  }`}
  style={{
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    color: "var(--text-primary)",
  }}
>
  {currentIndex + 1} / {images.length}
</div>
```

For the compact controls row (slideshow, rating, etc), wrap with:

```jsx
{/* Compact controls - positioned to the right */}
<div className={`absolute top-16 right-4 z-50 flex items-center gap-3 transition-opacity duration-300 ${
  controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
}`}>
```

For the keyboard hints, change to:

```jsx
{/* Keyboard hints */}
<div
  className={`absolute bottom-4 right-4 z-50 px-3 py-2 rounded-lg text-xs transition-opacity duration-300 ${
    controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
  }`}
  style={{
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    color: "var(--text-muted)",
  }}
>
  <div>← → Navigate</div>
  <div>Space Slideshow</div>
  <div>i Info • f Fullscreen</div>
  <div>Esc Close</div>
</div>
```

**Step 10: Wrap navigation buttons with visibility**

For both Previous and Next buttons, add the visibility class:

```jsx
{/* Previous button */}
{images.length > 1 && (
  <button
    onClick={(e) => {
      e.stopPropagation();
      goToPrevious();
    }}
    className={`absolute left-4 top-1/2 transform -translate-y-1/2 z-50 p-3 rounded-full transition-all duration-300 ${
      controlsVisible ? "opacity-100" : "opacity-0 pointer-events-none"
    }`}
    style={{
      backgroundColor: "rgba(0, 0, 0, 0.5)",
      color: "var(--text-primary)",
    }}
    aria-label="Previous image"
  >
    <ChevronLeft size={32} />
  </button>
)}
```

(Same pattern for Next button)

**Step 11: Add MetadataDrawer at end of component**

Before the closing `</div>` of the main container, add:

```jsx
{/* Metadata Drawer */}
<MetadataDrawer
  open={drawerOpen}
  onClose={() => setDrawerOpen(false)}
  image={currentImage}
  rating={rating}
  isFavorite={isFavorite}
  oCounter={oCounter}
  onRatingClick={() => setIsRatingPopoverOpen(true)}
  onFavoriteChange={handleFavoriteChange}
  onOCounterChange={handleOCounterChange}
/>
```

**Step 12: Verify lint passes**

Run:
```bash
cd client && npm run lint
```

Expected: No errors

**Step 13: Commit**

```bash
git add client/src/components/ui/Lightbox.jsx
git commit -m "feat: add swipe gestures, fullscreen, and metadata drawer to Lightbox"
```

---

## Task 5: Manual Testing Checklist

**Files:** None (testing only)

**Step 1: Start dev server**

Run:
```bash
cd client && npm run dev
```

**Step 2: Test on desktop browser**

- [ ] Open any gallery and click an image to open lightbox
- [ ] Press `i` key - drawer should open
- [ ] Press `i` again - drawer should close
- [ ] Press `f` key - should go fullscreen
- [ ] Press `f` again - should exit fullscreen
- [ ] Press `Escape` with drawer open - drawer closes, lightbox stays
- [ ] Press `Escape` with drawer closed - lightbox closes
- [ ] Click Info button - drawer opens
- [ ] Click Fullscreen button - goes fullscreen
- [ ] Mouse movement resets auto-hide timer
- [ ] After 3s of no mouse movement, controls fade out
- [ ] Click on image toggles controls visibility

**Step 3: Test on mobile (or Chrome DevTools mobile emulation)**

- [ ] Swipe left - next image
- [ ] Swipe right - previous image
- [ ] Swipe up - drawer opens
- [ ] Swipe down (drawer open) - drawer closes
- [ ] Swipe down (drawer closed) - lightbox closes
- [ ] Tap image - controls toggle
- [ ] Performers in drawer are horizontally scrollable
- [ ] Tags in drawer display correctly
- [ ] Clicking performer/tag link closes lightbox and navigates

**Step 4: Test edge cases**

- [ ] Lightbox with single image - no nav arrows
- [ ] Image without performers - no performers section in drawer
- [ ] Image without tags - no tags section in drawer
- [ ] Image without studio - subtitle shows only date/resolution
- [ ] Rating/favorite/O-counter work in drawer

**Step 5: Commit any fixes found during testing**

```bash
git add -A
git commit -m "fix: address issues found during lightbox testing"
```

---

## Task 6: Final cleanup and PR preparation

**Files:**
- Modify: `docs/plans/2024-12-29-lightbox-enhancements-design.md` (add implementation notes)

**Step 1: Run full lint check**

Run:
```bash
cd client && npm run lint
```

Expected: No errors

**Step 2: Run tests**

Run:
```bash
cd client && npm run test:run
```

Expected: All tests pass

**Step 3: Build check**

Run:
```bash
cd client && npm run build
```

Expected: Build succeeds

**Step 4: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final cleanup for lightbox enhancements"
```

**Step 5: Push branch**

```bash
git push -u origin feature/lightbox-enhancements-design
```

---

## Summary

| Task | Description | Est. Complexity |
|------|-------------|-----------------|
| 1 | Add react-swipeable dependency | Low |
| 2 | Create useFullscreen hook | Low |
| 3 | Create MetadataDrawer component | Medium |
| 4 | Add swipe gestures to Lightbox | High |
| 5 | Manual testing | Medium |
| 6 | Final cleanup and PR | Low |

Total: 6 tasks with frequent commits for easy rollback if needed.
