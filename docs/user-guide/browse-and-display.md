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

#### Selecting scenes

On the Scenes page (and any scene list), tick a card's checkbox, or press and hold a card, to select scenes for a bulk action (hide, add to a playlist). A selection covers the page you see: it clears when you change the filters, the sort or the page. Shift+click a second checkbox selects every scene between the two, and Select All selects the scenes on the page.

### Wall View

A justified gallery layout that preserves aspect ratios.

- Images and videos fill rows naturally without letterboxing
- All visible previews can play simultaneously
- Three zoom levels: Small, Medium, Large
- Available for: Scenes, Galleries, Images and Clips

**Wall playback modes** (Settings → User Preferences → Customization → **Wall View Preview Behavior**; in Wall view on Scenes and Clips, also the cog in the toolbar):

| Mode         | Behavior                                                           |
| ------------ | ------------------------------------------------------------------ |
| **Autoplay All** | Videos play when visible, up to six at once; hover controls volume |
| **Play on Hover Only** | Static thumbnail until hover, then plays                           |
| **Static Thumbnails** | Thumbnails only, no video playback                                 |

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

A table remembers your columns for each type: a change on the Scenes table is saved as your scene columns and is there the next time you open it, on any device. **Settings → User Preferences → Customization → Table Columns** shows and edits the same setting. A View saved in table view shows its own columns when you load it from **Views**; a default View applied when you open a page leaves your saved columns alone; your next column change saves the columns then shown as yours.

### Timeline View

Browse content chronologically, organized by date.

- Content grouped by year, month, week, or day; a week runs Monday to Sunday and belongs to the year of its Thursday (ISO weeks), so 30 December 2024 is in week 1 of 2025
- The bars count what the list shows: on a tag's page the items that carry the tag or inherit it, and with the filters and search you have set, without your hidden items
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
- Item count badges on each folder: how many items of the page's type (scenes, galleries or images) carry that tag directly, counting only what you can see
- A folder shows while it or a tag below it has items of the page's type, so a Galleries folder view hides tags that are only on scenes
- Click into nested tags like browsing directories
- Three density levels: Small, Medium, Large
- Available for: Scenes, Galleries, Images
- On a performer, tag, studio or collection page, the folders are the tags on that page's scenes and their parent tags
- On a tag's Scenes tab, a folder lists the scenes that carry both the folder's tag and the page's tag. The folder view is not offered there while **Include sub-tags** is on
- With several Stash servers, each server's tags are separate folders, even when two share a name or number
- A tag whose parent tags are all hidden from you shows at the top level

**Navigation:**

- Click folder to navigate into that tag
- Use breadcrumbs to navigate back up
- The root level lists the top-level folders only, no items
- Opening a folder lists its sub-folders first, then the items that carry the folder's tag directly, paged like any list ("12 galleries in this folder"). An item tagged with the folder and with one of its sub-folders shows in both
- The root ends with an **Untagged** folder while any item of the page's type is in no other folder; its badge counts them, and opening it lists them, paged like any folder. A scene that inherits a tag (from its performers or studio) is in that tag's folder, not in Untagged, and an image's tags include the ones its galleries give it. On a performer, studio or collection page, Untagged holds that page's scenes with no tag
- Inside a folder, including Untagged, **+ Filter** offers no **Tags** filter; inside Untagged it offers no **Tag Count** either

### Tag Hierarchy View

A tree view showing parent/child tag relationships (Tags page only).

- Expandable nodes reveal child tags
- Visual indentation shows hierarchy depth
- Search filters the tree while showing ancestors
- **Expand All** / **Collapse All** buttons for quick navigation
- With several Stash servers, each server's tags stay in their own branches
- A tag whose parent tags are all hidden from you shows at the top level
- Filters don't apply to the tree: the filter bar is replaced by a note saying so (it shows while filters are set), and **Views** still works

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

| Level      | Columns (Desktop) | Description               |
| ---------- | ----------------- | ------------------------- |
| **Small**  | 4-6               | More items, smaller cards |
| **Medium** | 3-5               | Balanced view (default)   |
| **Large**  | 2-3               | Fewer items, larger cards |

### Wall Zoom

In Wall View, zoom controls row height:

| Level      | Row Height | Items per Row (1920px) |
| ---------- | ---------- | ---------------------- |
| **Small**  | 150px      | 6-8 items              |
| **Medium** | 220px      | 4-5 items (default)    |
| **Large**  | 320px      | 2-3 items              |

---

## Card Display Settings

Customize what information appears on cards and detail pages.

### Accessing Settings

**Full settings:**
Settings → User Preferences → Customization → Card Display

**Quick access:**
Click the ⚙️ icon in the search toolbar for current entity type settings.

### Available Options

Settings vary by entity type. Common options include:

| Setting                | Description                      |
| ---------------------- | -------------------------------- |
| **Show studio**        | Display studio name on cards     |
| **Show date**          | Display date on cards            |
| **Show rating**        | Display the rating badge, a number from 0 to 10 |
| **Show favorite**      | Display favorite button          |
| **Show O-counter**     | Display O-counter badge          |
| **Show description**   | Display description text         |
| **Show relationships** | Display performer/tag indicators |

With **Show relationships** on, each indicator shows how many related items you can see, and its tooltip lists them with their pictures. On performer, studio, tag and collection cards a tooltip lists up to 12 and says how many more there are: first those sharing the most scenes with the card (on a tag's card, those with the most scenes), then by name. A card's own tags are always listed in full.

The counts on performer, studio, tag, collection and gallery cards (scenes, galleries, images, performers, collections) are what the page behind the card lists: Peek counts them from its copy of your library, and every sync keeps them current. They leave out what you cannot see (content restrictions and the items you hid) and equal the totals of the tabs on the page behind the card. A tag's scene count includes the scenes that inherit the tag from a performer, studio or collection, as the tag's Scenes tab does; a studio's counts do not include its sub-studios'. A tag page's marker count still comes from Stash. After a sync, a card may show a changed item for a few seconds until your view is recomputed.

A detail page (performer, studio, tag, collection or gallery) counts its tabs the same way, as you see them: the numbers in its Statistics card and on its tab badges are the totals of the lists under the tabs, and the page opens on the first tab with something in it. With **Include sub-tags** or **Include sub-studios** on, the counts include the sub-tags' or sub-studios' content, as the tabs then list it. A tag's **Markers** figure is the clips you can see with that tag (the Clips page's default list, generated previews only), and clicking it opens that list; markers on scenes you can't see are not counted. A page opened from a link that names no server shows the item on its own server.

A performer or studio page lists its StashDB entries (and those on any other stash-box) in a **StashDB Links** card, each opening the entry on its box. They come from Peek's copy of your library, as of the last sync. A performer's attributes (born, career, height and the rest) are in its **Details** card beside the image, and its biography in **About**; both show while **Show description on detail page** is on.

**Scene-specific:**

- Show studio code (abbreviated studio name)
- Show description on detail page

**Tag-specific:**

- Description and relationship indicators
- Show rating, Show favorite and Show O-counter, as on performers and studios

### Per-Entity Defaults

Each entity type (Scene, Performer, Studio, etc.) has independent settings. Configure each type separately in the Card Display settings accordion.

**Default view mode** offers only the views that type's page has: Grid and Table for performers, studios and collections; Grid, Table and Hierarchy for tags; Grid, Wall, Table, Timeline and Folder for scenes, galleries and images. A default saved before a page lost a view (Wall on performers, say) opens that page in Grid.

When nothing matches the search and filters, a list says so ("No performers found") instead of showing a blank page.

### The search box

Every word you type must match, in any order and anywhere the search looks: a scene's title, details, path, performers, studio and tags, so "anna blonde" finds a scene with a performer named Anna and a tag named Blonde. Put words in "quotes" to keep them together as one phrase. A quote with no partner is an ordinary character, a repeated word counts once, and only the first 10 words are used. A performer's or tag's aliases are searched one at a time, `%` and `_` match themselves, and a capital letter with an accent matches when you type it exactly. A gallery without a title is found by the name its card shows (its zip file's name without the extension, or its folder's name); the gallery **Title** filter matches the same name. An image is found by the name its card shows (its title, or its file name without the extension when it has none), and so is an untitled gallery; the image **Title** filter matches the same name. The Images search no longer matches words from a file's folder: use the image **Path** filter for that. The filters' text fields (Title contains and the like) are not split: they match the text as one phrase.

---

## Filters

The filter bar sits under the search toolbar. Only the filters you use take space: each one shows as a chip, **+ Filter** adds another from a list of every filter the page has, and your pinned filters wait in the bar for one click.

### Chips

Each active filter shows as a chip that names its picks and its condition, such as "Tags: none of Anal, with sub-tags" or "Rating: 40 to 80"; a pick that is no longer visible to you reads as "unavailable". Click a chip, or press Enter on it, to open its filter in a panel right under it. The **x** on a chip removes the filter.

- **Changes apply as you make them.** Picking a tag, an option or a Yes / No applies at once; typing a number, a date or text applies a moment after you stop, so a rating typed as `60` is one search, not two. Close the panel with Escape, with a click outside it, or by clicking the chip again.
- **Back undoes the whole edit.** Everything you changed in one open panel is one step in your browser history, so Back returns to how the list was before you opened it.
- The panel's header names the filter and offers **Remove** and the pin buttons (see [Pinned Filters](#pinned-filters)).
- A page's own filter, such as the studio on a studio's page, shows as a dimmed label before the chips and has no **x**.
- **Clear all** at the end of the bar removes every filter. Back brings them back.

### Adding a Filter

Click **+ Filter** (or press `f`) to open a search box over the list of filters the page offers, grouped in the same sections as [Filters by Page](#filters-by-page), with your pinned fields first. Type to narrow the list: `res` finds Resolution. Press Enter to pick the first match, or Down to move into the list; Enter or a click picks one. Picking a field opens its filter under a new chip, where you set a condition and values.

To filter by a name directly, type two letters or more of it (`outd` for a tag called Outdoor). The names of matching tags, performers, studios and collections (and galleries, on the lists that filter by them) appear under **Values** as "Tags: Outdoor"; picking one adds it to that filter and applies it at once.

A list holds up to 20 filters, counting those inside groups. At the limit the menu says so and offers only the filters already in use. For the same filter twice, or filters joined with "match any", use [Advanced](#advanced-filters).

### Pinned Filters

A pin keeps something you use often in the bar, whether or not it is set. There are two kinds:

- A **pinned field** is an empty chip with a dashed outline and the filter's name (**Tags**, **Rating**). Click it to open that filter without going through **+ Filter**; once the filter is set, the chip shows its values in the same place.
- A **pinned filter** is a one-tap button for a filter with a fixed value, such as **Unwatched** or **Favorites**. Tap it to turn the filter on (the button fills with colour) and tap it again to turn it off. Each tap is one step in your history, so Back undoes it. While a pinned filter is on, it takes the place of that filter's own chip.

To pin, open a filter's chip: **Pin** (the pin icon in its header) pins the field to the bar, and **Pin as quick filter** (the bookmark icon, offered once the filter has a value) pins that value as a one-tap button. Both show the opposite action when pinned. In **+ Filter**, a mouse also gets a pin icon on each field. On a phone or a TV the same buttons are in each filter's header in the sheet. A pinned button has a small pin-off icon to unpin it.

A list keeps up to 10 pins (fields and filters together); at the limit the pin buttons are disabled and say "Up to 10 pins". Pins are yours, kept for each kind of list (Scenes, Performers and so on, the same ones on a detail page's tab of that kind), and saved as soon as you change them.

A list you have not pinned anything on starts with a few:

| List | Pinned fields | Pinned filters |
| --- | --- | --- |
| Scenes | Performers, Tags, Rating | Unwatched, Favorites |
| Performers | Tags, Gender, Rating | Favorites |
| Studios, Collections, Galleries, Images | Tags, Rating | Favorites |
| Tags | Rating | Favorites |
| Clips | Clip Tags | none |

### Advanced Filters

**Advanced** (at the end of the bar, and in the filter sheet) opens a view of the same filters as rules, one per row. Use it for what the chip bar cannot say: rules joined with "match any" (a favorite tag **or** a favorite performer), and the same filter twice (scenes with all of these tags **and** any of those). A group shows in the bar as one chip, such as "Any of: Favorite Tags, Favorite Performers"; click it to open Advanced at that group, and its **x** removes the whole group. A "Match any" chip at the start of the bar means the top level of the filters is joined with any.

**Rows.** Each rule is a row with a **Filter** select (grouped like the lists in [Filters by Page](#filters-by-page)), its **Condition**, its **Value** and, where the filter has them, **Sub-items**. The row at the end of each list is a waiting row reading "Add a filter...": pick a field in it and a new row appears with the cursor in its value. A row's actions menu (the three dots) offers **Move to** each other group or the top level, and **Remove**. A saved rule the editor has no row for reads "A rule this editor can't show" with a **Remove** button, and is kept as it is until you remove it.

**Match all and Match any.** The select at the top says whether the top level needs every rule (**Match all**) or any one of them (**Match any**). **Add group** adds a box of its own rules with its own Match select, and a group can sit beside the top-level rules. Groups go one level deep: a group does not hold another group. With **Match all** at the top and a **Match any** group, the list shows what matches every top-level rule and also at least one rule of the group.

**Same filter twice.** In a Match all group a field can appear as many times as you like. In a Match any group, rows on the same field that each say "has any of" combine into one rule over all their values (two Tags rows with "any of A, B" and "any of C" are one rule, "any of A, B, C"); a line under the group says so, and the rows combine when you press Apply. Rows that cannot combine, such as "has all of" two or more values, stay apart.

**Limits.** A list holds up to 20 rules and 5 groups, counted as the rows that will filter after any rows have combined. At the limit **Add group** and the waiting row say so, and **Apply** says how many rules or groups to remove.

**Apply and discard.** Nothing changes in the list while you edit. **Apply** puts all the rules on the list at once and closes the view (in the filter sheet it also closes the sheet). **Cancel**, Escape or the close button leave the list as it was; with edits you have not applied, Peek first asks **Discard changes?** (**Discard** or **Keep editing**). If the list's filters changed while the view was open, for example with Back, a note says that Apply replaces them. On a phone or in TV mode the view takes the whole screen, with **Apply** and **Cancel** always in view.

**Fixed by the page.** A filter a page sets itself, such as the studio on a studio's page, shows above the rules as "Fixed by this page" and cannot be edited. It applies to every rule and group.

**Your exclusions still apply.** Rules and groups only narrow within what you are allowed to see: your hidden items and any content restrictions are applied to the whole result, outside every group. A Match any group never shows something you hid.

### On a Phone or in TV Mode

On a phone, and in [TV Mode](keyboard-navigation.md#tv-mode), the chips don't open a panel under themselves. The search box and a **Filters** button (**Filters (3)** with three filters in use) sit at the top; the chip row scrolls sideways; and **Filters**, a chip or **+ Filter** opens a full-height sheet instead.

- The sheet lists your pinned filters, then one editor per filter in use, then the list of filters to add (the same search box as **+ Filter**).
- Nothing applies while you edit. The button at the bottom counts the results of your choices as you make them and reads "Show 1,204 results" (or "Show results" while it counts). Press it to apply everything as one step and close the sheet. Escape, the close button or a tap outside discards the edits.
- **Advanced** and **Clear all** are in the sheet too.

In TV mode the chip row comes right under the search box, led by your pinned filters and fields, so one press of Down from the search box reaches the first; then the chips and groups, **Filters (n)** and **Views**, and **+ Filter**, **Advanced** and **Clear all** after them. Everything is reached with the arrows and Enter: see [Keyboard Navigation](keyboard-navigation.md#search-and-filtering).

### Modifier Dropdowns

A filter that picks performers, tags, studios, collections or galleries has a dropdown above it that says how the picks combine:

| Choice                | Matches                              |
| --------------------- | ------------------------------------ |
| **Has ANY of these**  | Items with at least one of the picks |
| **Has ALL of these**  | Items with every pick                |
| **Has NONE of these** | Items with none of the picks         |

- The dropdown always shows the choice the search uses. Until you change it, that is the filter's default: **Has ALL** for tags, **Has ANY** for the others.
- A gallery or an image has one studio, so its Studios filter offers only **Has ANY** and **Has NONE**.

### Include or Exclude Each Value

Every Tags, Performers and Studios picker (and Performer Tags, and a clip's tags and studio) lets you decide per value. Each value you pick has an include or exclude toggle beside its remove button; press it to turn a pick from "include" into "exclude" and back. A filter can then say "Tags: Anal and Outdoor, but not Redhead" in one go. The chip reads "Tags: any of Anal, Outdoor; not Redhead", and excluded values alone read "Tags: not Redhead". Include and exclude are kept in the address (for example `tagIds=1:a&tagIdsExclude=2:a`), in saved Views and in custom carousels.

- The toggle is offered under **Has ANY** and **Has ALL**. Under **Has NONE** every pick already excludes, so there is no toggle.
- With **Include sub-tags** (or sub-studios) on, an excluded tag also leaves out items that have one of its sub-tags.
- A filter saved before this existed, with only its picks and **Has NONE**, still means what it did.
- The Content Restrictions editor has no toggle: it has its own Show only and Always hide lists.

### Has None and Has Any

Where a thing can be missing, the condition select above a picker also offers **Has none** and **Has any**: a scene with no performers, a gallery with no studio, an image with no tags. A collection picker says **In none** and **In any**. They list items by whether the relation is empty, not by who is in it, so the picker hides while one is chosen. Only what you can see counts: a performer you hid is not "a performer" for **Has any**, and a scene whose only performer you hid is listed under **Has none**.

Scenes offer them on Performers, Tags, Studios, Collections and Galleries; images on Performers, Tags, Studios and Galleries; galleries on Performers, Tags and Studios; performers and studios on Tags; studios on Parent Studio; and collections on Studio and Tags. The text filters that can be empty (a performer's Aliases, URL and StashDB ID, a scene's Captions) offer **Has none** and **Has any** in the same way.

### Favorites and Yes / No / Any Filters

Many filters are three-state selects: **Yes**, **No** and **Any** (the default, which filters nothing). They are Favorite Scenes, Favorite Performers, Favorite Studios and Favorite Tags on Scenes; Favorite Performers, Favorite Studios and Favorite Tags on Images and Galleries; Has a Favorite Tag on Performers; Has a Favorite Performer on Collections; and, on Scenes, Organized, Has Markers, Duplicated, Watched, In Progress and In any of my playlists. A favorites checkbox such as Favorite Galleries lists favorites only. **No** lists what **Yes** leaves out: **Favorite Performers: No** lists scenes with no favorite performer, scenes with no performers at all included. A filter saved before these had a **No** keeps meaning what it did.

On the Scenes list, **Favorite Tags** lists the scenes that have one of your favorite tags: tagged with it, tagged with one of its sub-tags, or carrying it by inheritance from a performer, studio or collection, as the Tags filter does. **Favorite Studios** includes the scenes of a favorite studio's sub-studios. Images and galleries follow the same rules (an image's tags include its gallery's). Only your own favorites count, and a favorite you hid no longer matches.

- **Watched** and **In Progress** use the History page's rules (see [Watch History](watch-history.md)): the same scenes as its tabs and as Continue Watching.
- **Duplicated** lists scenes that share their file fingerprint with another scene you can see on the same server.
- **Has Markers** lists scenes with at least one clip you can see.
- **Organized** is Stash's flag, kept as Peek stores it.

### Number Ranges

A number range (rating, height, weight, duration and the like) never matches an item with no value: "rating at most 40" lists only items you rated 40 or less, not the ones you have not rated, and "weight at most 60 kg" only performers with a weight.

Ranges take decimals (a penis length of 14.5 cm, a frame rate of 29.97) and a minimum or a maximum on its own includes that value: "at least 10" lists 10 and up. Heights, weights and penis lengths are stored and linked in metric, so an address or View means the same to everyone; with imperial units on, the boxes and chips show feet, inches and pounds and the address still holds centimetres and kilograms.

#### Unknown values

A range never matches an item with no value. To list those items, open the condition select above the range and choose **Not rated** (Rating) or **Not set** (Height, Weight, Penis Length, Career Length and a collection's Duration); **Rated** and **Set** list the items that have a value. While one of these is chosen the range boxes are hidden and not used. Custom carousels offer the same choices.

### Date Ranges

Set a start date, an end date, or both. Both ends are included: a start alone matches that day and later, an end alone that day and earlier, and both the days in between, so the same day as start and end lists that one day. An item with no date never matches a range.

Created, updated and last-played dates follow your device's time zone: a scene you played at 8 pm is under that day, wherever the server is. A release date or birthdate is a plain calendar day; one Stash holds as a year or a month alone counts as its first day.

### Text Filters

A text filter (Title Search, Path, URL, Code, Aliases and the like) matches the text you type as one phrase, in any capitals. `%` and `_` match themselves, and a quote or bracket is an ordinary character. A filter on a performer's or studio's aliases matches each alias on its own, and URL matches any of an item's links.

Where a text filter offers a condition select, the choices are **Contains**, **Excludes**, **Equals**, **Starts with** (Path) and, on filters that can be empty, **Has none** and **Has any**. **Path** is the path of the scene's or image's primary file, as Peek stores it (a scene with several files is matched by its primary file only), or a gallery's folder, or its zip file's path; it takes no regular expressions.

### Playlists

On the Scenes list, **Playlists** lists the scenes in the playlists you pick: yours, then those shared with you, marked "by (owner name)". **Has ANY**, **Has ALL** and **Has NONE** work as for other pickers. **In any of my playlists** is a separate Yes / No / Any select over your own playlists only (a shared playlist does not count). **Playlist order** appears in the sort list only while exactly one playlist is chosen, and sorts the scenes by their place in it.

Your own exclusions still apply: a scene you hid, or a restriction removes, is not listed or counted whoever shared the playlist, and a playlist you cannot see (never shared with you, or its owner lost Can Share) is treated as one that does not exist: filtering by it lists nothing, and **Has NONE** of it lists everything. A saved filter that names a playlist you can no longer see keeps working and shows "Unavailable playlist".

### Performer Age, Resolution and Multi-Value Selects

- **Performer Age** matches a scene when any of its performers was that age on the scene's date, as Stash does. A scene with no date never matches. A performer's birthdate given as a year or a year and month counts from its first day, and a performer who has died keeps the age they reached. On one library "under 26" found 2,260 scenes before this change and finds 11,985 now.
- **Resolution** uses Stash's ranges on the shorter side of the file, so a portrait 1080p video counts as 1080p. Image Resolution works the same way.
- **Gender** (Performers) and **Orientation** (Scenes and Images) take several values at once, **Has ANY** of them, and Gender can also be "not set". A View saved with a single gender or orientation still means that one.

### Hidden Scenes and Related Filters

Filtering performers, collections, galleries or tags by a studio, a scene or another performer never counts scenes you hid or your restrictions remove: a performer whose only scene in that studio you hid is not listed under it.

### Filters by Page

Every list's **+ Filter** menu offers these filters, grouped in sections; the ones that take a picker also take **Has none / Has any** and include or exclude where described above.

- **Scenes:** Title and Details Search; Performers, Studios, Tags, Performer Tags, Collections (with sub-collections), Galleries and Playlists; Rating, O Count, Duration; the favorites above; **In any of my playlists**; Scene, Created, Updated and Last Played dates; Resolution, Bitrate, Framerate, Orientation, Video and Audio Codec; Director, Path, URL, Code, Captions; Organized, Has Markers, Duplicated, Watched and In Progress; Play Duration, Play Count, Performer Count, Performer Age and Tag Count.
- **Images:** Title, Details, Code, Photographer, Path and URL; Performers, Studios, Tags, Performer Tags and Galleries; Rating, O Count, Tag Count, Performer Count and Performer Age; the favorites; Organized; Resolution and Orientation; Image, Created and Updated dates.
- **Galleries:** Title, Details, Code, Photographer, Path and URL; Performers, Studios, Tags and Performer Tags; Rating, Image Count, Tag Count, Performer Count and Performer Age; the favorites and Has Favorite Image; Organized; **Zip or Folder**; Gallery, Created and Updated dates.
- **Performers:** Name, Disambiguation, Aliases, URL, StashDB ID and Details; Tags (with sub-tags), Studios (with sub-studios), Collections and **Appears With** (performers who share a scene with the ones you pick); Gender, hair and eye color, ethnicity, breast type, country, circumcised, measurements, tattoos, piercings; Age, Birth and Death Year, Career Length, Height, Weight, Penis Length; Birth, Death, Created and Updated dates; Scene, Image, Gallery, Marker, Tag and Play counts; Rating, O Count and the favorites.
- **Studios:** Name, Details, Aliases, URL and StashDB ID; Tags, **Parent Studio** (with sub-studios); counts of scenes, children, tags, images, galleries, performers and collections; Rating, O Count, Play Count, dates and Favorite Studios.
- **Tags:** Name, Description and Aliases; StashDB ID; Performers, Studio and Collections; **Parent Tags** and **Child Tags** (with sub-tags); counts of scenes, parents, children, images, galleries, performers, studios, collections and markers; Rating, O Count, Play Count, dates and Favorite Tags.
- **Collections:** Name, Synopsis, Director, Aliases and URL; Performers, Studio (with sub-studios and Has none / Has any), Tags (with sub-tags); **Parent collection** and **Sub-collections** (with depth); Scene, Sub-collection, Parent Collection and Tag counts; Duration, Rating, O Count, Play Count and Has a Favorite Performer; Release, Created and Updated dates.
- **Clips:** see [Clips](clips.md).
- **Recommended:** the Scenes filters, applied within your top 500 recommendations, with its own Views and default; see [Recommendations](recommendations.md#recommended-page).

A collection's O Count and Play Count are yours, summed over its scenes you can see.

### Sorting

Each list's sort menu offers the keys of its page, with the Random order keeping its seed. Beyond the long-standing ones: Scenes sort by Resolution, Studio, Code, Performer Age (youngest first ascending, oldest first descending, at the scene's date) and Organized, and by Resume Time; Images by Resolution, Tag Count and Performer Count; Galleries by Tag Count and Performer Count; Performers by Tag Count, Marker Count, Image Count, Gallery Count and Collection Count; Studios by Child Studio Count, Tag Count and the counts of images, galleries, performers and collections; Tags by Child Tag Count, Parent Tag Count and the counts of images, galleries, performers, studios and collections; Collections by Tag Count, Performer Count and O Count.

Two sorts appear only beside the filter they depend on: **Playlist Order** with exactly one playlist chosen, and **Collection Order** (position within a collection) with exactly one parent collection chosen. Counts are of what you can see.

### Studio and Tag Pages

A studio with sub-studios, or a tag with sub-tags, shows **Include sub-studios** or **Include sub-tags** above its tabs. Tick it to add them on every tab that can take them:

- On a tag page: every tab (Scenes, Galleries, Images, Performers, Studios and Collections).
- On a studio page: Scenes, Galleries, Images and Collections. The Performers tab lists the performers of this studio's own scenes, so the box is hidden there.

Filters you set on a tab narrow what that tab lists, on top of the page's studio or tag. The page's own studio or tag shows as a dimmed label in the bar, and the same field is offered in **+ Filter** (and can be pinned) like any other: a filter you add on it is combined with the page's by AND, so a tag page's Scenes tab filtered by another tag lists the scenes that have both, and a studio's Performers tab filtered by another studio lists the performers who have scenes in both studios. A View, including your default View, never brings that field to such a page: a "Fave Studios" default does not empty a studio's Performers tab. Inside a folder, the Tags filter is hidden because the folder fixes it, and in the timeline the date filter is.

### Images Tabs

The Images tab of a performer, studio, tag or gallery page is the Images page's list, kept to that page's item: the same sort, filters, search, Grid, Wall, Table and Timeline views and page size, and the same viewer. It opens sorted by title (a gallery's in file order, on the wall). The tab has its own Views and default: a default saved on a tag's Images tab applies to every tag's Images tab and never to the Images page, nor the Images page's default to the tab.

A rating or favorite you set on a detail page, or on a card or in the viewer there, shows on the lists and carousels you go back to without a reload.

### Clips

The Clips page's **Has Preview** filter lists clips **With preview only** until you pick **Without preview only** or **All clips**.

---

## Views

A View is a saved set of filters, sort and display settings for one list, for quick access later. Views are yours, and each belongs to one list: Scenes, Performers, the Scenes tab of a tag page, and so on. Your saved filter presets from earlier versions are your Views.

### What Gets Saved

- All active filters, groups included (never the page's own filters, such as a studio's, nor the search text or your pins)
- Sort field and direction
- View mode (Grid, Wall, Table, Timeline, Folder or Hierarchy)
- Grid density (for Grid view)
- Zoom level (for Wall view)
- Items per page
- Table column configuration (in table view; loading the View shows its columns)

### The Views Menu

The **Views** button in the toolbar names the View the list shows (**Views: Fave Ladies**), or just **Views** when none is loaded. A dot on it means the list has changed since: you changed a filter or the sort. Changing the sort direction or the filters marks it; a different view mode, density, page size or columns doesn't, but **Save changes** saves them. Click it to open the menu: your Views for this list, with a check on the one you are on and a **Default** badge on the default, then the actions below them:

| Action | What it does |
| --- | --- |
| **Save changes** | Saves what the list shows into the View you are on (offered once it has changed) |
| **Save as new view** | Asks for a name and saves the list as a new View; tick **Set as default for ...** to make it the page's default at the same time |
| **Rename view** | Renames the View you are on |
| **Delete view** | Deletes it after asking |
| **Set as default for ...** / **Stop using as default for ...** | Makes the View you are on the page's default, or takes the default away |

The actions apply to the View you are on; to rename or delete another, click its name first. View names are unique for a list ("A view named ... already exists"). If your Views changed in another tab or window, the menu reloads them and asks you to try again.

- Clicking a View name loads it: its filters, sort and display settings replace the list's, as one step in your history.
- **A default View** applies whenever the address names no filter. A default is kept per page: the Scenes tab of a performer, studio, tag, collection or gallery each has its own default, as does the Clips page. Changing a filter on the default View keeps its name on the button (with the dot), so it can be saved back.
- On a studio, tag, performer or collection page, a View never applies the filter the page itself fixes (see [Studio and Tag Pages](#studio-and-tag-pages)).
- On a phone, **Views** is in the second toolbar row. In TV mode it is in the chip row, next to **Filters (n)**, and opens as a dialog: the Views as buttons, then the actions, all reached with the arrows and Enter.
- The Tags page's Hierarchy view has **Views** too.

---

## URL Persistence

Your browse state is reflected in the URL, making it easy to bookmark or share specific views. The list follows the address bar:

- **Back and Forward** step through filters, sort, pages and folders.
- **Search text, per page, view, zoom and density** replace the current history entry, so they add no Back steps.
- **A default View** applies whenever the URL names no filter. Clearing the filters (Clear all, removing the last chip, or loading a View without filters) writes `filters=none`, so the list stays unfiltered and Back brings the filters back; a plain list link, such as the sidebar's, gets the default View again.
- **A filter chip's panel** adds one history entry for the whole edit, a pinned filter's tap one entry, and **Show N results** on a phone one entry.
- **Random order** keeps its seed in the URL (`sort=random_12345678`), so coming back from a scene shows the same order.

**URL parameters include:**

- `q` - search text
- `page` and `per_page` - the page and its size
- `sort` and `dir` - current sort settings
- `view` - grid, wall, table, timeline, folder or hierarchy
- `savedView` - the View the list is on, so the **Views** button keeps its name. It holds the id of one of your own Views; an id you don't have is ignored
- `grid_density` - small, medium, or large (grid view)
- `zoom` - small, medium, or large (wall view)
- `timeline_period` - the selected period (timeline view)
- `folderPath` - the open folder (folder view)
- Filter parameters - active filters, or `filters=none` when you cleared them

Sharing a URL shares your exact view configuration.

---

## Tips

### For Large Libraries

- Use **Table View** to quickly scan metadata across hundreds of items
- Use **Wall View with Small zoom** for visual overview
- Save **Views** for common browsing patterns, and pin the filters you reach for most

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
