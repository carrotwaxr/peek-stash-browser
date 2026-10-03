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
- Rating stars (your Peek rating)
- O counter indicator
- Favorite heart icon

**Hover actions:**

- Click the **star** to rate the image
- Click the **heart** to favorite/unfavorite
- Click the **O** button to increment the O counter

## The Lightbox Viewer

Click any image to open it in the full-screen lightbox viewer.

Small images are scaled up to fill the viewer, keeping their proportions. Video files that Stash stores as images (mp4, m4v, webm, mov) play in the viewer with the browser's video controls, muted and looping; the arrow keys and swipes still move to the next image.

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
    - **1-5**: Set rating (1=20%, 2=40%, 3=60%, 4=80%, 5=100%)
    - **0**: Clear rating
- **F key**: Toggle favorite

Your ratings and favorites are saved to Peek (separate from Stash ratings). Filtering and sorting images by rating or O count use your own ratings and O counts: an image you have not rated counts as unrated, whatever its rating in Stash.

### O Counter

Track special moments:

- Press **O** or click the O button to increment
- Pressed it by mistake? **Remove last O**, in the menu (⋮) beside the O button in the info drawer or on an image card, takes your newest O away. It shows only while the count is above 0.
- With Sync to Stash on (an admin sets it in User Management), the O is added to and removed from the image in Stash too
- View your O history in the info drawer

### Info Drawer

Press **I** or click the info button to see image metadata:

- Title and code
- Date and photographer
- Studio information
- Performers and tags
- File details (resolution, size)
- Gallery associations

The drawer slides in from the right and can stay open while navigating.

### Fullscreen Mode

Press **F** or click the expand button to enter fullscreen mode. Press **Escape** or **F** again to exit.

## Filtering Images

### By Performer

1. Click **Filters** in the search controls
2. Select **Performers**
3. Choose one or more performers
4. Images featuring those performers will display

### By Gallery

Filter to see images from specific galleries:

1. Click **Filters**
2. Select **Galleries**
3. Choose the gallery
4. Only images from that gallery appear

### By Tag

1. Click **Filters**
2. Select **Tags**
3. Choose one or more tags
4. Matching images display

!!! note "Inherited Tags"
    Images can inherit tags from their parent gallery, performers, and studio.

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
| **Performer Tags** | Images with a performer who has the tag, with sub-tags |
| **Performer Count**, **Performer Age** | Range filters: how many performers you can see on the image, and a performer's age on the image's date |
| **Favorite Performers**, **Favorite Studios**, **Favorite Tags** | Yes / No / Any, by your favorites (their sub-tags and sub-studios, and the tags an image gets from its galleries, included) |
| **Organized** | Yes / No / Any, by Stash's organized flag |
| **Resolution** | Stash's ranges on the shorter side of the file (a portrait 1080p image is 1080p), with Equals, Not Equals, Greater Than and Less Than |
| **Orientation** | Landscape, portrait or square: pick one or several |
| **Image Date**, **Created Date**, **Updated Date** | A start date, an end date, or both; both ends are included |

You can also sort by Resolution, Tag Count and Performer Count.

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

Images in galleries inherit metadata from the parent:

- Gallery's studio
- Gallery's performers
- Gallery's tags
- Photographer information

This inherited data appears in the info drawer.

## View Tracking

Peek automatically tracks which images you view:

- **View count**: Incremented after viewing for 3+ seconds
- **View history**: Timestamps of each view
- **Last viewed**: When you last saw the image

View this data in the info drawer or on performer/studio detail pages.

## Tips & Tricks

### Quick Rating

Use number keys while in the lightbox for rapid rating:

- View image → Press **4** → Instantly 4-star rated → **→** → Next image

### Random Browse

Set sort to **Random** for discovery mode. The random seed is consistent within your session, so pagination works correctly.

### Touch Devices

The lightbox is fully touch-optimized:

- Swipe left/right to navigate
- Tap center to show/hide controls
- Use the back gesture to close the viewer
- Pinch to zoom (coming soon)

### Keyboard-Only Navigation

For TV mode or keyboard-only use:

1. Use **Tab** to navigate image cards
2. Press **Enter** to open lightbox
3. Use arrow keys to browse
4. Press **Escape** to close

## Troubleshooting

### Images not loading

- Check your Stash connection in Server Settings
- Verify path mappings are configured correctly
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
