# Unified Card Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Unify SceneCard with other cards by moving selection mode and keyboard handling to BaseCard, allowing SceneCard to use `linkTo` for navigation like all other cards.

**Architecture:** Extract long-press selection and keyboard navigation into a reusable hook (`useCardSelection`). BaseCard consumes this hook and passes selection-aware click handlers to CardImage/CardTitle. SceneCard becomes a thin wrapper that only provides its unique render slots (preview, overlay).

**Tech Stack:** React hooks, React Router Links, existing CardComponents primitives

---

## Current State

### SceneCard Complexity
- **432 lines** total
- ~130 lines of gesture/selection handlers that duplicate what BaseCard should provide
- Uses `onClick` pattern instead of `linkTo`
- Only truly unique parts: `renderImageContent` (SceneCardPreview) and `renderOverlay` (checkbox + progress bar)

### The Problem
After refactoring cards to use explicit navigation zones (CardImage/CardTitle as Links), SceneCard broke because it doesn't use `linkTo`. BaseCard doesn't pass `onClick` to CardImage, so clicks on image area have no handler.

---

## Task 1: Create `useCardSelection` Hook

**Files:**
- Create: `client/src/hooks/useCardSelection.js`
- Create: `client/src/hooks/__tests__/useCardSelection.test.js`

### Step 1: Write the failing test for long-press detection

```javascript
// client/src/hooks/__tests__/useCardSelection.test.js
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useCardSelection } from "../useCardSelection.js";

describe("useCardSelection", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls onToggleSelect after 500ms long-press", () => {
    const onToggleSelect = vi.fn();
    const entity = { id: "1", name: "Test" };

    const { result } = renderHook(() =>
      useCardSelection({
        entity,
        selectionMode: false,
        onToggleSelect,
      })
    );

    // Simulate mousedown
    act(() => {
      result.current.selectionHandlers.onMouseDown({ target: document.body });
    });

    // Advance 500ms
    act(() => {
      vi.advanceTimersByTime(500);
    });

    expect(onToggleSelect).toHaveBeenCalledWith(entity);
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd client && npm test -- --run useCardSelection`
Expected: FAIL with "useCardSelection is not defined" or similar

### Step 3: Write minimal implementation

```javascript
// client/src/hooks/useCardSelection.js
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hook for card selection behavior: long-press to select, selection mode click handling
 * @param {Object} options
 * @param {Object} options.entity - The entity object (for onToggleSelect callback)
 * @param {boolean} options.selectionMode - Whether selection mode is active
 * @param {Function} options.onToggleSelect - Callback when entity should be toggled
 * @returns {Object} - { isLongPressing, selectionHandlers, handleNavigationClick }
 */
export const useCardSelection = ({
  entity,
  selectionMode = false,
  onToggleSelect,
}) => {
  const longPressTimerRef = useRef(null);
  const [isLongPressing, setIsLongPressing] = useState(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const hasMovedRef = useRef(false);

  // Clear timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  const isInteractiveElement = useCallback((target) => {
    const closestButton = target.closest("button");
    const isButton = closestButton && closestButton !== target;
    const isLink = target.closest("a");
    const isInput = target.closest("input");
    return isButton || isLink || isInput;
  }, []);

  const handleMouseDown = useCallback(
    (e) => {
      if (isInteractiveElement(e.target)) return;

      longPressTimerRef.current = setTimeout(() => {
        setIsLongPressing(true);
        onToggleSelect?.(entity);
      }, 500);
    },
    [entity, onToggleSelect, isInteractiveElement]
  );

  const handleMouseUp = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  }, []);

  const handleTouchStart = useCallback(
    (e) => {
      if (isInteractiveElement(e.target)) return;

      const touch = e.touches[0];
      startPosRef.current = { x: touch.clientX, y: touch.clientY };
      hasMovedRef.current = false;

      longPressTimerRef.current = setTimeout(() => {
        if (!hasMovedRef.current) {
          setIsLongPressing(true);
          onToggleSelect?.(entity);
        }
      }, 500);
    },
    [entity, onToggleSelect, isInteractiveElement]
  );

  const handleTouchMove = useCallback((e) => {
    if (longPressTimerRef.current && e.touches.length > 0) {
      const touch = e.touches[0];
      const deltaX = Math.abs(touch.clientX - startPosRef.current.x);
      const deltaY = Math.abs(touch.clientY - startPosRef.current.y);
      const moveThreshold = 10;

      if (deltaX > moveThreshold || deltaY > moveThreshold) {
        hasMovedRef.current = true;
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    hasMovedRef.current = false;
  }, []);

  // Click handler for navigation elements (CardImage, CardTitle)
  // Returns a function to pass as onClick, or undefined if not needed
  const handleNavigationClick = useCallback(
    (e) => {
      // If long-press just fired, block the click
      if (isLongPressing) {
        e.preventDefault();
        setIsLongPressing(false);
        return;
      }

      // In selection mode, toggle instead of navigate
      if (selectionMode) {
        e.preventDefault();
        onToggleSelect?.(entity);
      }
      // Otherwise, let the Link navigate normally
    },
    [isLongPressing, selectionMode, entity, onToggleSelect]
  );

  return {
    isLongPressing,
    selectionHandlers: {
      onMouseDown: handleMouseDown,
      onMouseUp: handleMouseUp,
      onMouseLeave: handleMouseUp,
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd,
      onTouchCancel: handleTouchEnd,
    },
    handleNavigationClick: selectionMode || isLongPressing ? handleNavigationClick : undefined,
  };
};
```

### Step 4: Run test to verify it passes

Run: `cd client && npm test -- --run useCardSelection`
Expected: PASS

### Step 5: Add more tests for edge cases

```javascript
// Add to the test file:

it("cancels long-press on mouseup before 500ms", () => {
  const onToggleSelect = vi.fn();
  const entity = { id: "1" };

  const { result } = renderHook(() =>
    useCardSelection({ entity, selectionMode: false, onToggleSelect })
  );

  act(() => {
    result.current.selectionHandlers.onMouseDown({ target: document.body });
  });

  act(() => {
    vi.advanceTimersByTime(300);
  });

  act(() => {
    result.current.selectionHandlers.onMouseUp();
  });

  act(() => {
    vi.advanceTimersByTime(300);
  });

  expect(onToggleSelect).not.toHaveBeenCalled();
});

it("cancels long-press on touch move > 10px", () => {
  const onToggleSelect = vi.fn();
  const entity = { id: "1" };

  const { result } = renderHook(() =>
    useCardSelection({ entity, selectionMode: false, onToggleSelect })
  );

  act(() => {
    result.current.selectionHandlers.onTouchStart({
      target: document.body,
      touches: [{ clientX: 100, clientY: 100 }],
    });
  });

  act(() => {
    vi.advanceTimersByTime(300);
  });

  act(() => {
    result.current.selectionHandlers.onTouchMove({
      touches: [{ clientX: 115, clientY: 100 }],
    });
  });

  act(() => {
    vi.advanceTimersByTime(300);
  });

  expect(onToggleSelect).not.toHaveBeenCalled();
});

it("returns handleNavigationClick when in selectionMode", () => {
  const onToggleSelect = vi.fn();
  const entity = { id: "1" };

  const { result } = renderHook(() =>
    useCardSelection({ entity, selectionMode: true, onToggleSelect })
  );

  expect(result.current.handleNavigationClick).toBeDefined();
});

it("returns undefined handleNavigationClick when not in selectionMode", () => {
  const onToggleSelect = vi.fn();
  const entity = { id: "1" };

  const { result } = renderHook(() =>
    useCardSelection({ entity, selectionMode: false, onToggleSelect })
  );

  expect(result.current.handleNavigationClick).toBeUndefined();
});

it("handleNavigationClick prevents default and toggles in selection mode", () => {
  const onToggleSelect = vi.fn();
  const entity = { id: "1" };
  const preventDefault = vi.fn();

  const { result } = renderHook(() =>
    useCardSelection({ entity, selectionMode: true, onToggleSelect })
  );

  act(() => {
    result.current.handleNavigationClick({ preventDefault });
  });

  expect(preventDefault).toHaveBeenCalled();
  expect(onToggleSelect).toHaveBeenCalledWith(entity);
});
```

### Step 6: Run all hook tests

Run: `cd client && npm test -- --run useCardSelection`
Expected: All PASS

### Step 7: Commit

```bash
git add client/src/hooks/useCardSelection.js client/src/hooks/__tests__/useCardSelection.test.js
git commit -m "$(cat <<'EOF'
feat: add useCardSelection hook for long-press and selection mode

Extracts selection behavior from SceneCard into a reusable hook:
- Long-press detection (500ms) for mouse and touch
- Touch move cancellation (>10px movement)
- Selection mode click interception
- Returns handlers for CardContainer and navigation click override
EOF
)"
```

---

## Task 2: Create `useCardKeyboardNav` Hook

**Files:**
- Create: `client/src/hooks/useCardKeyboardNav.js`
- Create: `client/src/hooks/__tests__/useCardKeyboardNav.test.js`

### Step 1: Write the failing test

```javascript
// client/src/hooks/__tests__/useCardKeyboardNav.test.js
import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { useCardKeyboardNav } from "../useCardKeyboardNav.js";
import { useNavigate } from "react-router-dom";

vi.mock("react-router-dom", () => ({
  useNavigate: vi.fn(),
}));

describe("useCardKeyboardNav", () => {
  it("navigates on Enter key", () => {
    const navigate = vi.fn();
    useNavigate.mockReturnValue(navigate);

    const { result } = renderHook(() =>
      useCardKeyboardNav({ linkTo: "/scene/123" })
    );

    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    result.current.onKeyDown({
      key: "Enter",
      preventDefault,
      stopPropagation,
      target: document.body,
      currentTarget: document.body,
    });

    expect(preventDefault).toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith("/scene/123");
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd client && npm test -- --run useCardKeyboardNav`
Expected: FAIL

### Step 3: Write minimal implementation

```javascript
// client/src/hooks/useCardKeyboardNav.js
import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/**
 * Hook for card keyboard navigation (TV mode support)
 * @param {Object} options
 * @param {string} options.linkTo - Navigation URL
 * @param {Function} options.onCustomAction - Optional override action
 * @returns {Object} - { onKeyDown }
 */
export const useCardKeyboardNav = ({ linkTo, onCustomAction }) => {
  const navigate = useNavigate();

  const onKeyDown = useCallback(
    (e) => {
      // Only handle if card (or child) is focused
      if (
        e.currentTarget !== document.activeElement &&
        !e.currentTarget.contains(document.activeElement)
      ) {
        return;
      }

      // Ignore if in input field
      const target = e.target;
      const isInputField =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      if (isInputField) return;

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();

        if (onCustomAction) {
          onCustomAction();
        } else if (linkTo) {
          navigate(linkTo);
        }
      }
    },
    [linkTo, onCustomAction, navigate]
  );

  return { onKeyDown };
};
```

### Step 4: Run test to verify it passes

Run: `cd client && npm test -- --run useCardKeyboardNav`
Expected: PASS

### Step 5: Add more tests

```javascript
// Add to test file:

it("navigates on Space key", () => {
  const navigate = vi.fn();
  useNavigate.mockReturnValue(navigate);

  const { result } = renderHook(() =>
    useCardKeyboardNav({ linkTo: "/scene/123" })
  );

  result.current.onKeyDown({
    key: " ",
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target: document.body,
    currentTarget: document.body,
  });

  expect(navigate).toHaveBeenCalledWith("/scene/123");
});

it("calls onCustomAction instead of navigate when provided", () => {
  const navigate = vi.fn();
  const onCustomAction = vi.fn();
  useNavigate.mockReturnValue(navigate);

  const { result } = renderHook(() =>
    useCardKeyboardNav({ linkTo: "/scene/123", onCustomAction })
  );

  result.current.onKeyDown({
    key: "Enter",
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target: document.body,
    currentTarget: document.body,
  });

  expect(onCustomAction).toHaveBeenCalled();
  expect(navigate).not.toHaveBeenCalled();
});

it("ignores key events on input fields", () => {
  const navigate = vi.fn();
  useNavigate.mockReturnValue(navigate);

  const { result } = renderHook(() =>
    useCardKeyboardNav({ linkTo: "/scene/123" })
  );

  const input = document.createElement("input");

  result.current.onKeyDown({
    key: "Enter",
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    target: input,
    currentTarget: document.body,
  });

  expect(navigate).not.toHaveBeenCalled();
});
```

### Step 6: Run all tests

Run: `cd client && npm test -- --run useCardKeyboardNav`
Expected: All PASS

### Step 7: Commit

```bash
git add client/src/hooks/useCardKeyboardNav.js client/src/hooks/__tests__/useCardKeyboardNav.test.js
git commit -m "$(cat <<'EOF'
feat: add useCardKeyboardNav hook for TV mode navigation

Handles Enter/Space key navigation for cards:
- Navigates to linkTo URL on keypress
- Supports custom action override
- Ignores events on input fields
- Only activates when card is focused
EOF
)"
```

---

## Task 3: Update CardImage to Support Click Override

**Files:**
- Modify: `client/src/components/ui/CardComponents.jsx` (CardImage section, ~lines 89-211)

### Step 1: Write failing test

```javascript
// Add to client/src/components/ui/__tests__/CardComponents.test.jsx
// (or create if doesn't exist)

describe("CardImage", () => {
  it("calls onClickOverride when clicking Link", () => {
    const onClickOverride = vi.fn((e) => e.preventDefault());

    render(
      <MemoryRouter>
        <CardImage
          src="/test.jpg"
          linkTo="/scene/1"
          onClickOverride={onClickOverride}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole("link"));
    expect(onClickOverride).toHaveBeenCalled();
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd client && npm test -- --run CardComponents`
Expected: FAIL (onClickOverride not implemented)

### Step 3: Update CardImage implementation

In `CardComponents.jsx`, update the CardImage component to accept `onClickOverride`:

```jsx
export const CardImage = ({
  src,
  alt = "",
  aspectRatio = "16/9",
  entityType,
  objectFit = "contain",
  children,
  className = "",
  style = {},
  onClick,
  linkTo,
  referrerUrl,
  onClickOverride,  // NEW: intercepts clicks before Link navigation
}) => {
  // ... existing code ...

  // If linkTo provided, wrap in Link; otherwise use div with onClick
  if (linkTo) {
    return (
      <Link
        ref={ref}
        to={linkTo}
        state={{ referrerUrl }}
        className={containerClasses}
        style={containerStyle}
        onClick={onClickOverride}  // NEW: onClick on Link itself
      >
        {imageContent}
        {children}
      </Link>
    );
  }

  // ... rest unchanged ...
};
```

### Step 4: Run test to verify it passes

Run: `cd client && npm test -- --run CardComponents`
Expected: PASS

### Step 5: Commit

```bash
git add client/src/components/ui/CardComponents.jsx client/src/components/ui/__tests__/CardComponents.test.jsx
git commit -m "feat(CardImage): add onClickOverride prop for selection mode"
```

---

## Task 4: Update CardTitle to Support Click Override

**Files:**
- Modify: `client/src/components/ui/CardComponents.jsx` (CardTitle section, ~lines 296-382)

### Step 1: Write failing test

```javascript
// Add to CardComponents.test.jsx

describe("CardTitle", () => {
  it("calls onClickOverride when clicking title Link", () => {
    const onClickOverride = vi.fn((e) => e.preventDefault());

    render(
      <MemoryRouter>
        <CardTitle
          title="Test Title"
          linkTo="/scene/1"
          onClickOverride={onClickOverride}
        />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByText("Test Title"));
    expect(onClickOverride).toHaveBeenCalled();
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd client && npm test -- --run CardComponents`
Expected: FAIL

### Step 3: Update CardTitle implementation

```jsx
export const CardTitle = ({
  title,
  subtitle,
  hideSubtitle = false,
  maxTitleLines = 1,
  linkTo,
  referrerUrl,
  onClickOverride,  // NEW
}) => {
  // ... existing code ...

  // Wrap in Link if linkTo provided
  const titleContent = linkTo ? (
    <Link
      to={linkTo}
      state={{ referrerUrl }}
      className="block hover:underline cursor-pointer"
      onClick={onClickOverride}  // NEW
    >
      {titleElement}
    </Link>
  ) : (
    titleElement
  );

  // Subtitle also gets the override
  const subtitleContent = linkTo && subtitleElement ? (
    <Link
      to={linkTo}
      state={{ referrerUrl }}
      className="block cursor-pointer"
      onClick={onClickOverride}  // NEW
    >
      {subtitleElement}
    </Link>
  ) : (
    subtitleElement
  );

  // ... rest unchanged ...
};
```

### Step 4: Run test to verify it passes

Run: `cd client && npm test -- --run CardComponents`
Expected: PASS

### Step 5: Commit

```bash
git add client/src/components/ui/CardComponents.jsx
git commit -m "feat(CardTitle): add onClickOverride prop for selection mode"
```

---

## Task 5: Update BaseCard to Use Selection Hooks

**Files:**
- Modify: `client/src/components/ui/BaseCard.jsx`

### Step 1: Write failing test

```javascript
// Add to client/src/components/ui/__tests__/BaseCard.test.jsx

describe("BaseCard selection mode", () => {
  it("passes selection handlers to CardContainer", () => {
    const onToggleSelect = vi.fn();
    const entity = { id: "1" };

    render(
      <MemoryRouter>
        <BaseCard
          entityType="scene"
          entity={entity}
          linkTo="/scene/1"
          selectionMode={true}
          onToggleSelect={onToggleSelect}
        />
      </MemoryRouter>
    );

    // The card container should have the handlers attached
    const card = screen.getByLabelText("Scene");
    expect(card).toBeInTheDocument();
  });

  it("applies selected styling when isSelected", () => {
    render(
      <MemoryRouter>
        <BaseCard
          entityType="scene"
          entity={{ id: "1" }}
          linkTo="/scene/1"
          isSelected={true}
        />
      </MemoryRouter>
    );

    const card = screen.getByLabelText("Scene");
    expect(card).toHaveStyle({ borderColor: "var(--selection-color)" });
  });
});
```

### Step 2: Run test to verify it fails

Run: `cd client && npm test -- --run BaseCard`
Expected: FAIL

### Step 3: Update BaseCard implementation

```jsx
import { forwardRef } from "react";
import { useEntityImageAspectRatio } from "../../hooks/useEntityImageAspectRatio.js";
import { useCardSelection } from "../../hooks/useCardSelection.js";
import { useCardKeyboardNav } from "../../hooks/useCardKeyboardNav.js";
import {
  CardContainer,
  CardDescription,
  CardImage,
  CardIndicators,
  CardRatingRow,
  CardTitle,
} from "./CardComponents.jsx";

export const BaseCard = forwardRef(
  (
    {
      // Data
      entityType,
      entity,  // NEW: for selection callbacks
      imagePath,
      title,
      subtitle,
      description,
      linkTo,

      // Selection mode (NEW)
      selectionMode = false,
      isSelected = false,
      onToggleSelect,

      // ... rest of existing props ...
      indicators = [],
      ratingControlsProps,
      displayPreferences = {},
      hideDescription = false,
      hideSubtitle = false,
      maxTitleLines = 2,
      maxDescriptionLines = 3,
      objectFit = "contain",
      renderOverlay,
      renderImageContent,
      renderAfterTitle,
      onClick,
      className = "",
      referrerUrl,
      tabIndex,
      style,
      onFocus,
      ...rest
    },
    ref
  ) => {
    const aspectRatio = useEntityImageAspectRatio(entityType);

    // Selection hook
    const { selectionHandlers, handleNavigationClick } = useCardSelection({
      entity,
      selectionMode,
      onToggleSelect,
    });

    // Keyboard navigation hook
    const { onKeyDown } = useCardKeyboardNav({
      linkTo,
      onCustomAction: selectionMode ? () => onToggleSelect?.(entity) : undefined,
    });

    const shouldShowDescription = hideDescription === true
      ? false
      : (displayPreferences.showDescription ?? true);

    // Selection styling
    const selectionStyle = isSelected
      ? {
          borderColor: "var(--selection-color)",
          borderWidth: "2px",
        }
      : {};

    return (
      <CardContainer
        ref={ref}
        entityType={entityType}
        onClick={onClick}
        className={className}
        tabIndex={tabIndex}
        style={{ ...style, ...selectionStyle }}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        {...selectionHandlers}
        {...rest}
      >
        <CardImage
          src={imagePath}
          alt={typeof title === "string" ? title : ""}
          aspectRatio={aspectRatio}
          entityType={entityType}
          objectFit={objectFit}
          linkTo={linkTo}
          referrerUrl={referrerUrl}
          onClickOverride={handleNavigationClick}
        >
          {renderImageContent?.()}
          {renderOverlay?.()}
        </CardImage>

        <CardTitle
          title={title}
          subtitle={hideSubtitle ? null : subtitle}
          maxTitleLines={maxTitleLines}
          linkTo={linkTo}
          referrerUrl={referrerUrl}
          onClickOverride={handleNavigationClick}
        />

        {renderAfterTitle?.()}

        {shouldShowDescription && (
          <CardDescription
            description={description}
            maxLines={maxDescriptionLines}
          />
        )}

        {indicators.length > 0 && <CardIndicators indicators={indicators} />}

        {ratingControlsProps && (
          <CardRatingRow entityType={entityType} {...ratingControlsProps} />
        )}
      </CardContainer>
    );
  }
);

BaseCard.displayName = "BaseCard";

export default BaseCard;
```

### Step 4: Run tests to verify they pass

Run: `cd client && npm test -- --run BaseCard`
Expected: PASS

### Step 5: Run full test suite

Run: `cd client && npm test`
Expected: All tests pass

### Step 6: Commit

```bash
git add client/src/components/ui/BaseCard.jsx
git commit -m "$(cat <<'EOF'
feat(BaseCard): add selection mode and keyboard navigation support

- Integrates useCardSelection hook for long-press and selection
- Integrates useCardKeyboardNav hook for TV mode
- Passes onClickOverride to CardImage/CardTitle
- Applies selection styling when isSelected
- New props: entity, selectionMode, isSelected, onToggleSelect
EOF
)"
```

---

## Task 6: Refactor SceneCard

**Files:**
- Modify: `client/src/components/ui/SceneCard.jsx`

This is the major simplification. We remove all gesture handlers and let BaseCard handle them.

### Step 1: Document current line count

Run: `wc -l client/src/components/ui/SceneCard.jsx`
Expected: ~432 lines

### Step 2: Refactor SceneCard

The new SceneCard removes all gesture/keyboard handlers and uses `linkTo`:

```jsx
import { forwardRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTVMode } from "../../hooks/useTVMode.js";
import {
  formatDurationCompact,
  formatResolution,
  getSceneDescription,
  getSceneTitle,
} from "../../utils/format.js";
import { formatRelativeTime } from "../../utils/date.js";
import BaseCard from "./BaseCard.jsx";
import { SceneCardPreview, TooltipEntityGrid } from "./index.js";

const buildSceneSubtitle = (scene) => {
  const parts = [];
  if (scene.studio) parts.push(scene.studio.name);
  if (scene.code) parts.push(scene.code);
  const date = scene.date ? formatRelativeTime(scene.date) : null;
  if (date) parts.push(date);
  return parts.length > 0 ? parts.join(' • ') : null;
};

const computeAllTags = (scene) => {
  const tagMap = new Map();
  if (scene.tags) scene.tags.forEach((tag) => tagMap.set(tag.id, tag));
  if (scene.inheritedTags) scene.inheritedTags.forEach((tag) => tagMap.set(tag.id, tag));
  return Array.from(tagMap.values());
};

const SceneCard = forwardRef(
  (
    {
      scene,
      onClick,
      onFocus,
      tabIndex = -1,
      className = "",
      isSelected = false,
      onToggleSelect,
      selectionMode = false,
      autoplayOnScroll = false,
      hideRatingControls = false,
      onHideSuccess,
    },
    ref
  ) => {
    const { isTVMode } = useTVMode();
    const navigate = useNavigate();

    const title = getSceneTitle(scene);
    const description = getSceneDescription(scene);
    const subtitle = buildSceneSubtitle(scene);
    const duration = scene.files?.[0]?.duration
      ? formatDurationCompact(scene.files[0].duration)
      : null;
    const resolution =
      scene.files?.[0]?.width && scene.files?.[0]?.height
        ? formatResolution(scene.files[0].width, scene.files[0].height)
        : null;

    const allTags = useMemo(() => computeAllTags(scene), [scene]);

    const indicators = useMemo(() => {
      const performersTooltip = scene.performers?.length > 0 && (
        <TooltipEntityGrid entityType="performer" entities={scene.performers} title="Performers" />
      );
      const groupsTooltip = scene.groups?.length > 0 && (
        <TooltipEntityGrid entityType="group" entities={scene.groups} title="Collections" />
      );
      const tagsTooltip = allTags?.length > 0 && (
        <TooltipEntityGrid entityType="tag" entities={allTags} title="Tags" />
      );
      const galleriesTooltip = scene.galleries?.length > 0 && (
        <TooltipEntityGrid entityType="gallery" entities={scene.galleries} title="Galleries" />
      );

      return [
        { type: "PLAY_COUNT", count: scene.play_count, tooltipContent: "Times watched" },
        {
          type: "PERFORMERS",
          count: scene.performers?.length,
          tooltipContent: performersTooltip,
          onClick: scene.performers?.length > 0 ? () => navigate(`/performers?sceneId=${scene.id}`) : undefined,
        },
        {
          type: "GROUPS",
          count: scene.groups?.length,
          tooltipContent: groupsTooltip,
          onClick: scene.groups?.length > 0 ? () => navigate(`/collections?sceneId=${scene.id}`) : undefined,
        },
        {
          type: "GALLERIES",
          count: scene.galleries?.length,
          tooltipContent: galleriesTooltip,
          onClick: scene.galleries?.length > 0 ? () => navigate(`/galleries?sceneId=${scene.id}`) : undefined,
        },
        {
          type: "TAGS",
          count: allTags?.length,
          tooltipContent: tagsTooltip,
          onClick: allTags?.length > 0 ? () => navigate(`/tags?sceneId=${scene.id}`) : undefined,
        },
      ];
    }, [scene, allTags, navigate]);

    const handleCheckboxClick = (e) => {
      e.stopPropagation();
      onToggleSelect?.(scene);
    };

    const renderOverlay = () => (
      <div className="absolute top-2 left-2 z-20">
        <button
          onClick={handleCheckboxClick}
          className="w-8 h-8 sm:w-6 sm:h-6 rounded border-2 flex items-center justify-center transition-all"
          style={{
            backgroundColor: isSelected ? "var(--selection-color)" : "rgba(0, 0, 0, 0.5)",
            borderColor: isSelected ? "var(--selection-color)" : "rgba(255, 255, 255, 0.7)",
          }}
          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.borderColor = "rgba(255, 255, 255, 1)"; }}
          onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.7)"; }}
          aria-label={isSelected ? "Deselect scene" : "Select scene"}
        >
          {isSelected && (
            <svg className="w-5 h-5 sm:w-4 sm:h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>
      </div>
    );

    const renderImageContent = () => (
      <>
        {scene.paths?.screenshot && (
          <SceneCardPreview
            scene={scene}
            autoplayOnScroll={autoplayOnScroll}
            cycleInterval={600}
            spriteCount={10}
            duration={duration}
            resolution={resolution}
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none" />
        {scene.resumeTime && scene.files?.[0]?.duration && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50 pointer-events-none">
            <div
              className="h-full transition-all pointer-events-none"
              style={{
                width: `${Math.min(100, (scene.resumeTime / scene.files[0].duration) * 100)}%`,
                backgroundColor: "var(--status-success)",
              }}
            />
          </div>
        )}
      </>
    );

    return (
      <BaseCard
        ref={ref}
        entityType="scene"
        entity={scene}
        linkTo={`/scene/${scene.id}`}
        referrerUrl="/scenes"
        selectionMode={selectionMode}
        isSelected={isSelected}
        onToggleSelect={onToggleSelect}
        imagePath={scene.paths?.screenshot}
        title={title}
        subtitle={subtitle}
        description={description}
        indicators={indicators}
        ratingControlsProps={!hideRatingControls && {
          entityType: "scene",
          entityId: scene.id,
          initialRating: scene.rating,
          initialFavorite: scene.favorite || false,
          initialOCounter: scene.o_counter,
          entityTitle: title,
          onHideSuccess,
        }}
        renderOverlay={renderOverlay}
        renderImageContent={renderImageContent}
        className={`${isSelected ? "scene-card-selected" : ""} ${className}`}
        onClick={onClick}
        onFocus={onFocus}
        tabIndex={isTVMode ? tabIndex : -1}
      />
    );
  }
);

SceneCard.displayName = "SceneCard";

export default SceneCard;
```

### Step 3: Count new line count

Run: `wc -l client/src/components/ui/SceneCard.jsx`
Expected: ~180-200 lines (down from 432)

### Step 4: Run tests

Run: `cd client && npm test`
Expected: All tests pass

### Step 5: Manual verification

Test in browser:
1. Scene cards navigate on click (image or title)
2. Long-press enters selection mode
3. In selection mode, clicking toggles selection
4. Checkbox works independently
5. Video preview still works on hover
6. Progress bar still shows
7. Keyboard Enter/Space navigates (in TV mode)

### Step 6: Commit

```bash
git add client/src/components/ui/SceneCard.jsx
git commit -m "$(cat <<'EOF'
refactor(SceneCard): simplify by using BaseCard selection support

Major refactoring:
- Removed all gesture handlers (~120 lines)
- Now uses linkTo like all other cards
- Selection/keyboard handled by BaseCard hooks
- Keeps only unique render slots (preview, overlay)

Line count: 432 -> ~190 (~56% reduction)
EOF
)"
```

---

## Task 7: Final Verification and Cleanup

### Step 1: Run full test suite

Run: `cd client && npm test`
Expected: All tests pass

### Step 2: Run linter

Run: `cd client && npm run lint`
Expected: No errors

### Step 3: Manual smoke test all card types

Test each card type in browser:
- SceneCard: navigation, selection, preview, keyboard
- PerformerCard: navigation, indicators
- GalleryCard: navigation, indicators
- GroupCard: navigation, indicators
- StudioCard: navigation
- TagCard: navigation

### Step 4: Commit any cleanup

```bash
git add -A
git commit -m "chore: cleanup after unified card architecture refactor"
```

---

## Summary: What Changed

| File | Before | After | Change |
|------|--------|-------|--------|
| `SceneCard.jsx` | 432 lines | ~190 lines | **-242 lines (-56%)** |
| `useCardSelection.js` | (new) | ~100 lines | +100 lines |
| `useCardKeyboardNav.js` | (new) | ~40 lines | +40 lines |
| `BaseCard.jsx` | ~125 lines | ~145 lines | +20 lines |
| `CardComponents.jsx` | - | +4 lines | +4 lines (onClickOverride) |
| **Net** | | | **-78 lines, much DRYer** |

### SceneCard After Refactor

SceneCard is now a thin wrapper around BaseCard:
- **~40 lines**: Imports and helpers (buildSceneSubtitle, computeAllTags)
- **~35 lines**: Indicator definitions
- **~25 lines**: `renderOverlay` (checkbox)
- **~30 lines**: `renderImageContent` (preview + gradient + progress)
- **~30 lines**: BaseCard call with props
- **~30 lines**: Component boilerplate

Total: ~190 lines (down from 432 = **56% reduction**)

### What We Gained

1. **Any card can opt into selection mode** - just pass `selectionMode`, `isSelected`, `onToggleSelect`, `entity`
2. **Keyboard navigation on all cards** - automatic via `useCardKeyboardNav`
3. **Consistent architecture** - all cards use `linkTo` pattern
4. **Testable hooks** - selection and keyboard logic unit tested separately
5. **DRYer codebase** - gesture logic centralized, ~78 net lines removed
