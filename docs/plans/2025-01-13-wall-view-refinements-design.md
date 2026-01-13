# Wall View Refinements Design

> **Status:** Ready for Implementation
> **Branch:** `feature/wall-view-refinements`

## Overview

Two issues to address with the Wall/Mosaic view:

1. **Toolbar button visual inconsistency** - ViewModeToggle and ZoomSlider buttons have different sizing/alignment than other toolbar controls
2. **Missing context-aware settings** - Wall preview behavior setting exists in Settings > Playback but should be accessible from toolbar and moved to Customization

## Design Decisions

- **Settings cog UI:** Popover/panel (not dropdown or modal)
- **Cog position:** After zoom slider in toolbar
- **Setting persistence:** Persistent (saves to user settings, same as Settings page)
- **Extensibility:** Config-driven popover for easy future additions
- **Settings location:** Move wallPlayback and preferredPreviewQuality from Playback to Customization tab

---

## 1. Toolbar Button Visual Consistency

### Problem

- `ViewModeToggle` uses `px-3 py-1.5` with 18px icons
- `ZoomSlider` uses `px-2.5 py-1.5 text-xs` with text labels
- `Button` (sm) uses `px-2 py-1.5` with 22px icons
- Inconsistent heights and vertical alignment

### Solution

Standardize both components to match Button's `sm` size:
- Padding: `px-2 py-1.5`
- Icon size: 16px (slightly smaller than Button's 22px to account for no text)
- Add explicit height matching

**Files:** `ViewModeToggle.jsx`, `ZoomSlider.jsx`

---

## 2. Settings Page Reorganization

### Move to CustomizationTab

1. **Wall View Preview Behavior** (wallPlayback)
2. **Scene Card Preview Quality** (preferredPreviewQuality)

### New CustomizationTab Structure

```
┌─ View Preferences (NEW) ─────────────────────────┐
│  Scene Card Preview Quality: [sprite ▾]          │
│  Wall View Preview Behavior: [autoplay ▾]        │
└──────────────────────────────────────────────────┘

┌─ Measurement Units ──────────────────────────────┐
│  (existing)                                      │
└──────────────────────────────────────────────────┘

┌─ Navigation Settings ────────────────────────────┐
│  (existing)                                      │
└──────────────────────────────────────────────────┘

┌─ Carousel Settings ──────────────────────────────┐
│  (existing)                                      │
└──────────────────────────────────────────────────┘
```

### PlaybackTab Keeps

- Preferred Quality
- Preferred Playback Mode
- Chromecast/AirPlay toggle
- Minimum Play Percent

**Files:** `CustomizationTab.jsx`, `PlaybackTab.jsx`

---

## 3. Context-Aware Settings Cog

### Component: ContextSettings

A toolbar component that:
1. Renders a Settings cog icon
2. Opens a popover panel when clicked
3. Receives config array of settings relevant to current page/view
4. Persists changes to user settings via API
5. Disabled (grayed out) when no context-specific settings apply

### Config Structure

```javascript
const contextSettings = [
  {
    key: "wallPlayback",
    label: "Preview Behavior",
    type: "select",
    options: [
      { value: "autoplay", label: "Autoplay All" },
      { value: "hover", label: "Play on Hover" },
      { value: "static", label: "Static Thumbnails" },
    ],
  },
];
```

### Behavior

- **Settings available:** Normal styling, click opens popover
- **No settings:** Grayed out, tooltip "No view-specific settings available"
- **Changes:** Save immediately on selection, brief toast confirms

### Popover Design

- ~250px wide panel anchored to cog
- Settings rendered based on type (select, toggle, etc.)
- No save button (auto-save on change)

**Files:** New `ContextSettings.jsx`

---

## 4. Toolbar Two-Row Layout

### Problem

Toolbar crowded with: Search, Sort, Direction, Filters, Presets, View Mode, Zoom, Settings Cog

### Solution

Split into two rows with logical grouping:

```
Row 1: [Search Input........................] [Sort ▾] [↓] [Filters]
Row 2: [Filter Presets ▾] [Grid|Wall] [S|M|L] [⚙]
```

- **Row 1:** "What to show" - search and filter controls
- **Row 2:** "How to show it" - view and display controls

### Responsive Behavior

- **Desktop (≥768px):** Two rows as shown
- **Mobile (<768px):** Stack vertically, controls wrap naturally

**Files:** `SearchControls.jsx`

---

## Implementation Order

1. Fix toolbar button consistency (ViewModeToggle, ZoomSlider)
2. Move settings to CustomizationTab, remove from PlaybackTab
3. Create ContextSettings component
4. Reorganize SearchControls into two rows and integrate ContextSettings

---

## Files Summary

**Modify:**
- `client/src/components/ui/ViewModeToggle.jsx`
- `client/src/components/ui/ZoomSlider.jsx`
- `client/src/components/ui/SearchControls.jsx`
- `client/src/components/settings/tabs/CustomizationTab.jsx`
- `client/src/components/settings/tabs/PlaybackTab.jsx`

**Create:**
- `client/src/components/ui/ContextSettings.jsx`

**No backend changes needed** - wallPlayback and preferredPreviewQuality already exist in user settings schema.
