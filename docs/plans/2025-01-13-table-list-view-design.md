# Table/List View Design

**Date:** 2025-01-13
**Status:** Approved
**Branch:** `feature/table-list-view`

## Overview

A high-density view mode for scanning and comparing metadata across many items at once. Available for all entity types. Users who want to see 20-50+ items on screen, quickly compare metadata fields, or find items based on specific attributes rather than visual browsing.

## Core Behavior

- Rows display one item each with configurable columns
- Title/Name column is always visible and serves as the navigation link to the detail page
- Other cells can be interactive (e.g., clicking a performer navigates to them, clicking a studio navigates to it)
- Horizontal scrolling when columns exceed viewport width
- Small fixed-size thumbnails (~40-50px) to maintain compact row height
- Fixed row heights with text truncation (ellipsis) for long values

## Sort Integration

- Clicking a column header sets that field as the sort and syncs with the existing sort dropdown
- Clicking the same header again reverses sort direction
- Visual indicator (arrow) shows current sort column and direction
- Both column headers and sort dropdown reflect the same state
- Non-sortable columns have no hover cursor change or click action

## Column Configuration

### Three-Tier Settings

1. **System defaults** - Hardcoded fallback per entity type. Sensible starting columns.

2. **User defaults** - Configured in Settings > Customization tab. Per-entity-type settings for which columns appear and their order. Overrides system defaults.

3. **Preset-specific** - When a user saves a filter preset while in table view, the current column visibility and order are saved with it. Loading that preset restores those columns. Overrides user defaults.

### Resolution Order

When entering table view:
1. If active preset has `tableColumns` → use those
2. Else if user has configured defaults for this entity → use those
3. Else → use system defaults

### Configuration UI

**Toolbar button:**
- "Columns" button appears in toolbar when in table view
- Opens a popover with column list

**Popover contents:**
- List of all available columns with checkboxes for visibility
- Each row has: checkbox, column name, up/down arrows, jump-to-top/jump-to-bottom buttons
- Mandatory columns (Title/Name) have checkbox disabled, always checked

**Right-click on headers:**
- Quick "Hide this column" option without opening full popover

**Settings page (Customization tab):**
- Same column list UI as the popover, for setting defaults
- One section per entity type

## Column Definitions

### Scenes

| Column | Mandatory | Default | Sortable |
|--------|-----------|---------|----------|
| Title | Yes | Yes | Yes |
| Thumbnail | No | Yes | No |
| Date | No | Yes | Yes |
| Duration | No | Yes | Yes |
| Rating | No | Yes | Yes |
| Studio | No | Yes | Yes |
| Performers | No | No | No |
| Tags | No | No | No |
| Resolution | No | No | Yes |
| Filesize | No | No | Yes |
| Play Count | No | No | Yes |
| O-Counter | No | No | Yes |
| Path | No | No | Yes |

### Performers

| Column | Mandatory | Default | Sortable |
|--------|-----------|---------|----------|
| Name | Yes | Yes | Yes |
| Image | No | Yes | No |
| Aliases | No | No | No |
| Gender | No | No | Yes |
| Rating | No | Yes | Yes |
| Favorite | No | Yes | Yes |
| Age | No | No | Yes |
| Country | No | No | Yes |
| Ethnicity | No | No | Yes |
| Scene Count | No | Yes | Yes |
| O-Counter | No | No | Yes |

### Studios

| Column | Mandatory | Default | Sortable |
|--------|-----------|---------|----------|
| Name | Yes | Yes | Yes |
| Image | No | Yes | No |
| Rating | No | Yes | Yes |
| Parent Studio | No | No | Yes |
| Scene Count | No | Yes | Yes |
| Child Count | No | No | Yes |

### Tags

| Column | Mandatory | Default | Sortable |
|--------|-----------|---------|----------|
| Name | Yes | Yes | Yes |
| Image | No | Yes | No |
| Scene Count | No | Yes | Yes |
| Performer Count | No | No | Yes |
| Description | No | No | No |

### Galleries

| Column | Mandatory | Default | Sortable |
|--------|-----------|---------|----------|
| Title | Yes | Yes | Yes |
| Thumbnail | No | Yes | No |
| Date | No | Yes | Yes |
| Rating | No | Yes | Yes |
| Studio | No | No | Yes |
| Performers | No | No | No |
| Tags | No | No | No |
| Image Count | No | Yes | Yes |
| Path | No | No | Yes |

### Images

| Column | Mandatory | Default | Sortable |
|--------|-----------|---------|----------|
| Title | Yes | Yes | Yes |
| Thumbnail | No | Yes | No |
| Rating | No | Yes | Yes |
| Studio | No | No | Yes |
| Performers | No | No | No |
| Tags | No | No | No |
| Filesize | No | No | Yes |
| Resolution | No | No | Yes |
| Path | No | No | Yes |

### Groups (Movies)

| Column | Mandatory | Default | Sortable |
|--------|-----------|---------|----------|
| Name | Yes | Yes | Yes |
| Image | No | Yes | No |
| Rating | No | Yes | Yes |
| Studio | No | No | Yes |
| Date | No | No | Yes |
| Duration | No | No | Yes |
| Scene Count | No | Yes | Yes |

## Interaction Details

### Row Interactions

- **Title/Name cell** - Clickable link, navigates to detail page. Styled as a link (hover underline or color change).
- **Thumbnail cell** - Not clickable.
- **Studio cell** - Clickable, navigates to that studio's page.
- **Performer cells** - Each performer name clickable, navigates to their page.
- **Tag cells** - Same pattern as performers.
- **Other cells** - Not clickable (Rating, Duration, Date, etc. are display-only).

### Multi-Value Cells

- Show first 2 items, then "+N more" if additional exist
- "+N more" opens a small popover listing all values
- Each value in the popover is clickable for navigation

### Sort Interactions

- **Column header click** - Sets sort to that field (if sortable), ascending. Shows up-arrow indicator.
- **Second click on same header** - Toggles to descending. Shows down-arrow indicator.
- **Third click** - Back to ascending (always a sort active).
- **Non-sortable columns** - No hover cursor change, no click action, slightly muted header style.

## UI Layout

### Table Structure

```
┌─────────────────────────────────────────────────────────────────────┐
│ [Toolbar: Search | Filters | Sort ▼ | View Mode Icons | Columns]   │
├──────┬────────────────┬────────┬──────────┬────────┬───────────────┤
│      │ Title ▲        │ Date   │ Duration │ Rating │ Studio        │
├──────┼────────────────┼────────┼──────────┼────────┼───────────────┤
│ [img]│ Scene Name     │ Jan 12 │ 32:15    │ ★★★★   │ Studio Name   │
├──────┼────────────────┼────────┼──────────┼────────┼───────────────┤
│ [img]│ Another Scene  │ Jan 10 │ 18:42    │ ★★★    │ Other Studio  │
└──────┴────────────────┴────────┴──────────┴────────┴───────────────┘
```

### Column Config Popover

```
┌─────────────────────────────────┐
│ Columns                    [x]  │
├─────────────────────────────────┤
│ ☑ Title (required)              │
│ ☑ Thumbnail      [⤒][↑][↓][⤓]  │
│ ☑ Date           [⤒][↑][↓][⤓]  │
│ ☑ Duration       [⤒][↑][↓][⤓]  │
│ ☑ Rating         [⤒][↑][↓][⤓]  │
│ ☐ Performers     [⤒][↑][↓][⤓]  │
│ ☐ Tags           [⤒][↑][↓][⤓]  │
└─────────────────────────────────┘
```

## State Persistence

### Storage Structure

**User defaults** (in user settings):
```typescript
tableColumns: {
  scenes: { visible: ["title", "thumbnail", "date", ...], order: ["title", "thumbnail", ...] },
  performers: { visible: [...], order: [...] },
  // ...per entity type
}
```

**Presets** (extended structure):
```typescript
{
  name: "My Scene Preset",
  filters: { ... },
  sort: { field: "date", direction: "desc" },
  viewMode: "table",
  tableColumns: { visible: [...], order: [...] }  // only when viewMode is table
}
```

### Change Behavior

- Column config changes apply immediately to current view
- If a preset is active, changes are "unsaved" (preset could indicate drift)
- Changes don't auto-save to user defaults - explicit save in Settings

## v1 Scope

### Included

- Table view mode for all entity types
- Column visibility toggles via toolbar popover
- Column reordering via arrow buttons (up/down/top/bottom)
- Clickable headers for sorting (sync with sort dropdown)
- Multi-value truncation with "+N more" popovers
- Cell navigation (title → detail, studio → studio page, performer → performer page)
- Right-click header → "Hide this column"
- User defaults in Settings > Customization
- Column config saved with presets
- Horizontal scroll for overflow

### Not Included (Future)

- Column width resizing
- Inline editing of cell values
- Bulk selection / bulk actions on rows
- Keyboard navigation within the table
- Column grouping or pinning

## Component Breakdown

- `TableView` - Main container, handles horizontal scroll
- `TableHeader` - Header row with sortable columns, sort indicators
- `TableRow` - Entity-specific row renderer
- `ColumnConfigPopover` - Visibility + reorder UI
- `MultiValueCell` - Handles truncation + "+N more" popover
- `useTableColumns` hook - Manages column state, persistence, resolution order
