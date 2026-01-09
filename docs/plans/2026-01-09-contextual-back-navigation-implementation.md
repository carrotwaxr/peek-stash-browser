# Contextual Back Navigation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Standardize back button navigation to use browser history with contextual "Back to {Page Title}" text.

**Architecture:** Create a `useNavigationState` hook that reads `fromPageTitle` from location state and provides `goBack()` + `backButtonText`. Update all navigation sources to pass current page title in state. Update all back buttons to use the hook.

**Tech Stack:** React, React Router v6, Vitest

---

## Task 1: Create useNavigationState Hook with Tests

**Files:**
- Create: `client/src/hooks/useNavigationState.js`
- Create: `client/src/hooks/__tests__/useNavigationState.test.jsx`

**Step 1: Write the failing tests**

```jsx
// client/src/hooks/__tests__/useNavigationState.test.jsx
import { renderHook } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { useNavigationState } from "../useNavigationState.js";

// Wrapper to provide router context with location state
const createWrapper = (initialEntries = ["/"], state = null) => {
  const entries = state
    ? [{ pathname: initialEntries[0], state }]
    : initialEntries;
  return ({ children }) => (
    <MemoryRouter initialEntries={entries}>{children}</MemoryRouter>
  );
};

describe("useNavigationState", () => {
  describe("backButtonText", () => {
    it("returns 'Back to {title}' when fromPageTitle is present", () => {
      const { result } = renderHook(() => useNavigationState(), {
        wrapper: createWrapper(["/performer/123"], { fromPageTitle: "Scenes" }),
      });

      expect(result.current.backButtonText).toBe("Back to Scenes");
    });

    it("returns 'Back' when fromPageTitle is missing", () => {
      const { result } = renderHook(() => useNavigationState(), {
        wrapper: createWrapper(["/performer/123"]),
      });

      expect(result.current.backButtonText).toBe("Back");
    });

    it("returns 'Back' when fromPageTitle is empty string", () => {
      const { result } = renderHook(() => useNavigationState(), {
        wrapper: createWrapper(["/performer/123"], { fromPageTitle: "" }),
      });

      expect(result.current.backButtonText).toBe("Back");
    });

    it("handles detail page names", () => {
      const { result } = renderHook(() => useNavigationState(), {
        wrapper: createWrapper(["/scene/456"], { fromPageTitle: "Jane Doe" }),
      });

      expect(result.current.backButtonText).toBe("Back to Jane Doe");
    });
  });

  describe("fromPageTitle", () => {
    it("exposes raw fromPageTitle from location state", () => {
      const { result } = renderHook(() => useNavigationState(), {
        wrapper: createWrapper(["/tag/789"], { fromPageTitle: "Performers" }),
      });

      expect(result.current.fromPageTitle).toBe("Performers");
    });

    it("returns undefined when not present", () => {
      const { result } = renderHook(() => useNavigationState(), {
        wrapper: createWrapper(["/tag/789"]),
      });

      expect(result.current.fromPageTitle).toBeUndefined();
    });
  });

  describe("goBack", () => {
    it("returns a function", () => {
      const { result } = renderHook(() => useNavigationState(), {
        wrapper: createWrapper(["/performer/123"]),
      });

      expect(typeof result.current.goBack).toBe("function");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npm test -- --run src/hooks/__tests__/useNavigationState.test.jsx`
Expected: FAIL with "Cannot find module '../useNavigationState.js'"

**Step 3: Write minimal implementation**

```javascript
// client/src/hooks/useNavigationState.js
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

/**
 * Hook for contextual back navigation.
 *
 * Reads `fromPageTitle` from location state (set by navigating pages)
 * and provides utilities for back navigation with contextual text.
 *
 * @returns {Object} { fromPageTitle, backButtonText, goBack }
 *
 * @example
 * const { goBack, backButtonText } = useNavigationState();
 * <Button onClick={goBack}>{backButtonText}</Button>
 */
export const useNavigationState = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Get the title of the page we came from
  const fromPageTitle = location.state?.fromPageTitle;

  // Generate back button text with graceful fallback
  const backButtonText =
    fromPageTitle && fromPageTitle.trim() !== ""
      ? `Back to ${fromPageTitle}`
      : "Back";

  // Go back using browser history
  const goBack = useCallback(() => {
    navigate(-1);
  }, [navigate]);

  return {
    fromPageTitle,
    backButtonText,
    goBack,
  };
};
```

**Step 4: Run test to verify it passes**

Run: `cd client && npm test -- --run src/hooks/__tests__/useNavigationState.test.jsx`
Expected: PASS (all 6 tests)

**Step 5: Commit**

```bash
git add client/src/hooks/useNavigationState.js client/src/hooks/__tests__/useNavigationState.test.jsx
git commit -m "feat: add useNavigationState hook for contextual back navigation"
```

---

## Task 2: Update Home Page Title

**Files:**
- Modify: `client/src/components/pages/Home.jsx:82`

**Step 1: Update usePageTitle call**

Change line 82 from:
```javascript
  usePageTitle(); // Sets "Peek"
```

To:
```javascript
  usePageTitle("Home");
```

**Step 2: Verify manually**

Run: `cd client && npm run dev`
Check: Browser tab shows "Home - Peek" on home page

**Step 3: Commit**

```bash
git add client/src/components/pages/Home.jsx
git commit -m "fix: set Home page title for back navigation context"
```

---

## Task 3: Update CardComponents to Use fromPageTitle

**Files:**
- Modify: `client/src/components/ui/CardComponents.jsx`

The CardComponents use `referrerUrl` in Link state. We need to change this to `fromPageTitle`.

**Step 1: Update CardImage component**

Find the prop definition around line 74:
```javascript
 * @param {string} [props.referrerUrl] - Referrer URL for navigation state
```

Change to:
```javascript
 * @param {string} [props.fromPageTitle] - Page title for back navigation context
```

Find the prop destructuring around line 88:
```javascript
  referrerUrl,
```

Change to:
```javascript
  fromPageTitle,
```

Find the Link state around line 172:
```javascript
        state={{ referrerUrl }}
```

Change to:
```javascript
        state={{ fromPageTitle }}
```

**Step 2: Update CardTitle component**

Find the prop definition around line 314:
```javascript
 * @param {string} [props.referrerUrl] - Referrer URL for navigation state
```

Change to:
```javascript
 * @param {string} [props.fromPageTitle] - Page title for back navigation context
```

Find the prop destructuring around line 323:
```javascript
  referrerUrl,
```

Change to:
```javascript
  fromPageTitle,
```

Find all Link state occurrences (lines ~356, ~388):
```javascript
      state={{ referrerUrl }}
```

Change each to:
```javascript
      state={{ fromPageTitle }}
```

**Step 3: Run linter**

Run: `cd client && npm run lint`
Expected: PASS (no errors)

**Step 4: Commit**

```bash
git add client/src/components/ui/CardComponents.jsx
git commit -m "refactor: rename referrerUrl to fromPageTitle in CardComponents"
```

---

## Task 4: Update BaseCard to Use fromPageTitle

**Files:**
- Modify: `client/src/components/ui/BaseCard.jsx`

**Step 1: Update prop name**

Find around line 57:
```javascript
      referrerUrl,
```

Change to:
```javascript
      fromPageTitle,
```

Find CardImage usage around line 116:
```javascript
          referrerUrl={referrerUrl}
```

Change to:
```javascript
          fromPageTitle={fromPageTitle}
```

Find CardTitle usage around line 131:
```javascript
          referrerUrl={referrerUrl}
```

Change to:
```javascript
          fromPageTitle={fromPageTitle}
```

**Step 2: Run linter**

Run: `cd client && npm run lint`
Expected: PASS

**Step 3: Commit**

```bash
git add client/src/components/ui/BaseCard.jsx
git commit -m "refactor: rename referrerUrl to fromPageTitle in BaseCard"
```

---

## Task 5: Update All Card Components

Update each card component to pass `fromPageTitle` instead of `referrerUrl`.

**Files:**
- Modify: `client/src/components/cards/PerformerCard.jsx`
- Modify: `client/src/components/cards/TagCard.jsx`
- Modify: `client/src/components/cards/StudioCard.jsx`
- Modify: `client/src/components/cards/GalleryCard.jsx`
- Modify: `client/src/components/cards/GroupCard.jsx`
- Modify: `client/src/components/ui/SceneCard.jsx`

**Step 1: Update PerformerCard.jsx**

Find around line 13:
```javascript
  ({ performer, referrerUrl, isTVMode, tabIndex, onHideSuccess, displayPreferences, ...rest }, ref) => {
```

Change to:
```javascript
  ({ performer, fromPageTitle, isTVMode, tabIndex, onHideSuccess, displayPreferences, ...rest }, ref) => {
```

Find around line 84:
```javascript
        referrerUrl={referrerUrl}
```

Change to:
```javascript
        fromPageTitle={fromPageTitle}
```

**Step 2: Update TagCard.jsx**

Apply same pattern: rename `referrerUrl` prop to `fromPageTitle` in destructuring and BaseCard usage.

**Step 3: Update StudioCard.jsx**

Apply same pattern.

**Step 4: Update GalleryCard.jsx**

Apply same pattern.

**Step 5: Update GroupCard.jsx**

Apply same pattern.

**Step 6: Update SceneCard.jsx**

Apply same pattern.

**Step 7: Run linter**

Run: `cd client && npm run lint`
Expected: PASS

**Step 8: Commit**

```bash
git add client/src/components/cards/*.jsx client/src/components/ui/SceneCard.jsx
git commit -m "refactor: rename referrerUrl to fromPageTitle in all card components"
```

---

## Task 6: Update List Pages to Pass fromPageTitle

Update all list pages that navigate to detail pages to pass the page title instead of referrer URL.

**Files:**
- Modify: `client/src/components/pages/Performers.jsx`
- Modify: `client/src/components/pages/Tags.jsx`
- Modify: `client/src/components/pages/Studios.jsx`
- Modify: `client/src/components/pages/Galleries.jsx`
- Modify: `client/src/components/pages/Groups.jsx`
- Modify: `client/src/components/pages/Images.jsx`

**Step 1: Update Performers.jsx**

Find around line 57-60:
```javascript
    onItemSelect: (performer) =>
      navigate(`/performer/${performer.id}`, {
        state: { referrerUrl: `${location.pathname}${location.search}` },
      }),
```

Change to:
```javascript
    onItemSelect: (performer) =>
      navigate(`/performer/${performer.id}`, {
        state: { fromPageTitle: "Performers" },
      }),
```

**Step 2: Update Tags.jsx**

Find similar pattern and change:
```javascript
        state: { referrerUrl: `${location.pathname}${location.search}` },
```
To:
```javascript
        state: { fromPageTitle: "Tags" },
```

**Step 3: Update Studios.jsx**

Change to `fromPageTitle: "Studios"`.

**Step 4: Update Galleries.jsx**

Change to `fromPageTitle: "Galleries"`.

**Step 5: Update Groups.jsx**

Change to `fromPageTitle: "Collections"`.

**Step 6: Update Images.jsx**

Change to `fromPageTitle: "Images"`.

**Step 7: Run linter**

Run: `cd client && npm run lint`
Expected: PASS

**Step 8: Commit**

```bash
git add client/src/components/pages/Performers.jsx client/src/components/pages/Tags.jsx client/src/components/pages/Studios.jsx client/src/components/pages/Galleries.jsx client/src/components/pages/Groups.jsx client/src/components/pages/Images.jsx
git commit -m "refactor: update list pages to pass fromPageTitle instead of referrerUrl"
```

---

## Task 7: Update Scene Navigation Sources

Update components that navigate to scene detail pages.

**Files:**
- Modify: `client/src/components/scene-search/SceneSearch.jsx`
- Modify: `client/src/components/pages/Home.jsx`
- Modify: `client/src/components/ui/ContinueWatchingCarousel.jsx`
- Modify: `client/src/components/ui/RecommendedSidebar.jsx`

**Step 1: Update SceneSearch.jsx**

Find around line 76-81 where `navigationState` is built:
```javascript
    // Only capture referrerUrl if captureReferrer is true
    if (captureReferrer) {
      navigationState.referrerUrl = `${location.pathname}${location.search}`;
    }
```

The `captureReferrer` prop is used to conditionally add referrer. We need to change this to use `fromPageTitle`. Check where SceneSearch is used to understand the context.

This component is used from detail pages (PerformerDetail, TagDetail, etc.) and list pages (Scenes). The `captureReferrer` controls whether to track where we came from.

We need to change this to accept a `fromPageTitle` prop instead. Update to:
```javascript
    // Only capture fromPageTitle if provided
    if (fromPageTitle) {
      navigationState.fromPageTitle = fromPageTitle;
    }
```

Also update the prop from `captureReferrer` to `fromPageTitle` in the component signature.

**Step 2: Update Home.jsx scene navigation**

Find around line 127-130:
```javascript
    navigate(`/scene/${scene.id}`, {
```

Add fromPageTitle to the state object that's being passed. Should become:
```javascript
    navigate(`/scene/${scene.id}`, {
      state: {
        fromPageTitle: "Home",
        // ... existing state
      },
    });
```

**Step 3: Update ContinueWatchingCarousel.jsx**

Find the scene navigation and add `fromPageTitle: "Home"` or appropriate title.

**Step 4: Update RecommendedSidebar.jsx**

Find the scene navigation and add `fromPageTitle` based on context.

**Step 5: Run linter**

Run: `cd client && npm run lint`
Expected: PASS

**Step 6: Commit**

```bash
git add client/src/components/scene-search/SceneSearch.jsx client/src/components/pages/Home.jsx client/src/components/ui/ContinueWatchingCarousel.jsx client/src/components/ui/RecommendedSidebar.jsx
git commit -m "refactor: update scene navigation sources to pass fromPageTitle"
```

---

## Task 8: Update SceneSearch Consumers to Pass fromPageTitle

Update all pages that use SceneSearch to pass the page title.

**Files:**
- Modify: `client/src/components/pages/PerformerDetail.jsx`
- Modify: `client/src/components/pages/TagDetail.jsx`
- Modify: `client/src/components/pages/StudioDetail.jsx`
- Modify: `client/src/components/pages/GalleryDetail.jsx`
- Modify: `client/src/components/pages/GroupDetail.jsx`
- Modify: `client/src/components/pages/Scenes.jsx`

**Step 1: Update PerformerDetail.jsx SceneSearch usage**

Find SceneSearch component usage and change `captureReferrer` to `fromPageTitle`:
```jsx
<SceneSearch
  fromPageTitle={performer?.name || "Performer"}
  // ... other props
/>
```

**Step 2: Update TagDetail.jsx**

```jsx
<SceneSearch
  fromPageTitle={tag?.name || "Tag"}
  // ... other props
/>
```

**Step 3: Update StudioDetail.jsx**

```jsx
<SceneSearch
  fromPageTitle={studio?.name || "Studio"}
  // ... other props
/>
```

**Step 4: Update GalleryDetail.jsx**

```jsx
<SceneSearch
  fromPageTitle={galleryTitle(gallery) || "Gallery"}
  // ... other props
/>
```

**Step 5: Update GroupDetail.jsx**

```jsx
<SceneSearch
  fromPageTitle={group?.name || "Collection"}
  // ... other props
/>
```

**Step 6: Update Scenes.jsx**

```jsx
<SceneSearch
  fromPageTitle="Scenes"
  // ... other props
/>
```

**Step 7: Run linter**

Run: `cd client && npm run lint`
Expected: PASS

**Step 8: Commit**

```bash
git add client/src/components/pages/PerformerDetail.jsx client/src/components/pages/TagDetail.jsx client/src/components/pages/StudioDetail.jsx client/src/components/pages/GalleryDetail.jsx client/src/components/pages/GroupDetail.jsx client/src/components/pages/Scenes.jsx
git commit -m "refactor: update SceneSearch consumers to pass fromPageTitle"
```

---

## Task 9: Update Detail Page Back Buttons

Update all detail pages to use `useNavigationState` hook.

**Files:**
- Modify: `client/src/components/pages/Scene.jsx`
- Modify: `client/src/components/pages/PerformerDetail.jsx`
- Modify: `client/src/components/pages/TagDetail.jsx`
- Modify: `client/src/components/pages/StudioDetail.jsx`
- Modify: `client/src/components/pages/GalleryDetail.jsx`
- Modify: `client/src/components/pages/GroupDetail.jsx`
- Modify: `client/src/components/pages/PlaylistDetail.jsx`
- Modify: `client/src/components/pages/HiddenItemsPage.jsx`

**Step 1: Update Scene.jsx**

Add import:
```javascript
import { useNavigationState } from "../../hooks/useNavigationState.js";
```

In SceneContent component, add hook call:
```javascript
const { goBack, backButtonText } = useNavigationState();
```

Find the back button around lines 130-145:
```jsx
<Button
  onClick={() => {
    // If we have a referrer URL with filters, navigate to it
    // Otherwise use browser back
    if (location.state?.referrerUrl) {
      navigate(location.state.referrerUrl);
    } else {
      navigate(-1);
    }
  }}
  variant="secondary"
  className="inline-flex items-center gap-2"
>
  <span>←</span>
  <span className="whitespace-nowrap">Back to Scenes</span>
</Button>
```

Change to:
```jsx
<Button
  onClick={goBack}
  variant="secondary"
  className="inline-flex items-center gap-2"
>
  <span>←</span>
  <span className="whitespace-nowrap">{backButtonText}</span>
</Button>
```

**Step 2: Update PerformerDetail.jsx**

Add import:
```javascript
import { useNavigationState } from "../../hooks/useNavigationState.js";
```

Add hook call in component:
```javascript
const { goBack, backButtonText } = useNavigationState();
```

Find the back button around lines 105-113:
```jsx
<Button
  onClick={() =>
    navigate(location.state?.referrerUrl || "/performers")
  }
  variant="secondary"
  icon={<ArrowLeft size={16} className="sm:w-4 sm:h-4" />}
  title="Back to Performers"
>
  <span className="hidden sm:inline">Back to Performers</span>
</Button>
```

Change to:
```jsx
<Button
  onClick={goBack}
  variant="secondary"
  icon={<ArrowLeft size={16} className="sm:w-4 sm:h-4" />}
  title={backButtonText}
>
  <span className="hidden sm:inline">{backButtonText}</span>
</Button>
```

**Step 3: Update TagDetail.jsx**

Apply same pattern. Note: TagDetail has TWO back buttons (lines ~119 and ~153). Update both.

**Step 4: Update StudioDetail.jsx**

Apply same pattern.

**Step 5: Update GalleryDetail.jsx**

Apply same pattern.

**Step 6: Update GroupDetail.jsx**

Apply same pattern.

**Step 7: Update PlaylistDetail.jsx**

This page has different structure. Find back buttons (around lines 303-324) and update similarly.

**Step 8: Update HiddenItemsPage.jsx**

This page navigates to Settings specifically. Change to use `goBack`:
```jsx
<Button onClick={goBack}>
  {backButtonText}
</Button>
```

**Step 9: Run linter**

Run: `cd client && npm run lint`
Expected: PASS

**Step 10: Commit**

```bash
git add client/src/components/pages/Scene.jsx client/src/components/pages/PerformerDetail.jsx client/src/components/pages/TagDetail.jsx client/src/components/pages/StudioDetail.jsx client/src/components/pages/GalleryDetail.jsx client/src/components/pages/GroupDetail.jsx client/src/components/pages/PlaylistDetail.jsx client/src/components/pages/HiddenItemsPage.jsx
git commit -m "feat: update detail page back buttons to use useNavigationState"
```

---

## Task 10: Clean Up Unused referrerUrl References

Search for any remaining `referrerUrl` references and clean them up.

**Files:**
- Various (search-based)

**Step 1: Search for remaining referrerUrl**

Run: `cd client && grep -r "referrerUrl" src/`

Review results and update any remaining references.

**Step 2: Remove useLocation if no longer needed**

In detail pages where we removed `location.state?.referrerUrl` checks, verify if `useLocation` is still needed. If not used elsewhere, remove the import and hook call.

**Step 3: Run linter**

Run: `cd client && npm run lint`
Expected: PASS

**Step 4: Run all tests**

Run: `cd client && npm test -- --run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add -A
git commit -m "chore: clean up unused referrerUrl references"
```

---

## Task 11: Manual Testing

**Step 1: Start dev server**

Run: `cd client && npm run dev`

**Step 2: Test list to detail navigation**

1. Go to Performers page
2. Click on a performer card
3. Verify back button shows "Back to Performers"
4. Click back button
5. Verify returns to Performers list

**Step 3: Test detail to detail navigation**

1. Go to a Performer detail page
2. Click on a Scene in their scenes list
3. Verify back button shows "Back to {Performer Name}"
4. Click back button
5. Verify returns to that performer's page

**Step 4: Test deep link fallback**

1. Open browser directly to `/performer/123` (no prior navigation)
2. Verify back button shows just "Back"
3. Click back button
4. Verify navigates somewhere sensible (browser history)

**Step 5: Test Home page**

1. Go to Home page
2. Click on a scene in a carousel
3. Verify back button shows "Back to Home"
4. Click back button
5. Verify returns to Home

**Step 6: Test browser back button**

1. Navigate: Home → Performers → Performer Detail → Scene
2. Click browser back button
3. Verify returns to Performer Detail with correct state
4. Click browser back again
5. Verify returns to Performers list

---

## Task 12: Final Review and Squash (Optional)

**Step 1: Review commit history**

Run: `git log --oneline -15`

**Step 2: Create PR or merge**

If all tests pass and manual testing looks good, create PR or merge to main.
