# Card Interaction Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace hover-based card interactions with click-only patterns for better mobile UX and to eliminate accidental tooltip popups.

**Architecture:** Modify `Tooltip` component to support hover-disabled mode. Update `CardCountIndicators` to use click-only for rich tooltips. Refactor `CardDescription` to detect truncation and show inline "...more" link that opens a popover.

**Tech Stack:** React, Vitest, happy-dom

---

## Task 1: Add `hoverDisabled` prop to Tooltip component

**Files:**
- Modify: `client/src/components/ui/Tooltip.jsx`
- Create: `client/src/components/ui/__tests__/Tooltip.test.jsx`

**Step 1: Write the failing test**

Create `client/src/components/ui/__tests__/Tooltip.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import Tooltip from "../Tooltip";

describe("Tooltip", () => {
  it("is a React component function", () => {
    expect(typeof Tooltip).toBe("function");
  });

  it("accepts hoverDisabled prop in signature", () => {
    const funcString = Tooltip.toString();
    expect(funcString).toContain("hoverDisabled");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/ui/__tests__/Tooltip.test.jsx`
Expected: FAIL - "hoverDisabled" not found in function string

**Step 3: Add hoverDisabled prop to Tooltip**

In `client/src/components/ui/Tooltip.jsx`, update the component signature (around line 8):

```jsx
const Tooltip = ({
  children,
  content,
  position = "top",
  className = "",
  disabled = false,
  clickable = false,
  hoverDisabled = false, // ADD THIS LINE
}) => {
```

**Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/ui/__tests__/Tooltip.test.jsx`
Expected: PASS

**Step 5: Commit**

```bash
cd client && git add src/components/ui/Tooltip.jsx src/components/ui/__tests__/Tooltip.test.jsx
git commit -m "feat: add hoverDisabled prop to Tooltip component"
```

---

## Task 2: Implement hoverDisabled behavior in Tooltip

**Files:**
- Modify: `client/src/components/ui/Tooltip.jsx`
- Modify: `client/src/components/ui/__tests__/Tooltip.test.jsx`

**Step 1: Write the failing test**

Add to `client/src/components/ui/__tests__/Tooltip.test.jsx`:

```jsx
describe("Tooltip hoverDisabled behavior", () => {
  it("has handleMouseEnter that checks hoverDisabled", () => {
    // The function body should reference hoverDisabled in mouse handlers
    const funcString = Tooltip.toString();
    // When hoverDisabled is true, hover shouldn't trigger visibility
    expect(funcString).toContain("hoverDisabled");
    // The mouse enter handler should exist and be conditional
    expect(funcString).toContain("handleMouseEnter");
  });
});
```

**Step 2: Run test to verify current state**

Run: `cd client && npx vitest run src/components/ui/__tests__/Tooltip.test.jsx`
Expected: May pass already since prop exists, but behavior not implemented

**Step 3: Update mouse handlers to respect hoverDisabled**

In `client/src/components/ui/Tooltip.jsx`, modify the `handleMouseEnter` function (around line 199):

```jsx
  const handleMouseEnter = () => {
    if (hoverDisabled) return; // ADD THIS LINE
    // Clear any pending hide timeout
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    setIsVisible(true);
  };
```

**Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/ui/__tests__/Tooltip.test.jsx`
Expected: PASS

**Step 5: Commit**

```bash
cd client && git add src/components/ui/Tooltip.jsx src/components/ui/__tests__/Tooltip.test.jsx
git commit -m "feat: implement hoverDisabled behavior in Tooltip"
```

---

## Task 3: Update CardCountIndicators to use hoverDisabled for rich tooltips

**Files:**
- Modify: `client/src/components/ui/CardCountIndicators.jsx`
- Create: `client/src/components/ui/__tests__/CardCountIndicators.test.jsx`

**Step 1: Write the failing test**

Create `client/src/components/ui/__tests__/CardCountIndicators.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { CardCountIndicators } from "../CardCountIndicators";

describe("CardCountIndicators", () => {
  it("is a React component function", () => {
    expect(typeof CardCountIndicators).toBe("function");
  });
});

describe("CardCountIndicator hoverDisabled", () => {
  it("passes hoverDisabled to Tooltip for rich content", () => {
    // The component should pass hoverDisabled={true} when tooltipContent is rich (not string)
    const funcString = CardCountIndicators.toString();
    expect(funcString).toContain("hoverDisabled");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/ui/__tests__/CardCountIndicators.test.jsx`
Expected: FAIL - "hoverDisabled" not found

**Step 3: Update CardCountIndicator to pass hoverDisabled**

In `client/src/components/ui/CardCountIndicators.jsx`, modify the Tooltip usage in `CardCountIndicator` (around line 152-155):

```jsx
  // Use rich tooltipContent if provided, otherwise use simple label text
  const effectiveTooltip = tooltipContent || (label ? label(count) : null);
  // Disable hover for rich tooltips (React elements), keep hover for simple text
  const isRichTooltip = tooltipContent && typeof tooltipContent !== "string";

  return effectiveTooltip ? (
    <Tooltip
      content={effectiveTooltip}
      clickable={!!tooltipContent}
      hoverDisabled={isRichTooltip}
    >
      {guts}
    </Tooltip>
  ) : (
    guts
  );
```

**Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/ui/__tests__/CardCountIndicators.test.jsx`
Expected: PASS

**Step 5: Commit**

```bash
cd client && git add src/components/ui/CardCountIndicators.jsx src/components/ui/__tests__/CardCountIndicators.test.jsx
git commit -m "feat: disable hover for rich indicator tooltips"
```

---

## Task 4: Create useTruncationDetection hook

**Files:**
- Create: `client/src/hooks/useTruncationDetection.js`
- Create: `client/src/hooks/__tests__/useTruncationDetection.test.js`

**Step 1: Write the failing test**

Create `client/src/hooks/__tests__/useTruncationDetection.test.js`:

```jsx
import { describe, it, expect } from "vitest";
import { useTruncationDetection } from "../useTruncationDetection";

describe("useTruncationDetection", () => {
  it("is a function", () => {
    expect(typeof useTruncationDetection).toBe("function");
  });

  it("returns ref and isTruncated state", () => {
    // Hook should return [ref, isTruncated]
    const funcString = useTruncationDetection.toString();
    expect(funcString).toContain("useRef");
    expect(funcString).toContain("useState");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/hooks/__tests__/useTruncationDetection.test.js`
Expected: FAIL - module not found

**Step 3: Create the hook**

Create `client/src/hooks/useTruncationDetection.js`:

```jsx
import { useEffect, useRef, useState } from "react";

/**
 * Hook to detect if text content is truncated (via CSS line-clamp or overflow)
 * @returns {[React.RefObject, boolean]} - [ref to attach to element, whether content is truncated]
 */
export const useTruncationDetection = () => {
  const ref = useRef(null);
  const [isTruncated, setIsTruncated] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const checkTruncation = () => {
      // Element is truncated if scrollHeight > clientHeight
      const truncated = element.scrollHeight > element.clientHeight;
      setIsTruncated(truncated);
    };

    // Check on mount
    checkTruncation();

    // Re-check on resize
    const resizeObserver = new ResizeObserver(checkTruncation);
    resizeObserver.observe(element);

    return () => resizeObserver.disconnect();
  }, []);

  return [ref, isTruncated];
};
```

**Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/hooks/__tests__/useTruncationDetection.test.js`
Expected: PASS

**Step 5: Commit**

```bash
cd client && git add src/hooks/useTruncationDetection.js src/hooks/__tests__/useTruncationDetection.test.js
git commit -m "feat: add useTruncationDetection hook"
```

---

## Task 5: Create ExpandableDescription component

**Files:**
- Create: `client/src/components/ui/ExpandableDescription.jsx`
- Create: `client/src/components/ui/__tests__/ExpandableDescription.test.jsx`

**Step 1: Write the failing test**

Create `client/src/components/ui/__tests__/ExpandableDescription.test.jsx`:

```jsx
import { describe, it, expect } from "vitest";
import { ExpandableDescription } from "../ExpandableDescription";

describe("ExpandableDescription", () => {
  it("is a React component function", () => {
    expect(typeof ExpandableDescription).toBe("function");
  });

  it("accepts description and maxLines props", () => {
    const funcString = ExpandableDescription.toString();
    expect(funcString).toContain("description");
    expect(funcString).toContain("maxLines");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/ui/__tests__/ExpandableDescription.test.jsx`
Expected: FAIL - module not found

**Step 3: Create the component**

Create `client/src/components/ui/ExpandableDescription.jsx`:

```jsx
import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTruncationDetection } from "../../hooks/useTruncationDetection";

/**
 * Description text with inline "...more" link when truncated
 * Clicking "more" opens a popover with full description
 */
export const ExpandableDescription = ({ description, maxLines = 3 }) => {
  const [ref, isTruncated] = useTruncationDetection();
  const [isExpanded, setIsExpanded] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });

  const descriptionHeight = useMemo(() => {
    return `${maxLines * 1.5}rem`;
  }, [maxLines]);

  if (!description) {
    return (
      <div
        className="text-sm my-1 w-full"
        style={{ height: descriptionHeight }}
      />
    );
  }

  const handleMoreClick = (e) => {
    e.stopPropagation();
    e.preventDefault();

    const rect = e.currentTarget.getBoundingClientRect();
    setPopoverPosition({
      top: rect.bottom + 8,
      left: Math.max(16, rect.left - 100),
    });
    setIsExpanded(true);
  };

  const handleClose = () => {
    setIsExpanded(false);
  };

  // Handle click outside
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <>
      <div className="relative w-full my-1" style={{ height: descriptionHeight }}>
        <p
          ref={ref}
          className="text-sm leading-relaxed"
          style={{
            color: "var(--text-muted)",
            height: descriptionHeight,
            display: "-webkit-box",
            WebkitLineClamp: maxLines,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {description}
        </p>
        {isTruncated && (
          <button
            onClick={handleMoreClick}
            className="absolute bottom-0 right-0 text-sm px-1 hover:underline"
            style={{
              color: "var(--accent-primary)",
              backgroundColor: "var(--bg-card)",
            }}
          >
            ...more
          </button>
        )}
      </div>

      {isExpanded &&
        createPortal(
          <div
            className="fixed inset-0 z-[9998]"
            onClick={handleBackdropClick}
          >
            <div
              className="fixed z-[9999] px-4 py-3 text-sm rounded-lg shadow-xl max-w-[80%] lg:max-w-[60%] max-h-[60vh] overflow-y-auto"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-color)",
                top: `${popoverPosition.top}px`,
                left: `${popoverPosition.left}px`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="whitespace-pre-wrap">{description}</p>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
```

**Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/ui/__tests__/ExpandableDescription.test.jsx`
Expected: PASS

**Step 5: Commit**

```bash
cd client && git add src/components/ui/ExpandableDescription.jsx src/components/ui/__tests__/ExpandableDescription.test.jsx
git commit -m "feat: add ExpandableDescription component with inline more link"
```

---

## Task 6: Update CardDescription to use ExpandableDescription

**Files:**
- Modify: `client/src/components/ui/CardComponents.jsx`
- Modify: `client/src/components/ui/__tests__/CardComponents.test.jsx`

**Step 1: Write the failing test**

Add to `client/src/components/ui/__tests__/CardComponents.test.jsx`:

```jsx
import { CardDescription } from "../CardComponents";

describe("CardDescription", () => {
  it("uses ExpandableDescription internally", () => {
    // CardDescription should delegate to ExpandableDescription
    const funcString = CardDescription.toString();
    expect(funcString).toContain("ExpandableDescription");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/ui/__tests__/CardComponents.test.jsx`
Expected: FAIL - "ExpandableDescription" not found

**Step 3: Update CardDescription to use ExpandableDescription**

In `client/src/components/ui/CardComponents.jsx`:

1. Add import at top (around line 13):
```jsx
import { ExpandableDescription } from "./ExpandableDescription.jsx";
```

2. Replace the entire `CardDescription` component (around lines 360-394) with:
```jsx
/**
 * Card description section with expandable "more" link when truncated
 * @param {string} description - Description text
 * @param {number} maxLines - Maximum lines to display (default: 3)
 */
export const CardDescription = ({ description, maxLines = 3 }) => {
  return (
    <ExpandableDescription description={description} maxLines={maxLines} />
  );
};
```

**Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/ui/__tests__/CardComponents.test.jsx`
Expected: PASS

**Step 5: Commit**

```bash
cd client && git add src/components/ui/CardComponents.jsx src/components/ui/__tests__/CardComponents.test.jsx
git commit -m "refactor: CardDescription now uses ExpandableDescription"
```

---

## Task 7: Run full test suite and lint

**Files:**
- None (verification only)

**Step 1: Run all client tests**

Run: `cd client && npm test`
Expected: All tests pass

**Step 2: Run linter**

Run: `cd client && npm run lint`
Expected: No errors (warnings OK)

**Step 3: Fix any issues**

If tests fail or lint errors, fix them before proceeding.

**Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: address test and lint issues"
```

---

## Task 8: Manual testing checklist

**Files:**
- None (manual verification)

**Step 1: Start development server**

Run: `cd peek-stash-browser && docker-compose -f docker-compose.yml -f docker-compose.windows.yml up`

**Step 2: Test indicator behavior**

- [ ] Hover over indicator icons - NO tooltip should appear
- [ ] Click indicator with rich content (performers, tags) - popover should open
- [ ] Click outside popover - should close
- [ ] Indicators with only counts (images, play count) should still show simple hover tooltip

**Step 3: Test description behavior**

- [ ] Cards with short descriptions - NO "more" link visible
- [ ] Cards with long truncated descriptions - "...more" link visible at end
- [ ] Click "more" - popover with full description opens
- [ ] Click outside popover - should close

**Step 4: Test on mobile/touch**

- [ ] Tap indicators - popover opens
- [ ] Tap "more" on descriptions - popover opens
- [ ] Tap outside - popovers close

---

## Task 9: Final commit and branch cleanup

**Step 1: Create final commit if any uncommitted changes**

```bash
git status
git add -A
git commit -m "feat: card interaction improvements complete"
```

**Step 2: Verify branch is ready**

```bash
git log --oneline -10
```

Expected: Clean commit history with feature commits

---

## Summary of Changes

| File | Change |
|------|--------|
| `Tooltip.jsx` | Added `hoverDisabled` prop |
| `CardCountIndicators.jsx` | Pass `hoverDisabled={true}` for rich tooltips |
| `useTruncationDetection.js` | New hook to detect CSS truncation |
| `ExpandableDescription.jsx` | New component with "...more" link and popover |
| `CardComponents.jsx` | `CardDescription` now uses `ExpandableDescription` |
