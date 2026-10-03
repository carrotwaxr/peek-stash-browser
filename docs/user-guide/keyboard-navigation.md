# Keyboard Navigation & TV Mode

Peek supports keyboard navigation for remotes, wireless keyboards, or couch browsing.

## Why Keyboard Navigation?

- **TV Mode** - Navigate Peek with a remote or arrow keys
- **Accessibility** - Full keyboard support for users who prefer or require it
- **Efficiency** - Navigate faster without reaching for the mouse
- **Couch Browsing** - Control everything from your couch with a wireless keyboard

## Global Navigation

### Primary Navigation Keys

| Key | Action |
|-----|--------|
| `Tab` | Move to next focusable element |
| `Shift+Tab` | Move to previous focusable element |
| `Enter` | Activate/click the focused element |
| `Space` | Activate the focused button (also play/pause in video player) |
| `Escape` | Close the open lightbox or dialog |
| `?` | Open the keyboard shortcuts help |

### Go To a Page

Press `g`, then a letter, within one second:

| Keys | Page |
|------|------|
| `g` `s` | Scenes |
| `g` `r` | Recommended |
| `g` `p` | Performers |
| `g` `u` | Studios |
| `g` `t` | Tags |
| `g` `c` or `g` `v` | Collections |
| `g` `l` | Galleries |
| `g` `y` | Playlists |
| `g` `z` | Settings |

### Rate and Favorite

On a scene, performer, studio, tag, collection or gallery page, and on the image open in the lightbox, press `r`, then within one second:

| Keys | Action |
|------|--------|
| `r` `1` to `r` `5` | Rate 1 to 5 stars (20, 40, 60, 80 or 100) |
| `r` `0` | Clear the rating |
| `r` `f` | Toggle favorite |

### Which Keys Go Where

- **A lightbox or dialog takes every key while it is open.** With an image open in the lightbox, `r` `4` rates that image, never the performer, studio, tag or gallery page behind it, and `g` shortcuts wait until you close it.
- **Typing in a field never triggers a shortcut.** In a search box or text field, letters, numbers and `Space` type as usual; only `Escape` reaches the page.
- **The focused control keeps its own keys.** `Space` and `Enter` press the focused button or link, and the arrow keys move a focused slider, list or menu.
- **The second key of a pair goes only to the first.** After `r`, the next key rates; after `g`, the next key opens a page. Nothing else reacts to it, so `r` `4` on a scene page rates the scene and does not seek the video.

### Arrow Key Navigation

In [TV Mode](#tv-mode) the arrow keys move focus to the nearest item in that direction, by where things are on the screen: the cards of any grid or carousel, a detail page's tabs, the search and sort controls, the pagination buttons and the sidebar. It works the same way on every page, detail pages, Clips and Recommended included, at any screen size.

| Key | Action (TV Mode) |
|-----|--------|
| `↑` `↓` `←` `→` | Move focus to the nearest item in that direction |
| `Enter` | Open the focused card, or press the focused button or link |
| `Page Up` / `Page Down` | Previous / next page of a list |

- `↓` from the last full row of a grid reaches a shorter last row.
- `←` from the leftmost cards reaches the sidebar, and `→` comes back to the page. `↑` and `↓` stay on the side they are on.
- In a search box, `←` and `→` move the cursor and `Space` types a space; `↑` or `↓` leaves the box.
- With the lightbox or a dialog open, the arrows stay inside it. In the lightbox, `←` and `→` still show the previous and next image.
- Drop-down lists (sort, page, per page) are reached like anything else, and the arrow keys move on from them without changing their value; press `Enter` (or `Space`) to open one, then pick with the arrow keys and `Enter`.
- On a slider, `←` and `→` change its value and `↑` or `↓` moves on.
- An open menu keeps the arrow keys until you close it. In the menus that open from a button, such as the view-mode menu (Grid, Wall, ...), `Enter` on the button opens the menu on the current choice, `↑` and `↓` move through the choices (`Home` and `End` jump to the first and last), `Enter` picks one and `Esc` closes the menu and puts focus back on the button.
- When a page opens, its first card takes focus.

Outside TV Mode the arrow keys scroll the page, and `Tab` moves through the page's links and buttons and the sidebar.

## Scene Browsing

### Scene Grid Navigation

**Navigating scene cards:**

1. Use `Tab` or arrow keys to focus a scene card
2. Press `Enter` to open the scene detail page

**On a focused scene card:**

| Key | Action |
|-----|--------|
| `Enter` | Open scene detail page |

### Scene Detail Page

`Tab` moves between the action buttons, and `Enter` presses the focused one. To go back, use the **Back** button at the top of the page or your browser's back button; `Escape` does not leave the page. The player's own keys are listed below.

## Video Player Controls

The player's keys work when the player, or nothing, has focus. With focus on a button, menu, tab or field elsewhere on the scene page, `Space`, the arrow keys and `Home`/`End` do that control's own job instead of controlling the video.

### Playback Controls

| Key | Action |
|-----|--------|
| `Space` or `K` | Play/Pause |
| `←` | Seek backward 5 seconds |
| `→` | Seek forward 5 seconds |
| `J` | Seek backward 10 seconds |
| `L` | Seek forward 10 seconds |
| `Home` | Jump to beginning |
| `End` | Jump to end |
| `0-9` | Jump to 0%-90% of video |

**Examples:**
- Press `5` to jump to 50% of the video
- Press `0` to jump to the start
- Press `9` to jump to 90%

### Volume Controls

| Key | Action |
|-----|--------|
| `↑` | Increase volume by 5% |
| `↓` | Decrease volume by 5% |
| `M` | Mute/unmute |

### Playback Speed

| Key | Action |
|-----|--------|
| `Shift+>` | Speed up by 0.25 (up to 2x) |
| `Shift+<` | Slow down by 0.25 (down to 0.25x) |

### Rating

The rating keys from [Rate and Favorite](#rate-and-favorite) work on a scene page, with the player or nothing focused: `r` then `1` to `5` rates the scene, `r` `0` clears the rating and `r` `f` toggles the favorite. The number keys after `r` rate; they do not seek.

### Display Controls

| Key | Action |
|-----|--------|
| `F` | Toggle fullscreen |

In fullscreen, your browser's own `Escape` exits it.

### Playlist Playback

**While playing a playlist of two or more scenes:**

| Key | Action |
|-----|--------|
| `Shift+N` | Next scene in playlist |
| `Shift+P` | Previous scene in playlist |

## Search and Filtering

These keys work on every list page (Scenes, Performers, Clips, Recommended, and the tabs of detail pages that list items). They don't run while you are typing in a field, inside an open dialog or popover, or with the video player focused.

| Key | Action |
|-----|--------|
| `/` | Focus the search box |
| `f` | Open **+ Filter** (on a phone or in TV mode, the filter sheet with its list of filters open); not offered where the view takes no filters, such as the Tags hierarchy |
| `↓` | Leave the search box for the controls and chips below it (TV mode) |
| `Page Up` / `Page Down` | Previous / next page (TV mode) |

Search applies as you type, a moment after you stop; there is nothing to submit. `Shift+F` is left free.

### The Filter Bar

The filter bar is ordinary buttons, so `Tab` and `Shift+Tab` move through it in order: pinned filters, chips, **+ Filter**, **Advanced**, **Clear all**.

| Where | Key | Action |
|-------|-----|--------|
| A chip | `Enter` or `Space` | Open its filter under the chip; again to close it |
| A chip's **x** | `Enter` or `Space` | Remove the filter; focus moves to the next chip's **x** |
| An open filter | `Tab` | Move through its fields and its header buttons (**Pin**, **Pin as quick filter**, **Remove**) |
| An open filter | `Escape` | Close it, with focus back on the chip |
| A pinned filter | `Enter` or `Space` | Turn it on or off |
| **+ Filter** | `Enter`, `Space` or `f` | Open the menu with the cursor in its search box |
| The menu's search box | Letters | Narrow the filters; with two letters or more, also find tags, performers, studios and collections by name |
| The menu's search box | `Enter` | Pick the first match |
| The menu's search box | `↓` | Move into the list; `↑` from the first entry goes back to the box, and `Home` and `End` jump |
| The menu's list | `Enter` | Pick the highlighted filter or name |
| The menu | `Escape` | Close it, with focus back on **+ Filter** |
| **Advanced** | `Enter` | Open the rule view (see [The Advanced View](#the-advanced-view)) |

A filter you pick opens under its chip. In the filter's own field, a typed number or date applies when you stop typing, and everything in one open filter is one Back step in the browser.

The pickers (performers, tags, studios, collections, galleries) work the same inside a chip's filter, in the filter sheet, in the carousel builder and in the Content Restrictions editor: a picker's list opens with the cursor in its search box, `Enter` on the picker opens its list, `Escape` closes an open list (focus returns to the picker), and `Tab` or an arrow that leaves the picker closes it. Each picked value has an include or exclude button and a remove button, both reached with `Tab`.

### The Advanced View

The Advanced view (and the carousel builder, which uses the same rows) is ordinary form controls, so `Tab` and `Shift+Tab` move through them in order: the top-level **Match** select, then each row (**Filter**, **Condition**, **Value**, **Sub-items**, the row's actions button), the waiting row **Add a filter...**, then each group's header (its **Match** select and **Remove group**), its rows and its waiting row, then **Add group**, **Cancel** and **Apply**.

| Where | Key | Action |
|-------|-----|--------|
| A **Filter**, **Condition** or **Match** select | `Space` (`Enter` in TV mode) | Open its list; `↑` and `↓` choose and `Enter` picks |
| The waiting row | `Space` (`Enter` in TV mode), then `↑` or `↓` and `Enter` | Pick a field: a new row is added and focus moves to its value |
| A row's actions button | `Enter` | Open the menu (**Move to** each other group or the top level, **Remove**); `↑` and `↓` move, `Enter` picks, `Escape` closes it with focus back on the button |
| After **Remove** | | Focus moves to the next row, or the container's waiting row |
| The view | `Escape` | Close it; with edits you have not applied, ask **Discard changes?** first (`Enter` on **Discard** or **Keep editing**) |
| **Apply** | `Enter` | Apply every rule at once and close |

Nothing applies until **Apply**. At 20 rules or 5 groups, the waiting row and **Add group** say so and **Apply** names what to remove.

In TV mode, with the D-pad:

- `↑` and `↓` move between rows, landing on the same column of the next row (**Filter** to **Filter**, **Value** to **Value**); `←` and `→` move within a row.
- `Enter` (the remote's OK) on a select opens it; `↑` and `↓` choose and `Enter` picks. OK on a row's actions button opens its menu, which keeps the arrow keys until you close it.
- The view takes the whole screen, so `↓` from the last row reaches **Add group**, **Cancel** and **Apply**.
- `Escape` asks before discarding, as above.

### Filters on a Phone and in TV Mode

On a phone and in TV mode, **Filters (n)**, a chip and **+ Filter** (and `f`) open the filter sheet, a full-height dialog. `Tab` (or the arrows in TV mode) moves through the pinned filters, each filter's editor, **Advanced**, **Clear all**, the list of filters to add, and last the button **Show N results**. Nothing applies until `Enter` on **Show N results**, which applies everything as one step; `Escape` closes the sheet and drops the edits.

In TV mode, with the D-pad:

- The chip row sits right under the search box and sort controls. `↓` from the search box lands on the first pinned filter. Left to right the row holds the pinned filters, the pinned fields, your chips and groups, **Filters (n)**, **Views**, **+ Filter**, **Advanced** and **Clear all**.
- **Views** opens a dialog: its Views are buttons (the one you are on is pressed, and focused first) with the actions (**Save changes**, **Save as new view**, **Rename view**, **Delete view**, set or stop using as default) below. `Enter` on a View loads it and `Escape` closes the dialog.
- In the sheet, **+ Filter** is a button over its menu (`Enter` opens it, the arrows move through the filters, `Enter` picks, `Escape` closes it), so `↓` from the last filter reaches **Show N results**.
- An open menu or filter panel keeps the arrow keys until you close it: they never move focus to the page behind.
- `Left` and `Right` leave a text field once the cursor is at that end of the text, and leave a number or date field at once, so no field traps the D-pad.
- `Enter` (the remote's OK) ticks a checkbox or radio button, in the filter sheet and in dialogs; `Space` still does as well.
- A picked value's include or exclude button and its remove button are buttons the arrows reach.
- A filter's header buttons (**Pin**, **Pin as quick filter**, **Remove**) are reached by the arrows in each filter of the sheet. This is where you pin in TV mode.

## Playlists

The Playlists page and a playlist's page have no keys of their own: `Tab` or the arrow keys (TV Mode) move between playlists and scenes, and `Enter` opens or presses the focused one. To create, edit or delete, use the buttons on the page.

### Reordering Scenes
- Click **Reorder**, then `Tab` to a scene's arrow buttons and press `Enter`, or type its new position in the box and press `Enter`
- Each move is saved at once

## TV Mode

### What is TV Mode?

TV Mode makes Peek work from the couch with arrow keys and Enter:

- **Arrow keys move by position** - focus goes to the nearest item in the direction you press, on every page (see [Arrow Key Navigation](#arrow-key-navigation))
- **Large Focus Indicators** - the focused card is enlarged and outlined, easy to see from across the room
- **Auto-Scroll** - the page scrolls just enough to keep the focused item visible
- **Page keys** - `Page Up` and `Page Down` change the page of a list
- **Filters lead the list** - on a list, your pinned filters come right under the search box, one `↓` away, and filtering happens in a sheet you can use with the D-pad (see [Filters on a Phone and in TV Mode](#filters-on-a-phone-and-in-tv-mode))
- **List keys** - `/` focuses the search box and `f` opens the filter sheet

Turn it on or off from the user menu (**TV Mode**). Peek remembers the choice in this browser.

### Using Peek on TV

**Recommended setup:**

1. Connect a computer to your TV (HDMI)
2. Access Peek via web browser on that computer
3. Use a **wireless keyboard** (e.g., Logitech K400) - recommended for best experience
4. Enable TV Mode from the user menu
5. Use the arrow keys to move around, Enter to open, Page Up/Page Down to change pages

In the Advanced view and the carousel builder's rules, `↑` and `↓` move between rows, `←` and `→` move within a row, and OK opens a select (see [The Advanced View](#the-advanced-view)).

**Alternative remotes** (limited support):

- Android TV remote apps
- Smart TV keyboards
- Game controllers (via browser support)

### TV Mode Tips

1. **Use fullscreen browser mode** (F11) for immersive experience
2. **Enable auto-hide cursor** in your OS settings
3. **Increase font size** in browser settings (Ctrl +)
4. **Pick a dark theme** (Settings → User Preferences → Theme) for better viewing in dark rooms
5. **Keep a keyboard nearby** for typing, such as a search or a playlist position

## Settings and Dialogs

Settings pages and dialogs use the browser's own behavior: `Tab` moves between controls, and `Enter` or `Space` presses the focused button or toggles the focused switch or checkbox. Peek adds one thing: `Escape` closes a dialog, and with a dialog open `Tab` stays inside it.

## Accessibility Features

### Focus Indicators

Peek shows clear visual focus indicators:

- **Blue outline** around focused elements
- **Highlighted cards** when focused in grids
- **Button highlights** when focused
- **Scale effect** on focused scene cards

### Screen Reader Support

Basic screen reader support:

- **Alt text** on images
- **ARIA labels** on buttons and controls
- **Semantic HTML** for proper navigation
- **Keyboard-accessible** everything

!!! note "Screen Reader Support"
    Screen reader support is improving but may not be perfect. Please report accessibility issues on GitHub.

## Customizing Keyboard Shortcuts

**Currently not customizable.** Keyboard shortcuts are built-in and cannot be changed.

**Future enhancement:** Custom keyboard shortcuts may be added in a future update.

## Troubleshooting

### Keyboard navigation not working

**Solution:**
- Click anywhere in the browser window to focus it
- Try pressing `Tab` to activate focus mode
- Check if a modal or dialog is open (press `Escape`)
- Disable browser extensions that may interfere
- Try a different browser

### Focus indicator not visible

**Solution:**
- Your browser theme may be hiding focus outlines
- Try a different theme in Peek (Settings → User Preferences → Theme)
- Check browser zoom level (Ctrl + 0 to reset)
- Report as a bug if it persists

### Arrow keys scroll page instead of navigating

**Solution:**
- Turn on TV Mode from the user menu: outside it, the arrow keys scroll the page
- In a text field, `←` and `→` move the cursor; press `↑` or `↓` to leave it
- Outside TV Mode, a drop-down list or slider keeps the arrow keys while it has focus; press `Tab` to move on

### Video player shortcuts not working

**Solution:**
- Make sure video player is focused (click on it)
- Some shortcuts only work during playback
- Check if another app is intercepting keys
- Try clicking the video before using shortcuts

## Tips for Power Users

### Speed Navigation

1. **Use `/` to search instantly** on any list page, and `f` to add a filter
2. **Use number keys (0-9) to scrub through videos** quickly
3. **Use `Tab` then `Enter`** to press the focused button without the mouse

### Couch Potato Mode

Perfect setup for couch browsing:

1. Open Peek in fullscreen (F11)
2. Create a "Favorites" playlist
3. Start playlist playback
4. Use only these keys:
   - `Space` - Play/Pause
   - `Shift+N` - Next video
   - `Shift+P` - Previous video
   - `↑/↓` - Volume
   - `F` - Fullscreen on/off

### Workflow Optimization

**Browse and queue efficiently:**

1. Navigate the scene grid with the arrow keys (TV Mode)
2. Select the scenes you want to watch and add them to a "Watch Later" playlist from the selection bar
3. Open the playlist and press Play
4. Lean back and enjoy

## Next Steps

- [Watch History](watch-history.md) - Resume playback from where you left off
- [Playlists](playlists.md) - Create and manage custom playlists
- [Quick Start Guide](../getting-started/quick-start.md) - Get started with Peek
