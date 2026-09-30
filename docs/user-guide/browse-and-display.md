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
- On a performer, tag, studio or collection page, the folders are the tags on that page's scenes and their parent tags
- With several Stash servers, each server's tags are separate folders, even when two share a name or number
- A tag whose parent tags are all hidden from you shows at the top level

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
- With several Stash servers, each server's tags stay in their own branches
- A tag whose parent tags are all hidden from you shows at the top level

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

With **Show relationships** on, each indicator shows how many related items you can see, and its tooltip lists them with their pictures. On performer, studio, tag and collection cards a tooltip lists up to 12 and says how many more there are: first those sharing the most scenes with the card (on a tag's card, those with the most scenes), then by name. A card's own tags are always listed in full.

The counts on performer, studio, tag, collection and gallery cards (scenes, galleries, images, performers, collections) are what the page behind the card lists: Peek counts them from its copy of your library, and every sync keeps them current. They leave out what you cannot see (content restrictions and the items you hid) and equal the totals of the tabs on the page behind the card. A tag's scene count includes the scenes that inherit the tag from a performer, studio or collection, as the tag's Scenes tab does; a studio's counts do not include its sub-studios'. A tag page's marker count still comes from Stash. After a sync, a card may show a changed item for a few seconds until your view is recomputed.

A detail page (performer, studio, tag, collection or gallery) counts its tabs the same way, as you see them: the numbers in its Statistics card and on its tab badges are the totals of the lists under the tabs, and the page opens on the first tab with something in it. With **Include sub-tags** or **Include sub-studios** on, the counts include the sub-tags' or sub-studios' content, as the tabs then list it. A page opened from a link that names no server shows the item on its own server.

**Scene-specific:**

- Show studio code (abbreviated studio name)
- Show description on detail page

**Tag-specific:**

- Description and relationship indicators only

### Per-Entity Defaults

Each entity type (Scene, Performer, Studio, etc.) has independent settings. Configure each type separately in the Card Display settings accordion.

---

## Filters

Click **Filters** in the search toolbar to open the filter panel, set the filters, and click **Apply Filters**.

### Modifier Dropdowns

A filter that picks performers, tags, studios, collections or galleries has a dropdown above it that says how the picks combine:

| Choice | Matches |
|--------|---------|
| **Has ANY of these** | Items with at least one of the picks |
| **Has ALL of these** | Items with every pick |
| **Has NONE of these** | Items with none of the picks |

- The dropdown always shows the choice the search uses. Until you change it, that is the filter's default: **Has ALL** for tags, **Has ANY** for the others.
- A gallery or an image has one studio, so its Studios filter offers only **Has ANY** and **Has NONE**.
- Ticking **Include sub-tags** or **Include sub-studios** sets the dropdown to **Has ANY**.

### Date Ranges

Set a start date, an end date, or both. A start alone matches later dates, an end alone earlier dates, and both the dates in between.

### Studio and Tag Pages

A studio with sub-studios, or a tag with sub-tags, shows **Include sub-studios** or **Include sub-tags** above its tabs. Tick it to add them on every tab that can take them:

- On a tag page: every tab (Scenes, Galleries, Images, Performers, Studios and Collections).
- On a studio page: Scenes, Galleries, Images and Collections. The Performers tab lists the performers of this studio's own scenes, so the box is hidden there.

Filters you set on a tab narrow what that tab lists, on top of the page's studio or tag.

### Clips

The Clips page's **Has Preview** filter lists clips **With preview only** until you pick **Without preview only** or **All clips**.

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
