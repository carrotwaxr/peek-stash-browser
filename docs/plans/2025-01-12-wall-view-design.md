# Wall View Design

**Date:** 2025-01-12
**Status:** Ready for implementation
**Branch:** `feature/view-mode-options`

## Overview

A justified gallery "Wall" view mode for Scenes, Galleries, and Images that mirrors Stash's SceneWallPanel behavior - preserving aspect ratios with minimal letterboxing, with all visible previews playing simultaneously.

## Scope

**Entity types:** Scenes, Galleries, Images (not Performers, Studios, Tags, Groups)

**Locations:** All search pages AND all detail page tabs where these entities appear with SearchControls:

- Scene Search (`/scenes`)
- Gallery Search (`/galleries`)
- Image Search (`/images`)
- Performer detail → Scenes, Galleries, Images tabs
- Studio detail → Scenes, Galleries tabs
- Tag detail → Scenes, Galleries, Images tabs
- Group detail → Scenes tab
- Gallery detail → Images tab

**View modes:** Grid (current cards) and Wall (new)

## Key Behaviors

- Justified layout using `react-photo-gallery` or `react-photo-album`
- 3 zoom levels: small / medium / large (controls target row height)
- Wall-specific playback setting: autoplay all / hover only / static (global setting)
- Hover overlay: title + key metadata with gradient, 500ms fade-in delay
- View preference synced to URL and saved in filter presets
- Grid remains the default; users can set a default preset with wall view

## Component Architecture

### New Components

| Component | Purpose |
|-----------|---------|
| `client/src/components/wall/WallView.jsx` | Justified gallery container using react-photo-gallery |
| `client/src/components/wall/WallItem.jsx` | Individual item with hover overlay, preview playback |
| `client/src/components/wall/wallConfig.js` | Entity-specific configuration (scene/gallery/image) |
| `client/src/components/ui/ViewModeToggle.jsx` | Grid/Wall icon button group |
| `client/src/components/ui/ZoomSlider.jsx` | S/M/L zoom control |

### Modified Components

| Component | Changes |
|-----------|---------|
| `SearchControls.jsx` | Add ViewModeToggle, ZoomSlider, pass view/zoom state |
| `useFilterState.js` | Parse/sync `view` and `zoom` URL params |
| `FilterPresets.jsx` | Save/load view and zoom in presets |
| `SceneSearch.jsx` | Conditional render WallView or grid |
| `GallerySearch.jsx` | Conditional render WallView or grid |
| `ImageSearch.jsx` | Conditional render WallView or grid |
| Detail page tab components | Conditional render WallView or grid |
| `Settings.jsx` | Add wallPlayback setting |
| `prisma/schema.prisma` | Add wallPlayback to user preferences (if stored server-side) |

### Shared Logic (DRY)

WallView accepts a generic `items` array and `entityType` prop. Entity-specific rendering is configured via wallConfig:

```javascript
const wallConfig = {
  scene: {
    getImageUrl: (item) => item.paths?.screenshot,
    getPreviewUrl: (item) => item.paths?.preview,
    getAspectRatio: (item) => {
      const file = item.files?.[0];
      return file ? file.width / file.height : 16/9;
    },
    getTitle: (item) => item.title || "Untitled",
    getSubtitle: (item) => [item.studio?.name, formatDate(item.date)].filter(Boolean).join(" • "),
    getLinkPath: (item) => `/scenes/${item.id}`,
  },

  gallery: {
    getImageUrl: (item) => item.cover?.paths?.thumbnail,
    getPreviewUrl: () => null,
    getAspectRatio: (item) => {
      const cover = item.cover;
      return cover ? cover.width / cover.height : 4/3;
    },
    getTitle: (item) => item.title || "Untitled Gallery",
    getSubtitle: (item) => `${item.image_count} images`,
    getLinkPath: (item) => `/galleries/${item.id}`,
  },

  image: {
    getImageUrl: (item) => item.paths?.thumbnail,
    getPreviewUrl: () => null,
    getAspectRatio: (item) => item.width && item.height ? item.width / item.height : 1,
    getTitle: (item) => item.title || item.files?.[0]?.basename || "Untitled",
    getSubtitle: (item) => formatResolution(item.width, item.height),
    getLinkPath: (item) => `/images/${item.id}`,
  },
}
```

## State & URL Sync

### URL Parameters

| Param | Values | Default |
|-------|--------|---------|
| `view` | `"grid"` \| `"wall"` | `"grid"` |
| `zoom` | `"small"` \| `"medium"` \| `"large"` | `"medium"` |

Example: `/scenes?sort=o_counter&view=wall&zoom=large`

### Preset Integration

Filter presets already save `sort`, `direction`, and `filters`. Extend to also save `view` and `zoom`. When a preset is loaded, it applies the saved view mode and zoom along with filters/sort.

### Global Settings (not URL-synced)

| Setting | Values | Default |
|---------|--------|---------|
| `wallPlayback` | `"autoplay"` \| `"hover"` \| `"static"` | `"autoplay"` |

This lives in Settings → Display since it's about device capability, not search context.

## Layout & Styling

### Target Row Heights by Zoom

| Zoom | Target Height | Approx items/row (1920px) |
|------|---------------|---------------------------|
| small | 150px | 6-8 items |
| medium | 220px | 4-5 items |
| large | 320px | 2-3 items |

### Aspect Ratio Sources

- Scenes: video file dimensions (`file.width`/`file.height`)
- Galleries: cover image dimensions
- Images: image dimensions

### Hover Overlay

```
┌─────────────────────────────────┐
│                                 │
│         [video/image]           │
│                                 │
│  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ │  ← gradient (transparent → 30% black)
│  Title of Scene                 │
│  Studio Name • Jan 15, 2024     │
└─────────────────────────────────┘
```

- Gradient: 100px height from bottom
- Text: appears on hover after 500ms delay
- Padding: 1rem horizontal, 20px from bottom
- Title: primary text color, single line truncate
- Subtitle: secondary/muted text color
- Gap between items: 2-4px

## Preview Playback

### Playback Modes

| Mode | Behavior |
|------|----------|
| `autoplay` | All visible videos play via Intersection Observer. Hover controls sound. |
| `hover` | Static thumbnail until hover, then video plays. |
| `static` | Thumbnail only, no video playback. |

### Implementation

- Intersection Observer triggers play/pause based on viewport visibility
- Reuse existing preview quality logic (sprite/webp/mp4 fallback chain)
- Sound: muted by default, 5% volume on hover if `soundOnPreview` enabled
- Performance: limit simultaneous video elements to visible viewport + buffer

## UI Integration

### Toolbar Layout

```
[ Search input ] [ Sort ▼ ] [↑↓] [ Filters ] [ Presets ▼ ] [ ⊞ ▣ ] [ S M L ]
                                                            ↑        ↑
                                                     ViewModeToggle  ZoomSlider
                                                                    (wall only)
```

### ViewModeToggle

Two icon buttons in a button group:
- Grid icon (grid-2x2 style)
- Wall icon (solid square style)

Active state uses primary color, inactive uses secondary.

### ZoomSlider

Simple 3-position segmented control: S / M / L. Only visible when view mode is `wall`.

### Mobile

View mode toggle wraps with other controls on narrow screens.

## New Dependency

`react-photo-gallery` or `react-photo-album` (newer maintained fork) for justified layout algorithm.

## Related Documents

- [View Mode Options Brainstorm](./2025-01-11-view-mode-options-brainstorm.md) - Original ideation document with additional view modes for future consideration
