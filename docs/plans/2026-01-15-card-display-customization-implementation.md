# Card Display Customization Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow users to customize what information appears on entity cards (scene code, descriptions, rating/favorite/O counter controls) with settings accessible from the Settings page and in-context via card grids.

**Architecture:** Add a `cardDisplaySettings` JSON field to the User model storing per-entity-type visibility toggles. Create a React context/hook (`useCardDisplaySettings`) to provide settings throughout the app. Modify cards and detail pages to respect these settings.

**Tech Stack:** Prisma (SQLite), Express API, React (Context API), existing UI patterns from CustomizationTab.

---

## Phase 1: Foundation

### Task 1: Add description to PerformerCard

**Files:**
- Modify: `client/src/components/cards/PerformerCard.jsx`

**Step 1: Add description prop to BaseCard**

In `PerformerCard.jsx`, remove `hideDescription` and add `description` prop:

```jsx
// Line 86: Change from:
hideDescription
// To:
description={performer.details}
```

**Step 2: Verify visually**

Run: `npm run dev` (client)
Navigate to Performers grid, verify performers with details now show descriptions.

**Step 3: Commit**

```bash
git add client/src/components/cards/PerformerCard.jsx
git commit -m "feat(cards): show description on PerformerCard

Performers with details now display them on cards, matching other entity types."
```

---

### Task 2: Add description to ImageCard

**Files:**
- Modify: `client/src/components/cards/ImageCard.jsx`

**Step 1: Add description prop to BaseCard**

Images don't have a direct description field, but they can inherit from galleries. Check if there's a description or title we can use. Looking at the code, images have a `title` field but no description. For consistency, we'll pass the image title as description if it exists and is different from what's shown as the card title.

Actually, looking at the data model, images don't have a `description` field. The title is already shown. Skip this task - ImageCard doesn't need a description since images don't have one.

**Step 1: Verify ImageCard data model**

Images in the schema don't have a description field. The `title` is already displayed. No change needed for ImageCard description.

**Step 2: Commit (skip if no changes)**

No changes needed - ImageCard already doesn't show description because images don't have one.

---

### Task 3: Audit skeleton vs actual card heights

**Files:**
- Read: `client/src/components/ui/SkeletonSceneCard.jsx`
- Read: `client/src/components/ui/BaseCard.jsx`
- Read: `client/src/components/ui/CardComponents.jsx`

**Step 1: Document current skeleton structure**

Current SkeletonSceneCard has:
- Thumbnail: `aspect-video` (16:9)
- Title: `h-5` (1.25rem)
- Stats row: 3 items with `h-4` each
- Metadata rows: performers, studio, tags with `h-3` each
- Quality badges: `h-5` (1.25rem)
- Rating row: `height: 2rem`

**Step 2: Document actual card structure**

Actual cards have:
- Image: aspect ratio via `useEntityImageAspectRatio`
- Title: via `CardTitle` component
- Description: via `CardDescription` (optional)
- Indicators: via `CardIndicators` with fixed `height: 3.5rem`
- Rating row: via `CardRatingRow` with fixed `height: 2rem`

**Step 3: Identify mismatches**

The skeleton shows metadata rows (performers, studio, tags) which don't exist in the actual card structure. The actual card has:
- Title (with optional subtitle)
- Description (expandable)
- Indicators (count badges)
- Rating row

The skeleton is outdated and doesn't match current card anatomy.

---

### Task 4: Fix SkeletonSceneCard to match actual card anatomy

**Files:**
- Modify: `client/src/components/ui/SkeletonSceneCard.jsx`

**Step 1: Rewrite skeleton to match BaseCard structure**

Replace the entire component with one that matches actual card anatomy:

```jsx
/**
 * Skeleton loading card that matches BaseCard structure
 * Used in carousels and grids while data is loading
 */
const SkeletonSceneCard = ({ entityType = "scene" }) => {
  // Match aspect ratio logic from useEntityImageAspectRatio
  const aspectRatio = ["performer", "gallery", "group"].includes(entityType)
    ? "2/3"
    : "16/9";

  return (
    <div
      className="relative rounded-lg border overflow-hidden"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
        borderWidth: "1px",
      }}
    >
      {/* Image skeleton */}
      <div
        className="relative animate-pulse"
        style={{
          aspectRatio,
          backgroundColor: "var(--bg-tertiary)",
        }}
      />

      {/* Card content */}
      <div className="p-3 space-y-2">
        {/* Title skeleton */}
        <div
          className="h-5 rounded animate-pulse"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            width: "85%",
          }}
        />

        {/* Subtitle skeleton */}
        <div
          className="h-4 rounded animate-pulse"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            width: "60%",
          }}
        />

        {/* Description skeleton (2 lines) */}
        <div className="space-y-1">
          <div
            className="h-3 rounded animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              width: "100%",
            }}
          />
          <div
            className="h-3 rounded animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              width: "75%",
            }}
          />
        </div>

        {/* Indicators skeleton - matches CardIndicators height */}
        <div
          className="flex items-center gap-2"
          style={{ height: "3.5rem" }}
        >
          <div
            className="h-6 rounded-full animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              width: "3rem",
            }}
          />
          <div
            className="h-6 rounded-full animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              width: "3rem",
            }}
          />
          <div
            className="h-6 rounded-full animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              width: "3rem",
            }}
          />
        </div>

        {/* Rating controls row skeleton - matches CardRatingRow height */}
        <div
          className="flex justify-between items-center w-full"
          style={{ height: "2rem" }}
        >
          {/* Rating badge placeholder */}
          <div
            className="h-6 rounded-full animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              width: "3.5rem",
            }}
          />

          {/* Right side: O Counter + Favorite + Menu */}
          <div className="flex items-center gap-2">
            <div
              className="h-6 w-6 rounded-full animate-pulse"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            />
            <div
              className="h-6 w-6 rounded-full animate-pulse"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            />
            <div
              className="h-6 w-6 rounded-full animate-pulse"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkeletonSceneCard;
```

**Step 2: Verify skeleton matches loaded card**

Run: `npm run dev`
Navigate to Scenes grid, observe skeleton during loading matches the loaded card structure.

**Step 3: Commit**

```bash
git add client/src/components/ui/SkeletonSceneCard.jsx
git commit -m "fix(skeleton): align SkeletonSceneCard with actual card anatomy

- Match image aspect ratio
- Add title and subtitle placeholders
- Add description placeholder
- Match indicators section height (3.5rem)
- Match rating row height (2rem)
- Remove outdated metadata rows"
```

---

## Phase 2: Core Infrastructure

### Task 5: Add cardDisplaySettings to database schema

**Files:**
- Modify: `server/prisma/schema.prisma`

**Step 1: Add field to User model**

After line 30 (after `tableColumnDefaults`), add:

```prisma
  cardDisplaySettings     Json? // Object with per-entity-type card display toggles: {scene: {showCodeOnCard, showDescriptionOnCard, ...}, performer: {...}, ...}
```

**Step 2: Generate migration**

Run:
```bash
cd server && npx prisma migrate dev --name add_card_display_settings
```

Expected: Migration created successfully.

**Step 3: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/migrations/
git commit -m "feat(db): add cardDisplaySettings field to User model

JSON field for per-entity-type card display preferences:
- showCodeOnCard (scene only)
- showDescriptionOnCard
- showDescriptionOnDetail
- showRating
- showFavorite
- showOCounter"
```

---

### Task 6: Add cardDisplaySettings to user settings API

**Files:**
- Modify: `server/controllers/user.ts`

**Step 1: Add to GET /settings select**

Find the `select` object in the settings GET handler and add `cardDisplaySettings: true`.

**Step 2: Add to PUT /settings validation and update**

Add validation for `cardDisplaySettings` similar to `tableColumnDefaults`:

```typescript
// In validation section
if (cardDisplaySettings !== undefined) {
  if (cardDisplaySettings !== null && typeof cardDisplaySettings !== "object") {
    return res.status(400).json({ error: "Card display settings must be an object or null" });
  }
}

// In update data object
...(cardDisplaySettings !== undefined && { cardDisplaySettings }),
```

**Step 3: Verify API works**

Run: `curl -X PUT http://localhost:3001/api/user/settings -H "Content-Type: application/json" -d '{"cardDisplaySettings": {"scene": {"showCodeOnCard": false}}}'`

Expected: 200 OK with updated settings.

**Step 4: Commit**

```bash
git add server/controllers/user.ts
git commit -m "feat(api): add cardDisplaySettings to user settings endpoints

- Include in GET /user/settings response
- Accept in PUT /user/settings with validation
- Follows existing pattern for JSON settings fields"
```

---

### Task 7: Create useCardDisplaySettings hook

**Files:**
- Create: `client/src/hooks/useCardDisplaySettings.js`
- Create: `client/src/contexts/CardDisplaySettingsContext.jsx`

**Step 1: Create the context**

```jsx
// client/src/contexts/CardDisplaySettingsContext.jsx
import { createContext, useContext, useState, useEffect, useCallback } from "react";
import axios from "axios";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

// Default settings - all features ON
const DEFAULT_ENTITY_SETTINGS = {
  showDescriptionOnCard: true,
  showDescriptionOnDetail: true,
  showRating: true,
  showFavorite: true,
  showOCounter: true,
};

const DEFAULT_SCENE_SETTINGS = {
  ...DEFAULT_ENTITY_SETTINGS,
  showCodeOnCard: true,
};

const getDefaultSettings = (entityType) => {
  if (entityType === "scene") {
    return DEFAULT_SCENE_SETTINGS;
  }
  return DEFAULT_ENTITY_SETTINGS;
};

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

  // Get settings for a specific entity type (with defaults)
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

**Step 2: Add provider to app**

Find the main App component and wrap with `CardDisplaySettingsProvider`. This is likely in `client/src/App.jsx` or similar.

**Step 3: Verify hook works**

Add a console.log in a card component to verify settings are accessible.

**Step 4: Commit**

```bash
git add client/src/contexts/CardDisplaySettingsContext.jsx
git commit -m "feat(client): add CardDisplaySettingsContext and useCardDisplaySettings hook

- Provides card display settings throughout the app
- getSettings(entityType) returns settings with defaults
- updateSettings(entityType, key, value) persists changes
- Optimistic updates with error rollback"
```

---

### Task 8: Wire up CardDisplaySettingsProvider in App

**Files:**
- Modify: `client/src/App.jsx` (or wherever providers are configured)

**Step 1: Import and add provider**

```jsx
import { CardDisplaySettingsProvider } from "./contexts/CardDisplaySettingsContext.jsx";

// Wrap existing content with provider (inside other providers)
<CardDisplaySettingsProvider>
  {/* existing app content */}
</CardDisplaySettingsProvider>
```

**Step 2: Verify no errors**

Run: `npm run dev`
Expected: App loads without errors.

**Step 3: Commit**

```bash
git add client/src/App.jsx
git commit -m "feat(client): wire up CardDisplaySettingsProvider in App"
```

---

## Phase 3: Card Customization

### Task 9: Implement scene code toggle on SceneCard

**Files:**
- Modify: `client/src/components/ui/SceneCard.jsx`

**Step 1: Import useCardDisplaySettings**

```jsx
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";
```

**Step 2: Use settings to control code in subtitle**

Find where the subtitle is built (likely around line 25-30 where `scene.code` is used). Modify to check settings:

```jsx
const { getSettings } = useCardDisplaySettings();
const sceneSettings = getSettings("scene");

// In subtitle building logic:
if (sceneSettings.showCodeOnCard && scene.code) {
  parts.push(scene.code);
}
```

**Step 3: Verify toggle works**

Manually set `showCodeOnCard: false` in database, verify code disappears from scene cards.

**Step 4: Commit**

```bash
git add client/src/components/ui/SceneCard.jsx
git commit -m "feat(cards): implement scene code toggle on SceneCard

Scene code (e.g., JAV codes) in subtitle now respects showCodeOnCard setting."
```

---

### Task 10: Implement description toggle on cards

**Files:**
- Modify: `client/src/components/ui/SceneCard.jsx`
- Modify: `client/src/components/cards/PerformerCard.jsx`
- Modify: `client/src/components/cards/StudioCard.jsx`
- Modify: `client/src/components/cards/GalleryCard.jsx`
- Modify: `client/src/components/cards/GroupCard.jsx`
- Modify: `client/src/components/cards/TagCard.jsx`

**Step 1: Update each card to use settings**

For each card component:

1. Import `useCardDisplaySettings`
2. Get settings for entity type
3. Pass `displayPreferences={{ showDescription: settings.showDescriptionOnCard }}` to BaseCard

Example for StudioCard:

```jsx
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";

// Inside component:
const { getSettings } = useCardDisplaySettings();
const studioSettings = getSettings("studio");

// In BaseCard props:
displayPreferences={{ showDescription: studioSettings.showDescriptionOnCard }}
```

**Step 2: Verify each card respects setting**

Test by setting `showDescriptionOnCard: false` for each entity type.

**Step 3: Commit**

```bash
git add client/src/components/ui/SceneCard.jsx client/src/components/cards/*.jsx
git commit -m "feat(cards): implement description toggle for all card types

All entity cards now respect showDescriptionOnCard setting from user preferences."
```

---

### Task 11: Implement rating controls toggles

**Files:**
- Modify: `client/src/components/ui/CardComponents.jsx` (CardRatingRow)
- Modify: All card components to pass visibility props

**Step 1: Add visibility props to CardRatingRow**

Modify `CardRatingRow` to accept and respect visibility props:

```jsx
export const CardRatingRow = ({
  entityType,
  entityId,
  initialRating,
  initialFavorite,
  initialOCounter,
  entityTitle,
  onHideSuccess,
  onOCounterChange,
  onRatingChange,
  onFavoriteChange,
  // NEW: visibility controls
  showRating = true,
  showFavorite = true,
  showOCounter = true,
}) => {
  // ... existing state and handlers ...

  return (
    <>
      <div
        className="flex justify-between items-center w-full my-1"
        style={{ height: "2rem" }}
      >
        {/* Left side: Rating badge (conditional) */}
        <div ref={badgeRef}>
          {showRating ? (
            <RatingBadge
              rating={rating}
              onClick={() => setDialogOpen(true)}
              size="small"
            />
          ) : (
            <div /> {/* Empty placeholder to maintain layout */}
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

      {/* Dialogs only needed if controls are shown */}
      {showRating && (
        <RatingSliderDialog
          isOpen={dialogOpen}
          onClose={() => setDialogOpen(false)}
          initialRating={rating}
          onSave={handleRatingSave}
          entityType={entityType}
          entityTitle={entityTitle}
          anchorEl={badgeRef.current}
        />
      )}

      <HideConfirmationDialog
        isOpen={hideDialogOpen}
        onClose={handleHideCancel}
        onConfirm={handleHideConfirm}
        entityType={pendingHide?.entityType}
        entityName={pendingHide?.entityName}
      />
    </>
  );
};
```

**Step 2: Update all cards to pass visibility props**

Each card needs to get settings and pass to ratingControlsProps:

```jsx
const { getSettings } = useCardDisplaySettings();
const settings = getSettings("scene"); // or appropriate entity type

// In ratingControlsProps:
ratingControlsProps={{
  ...existingProps,
  showRating: settings.showRating,
  showFavorite: settings.showFavorite,
  showOCounter: settings.showOCounter,
}}
```

**Step 3: Commit**

```bash
git add client/src/components/ui/CardComponents.jsx client/src/components/ui/SceneCard.jsx client/src/components/cards/*.jsx
git commit -m "feat(cards): implement rating/favorite/O counter visibility toggles

- CardRatingRow accepts showRating, showFavorite, showOCounter props
- All card components pass settings to control visibility
- EntityMenu always visible for hide functionality"
```

---

## Phase 4: Detail Page Integration

### Task 12: Implement settings on SceneDetails

**Files:**
- Modify: `client/src/components/pages/SceneDetails.jsx`

**Step 1: Import and use settings**

```jsx
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";

// Inside component:
const { getSettings } = useCardDisplaySettings();
const sceneSettings = getSettings("scene");
```

**Step 2: Conditionally render description**

Wrap description section:

```jsx
{sceneSettings.showDescriptionOnDetail && scene.details && (
  <DescriptionSection details={scene.details} />
)}
```

**Step 3: Conditionally render rating controls**

Find where RatingSlider, FavoriteButton, OCounterButton are rendered and wrap:

```jsx
{sceneSettings.showRating && <RatingSlider ... />}
{sceneSettings.showFavorite && <FavoriteButton ... />}
{sceneSettings.showOCounter && <OCounterButton ... />}
```

**Step 4: Commit**

```bash
git add client/src/components/pages/SceneDetails.jsx
git commit -m "feat(detail): implement display settings on SceneDetails page

- Description respects showDescriptionOnDetail
- Rating/Favorite/O Counter respect visibility settings"
```

---

### Task 13: Implement settings on other detail pages

**Files:**
- Modify: `client/src/components/pages/PerformerDetail.jsx`
- Modify: `client/src/components/pages/StudioDetails.jsx`
- Modify: `client/src/components/pages/GalleryDetails.jsx`
- Modify: `client/src/components/pages/GroupDetails.jsx`
- Modify: `client/src/components/pages/TagDetails.jsx`
- Modify: `client/src/components/pages/ImageDetails.jsx` (if exists)

**Step 1: Apply same pattern to each detail page**

For each:
1. Import `useCardDisplaySettings`
2. Get settings for entity type
3. Conditionally render description based on `showDescriptionOnDetail`
4. Conditionally render rating controls based on `showRating`, `showFavorite`, `showOCounter`

**Step 2: Commit**

```bash
git add client/src/components/pages/*Detail*.jsx
git commit -m "feat(detail): implement display settings on all detail pages

All entity detail pages now respect card display settings for:
- Description visibility
- Rating/Favorite/O Counter visibility"
```

---

## Phase 5: Settings UI

### Task 14: Create CardDisplaySettings component

**Files:**
- Create: `client/src/components/settings/CardDisplaySettings.jsx`

**Step 1: Create the component**

```jsx
import { useState, useEffect } from "react";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";
import { showSuccess, showError } from "../../utils/toast.jsx";

const ENTITY_TYPES = [
  { id: "scene", label: "Scene", hasCode: true },
  { id: "performer", label: "Performer", hasCode: false },
  { id: "studio", label: "Studio", hasCode: false },
  { id: "gallery", label: "Gallery", hasCode: false },
  { id: "group", label: "Group", hasCode: false },
  { id: "tag", label: "Tag", hasCode: false },
  { id: "image", label: "Image", hasCode: false },
];

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

const EntitySettingsSection = ({ entityType, label, hasCode }) => {
  const { getSettings, updateSettings } = useCardDisplaySettings();
  const settings = getSettings(entityType);

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
      <h4
        className="font-medium"
        style={{ color: "var(--text-primary)" }}
      >
        {label}
      </h4>
      <div className="space-y-2 pl-2">
        {hasCode && (
          <Toggle
            label="Show studio code on cards"
            checked={settings.showCodeOnCard}
            onChange={(v) => handleChange("showCodeOnCard", v)}
            description="Display scene codes (e.g., JAV codes) in card subtitles"
          />
        )}
        <Toggle
          label="Show description on cards"
          checked={settings.showDescriptionOnCard}
          onChange={(v) => handleChange("showDescriptionOnCard", v)}
        />
        <Toggle
          label="Show description on detail page"
          checked={settings.showDescriptionOnDetail}
          onChange={(v) => handleChange("showDescriptionOnDetail", v)}
        />
        <Toggle
          label="Show rating"
          checked={settings.showRating}
          onChange={(v) => handleChange("showRating", v)}
        />
        <Toggle
          label="Show favorite"
          checked={settings.showFavorite}
          onChange={(v) => handleChange("showFavorite", v)}
        />
        <Toggle
          label="Show O counter"
          checked={settings.showOCounter}
          onChange={(v) => handleChange("showOCounter", v)}
        />
      </div>
    </div>
  );
};

const CardDisplaySettings = () => {
  const [expandedEntity, setExpandedEntity] = useState("scene");

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
        {ENTITY_TYPES.map(({ id, label, hasCode }) => (
          <div
            key={id}
            className="rounded-lg border"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-color)",
            }}
          >
            <button
              onClick={() => setExpandedEntity(expandedEntity === id ? null : id)}
              className="w-full px-4 py-3 flex justify-between items-center"
              style={{ color: "var(--text-primary)" }}
            >
              <span className="font-medium">{label}</span>
              <span>{expandedEntity === id ? "−" : "+"}</span>
            </button>
            {expandedEntity === id && (
              <div className="px-4 pb-4">
                <EntitySettingsSection
                  entityType={id}
                  label={label}
                  hasCode={hasCode}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CardDisplaySettings;
```

**Step 2: Commit**

```bash
git add client/src/components/settings/CardDisplaySettings.jsx
git commit -m "feat(settings): create CardDisplaySettings component

Accordion-style UI for configuring card display per entity type:
- Scene code toggle (scene only)
- Description toggles (cards and detail pages)
- Rating/Favorite/O Counter toggles"
```

---

### Task 15: Add CardDisplaySettings to CustomizationTab

**Files:**
- Modify: `client/src/components/settings/tabs/CustomizationTab.jsx`

**Step 1: Import and add component**

```jsx
import CardDisplaySettings from "../CardDisplaySettings.jsx";

// In the return, add after View Preferences section (around line 203):
{/* Card Display Settings */}
<div
  className="p-6 rounded-lg border"
  style={{
    backgroundColor: "var(--bg-card)",
    borderColor: "var(--border-color)",
  }}
>
  <CardDisplaySettings />
</div>
```

**Step 2: Verify in UI**

Run: `npm run dev`
Navigate to Settings > Customization, verify Card Display section appears.

**Step 3: Commit**

```bash
git add client/src/components/settings/tabs/CustomizationTab.jsx
git commit -m "feat(settings): add CardDisplaySettings to Customization tab"
```

---

### Task 16: Add card display to ContextSettings

**Files:**
- Modify: `client/src/components/ui/ContextSettings.jsx`

**Step 1: Extend ContextSettings to support card display settings**

Add a new section for card display when entity type is provided:

```jsx
// Add prop for entityType
const ContextSettings = ({ settings, onSettingChange, entityType }) => {
  const { getSettings, updateSettings } = useCardDisplaySettings();
  const cardSettings = entityType ? getSettings(entityType) : null;

  // ... existing code ...

  // Add card display section when entityType is provided
  {entityType && cardSettings && (
    <div className="border-t pt-3 mt-3" style={{ borderColor: "var(--border-color)" }}>
      <h4 className="text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
        Card Display
      </h4>
      <div className="space-y-2">
        {entityType === "scene" && (
          <Toggle
            label="Show code"
            checked={cardSettings.showCodeOnCard}
            onChange={(v) => updateSettings(entityType, "showCodeOnCard", v)}
          />
        )}
        <Toggle
          label="Show description"
          checked={cardSettings.showDescriptionOnCard}
          onChange={(v) => updateSettings(entityType, "showDescriptionOnCard", v)}
        />
        <Toggle
          label="Show rating"
          checked={cardSettings.showRating}
          onChange={(v) => updateSettings(entityType, "showRating", v)}
        />
        <Toggle
          label="Show favorite"
          checked={cardSettings.showFavorite}
          onChange={(v) => updateSettings(entityType, "showFavorite", v)}
        />
        <Toggle
          label="Show O counter"
          checked={cardSettings.showOCounter}
          onChange={(v) => updateSettings(entityType, "showOCounter", v)}
        />
      </div>
    </div>
  )}
};
```

**Step 2: Update grid components to pass entityType to ContextSettings**

Find where ContextSettings is used in grids and pass the entityType prop.

**Step 3: Commit**

```bash
git add client/src/components/ui/ContextSettings.jsx
git commit -m "feat(ui): add card display toggles to ContextSettings popover

Quick access to card display settings from grid context menus."
```

---

### Task 17: Add settings cog to entity search pages

**Files:**
- Modify entity search/list pages to include ContextSettings with entityType

This task depends on the specific structure of search pages. Find where the settings cog is rendered and ensure entityType is passed to ContextSettings.

**Step 1: Identify search page components**

Look for files like `SceneSearch.jsx`, `PerformerSearch.jsx`, etc. or grid wrapper components.

**Step 2: Add/update ContextSettings usage**

Ensure each search page passes entityType to ContextSettings.

**Step 3: Commit**

```bash
git add client/src/components/pages/*.jsx
git commit -m "feat(search): add card display settings to entity search pages"
```

---

## Phase 6: Skeleton Adaptation

### Task 18: Make skeleton respect display settings

**Files:**
- Modify: `client/src/components/ui/SkeletonSceneCard.jsx`

**Step 1: Accept and use display settings**

```jsx
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";

const SkeletonSceneCard = ({ entityType = "scene" }) => {
  const { getSettings } = useCardDisplaySettings();
  const settings = getSettings(entityType);

  const showDescription = settings.showDescriptionOnCard;
  const showRatingRow = settings.showRating || settings.showFavorite || settings.showOCounter;

  // ... aspect ratio logic ...

  return (
    <div ...>
      {/* Image skeleton */}
      ...

      <div className="p-3 space-y-2">
        {/* Title skeleton */}
        ...

        {/* Subtitle skeleton */}
        ...

        {/* Description skeleton (conditional) */}
        {showDescription && (
          <div className="space-y-1">
            <div className="h-3 rounded animate-pulse" style={{...}} />
            <div className="h-3 rounded animate-pulse" style={{...}} />
          </div>
        )}

        {/* Indicators skeleton */}
        ...

        {/* Rating controls row skeleton (conditional based on any control being visible) */}
        {showRatingRow && (
          <div className="flex justify-between items-center w-full" style={{ height: "2rem" }}>
            {settings.showRating && <div ... />}
            <div className="flex items-center gap-2">
              {settings.showOCounter && <div ... />}
              {settings.showFavorite && <div ... />}
              {/* EntityMenu placeholder always shown */}
              <div className="h-6 w-6 rounded-full animate-pulse" style={{...}} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
```

**Step 2: Verify skeleton matches customized card**

Toggle settings and verify skeleton adapts accordingly.

**Step 3: Commit**

```bash
git add client/src/components/ui/SkeletonSceneCard.jsx
git commit -m "feat(skeleton): adapt skeleton to respect card display settings

Skeleton now shows/hides sections based on user's card display preferences,
ensuring seamless loading transitions."
```

---

## Final Verification

### Task 19: End-to-end testing

**Step 1: Test all entity types**

For each entity type (scene, performer, studio, gallery, group, tag, image):
1. Toggle each setting in Settings > Customization
2. Verify cards update accordingly
3. Verify detail pages update accordingly
4. Verify skeleton matches loaded state

**Step 2: Test quick access**

1. Open a grid (e.g., Scenes)
2. Open ContextSettings
3. Toggle card display settings
4. Verify immediate effect

**Step 3: Test persistence**

1. Change settings
2. Refresh page
3. Verify settings persist

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete card display customization feature

Allows users to customize card display per entity type:
- Scene code visibility (scene only)
- Description visibility (cards and detail pages separately)
- Rating/Favorite/O Counter visibility

Settings accessible from:
- Settings > Customization > Card Display
- ContextSettings popover on grids
- Settings cog on search pages"
```
