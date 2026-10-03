# Clips

Browse and play scene markers (clips) from your Stash library. Clips are short segments of scenes, typically created around tags or specific moments.

## Browsing Clips

**Location:** Navigation menu → **Clips**

The Clips page shows all clips synced from your Stash library. Each clip card displays:

- Animated preview thumbnail (if generated in Stash)
- Clip title, or its tag's name when it has none
- Duration badge
- Tag indicators
- "No preview" badge for ungenerated clips

### View Modes

Clips support three view modes, selectable from the toolbar:

- **Grid** (default) — Card-based layout with animated previews on hover
- **Wall** — Compact masonry layout
- **Table** — Sortable table with configurable columns

All view modes support adjustable density controls.

## Filtering Clips

Click **+ Filter** in the bar under the search box (or press `f`) to add a filter; the filters in use show as chips, and you can pin the ones you use most. On a phone, **Filters** opens a sheet instead. See [Filters](browse-and-display.md#filters). Available filters:

| Filter | Description |
|--------|-------------|
| **Clip Tags** | Tags applied directly to the clip. Supports ANY / ALL / NONE, include or exclude per tag, and **Include sub-tags** |
| **Scene Tags** | Tags on the parent scene, with the same choices |
| **Performers** | Performers in the parent scene. Supports ANY / ALL / NONE and include or exclude per performer |
| **Studio** | Studio of the parent scene: pick several, include or exclude each, and **Include sub-studios**. A scene with no studio is kept by an exclusion |
| **Scenes** | Clips of the scenes you pick, found by their title |
| **Has Preview** | Filter by generation status: "With preview only" (the default, so a clip without a preview does not list until you change it), "Without preview only", or "All clips" |
| **Duration (seconds)** | How long the clip lasts: a minimum, a maximum, or both. A clip with no end time never matches |
| **Created Date**, **Updated Date** | A start date, an end date, or both; both ends are included, in your device's time zone |

Filters are cumulative (AND logic). Use the search box to find a clip by the name its card shows. Include and exclude, sub-tags and sub-studios work as on every list: see [Browse and Display](browse-and-display.md#include-or-exclude-each-value). A saved clip filter from an earlier version, and an address with a clip filter in it, keep working.

## Sorting

| Sort Option | Description |
|-------------|-------------|
| **Created At** (default) | When the clip was created in Stash |
| **Title** | Alphabetical by clip title, or by its tag's name when it has no title, as the card shows it |
| **Position in Scene** | By start time within the scene |
| **Duration** | By clip length |
| **Random** | Randomized order (consistent across pages) |

All sorts support ascending and descending direction.

## Playing Clips

Clicking a clip navigates to the parent scene and automatically seeks to the clip's start position. The video begins playing from that point.

!!! tip "Quick Preview"
    On desktop, hover over a clip card to see an animated preview without navigating away. Clips without generated previews show a static screenshot instead.

## Markers on the Timeline

The player's timeline shows a dot for every marker of the scene, placed at its start time on every source. A hollow dot is a marker whose preview has not been generated yet; it still seeks to its start when you click it.

## Markers Figure on a Tag Page

A tag's page shows a **Markers** figure: the clips you can see with that tag. Click it to open this list filtered to the tag. The figure counts clips with a generated preview, as this page's default does.

## Clips Without Previews

Some clips may show a "No preview" badge. This means the clip marker exists in Stash but the preview video hasn't been generated yet. The Clips page lists only clips with a preview until you set **Has Preview** to "All clips" or "Without preview only". Use that to find these clips, then generate their previews in Stash with the "Generate" task.

## Related

- [Browse and Display](browse-and-display.md) — View modes and density controls
- [Keyboard Navigation](keyboard-navigation.md) — Navigate clips with keyboard or TV remote
