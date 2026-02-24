# Clips

Browse and play scene markers (clips) from your Stash library. Clips are short segments of scenes, typically created around tags or specific moments.

## Browsing Clips

**Location:** Navigation menu → **Clips**

The Clips page shows all clips synced from your Stash library. Each clip card displays:

- Animated preview thumbnail (if generated in Stash)
- Clip title
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

Click the filter icon in the toolbar to open the filter panel. Available filters:

| Filter | Description |
|--------|-------------|
| **Clip Tags** | Tags applied directly to the clip. Supports ANY / ALL / NONE modifiers |
| **Scene Tags** | Tags on the parent scene |
| **Performers** | Performers in the parent scene. Supports ANY / ALL / NONE modifiers |
| **Studio** | Studio of the parent scene |
| **Has Preview** | Filter by generation status: "With preview only", "Without preview only", or "All clips" |

Filters are cumulative (AND logic). Use the search box to filter by clip title.

## Sorting

| Sort Option | Description |
|-------------|-------------|
| **Created At** (default) | When the clip was created in Stash |
| **Title** | Alphabetical by clip title |
| **Position in Scene** | By start time within the scene |
| **Duration** | By clip length |
| **Random** | Randomized order (consistent across pages) |

All sorts support ascending and descending direction.

## Playing Clips

Clicking a clip navigates to the parent scene and automatically seeks to the clip's start position. The video begins playing from that point.

!!! tip "Quick Preview"
    On desktop, hover over a clip card to see an animated preview without navigating away. Clips without generated previews show a static screenshot instead.

## Clips Without Previews

Some clips may show a "No preview" badge. This means the clip marker exists in Stash but the preview video hasn't been generated yet. Use the **Has Preview** filter to find these clips, and generate previews in Stash using the "Generate" task.

## Related

- [Browse and Display](browse-and-display.md) — View modes and density controls
- [Keyboard Navigation](keyboard-navigation.md) — Navigate clips with keyboard or TV remote
