# Browse and Display Options

Peek offers multiple ways to browse your library with customizable view modes and card display settings.

## View Modes

Switch between view modes using the toolbar buttons on any browse page.

### Grid View

The default card-based layout showing thumbnails with metadata.

- Standard card grid with consistent sizing
- Shows title, studio, date, and rating information
- Hover for sprite preview (scenes)
- Three density levels: Small, Medium, Large
- Available for all entity types

### Wall View

A justified gallery layout that preserves aspect ratios.

- Images and videos fill rows naturally without letterboxing
- All visible previews can play simultaneously
- Three zoom levels: Small, Medium, Large
- Available for: Scenes, Galleries, Images, Performers, Studios, Groups

**Wall playback modes** (Settings → Display):

| Mode | Behavior |
|------|----------|
| **Autoplay** | Videos play when visible, hover controls volume |
| **Hover** | Static thumbnail until hover, then plays |
| **Static** | Thumbnails only, no video playback |

### Table View

A high-density tabular layout for scanning metadata across many items.

- Compact rows with sortable columns
- Click column headers to sort
- Customizable columns per entity type
- Available for all entity types

**Managing columns:**

1. Click **Columns** button in toolbar
2. Check/uncheck columns to show/hide
3. Use arrows to reorder columns
4. Or right-click any column header → **Hide column**

### Timeline View

Browse content chronologically, organized by date.

- Content grouped by year, month, or day
- Expandable date sections with item counts
- Visual timeline with thumbnails
- Three density levels: Small, Medium, Large
- Available for: Scenes, Galleries, Images

**Navigation:**

- Click date header to expand/collapse
- Click thumbnail to open detail page
- Use density controls to adjust items per row

### Folder View

Navigate content through your tag hierarchy as folders.

- Tags displayed as folders based on parent/child relationships
- Breadcrumb navigation shows your current path
- Item count badges on each folder
- Click into nested tags like browsing directories
- Three density levels: Small, Medium, Large
- Available for: Scenes, Galleries, Images

**Navigation:**

- Click folder to navigate into that tag
- Use breadcrumbs to navigate back up
- Root level shows top-level parent tags
- Content displays when you reach a leaf tag or click to view items

### Tag Hierarchy View

A tree view showing parent/child tag relationships (Tags page only).

- Expandable nodes reveal child tags
- Visual indentation shows hierarchy depth
- Search filters the tree while showing ancestors
- **Expand All** / **Collapse All** buttons for quick navigation

**Navigation:**

- Single click: Expand/collapse node
- Double-click: Open tag detail page
- Arrow keys: Navigate the tree
- Enter: Open selected tag

---

## Density Controls

Adjust how many items appear per row using the S/M/L buttons in the toolbar.

### Grid Density

In Grid View, density controls the number of columns:

| Level | Columns (Desktop) | Description |
|-------|-------------------|-------------|
| **Small** | 4-6 | More items, smaller cards |
| **Medium** | 3-5 | Balanced view (default) |
| **Large** | 2-3 | Fewer items, larger cards |

### Wall Zoom

In Wall View, zoom controls row height:

| Level | Row Height | Items per Row (1920px) |
|-------|------------|------------------------|
| **Small** | 150px | 6-8 items |
| **Medium** | 220px | 4-5 items (default) |
| **Large** | 320px | 2-3 items |

---

## Card Display Settings

Customize what information appears on cards and detail pages.

### Accessing Settings

**Full settings:**
Settings → Customization → Card Display

**Quick access:**
Click the ⚙️ icon in the search toolbar for current entity type settings.

### Available Options

Settings vary by entity type. Common options include:

| Setting | Description |
|---------|-------------|
| **Show studio** | Display studio name on cards |
| **Show date** | Display date on cards |
| **Show rating** | Display star rating badge |
| **Show favorite** | Display favorite button |
| **Show O-counter** | Display O-counter badge |
| **Show description** | Display description text |
| **Show relationships** | Display performer/tag indicators |

**Scene-specific:**

- Show studio code (abbreviated studio name)
- Show description on detail page

**Tag-specific:**

- Description and relationship indicators only

### Per-Entity Defaults

Each entity type (Scene, Performer, Studio, etc.) has independent settings. Configure each type separately in the Card Display settings accordion.

---

## Filter Presets

Save your current view configuration for quick access later.

### What Gets Saved

- All active filters
- Sort field and direction
- View mode (Grid/Wall/Table/Hierarchy)
- Grid density (for Grid view)
- Zoom level (for Wall view)
- Table column configuration

### Creating a Preset

1. Configure your filters and view settings
2. Click **Presets** → **Save current as preset**
3. Enter a name
4. Optionally set as default for this page

### Using Presets

- Click **Presets** to see saved presets
- Click a preset name to apply it
- Star icon indicates the default preset
- Presets are per-entity-type (Scene presets, Performer presets, etc.)

---

## URL Persistence

Your browse state is reflected in the URL, making it easy to bookmark or share specific views.

**URL parameters include:**

- `view` - grid, wall, table, or hierarchy
- `grid_density` - small, medium, or large (grid view)
- `zoom` - small, medium, or large (wall view)
- `sort` and `dir` - current sort settings
- Filter parameters - active filters

Sharing a URL shares your exact view configuration.

---

## Tips

### For Large Libraries

- Use **Table View** to quickly scan metadata across hundreds of items
- Use **Wall View with Small zoom** for visual overview
- Create **Filter Presets** for common browsing patterns

### For Tag Organization

- Use **Hierarchy View** to understand tag relationships
- Expand parent tags to find related child tags
- Search within hierarchy to find specific tags

### For Performance

- **Static** wall playback mode uses less bandwidth
- Table view loads faster than Grid or Wall for large result sets
- Pagination keeps memory usage reasonable

---

## Related

- [Keyboard Navigation](keyboard-navigation.md) — Keyboard shortcuts for all view modes
- [Custom Carousels](custom-carousels.md) — Create homepage carousels with saved filters
- [Images](images.md) — Image-specific browsing features
