# Images

Browse, filter, and view images from your Stash library with a full-featured lightbox viewer.

## Browsing Images

### The Images Page

Access the Images page from the main navigation menu. Here you can:

- **Browse** all images in your library with thumbnail cards
- **Search** by the name the card shows (the title, or the file name without its extension), details and the like. Words from a file's folder are not searched: use the **Path** filter
- **Filter** by performer, studio, tag, or gallery
- **Sort** by date, rating, random, and more
- **Paginate** through large collections

### Image Cards

Each image card displays:

- Thumbnail preview
- Title (if set)
- A rating badge with your rating as a number from 0 to 10, or `--` when you have not rated the image
- O counter
- Favorite heart icon
- A menu with **Hide** (see [Hidden Items](hidden-items.md))

**Card actions:**

- Click the **rating badge** to open a slider and rate the image from 0 to 10
- Click the **heart** to favorite/unfavorite
- Click the **O** button to increment the O counter

## The Lightbox Viewer

Click any image to open it in the full-screen lightbox viewer.

Small images are scaled up to fill the viewer, keeping their proportions. Pinch to zoom on a touch screen, or scroll to zoom with a mouse (up to 5 times), then drag to pan the zoomed image. Video files that Stash stores as images (mp4, m4v, webm, mov) play in the viewer with the browser's video controls, muted and looping; the arrow keys and swipes still move to the next image.

The open image is part of the page's address. Your browser's **Back** button (or the phone's back gesture) closes the viewer and leaves you on the list where you were, and copying or bookmarking the address while an image is open opens the viewer straight on that image. Moving from image to image, even onto the next page, does not add history entries, so one Back always closes the viewer. Closing the viewer, with Back or its own close button, leaves the list on the page of the last image you viewed, and the next Back leaves the list. If the next page of images fails to load, the viewer stays on the image you were on and a message says what went wrong.

### Navigation

**Keyboard:**

| Key | Action |
|-----|--------|
| ← / → | Previous / Next image |
| Escape (or Back) | Close lightbox |
| F | Toggle fullscreen |
| I | Toggle info drawer |
| Space | Play/pause slideshow |

**Touch/Mouse:**

- **Swipe left/right** to navigate between images
- **Click arrows** on screen edges
- **Tap** to show/hide controls

### Slideshow Mode

Start an automatic slideshow:

1. Open an image in the lightbox
2. Click the **Play** button or press **Space**
3. Images advance automatically every 5 seconds
4. Click **Pause** or press **Space** to stop

!!! tip "Slideshow Timer"
    Click the clock icon to adjust slideshow duration (2, 3, 5, 10, or 15 seconds).

### Rating & Favorites

Rate images directly in the lightbox:

- **R key**: Enter rating mode, then:
    - **1-5**: Set the rating to 2, 4, 6, 8 or 10
    - **0**: Clear rating
    - **F**: Toggle favorite
- In the info drawer, click the rating badge for a slider (0 to 10 in steps of 0.1) and use the heart to favorite
- A **double-tap** (touch) or **double-click** (mouse) on the image does one action you choose in Settings → User Preferences → Customization → **Image Lightbox Double-Tap Action**: toggle favorite (the default), add an O, or toggle fullscreen

Ratings and favorites are yours, per user, and show as you set them, not as Stash has them. Filtering and sorting images by rating or O count use your own ratings and O counts: an image you have not rated counts as unrated, whatever its rating in Stash. With **Sync to Stash** on for your account, an image rating you set is also written to Stash; favorites stay in Peek (see [Sync to Stash](user-management.md#sync-to-stash-export)).

### O Counter

Track special moments:

- Click the O button on an image card, or in the info drawer, to increment (the lightbox has no O key)
- Pressed it by mistake? **Remove last O**, in the menu (⋮) beside the O button in the info drawer or on an image card, takes your newest O away. It shows only while the count is above 0.
- With Sync to Stash on (an admin sets it in User Management), the O is added to and removed from the image in Stash too

### Info Drawer

Press **I** or click the info button to see image metadata and your own controls:

- Title, with your rating badge, O counter (and its **Remove last O** menu) and favorite heart
- Studio, date, photographer and resolution
- Performers and tags
- Details
- Links

The drawer slides in from the right and can stay open while navigating.

### Fullscreen Mode

Press **F** or click the expand button to enter fullscreen mode. Press **Escape** or **F** again to exit.

## Filtering Images

### By Performer, Gallery and Tag

Pick one or more performers, galleries or tags, and only the matching images list. Combine them with ANY, ALL or NONE as described in the table below.

!!! note "Inherited Tags"
    An image with no tags of its own takes its gallery's tags, and the filters see them. The same holds for performers.

With **Include sub-tags** on, a chosen tag also matches its sub-tags, and "has all of" matches an image tagged with any sub-tag of each chosen tag. With more than one Stash server, a tag or studio picked from one server (and its sub-tags or sub-studios) matches only that server's content.

### By Tag Count

**Tag Count** filters by how many tags an image has, the ones its galleries give it included: 0 to 0 lists the untagged images, as the folder view's **Untagged** folder does.

### More Filters

| Filter | Description |
|--------|-------------|
| **Title Search** | The name the card shows: the title, or the file name without its extension for an untitled image |
| **Details Search**, **Code**, **Photographer** | Text search |
| **Path** | The image file's path: **Contains**, **Excludes**, **Equals** or **Starts with**. No regular expressions |
| **URL** | Text search on any of the image's links |
| **Performers**, **Studios**, **Tags**, **Galleries** | ANY / ALL / NONE (a studio: ANY or NONE), include or exclude each value, and **Has none / Has any** (see [Browse and Display](browse-and-display.md#include-or-exclude-each-value)) |
| **Rating** | A range from 0 to 10, as ratings show (one decimal), or Rated / Not rated. It uses your own ratings |
| **Favorite Images** | Show only your favorited images |
| **O Count** | A range on your own O count |
| **Performer Tags** | Images with a performer who has the tag, with sub-tags |
| **Performer Count**, **Performer Age** | Range filters: how many performers you can see on the image, and a performer's age on the image's date |
| **Favorite Performers**, **Favorite Studios**, **Favorite Tags** | Yes / No / Any, by your favorites (their sub-tags and sub-studios, and the tags an image gets from its galleries, included) |
| **Organized** | Yes / No / Any, by Stash's organized flag |
| **Resolution** | Stash's ranges on the shorter side of the file (a portrait 1080p image is 1080p), with Equals, Not Equals, Greater Than and Less Than |
| **Orientation** | Landscape, portrait or square: pick one or several |
| **Image Date**, **Created Date**, **Updated Date** | A start date, an end date, or both; both ends are included |

You can sort by Created At, Date, File Size, O Count, Path, Performer Count, Random, Rating, Resolution, Tag Count, Title and Updated At.

### Combined Filters

Combine multiple filters for precise results:

- Performer: "Jane Doe" + Tag: "Outdoor" = Jane's outdoor images

## Gallery Image Viewing

When viewing a gallery detail page, click any image to open it in the lightbox with special features:

### Cross-Page Navigation

Navigate seamlessly across gallery pages:

1. Open the lightbox on an image
2. Navigate to the last image on the current page
3. Press **→** to automatically load the next page
4. Continue browsing without closing the lightbox

**Back** closes the viewer and stays on the gallery; the gallery's address with an image open opens that image directly. The same holds for the Images tabs on performer, studio and tag pages.

### Inherited Metadata

An image that has none of its own takes these from its gallery:

- Studio
- Performers
- Tags
- Date, photographer and details

An image in several galleries takes its studio, date, photographer and details from the first gallery that has one, and its performers and tags from all of its galleries. This inherited data appears in the info drawer and counts in the filters.

## View Tracking

Peek automatically tracks which images you view:

- **View count**: Incremented after viewing for 3+ seconds
- **View history**: Timestamps of each view

Your most viewed image shows in [My Stats](stats.md). The info drawer does not show view counts.

## Tips & Tricks

### Quick Rating

Use number keys while in the lightbox for rapid rating:

- View image → Press **R**, then **4** → Rated 8.0 → **→** → Next image

### Random Browse

Set sort to **Random** for discovery mode. The random seed is consistent within your session, so pagination works correctly.

### Touch Devices

The lightbox is fully touch-optimized:

- Swipe left/right to navigate
- Tap center to show/hide controls
- Use the back gesture to close the viewer
- Pinch to zoom, then drag to pan
- Double-tap for the action you set in Settings (favorite by default)

### Keyboard-Only Navigation

For TV mode or keyboard-only use:

1. Use **Tab** to navigate image cards
2. Press **Enter** to open lightbox
3. Use arrow keys to browse
4. Press **Escape** to close

## Troubleshooting

### Images not loading

- Ask an admin to check the Stash connection (Settings → Server Settings → Server Configuration → Stash Instances)
- Ensure Stash has generated thumbnails

### Lightbox not opening

- Make sure JavaScript is enabled
- Try refreshing the page
- Check browser console for errors

### Slow loading

- Large libraries may take time to load
- Use filters to narrow results
- Check your network connection to Stash

## Next Steps

- [Watch History](watch-history.md) - Track your viewing across scenes and images
- [Keyboard Navigation](keyboard-navigation.md) - Complete keyboard shortcuts
- [Hidden Items](hidden-items.md) - Hide images you don't want to see
