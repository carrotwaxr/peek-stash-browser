# Issue #221 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix card density bugs, view toggle styling, table view gallery images, fullscreen exit, and add new card display settings (hide indicators/date/studio, default view mode per entity).

**Architecture:** Extend existing CardDisplaySettingsContext with new per-entity settings. Create shared entityDisplayConfig.js for DRY configuration of available view modes and settings per entity type. Fix component bugs in ViewModeToggle, cellRenderers, CardComponents, and Lightbox.

**Tech Stack:** React, Vitest, React Testing Library

---

## Task 1: Fix View Toggle Active Styling Bug

**Files:**
- Modify: `client/src/components/ui/ViewModeToggle.jsx`
- Modify: `client/tests/components/ui/ViewModeToggle.test.jsx`

**Step 1: Add test for rapid click stability**

Add to existing test file:

```jsx
// In client/tests/components/ui/ViewModeToggle.test.jsx

describe("rapid click stability", () => {
  it("shows exactly one active button after rapid clicks", async () => {
    const onChange = vi.fn();
    const { rerender } = render(
      <ViewModeToggle
        modes={[
          { id: "grid", label: "Grid view" },
          { id: "wall", label: "Wall view" },
          { id: "table", label: "Table view" },
        ]}
        value="grid"
        onChange={onChange}
      />
    );

    const wallBtn = screen.getByLabelText("Wall view");
    const tableBtn = screen.getByLabelText("Table view");
    const gridBtn = screen.getByLabelText("Grid view");

    // Rapid clicks
    fireEvent.click(wallBtn);
    fireEvent.click(tableBtn);
    fireEvent.click(gridBtn);
    fireEvent.click(wallBtn);

    // Simulate parent updating value to last clicked
    rerender(
      <ViewModeToggle
        modes={[
          { id: "grid", label: "Grid view" },
          { id: "wall", label: "Wall view" },
          { id: "table", label: "Table view" },
        ]}
        value="wall"
        onChange={onChange}
      />
    );

    // Verify exactly one button is active
    const buttons = screen.getAllByRole("button");
    const activeButtons = buttons.filter(
      (btn) => btn.getAttribute("aria-pressed") === "true"
    );
    expect(activeButtons).toHaveLength(1);
    expect(activeButtons[0]).toBe(screen.getByLabelText("Wall view"));
  });

  it("immediately shows clicked button as active (optimistic)", () => {
    const onChange = vi.fn();
    render(
      <ViewModeToggle
        modes={[
          { id: "grid", label: "Grid view" },
          { id: "wall", label: "Wall view" },
        ]}
        value="grid"
        onChange={onChange}
      />
    );

    const wallBtn = screen.getByLabelText("Wall view");
    fireEvent.click(wallBtn);

    // Should immediately show as active (optimistic update)
    expect(wallBtn.getAttribute("aria-pressed")).toBe("true");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- --run ViewModeToggle`
Expected: FAIL - optimistic test fails because current implementation doesn't have local state

**Step 3: Implement local optimistic state**

```jsx
// client/src/components/ui/ViewModeToggle.jsx
import { useState, useEffect } from "react";
import { LucideGrid2X2, LucideSquare, LucideNetwork, LucideList } from "lucide-react";

// Default modes for backward compatibility
const DEFAULT_MODES = [
  { id: "grid", icon: LucideGrid2X2, label: "Grid view" },
  { id: "wall", icon: LucideSquare, label: "Wall view" },
];

// Icon mapping for custom mode definitions
const MODE_ICONS = {
  grid: LucideGrid2X2,
  wall: LucideSquare,
  hierarchy: LucideNetwork,
  table: LucideList,
};

/**
 * Toggle between view modes.
 *
 * @param {Array} modes - Optional custom modes array [{id, label, icon?}]
 *                        If not provided, defaults to grid/wall
 * @param {string} value - Currently selected mode id
 * @param {function} onChange - Called with mode id when selection changes
 */
const ViewModeToggle = ({ modes, value = "grid", onChange, className = "" }) => {
  // Local state for immediate visual feedback (optimistic update)
  const [localValue, setLocalValue] = useState(value);

  // Sync local state when parent value changes (authoritative)
  useEffect(() => {
    setLocalValue(value);
  }, [value]);

  const handleClick = (modeId) => {
    setLocalValue(modeId); // Immediate visual feedback
    onChange(modeId);       // Trigger parent update
  };

  // Use custom modes or fall back to defaults
  const effectiveModes = modes
    ? modes.map((mode) => ({
        ...mode,
        icon: mode.icon || MODE_ICONS[mode.id] || LucideGrid2X2,
      }))
    : DEFAULT_MODES;

  return (
    <div
      className={`inline-flex items-center rounded-lg overflow-hidden h-[34px] ${className}`}
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
      }}
    >
      {effectiveModes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          onClick={() => handleClick(mode.id)}
          className="px-2.5 h-full transition-colors flex items-center justify-center"
          style={{
            backgroundColor: localValue === mode.id ? "var(--accent-primary)" : "transparent",
            color: localValue === mode.id ? "white" : "var(--text-secondary)",
          }}
          title={mode.label}
          aria-label={mode.label}
          aria-pressed={localValue === mode.id}
        >
          <mode.icon size={18} />
        </button>
      ))}
    </div>
  );
};

export default ViewModeToggle;
```

**Step 4: Run tests to verify they pass**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- --run ViewModeToggle`
Expected: PASS

**Step 5: Commit**

```bash
cd /home/carrot/code/peek-stash-browser && git add client/src/components/ui/ViewModeToggle.jsx client/tests/components/ui/ViewModeToggle.test.jsx && git commit -m "fix: View toggle uses local state for immediate visual feedback

Prevents visual glitches when rapidly clicking view mode buttons.
Local state provides optimistic update while parent state settles.

Fixes #221"
```

---

## Task 2: Fix Table View Gallery Images

**Files:**
- Modify: `client/src/components/table/cellRenderers.jsx:394-401`

**Step 1: Write test for gallery cover renderer**

Create new test file:

```jsx
// client/tests/components/table/cellRenderers.test.jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect } from "vitest";
import { getCellRenderer } from "../../../src/components/table/cellRenderers.jsx";

describe("cellRenderers", () => {
  describe("gallery cover renderer", () => {
    it("renders thumbnail from gallery.cover string URL", () => {
      const gallery = {
        id: "123",
        title: "Test Gallery",
        cover: "/api/proxy/stash?path=/galleries/cover.jpg",
      };

      const CoverRenderer = getCellRenderer("cover", "gallery");
      render(
        <MemoryRouter>
          <CoverRenderer {...gallery} />
        </MemoryRouter>
      );

      const img = screen.getByRole("img");
      expect(img).toHaveAttribute("src", "/api/proxy/stash?path=/galleries/cover.jpg");
    });

    it("renders placeholder when gallery has no cover", () => {
      const gallery = {
        id: "123",
        title: "Test Gallery",
        cover: null,
      };

      const CoverRenderer = getCellRenderer("cover", "gallery");
      render(
        <MemoryRouter>
          <CoverRenderer {...gallery} />
        </MemoryRouter>
      );

      // Should render ThumbnailCell with no src (shows placeholder)
      const link = screen.getByRole("link");
      expect(link).toHaveAttribute("href", "/gallery/123");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- --run cellRenderers`
Expected: FAIL - image src will be undefined because current code tries `gallery.cover?.paths?.thumbnail`

**Step 3: Fix gallery cover renderer**

In `client/src/components/table/cellRenderers.jsx`, change lines 394-401:

```jsx
// FROM:
cover: (gallery) => (
  <ThumbnailCell
    src={gallery.cover?.paths?.thumbnail || gallery.image_path}
    alt={gallery.title}
    linkTo={`/gallery/${gallery.id}`}
    entityType="gallery"
  />
),

// TO:
cover: (gallery) => (
  <ThumbnailCell
    src={gallery.cover}
    alt={gallery.title}
    linkTo={`/gallery/${gallery.id}`}
    entityType="gallery"
  />
),
```

**Step 4: Run test to verify it passes**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- --run cellRenderers`
Expected: PASS

**Step 5: Commit**

```bash
cd /home/carrot/code/peek-stash-browser && git add client/src/components/table/cellRenderers.jsx client/tests/components/table/cellRenderers.test.jsx && git commit -m "fix: Gallery cover images now display in Table View

Backend sends gallery.cover as string URL, not object with paths.thumbnail.
Updated renderer to use the direct string value.

Fixes #221"
```

---

## Task 3: Fix Card Density - Remove Fixed Heights

**Files:**
- Modify: `client/src/components/ui/CardComponents.jsx`

**Step 1: Write tests for dynamic height behavior**

```jsx
// client/tests/components/ui/CardComponents.density.test.jsx
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, it, expect, vi } from "vitest";
import { CardContainer, CardTitle, CardIndicators, CardRatingRow } from "../../../src/components/ui/CardComponents.jsx";

// Mock hooks used by CardRatingRow
vi.mock("../../../src/hooks/useHiddenEntities.js", () => ({
  useHiddenEntities: () => ({
    hideEntity: vi.fn(),
    hideConfirmationDisabled: false,
  }),
}));

describe("CardComponents density", () => {
  describe("CardContainer", () => {
    it("does not have fixed minHeight", () => {
      render(<CardContainer>Content</CardContainer>);
      const container = screen.getByLabelText("Card");
      expect(container.style.minHeight).toBe("");
    });
  });

  describe("CardTitle", () => {
    it("does not reserve height when subtitle is null", () => {
      const { container } = render(
        <MemoryRouter>
          <CardTitle title="Test" subtitle={null} />
        </MemoryRouter>
      );
      // Should not render subtitle element at all
      const subtitles = container.querySelectorAll("h4");
      expect(subtitles).toHaveLength(0);
    });

    it("renders subtitle when provided", () => {
      render(
        <MemoryRouter>
          <CardTitle title="Test" subtitle="Studio Name" />
        </MemoryRouter>
      );
      expect(screen.getByText("Studio Name")).toBeInTheDocument();
    });
  });

  describe("CardIndicators", () => {
    it("does not render wrapper when indicators is empty", () => {
      const { container } = render(<CardIndicators indicators={[]} />);
      expect(container.firstChild).toBeNull();
    });

    it("does not render wrapper when indicators is null", () => {
      const { container } = render(<CardIndicators indicators={null} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe("CardRatingRow", () => {
    it("uses compact height when only menu is visible", () => {
      render(
        <CardRatingRow
          entityType="scene"
          entityId="123"
          showRating={false}
          showFavorite={false}
          showOCounter={false}
        />
      );
      const row = screen.getByRole("button", { name: /menu/i }).closest("div");
      // Row should exist but be more compact
      expect(row).toBeInTheDocument();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- --run CardComponents.density`
Expected: FAIL - CardContainer has minHeight, CardTitle always renders subtitle space, etc.

**Step 3: Update CardContainer - remove minHeight**

In `client/src/components/ui/CardComponents.jsx`, modify `CardContainer` (around line 38-56):

```jsx
export const CardContainer = forwardRef(
  (
    {
      children,
      className = "",
      entityType = "card",
      onClick,
      style = {},
      ...others
    },
    ref
  ) => {
    const entityDisplayType =
      entityType.charAt(0).toUpperCase() + entityType.slice(1);

    return (
      <div
        aria-label={`${entityDisplayType}`}
        className={`flex flex-col items-center justify-between rounded-lg border p-2 hover:shadow-lg hover:scale-[1.02] transition-all focus:outline-none ${className}`}
        ref={ref}
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
          // Removed: minHeight: "20rem"
          // Removed: maxHeight: "36rem"
          ...style,
        }}
        onClick={onClick}
        {...others}
      >
        {children}
      </div>
    );
  }
);
```

**Step 4: Update CardTitle - only render subtitle when present**

In `client/src/components/ui/CardComponents.jsx`, modify `CardTitle` (around line 317-410):

```jsx
export const CardTitle = ({
  title,
  subtitle,
  hideSubtitle = false,
  maxTitleLines = 1,
  linkTo,
  fromPageTitle,
  onClickOverride,
}) => {
  // Calculate fixed height based on line count
  const titleHeight = useMemo(() => {
    return `${maxTitleLines * 1.25}rem`;
  }, [maxTitleLines]);

  const titleIsString = typeof title === "string";
  const shouldShowSubtitle = !hideSubtitle && subtitle;

  const titleElement = (
    <h3
      className="font-semibold leading-tight text-center"
      style={{
        color: "var(--text-primary)",
        height: titleHeight,
        display: "-webkit-box",
        WebkitLineClamp: maxTitleLines,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        textOverflow: "ellipsis",
        overflowWrap: "break-word",
      }}
    >
      {title}
    </h3>
  );

  // Wrap in Link if linkTo provided
  const titleContent = linkTo ? (
    <Link
      to={linkTo}
      state={{ fromPageTitle }}
      className="block hover:underline cursor-pointer"
      onClick={onClickOverride}
    >
      {titleElement}
    </Link>
  ) : (
    titleElement
  );

  // Only render subtitle element if we have content
  const subtitleElement = shouldShowSubtitle && (
    <h4
      className="text-sm leading-tight text-center"
      style={{
        color: "var(--text-muted)",
        display: "-webkit-box",
        WebkitLineClamp: 1,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
      title={subtitle}
    >
      {subtitle}
    </h4>
  );

  const subtitleContent = linkTo && subtitleElement ? (
    <Link
      to={linkTo}
      state={{ fromPageTitle }}
      className="block cursor-pointer"
      onClick={onClickOverride}
    >
      {subtitleElement}
    </Link>
  ) : (
    subtitleElement
  );

  return (
    <div className="w-full text-center mb-2">
      {titleIsString ? (
        <Tooltip content={title} disabled={!title || title.length < 30}>
          {titleContent}
        </Tooltip>
      ) : (
        titleContent
      )}
      {subtitleContent}
    </div>
  );
};
```

**Step 5: Update CardIndicators - don't render when empty**

In `client/src/components/ui/CardComponents.jsx`, modify `CardIndicators` (around line 426-431):

```jsx
/**
 * Card indicators section - only renders when indicators exist
 */
export const CardIndicators = ({ indicators }) => {
  // Don't render anything if no indicators
  if (!indicators || indicators.length === 0) {
    return null;
  }

  return (
    <div className="my-2 w-full">
      <CardCountIndicators indicators={indicators} />
    </div>
  );
};
```

**Step 6: Update CardRatingRow - compact when only menu visible**

In `client/src/components/ui/CardComponents.jsx`, modify `CardRatingRow` (around line 557-602):

```jsx
// Inside CardRatingRow, update the return statement:

// Check if any controls are visible (besides the always-present menu)
const hasVisibleControls = showRating || showFavorite || showOCounter;

return (
  <>
    <div
      className="flex justify-between items-center w-full my-1"
      style={{ height: hasVisibleControls ? "2rem" : "1.5rem" }}
    >
      {/* Left side: Rating badge */}
      <div ref={badgeRef}>
        {showRating && (
          <RatingBadge
            rating={rating}
            onClick={() => setDialogOpen(true)}
            size="small"
          />
        )}
      </div>

      {/* Right side: O Counter + Favorite + EntityMenu */}
      <div className="flex items-center gap-2">
        {showOCounter && (
          <OCounterButton
            sceneId={entityType === "scene" ? entityId : null}
            imageId={entityType === "image" ? entityId : null}
            initialCount={oCounter ?? 0}
            onChange={handleOCounterChange}
            size="small"
            variant="card"
            interactive={isSceneOrImage}
          />
        )}
        {showFavorite && (
          <FavoriteButton
            isFavorite={isFavorite}
            onChange={handleFavoriteChange}
            size="small"
            variant="card"
          />
        )}
        <EntityMenu
          entityType={entityType}
          entityId={entityId}
          entityName={entityTitle}
          onHide={handleHideClick}
        />
      </div>
    </div>
    {/* ... dialogs remain unchanged ... */}
  </>
);
```

**Step 7: Run tests to verify they pass**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- --run CardComponents`
Expected: PASS

**Step 8: Commit**

```bash
cd /home/carrot/code/peek-stash-browser && git add client/src/components/ui/CardComponents.jsx client/tests/components/ui/CardComponents.density.test.jsx && git commit -m "fix: Cards now shrink when elements are hidden

- Remove fixed minHeight from CardContainer (grid handles row alignment)
- CardTitle only reserves subtitle space when subtitle exists
- CardIndicators returns null when empty (no fixed height wrapper)
- CardRatingRow uses compact height when only menu visible

Fixes #221"
```

---

## Task 4: Create Shared Entity Display Config

**Files:**
- Create: `client/src/config/entityDisplayConfig.js`

**Step 1: Create the shared configuration file**

```javascript
// client/src/config/entityDisplayConfig.js

/**
 * Shared configuration for entity display settings.
 * Used by CardDisplaySettingsContext, CardDisplaySettings UI, and page components.
 * Single source of truth for available view modes and settings per entity type.
 */

export const ENTITY_DISPLAY_CONFIG = {
  scene: {
    label: "Scene",
    viewModes: [
      { id: "grid", label: "Grid" },
      { id: "wall", label: "Wall" },
      { id: "table", label: "Table" },
    ],
    defaultSettings: {
      defaultViewMode: "grid",
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showCodeOnCard: true,
      showStudio: true,
      showDate: true,
      showRelationshipIndicators: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    },
    // Which settings to show in UI for this entity
    availableSettings: [
      "defaultViewMode",
      "showCodeOnCard",
      "showStudio",
      "showDate",
      "showDescriptionOnCard",
      "showDescriptionOnDetail",
      "showRelationshipIndicators",
      "showRating",
      "showFavorite",
      "showOCounter",
    ],
  },
  gallery: {
    label: "Gallery",
    viewModes: [
      { id: "grid", label: "Grid" },
      { id: "wall", label: "Wall" },
      { id: "table", label: "Table" },
    ],
    defaultSettings: {
      defaultViewMode: "grid",
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showStudio: true,
      showDate: true,
      showRelationshipIndicators: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    },
    availableSettings: [
      "defaultViewMode",
      "showStudio",
      "showDate",
      "showDescriptionOnCard",
      "showDescriptionOnDetail",
      "showRelationshipIndicators",
      "showRating",
      "showFavorite",
      "showOCounter",
    ],
  },
  image: {
    label: "Image",
    viewModes: [
      { id: "grid", label: "Grid" },
      { id: "wall", label: "Wall" },
    ],
    defaultSettings: {
      defaultViewMode: "grid",
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showStudio: true,
      showDate: true,
      showRelationshipIndicators: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    },
    availableSettings: [
      "defaultViewMode",
      "showStudio",
      "showDate",
      "showDescriptionOnCard",
      "showDescriptionOnDetail",
      "showRelationshipIndicators",
      "showRating",
      "showFavorite",
      "showOCounter",
    ],
  },
  performer: {
    label: "Performer",
    viewModes: [
      { id: "grid", label: "Grid" },
      { id: "wall", label: "Wall" },
      { id: "table", label: "Table" },
    ],
    defaultSettings: {
      defaultViewMode: "grid",
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showRelationshipIndicators: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    },
    availableSettings: [
      "defaultViewMode",
      "showDescriptionOnCard",
      "showDescriptionOnDetail",
      "showRelationshipIndicators",
      "showRating",
      "showFavorite",
      "showOCounter",
    ],
  },
  studio: {
    label: "Studio",
    viewModes: [
      { id: "grid", label: "Grid" },
      { id: "wall", label: "Wall" },
      { id: "table", label: "Table" },
    ],
    defaultSettings: {
      defaultViewMode: "grid",
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showRelationshipIndicators: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    },
    availableSettings: [
      "defaultViewMode",
      "showDescriptionOnCard",
      "showDescriptionOnDetail",
      "showRelationshipIndicators",
      "showRating",
      "showFavorite",
      "showOCounter",
    ],
  },
  tag: {
    label: "Tag",
    viewModes: [
      { id: "grid", label: "Grid" },
      { id: "table", label: "Table" },
      { id: "hierarchy", label: "Hierarchy" },
    ],
    defaultSettings: {
      defaultViewMode: "grid",
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showRelationshipIndicators: true,
    },
    availableSettings: [
      "defaultViewMode",
      "showDescriptionOnCard",
      "showDescriptionOnDetail",
      "showRelationshipIndicators",
    ],
  },
  group: {
    label: "Group",
    viewModes: [
      { id: "grid", label: "Grid" },
      { id: "wall", label: "Wall" },
      { id: "table", label: "Table" },
    ],
    defaultSettings: {
      defaultViewMode: "grid",
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showRelationshipIndicators: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    },
    availableSettings: [
      "defaultViewMode",
      "showDescriptionOnCard",
      "showDescriptionOnDetail",
      "showRelationshipIndicators",
      "showRating",
      "showFavorite",
      "showOCounter",
    ],
  },
};

/**
 * Get list of entity types in display order
 */
export const getEntityTypes = () => Object.keys(ENTITY_DISPLAY_CONFIG);

/**
 * Get default settings for an entity type
 */
export const getDefaultSettings = (entityType) => {
  return ENTITY_DISPLAY_CONFIG[entityType]?.defaultSettings || {};
};

/**
 * Get available view modes for an entity type
 */
export const getViewModes = (entityType) => {
  return ENTITY_DISPLAY_CONFIG[entityType]?.viewModes || [{ id: "grid", label: "Grid" }];
};

/**
 * Get available settings for an entity type (for UI rendering)
 */
export const getAvailableSettings = (entityType) => {
  return ENTITY_DISPLAY_CONFIG[entityType]?.availableSettings || [];
};

/**
 * Setting labels for UI display
 */
export const SETTING_LABELS = {
  defaultViewMode: "Default view mode",
  showCodeOnCard: "Show studio code on cards",
  showStudio: "Show studio name",
  showDate: "Show date",
  showDescriptionOnCard: "Show description on cards",
  showDescriptionOnDetail: "Show description on detail page",
  showRelationshipIndicators: "Show relationship indicators",
  showRating: "Show rating",
  showFavorite: "Show favorite",
  showOCounter: "Show O counter",
};

/**
 * Setting descriptions for UI display
 */
export const SETTING_DESCRIPTIONS = {
  showCodeOnCard: "Display scene codes (e.g., JAV codes) in card subtitles",
  showStudio: "Display studio name in card subtitles",
  showDate: "Display date in card subtitles",
  showRelationshipIndicators: "Display count badges for performers, tags, etc.",
};
```

**Step 2: Commit**

```bash
cd /home/carrot/code/peek-stash-browser && git add client/src/config/entityDisplayConfig.js && git commit -m "feat: Add shared entity display configuration

Single source of truth for view modes and settings per entity type.
Used by CardDisplaySettingsContext and CardDisplaySettings UI.

Part of #221"
```

---

## Task 5: Update CardDisplaySettingsContext to Use Shared Config

**Files:**
- Modify: `client/src/contexts/CardDisplaySettingsContext.jsx`

**Step 1: Update context to use shared config**

```jsx
// client/src/contexts/CardDisplaySettingsContext.jsx
/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";
import { getDefaultSettings } from "../config/entityDisplayConfig.js";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const CardDisplaySettingsContext = createContext(null);

export const CardDisplaySettingsProvider = ({ children }) => {
  const [settings, setSettings] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const response = await api.get("/user/settings");
        setSettings(response.data.settings.cardDisplaySettings || {});
      } catch (error) {
        console.error("Failed to load card display settings:", error);
      } finally {
        setIsLoading(false);
      }
    };
    loadSettings();
  }, []);

  // Get settings for a specific entity type (with defaults from shared config)
  const getSettings = useCallback((entityType) => {
    const defaults = getDefaultSettings(entityType);
    const entitySettings = settings[entityType] || {};
    return { ...defaults, ...entitySettings };
  }, [settings]);

  // Update a specific setting
  const updateSettings = useCallback(async (entityType, key, value) => {
    const newEntitySettings = {
      ...(settings[entityType] || {}),
      [key]: value,
    };
    const newSettings = {
      ...settings,
      [entityType]: newEntitySettings,
    };

    // Optimistic update
    setSettings(newSettings);

    try {
      await api.put("/user/settings", {
        cardDisplaySettings: newSettings,
      });
    } catch (error) {
      console.error("Failed to save card display settings:", error);
      // Revert on error
      setSettings(settings);
      throw error;
    }
  }, [settings]);

  return (
    <CardDisplaySettingsContext.Provider value={{ getSettings, updateSettings, isLoading }}>
      {children}
    </CardDisplaySettingsContext.Provider>
  );
};

export const useCardDisplaySettings = () => {
  const context = useContext(CardDisplaySettingsContext);
  if (!context) {
    throw new Error("useCardDisplaySettings must be used within CardDisplaySettingsProvider");
  }
  return context;
};
```

**Step 2: Commit**

```bash
cd /home/carrot/code/peek-stash-browser && git add client/src/contexts/CardDisplaySettingsContext.jsx && git commit -m "refactor: CardDisplaySettingsContext uses shared config for defaults

Part of #221"
```

---

## Task 6: Update CardDisplaySettings UI to Use Shared Config

**Files:**
- Modify: `client/src/components/settings/CardDisplaySettings.jsx`

**Step 1: Rewrite settings UI to use shared config**

```jsx
// client/src/components/settings/CardDisplaySettings.jsx
import { useState } from "react";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";
import {
  ENTITY_DISPLAY_CONFIG,
  getEntityTypes,
  getAvailableSettings,
  getViewModes,
  SETTING_LABELS,
  SETTING_DESCRIPTIONS,
} from "../../config/entityDisplayConfig.js";
import { showSuccess, showError } from "../../utils/toast.jsx";

const Toggle = ({ label, checked, onChange, description }) => (
  <label className="flex items-start gap-3 cursor-pointer">
    <input
      type="checkbox"
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
      className="mt-1 w-4 h-4 rounded"
      style={{
        accentColor: "var(--accent-primary)",
      }}
    />
    <div>
      <span style={{ color: "var(--text-primary)" }}>{label}</span>
      {description && (
        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      )}
    </div>
  </label>
);

const Dropdown = ({ label, value, options, onChange, description }) => (
  <div className="flex flex-col gap-1">
    <label className="flex items-center justify-between gap-3">
      <div>
        <span style={{ color: "var(--text-primary)" }}>{label}</span>
        {description && (
          <p className="text-sm" style={{ color: "var(--text-muted)" }}>
            {description}
          </p>
        )}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-1.5 rounded border"
        style={{
          backgroundColor: "var(--bg-primary)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
      >
        {options.map((opt) => (
          <option key={opt.id} value={opt.id}>
            {opt.label}
          </option>
        ))}
      </select>
    </label>
  </div>
);

const EntitySettingsSection = ({ entityType }) => {
  const { getSettings, updateSettings } = useCardDisplaySettings();
  const settings = getSettings(entityType);
  const availableSettings = getAvailableSettings(entityType);
  const viewModes = getViewModes(entityType);

  const handleChange = async (key, value) => {
    try {
      await updateSettings(entityType, key, value);
      showSuccess("Setting saved");
    } catch {
      showError("Failed to save setting");
    }
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {/* Default View Mode - always first if available */}
        {availableSettings.includes("defaultViewMode") && (
          <Dropdown
            label={SETTING_LABELS.defaultViewMode}
            value={settings.defaultViewMode}
            options={viewModes}
            onChange={(v) => handleChange("defaultViewMode", v)}
          />
        )}

        {/* Toggle settings */}
        {availableSettings
          .filter((key) => key !== "defaultViewMode")
          .map((settingKey) => (
            <Toggle
              key={settingKey}
              label={SETTING_LABELS[settingKey]}
              checked={settings[settingKey]}
              onChange={(v) => handleChange(settingKey, v)}
              description={SETTING_DESCRIPTIONS[settingKey]}
            />
          ))}
      </div>
    </div>
  );
};

const CardDisplaySettings = () => {
  const [expandedEntity, setExpandedEntity] = useState("scene");
  const entityTypes = getEntityTypes();

  return (
    <div>
      <h3
        className="text-lg font-semibold mb-4"
        style={{ color: "var(--text-primary)" }}
      >
        Card Display
      </h3>
      <p className="text-sm mb-4" style={{ color: "var(--text-muted)" }}>
        Control what information appears on entity cards and detail pages.
      </p>

      {/* Accordion-style entity sections */}
      <div className="space-y-2">
        {entityTypes.map((entityType) => {
          const config = ENTITY_DISPLAY_CONFIG[entityType];
          return (
            <div
              key={entityType}
              className="rounded-lg border"
              style={{
                backgroundColor: "var(--bg-secondary)",
                borderColor: "var(--border-color)",
              }}
            >
              <button
                onClick={() =>
                  setExpandedEntity(expandedEntity === entityType ? null : entityType)
                }
                className="w-full px-4 py-3 flex justify-between items-center"
                style={{ color: "var(--text-primary)" }}
              >
                <span className="font-medium">{config.label}</span>
                <span>{expandedEntity === entityType ? "−" : "+"}</span>
              </button>
              {expandedEntity === entityType && (
                <div className="px-4 pb-4">
                  <EntitySettingsSection entityType={entityType} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default CardDisplaySettings;
```

**Step 2: Commit**

```bash
cd /home/carrot/code/peek-stash-browser && git add client/src/components/settings/CardDisplaySettings.jsx && git commit -m "feat: CardDisplaySettings UI uses shared config

Now dynamically renders settings based on entityDisplayConfig.
Includes new settings: defaultViewMode, showStudio, showDate, showRelationshipIndicators.

Part of #221"
```

---

## Task 7: Wire New Settings to Card Components

**Files:**
- Modify: `client/src/components/ui/SceneCard.jsx`
- Modify: `client/src/components/cards/GalleryCard.jsx`
- Modify: `client/src/components/cards/ImageCard.jsx`

**Step 1: Update SceneCard to respect new settings**

In `client/src/components/ui/SceneCard.jsx`, update `buildSceneSubtitle` and the component:

```jsx
/**
 * Build scene subtitle with studio, code, and date
 * @param {Object} scene - The scene object
 * @param {Object} options - Display options
 */
const buildSceneSubtitle = (scene, { showCodeOnCard = true, showStudio = true, showDate = true } = {}) => {
  const parts = [];

  if (showStudio && scene.studio) {
    parts.push(scene.studio.name);
  }

  if (showCodeOnCard && scene.code) {
    parts.push(scene.code);
  }

  if (showDate) {
    const date = scene.date ? formatRelativeTime(scene.date) : null;
    if (date) {
      parts.push(date);
    }
  }

  return parts.length > 0 ? parts.join(' • ') : null;
};

// Inside SceneCard component, update subtitle and indicators usage:
const subtitle = buildSceneSubtitle(scene, {
  showCodeOnCard: sceneSettings.showCodeOnCard,
  showStudio: sceneSettings.showStudio,
  showDate: sceneSettings.showDate,
});

// Update indicators prop - only pass if setting enabled
const indicatorsToShow = sceneSettings.showRelationshipIndicators ? indicators : [];

// In BaseCard JSX:
<BaseCard
  // ... other props
  indicators={indicatorsToShow}
  // ...
/>
```

**Step 2: Update GalleryCard to respect new settings**

In `client/src/components/cards/GalleryCard.jsx`:

```jsx
// Update subtitle building (around line 18-31):
const subtitle = (() => {
  const parts = [];

  if (gallerySettings.showStudio && gallery.studio) {
    parts.push(gallery.studio.name);
  }

  if (gallerySettings.showDate && gallery.date) {
    parts.push(new Date(gallery.date).toLocaleDateString());
  }

  return parts.length > 0 ? parts.join(' • ') : null;
})();

// Update indicators (before BaseCard):
const indicatorsToShow = gallerySettings.showRelationshipIndicators ? indicators : [];

// In BaseCard JSX:
<BaseCard
  // ... other props
  indicators={indicatorsToShow}
  // ...
/>
```

**Step 3: Update ImageCard similarly**

Find ImageCard.jsx and apply same pattern for subtitle and indicators.

**Step 4: Run tests**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- --run`
Expected: PASS

**Step 5: Commit**

```bash
cd /home/carrot/code/peek-stash-browser && git add client/src/components/ui/SceneCard.jsx client/src/components/cards/GalleryCard.jsx client/src/components/cards/ImageCard.jsx && git commit -m "feat: Card components respect new display settings

- showStudio: controls studio name in subtitle
- showDate: controls date in subtitle
- showRelationshipIndicators: controls indicator badges

Part of #221"
```

---

## Task 8: Wire Default View Mode to Page Components

**Files:**
- Modify: `client/src/components/pages/Scenes.jsx`
- Modify: `client/src/components/pages/Galleries.jsx`
- Modify: `client/src/components/pages/Images.jsx`
- Modify: `client/src/components/pages/Performers.jsx`
- Modify: `client/src/components/pages/Studios.jsx`
- Modify: `client/src/components/pages/Tags.jsx`
- Modify: `client/src/components/pages/Groups.jsx`

**Step 1: Update Galleries.jsx as example pattern**

```jsx
// At top of file, add import:
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";

// Inside component, before useFilterState or similar:
const { getSettings } = useCardDisplaySettings();
const gallerySettings = getSettings("gallery");

// When initializing view mode state or passing to SearchControls:
// The defaultViewMode should be used as initial value
// This depends on how useFilterState handles initialization

// If useFilterState accepts a defaultViewMode option:
const filterState = useFilterState({
  artifactType: "gallery",
  defaultViewMode: gallerySettings.defaultViewMode,
  // ... other options
});

// OR if viewMode is managed separately, initialize with setting:
const [viewMode, setViewMode] = useState(gallerySettings.defaultViewMode || "grid");
```

**Note:** The exact implementation depends on how each page currently manages viewMode. Some use `useFilterState`, others may manage it directly. Follow the existing pattern in each file.

**Step 2: Apply same pattern to all other page components**

Each page should:
1. Import `useCardDisplaySettings`
2. Get settings for its entity type
3. Use `settings.defaultViewMode` as the initial view mode

**Step 3: Commit**

```bash
cd /home/carrot/code/peek-stash-browser && git add client/src/components/pages/*.jsx && git commit -m "feat: Pages use per-entity default view mode setting

Each page loads defaultViewMode from card display settings.

Completes #221 default view mode feature"
```

---

## Task 9: Fix Fullscreen Exit on Lightbox Close

**Files:**
- Modify: `client/src/components/ui/Lightbox.jsx`

**Step 1: Write test for fullscreen exit on close**

```jsx
// Add to client/tests/components/ui/Lightbox.test.jsx

describe("fullscreen exit behavior", () => {
  it("exits fullscreen when close button is clicked", async () => {
    const exitFullscreen = vi.fn();
    Object.defineProperty(document, "fullscreenElement", {
      value: document.body,
      writable: true,
    });
    document.exitFullscreen = exitFullscreen;

    const onClose = vi.fn();
    render(
      <Lightbox
        images={[{ id: "1", paths: { image: "/test.jpg" } }]}
        isOpen={true}
        onClose={onClose}
        supportsFullscreen={true}
      />
    );

    const closeButton = screen.getByLabelText("Close lightbox");
    fireEvent.click(closeButton);

    expect(exitFullscreen).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it("exits fullscreen on Escape key when not in drawer", async () => {
    const exitFullscreen = vi.fn();
    Object.defineProperty(document, "fullscreenElement", {
      value: document.body,
      writable: true,
    });
    document.exitFullscreen = exitFullscreen;

    const onClose = vi.fn();
    render(
      <Lightbox
        images={[{ id: "1", paths: { image: "/test.jpg" } }]}
        isOpen={true}
        onClose={onClose}
      />
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(exitFullscreen).toHaveBeenCalled();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- --run Lightbox`
Expected: FAIL - exitFullscreen not called because current code doesn't exit fullscreen on close

**Step 3: Create helper function and update close handlers**

In `client/src/components/ui/Lightbox.jsx`:

```jsx
// Add helper function inside component (after hooks, before handlers):
const handleCloseWithFullscreenExit = useCallback(() => {
  // Exit browser fullscreen if active
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(() => {
      // Ignore errors (e.g., if already exiting)
    });
  }
  onClose();
}, [onClose]);

// Update swipe handler (around line 306-311):
onSwipedDown: () => {
  if (drawerOpen) {
    setDrawerOpen(false);
  } else {
    handleCloseWithFullscreenExit();
  }
},

// Update keyboard handler (around line 398-405):
case "Escape":
  if (drawerOpen) {
    setDrawerOpen(false);
  } else if (isFullscreen) {
    // Browser handles fullscreen exit via Escape, but we also close
    handleCloseWithFullscreenExit();
  } else {
    handleCloseWithFullscreenExit();
  }
  break;

// Update close button (around line 587-598):
<button
  onClick={handleCloseWithFullscreenExit}
  className="p-2 rounded-full transition-colors"
  style={{
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    color: "var(--text-primary)",
  }}
  aria-label="Close lightbox"
>
  <X size={24} />
</button>
```

**Step 4: Run test to verify it passes**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- --run Lightbox`
Expected: PASS

**Step 5: Commit**

```bash
cd /home/carrot/code/peek-stash-browser && git add client/src/components/ui/Lightbox.jsx client/tests/components/ui/Lightbox.test.jsx && git commit -m "fix: Closing lightbox now exits browser fullscreen

All close triggers (X button, swipe down, Escape) exit fullscreen mode.

Fixes #221"
```

---

## Task 10: Final Integration Test and Cleanup

**Step 1: Run full test suite**

Run: `cd /home/carrot/code/peek-stash-browser/client && npm test -- --run`
Expected: All tests PASS

**Step 2: Manual testing checklist**

- [ ] View toggle: Rapid clicking shows exactly one active button
- [ ] Table view: Gallery covers display correctly
- [ ] Cards: Hiding all settings makes cards visibly smaller
- [ ] Settings: New toggles appear (showStudio, showDate, showRelationshipIndicators, defaultViewMode)
- [ ] Settings: Toggling settings affects card display
- [ ] Default view mode: Setting persists and loads on page refresh
- [ ] Lightbox: Closing via X/swipe/Escape exits fullscreen

**Step 3: Final commit with issue reference**

```bash
cd /home/carrot/code/peek-stash-browser && git add -A && git commit -m "chore: Final cleanup for #221

All bug fixes and features complete:
- View toggle styling bug fixed
- Table view gallery images fixed
- Card density bug fixed
- New settings: showStudio, showDate, showRelationshipIndicators
- Default view mode per entity type
- Fullscreen exit on lightbox close

Closes #221"
```
