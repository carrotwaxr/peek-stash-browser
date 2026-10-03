# Galleries

Browse image galleries synced from your Stash library. Galleries group related images together and support ratings, favorites, and full-screen lightbox viewing.

## Browsing Galleries

**Location:** Navigation menu → **Galleries**

### View Modes

Galleries support five view modes:

- **Grid** (default) — Card-based layout
- **Wall** — Compact masonry display
- **Table** — Sortable table with configurable columns
- **Timeline** — Chronological display grouped by date ranges
- **Folder** — Hierarchical tag-based folder navigation

### Filtering

| Filter | Description |
|--------|-------------|
| **Title Search** | Text search on the name the gallery card shows: its title, or for an untitled gallery its zip file's name or its folder's name |
| **Details Search**, **Code**, **Photographer** | Text search |
| **Path** | The gallery's folder path, or its zip file's path; **Contains**, **Excludes**, **Equals** or **Starts with**. No regular expressions |
| **URL** | Text search on any of the gallery's links |
| **Performers** | Filter by performers. Supports ANY / ALL / NONE, include or exclude per performer, and Has none / Has any |
| **Studios** | Filter by studio (ANY or NONE, include or exclude, Has none / Has any), including sub-studios |
| **Tags** | Filter by tags, with "Include sub-tags". With sub-tags on, "has all of" matches a gallery tagged with any sub-tag of each chosen tag. Include or exclude per tag, Has none / Has any |
| **Performer Tags** | Galleries with a performer who has the tag (ANY, ALL or NONE, with sub-tags) |
| **Rating (0-100)** | A range on the stored 0-100 scale, which is ten times the rating shown (a gallery shown as 7.5 is 75), or Rated / Not rated |
| **Image Count** | Range filter for number of images |
| **Tag Count**, **Performer Count** | Range filters; 0 to 0 on Tag Count lists the untagged galleries |
| **Performer Age** | A performer's age on the gallery's date, as on Scenes |
| **Favorite Galleries** | Show only favorited galleries |
| **Has Favorite Image** | Show galleries containing at least one favorited image |
| **Favorite Performers**, **Favorite Studios**, **Favorite Tags** | Yes / No / Any, by your favorites (and their sub-tags and sub-studios) |
| **Organized** | Yes / No / Any, by Stash's organized flag |
| **Zip or Folder** | A gallery from a zip file, or from a folder |
| **Gallery Date**, **Created Date**, **Updated Date** | A start date, an end date, or both; both ends are included |

### Sorting

Sort by Created At, Date, Image Count, Path, Performer Count, Random, Rating, Tag Count, Title, or Updated At.

## Gallery Detail Page

Click a gallery to open its detail page showing:

- **Header**: Gallery title, favorite toggle, the studio, how many images you can see, the date, the photographer, and **Play Slideshow**. Admins also see a "View in Stash" button
- **Rating**: A slider from 0 to 10 in steps of 0.1, shown as a number (keyboard shortcut: ++r++ then ++1++ through ++5++ for 2, 4, 6, 8 or 10; ++r++ then ++0++ clears it)
- **Description** — If available from Stash
- **Performers** — Scrollable grid with clickable performer links
- **Tags** — Clickable tag chips

### Tabs

The detail page has two tabs:

**Images**

The Images page's list, kept to this gallery: the same sort, filters, search, Grid, Wall, Table and Timeline views and page size (see [Images Tabs](browse-and-display.md#images-tabs)). It opens in the gallery's file order (sorted by path), on the wall. The timeline counts this gallery's images only. The tab has its own Views and default, shared by every gallery's Images tab. Click any image to open the lightbox viewer.

**Play Slideshow** opens the viewer on the first image of the list's page and starts the slideshow; from the Scenes tab it opens the Images tab first.

The lightbox supports:

- Full-screen viewing
- Slideshow mode (click "Play Slideshow")
- Individual image rating and favoriting
- O counter (your own count)
- Navigation with automatic page boundary handling
- Closing with your browser's Back button or the phone's back gesture, which leaves you on the gallery
- A shareable address: with an image open, the page's address opens the viewer straight on that image

**Scenes**

Shows scenes associated with this gallery, with full search and filtering. Its timeline counts this gallery's scenes only, and its folder view lists the tags on this gallery's scenes.

## Rating and Favorites

- **Rate** a gallery using the slider on the detail page, or press ++r++ then a number key
- **Favorite** a gallery with the heart icon, or press ++r++ then ++f++
- Ratings run from 0 to 10 in steps of 0.1 and show as a number, not stars. Peek stores them as 0-100 (7.5 is 75)
- Ratings and favorites are per user: what you see is yours, not Stash's
- With **Sync to Stash** on for your account (an admin sets it), a gallery rating you set is also written to Stash. Gallery favorites stay in Peek. See [Sync to Stash](user-management.md#sync-to-stash-export)

## Related

- [Images](images.md) — Image browsing and lightbox details
- [Browse and Display](browse-and-display.md) — View modes and density controls
- [Content Restrictions](content-restrictions.md) — Restrict gallery access by user
