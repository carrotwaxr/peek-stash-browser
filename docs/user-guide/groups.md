# Groups

Browse and explore groups (collections) synced from your Stash library. Groups organize scenes into curated sets — commonly used for movie series, themed collections, or multi-part releases.

## Browsing Groups

**Location:** Navigation menu → **Collections**

### View Modes

Groups support two view modes:

- **Grid** (default) — Card-based layout with front cover images
- **Table** — Sortable table with configurable columns

### Filtering

| Filter | Description |
|--------|-------------|
| **Name Search** | Text search on group name |
| **Synopsis Search** | Text search on group synopsis |
| **Director Search** | Text search on director name |
| **Aliases**, **URL** | Text search. A collection's aliases are matched as one text; Has none / Has any |
| **Performers** | Performers in any scene within the group you can see. Supports ANY / ALL / NONE modifiers |
| **Studio** | Filter by studio: ANY or NONE, with **Include sub-studios**, and Has none / Has any |
| **Tags** | Filter by tags. Supports ANY / ALL / NONE modifiers, with "Include sub-tags": "all of" then matches a collection tagged with any sub-tag of each chosen tag; Has none / Has any |
| **Rating** | A range from 0 to 10, as ratings show (one decimal), or Rated / Not rated |
| **Scene Count**, **Tag Count** | Range filters for the number of scenes and tags you can see |
| **Duration** | Range filter for total duration in minutes; **Not set** lists collections with no duration |
| **O Count**, **Play Count** | Your own O count and plays, summed over the collection's scenes you can see |
| **Favorite Collections** | Show only favorited groups |
| **Has a Favorite Performer** | Yes / No / Any: a favorite performer in one of its scenes you can see |
| **Parent collection** | The sub-collections of the collections you pick; **Include sub-collections** goes deeper than direct children |
| **Sub-collections** | The collections that contain the ones you pick; **Include all parent collections** goes further up |
| **Sub-collection Count**, **Parent Collection Count** | Range filters for how many sub-collections or parent collections a collection has |
| **Release Date** | Date range filter |
| **Created Date** | Date range filter |
| **Updated Date** | Date range filter |

### Sorting

Sort by Created At, Date, Duration, Name (default), O Count, Performer Count, Random, Rating, Scene Count, Tag Count, or Updated At. **Collection Order** (the position within a collection) is offered while exactly one parent collection is chosen.

## Group Detail Page

Click a group to open its detail page showing:

- **Header**: Group name, aliases and favorite toggle. Admins also see a "View in Stash" button
- **Cover Art** — Front and back images with a toggle to flip between them (DVD cover style, 2:3 aspect ratio)
- **Rating**: A slider from 0 to 10 in steps of 0.1, shown as a number (keyboard shortcut: ++r++ then ++1++ through ++5++ for 2, 4, 6, 8 or 10; ++r++ then ++0++ clears it)

### Statistics

A summary card shows at-a-glance metrics. Click any metric to jump to its tab:

| Metric | Description |
|--------|-------------|
| **Scenes** | Number of scenes in the group |
| **Performers** | Number of performers across all scenes |
| **Duration** | Total combined duration |
| **Date** | Release date |

### Details

Conditional sections appear when data is available:

- **Studio** — Studio logo and name (clickable)
- **Director** — Director name
- **Part Of** — Parent collections this group belongs to (clickable links with descriptions)
- **Sub-Collections** — Child collections (clickable links with descriptions)
- **Tags** — Tag chips
- **Links** — External URLs

### Tabs

**Scenes**

Shows all scenes in the group, sorted by scene number (position within the group) by default. Full scene search and filtering available. Scene Number appears in the sort list only while a collection filter is active, and scenes without a number in that collection come last.

**Performers**

Shows all performers appearing in any scene within the group, with full performer browsing and filtering.

## Group Hierarchy

Peek syncs Stash's collection hierarchy, so groups keep the parent-child relationships you set up in Stash:

- A group can belong to one or more parent collections, shown in "Part Of" by name
- A group can contain sub-collections, shown in "Sub-Collections" in Stash's order
- Each link shows its description from Stash, such as "Part 2"
- Click any parent or child link to navigate the hierarchy
- A collection card's collections count is its number of sub-collections; click it to open the Collections page filtered to them (the **Parent collection** filter)

Collections you cannot see (hidden, or excluded by your content restrictions) are left out of these lists and counts. Hiding or restricting a collection covers that collection only, not its sub-collections.

## Rating and Favorites

- **Rate** a group using the slider, or press ++r++ then a number key
- **Favorite** a group with the heart icon, or press ++r++ then ++f++
- Ratings run from 0 to 10 in steps of 0.1 and show as a number, not stars. Peek stores them as 0-100 (7.5 is 75)
- Ratings and favorites are per user: what you see is yours, not Stash's
- With **Sync to Stash** on for your account (an admin sets it), a group rating you set is also written to Stash. Group favorites stay in Peek. See [Sync to Stash](user-management.md#sync-to-stash-export)

## Related

- [Browse and Display](browse-and-display.md) — View modes and density controls
- [Content Restrictions](content-restrictions.md) — Restrict access using group-based restrictions
- [Keyboard Navigation](keyboard-navigation.md) — Navigate with keyboard or TV remote
