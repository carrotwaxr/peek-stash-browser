# Keyboard Navigation & TV Mode

Peek supports keyboard navigation for remotes, wireless keyboards, or couch browsing.

!!! warning "TV Mode Status"
    TV Mode is a work-in-progress. Grid navigation works on most pages (Scenes, Performers, Studios, Tags), but some features and pages don't have full TV navigation yet. Best experience is currently with a wireless keyboard.

## Why Keyboard Navigation?

- **TV Mode** - Navigate Peek with a remote (partial support)
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

Arrow keys navigate through grid layouts and lists:

| Key | Action |
|-----|--------|
| `↑` | Move focus up (in grids and lists) |
| `↓` | Move focus down (in grids and lists) |
| `←` | Move focus left (in grids) |
| `→` | Move focus right (in grids) |

**Grid Navigation:**
- Scene grids automatically respond to arrow keys
- Focus moves intelligently between rows and columns
- Works on Scenes, Performers, Studios, Tags pages

**List Navigation:**
- Arrow up/down navigates vertical lists
- Works in playlists, search results, settings

## Scene Browsing

### Scene Grid Navigation

**Navigating scene cards:**

1. Use `Tab` or arrow keys to focus a scene card
2. Press `Enter` to open the scene detail page
3. Press `Escape` to go back to the grid

**On a focused scene card:**

| Key | Action |
|-----|--------|
| `Enter` | Open scene detail page |

### Scene Detail Page

**While viewing scene details:**

| Key | Action |
|-----|--------|
| `Space` or `Enter` | Play video |
| `Escape` | Return to previous page |
| `Tab` | Navigate between action buttons |

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
| `↑` | Increase volume |
| `↓` | Decrease volume |
| `M` | Mute/unmute |

### Display Controls

| Key | Action |
|-----|--------|
| `F` | Toggle fullscreen |
| `Escape` | Exit fullscreen |

### Playlist Playback

**While playing a playlist of two or more scenes:**

| Key | Action |
|-----|--------|
| `Shift+N` | Next scene in playlist |
| `Shift+P` | Previous scene in playlist |

## Search & Filtering

### Search Box

| Key | Action |
|-----|--------|
| `/` or `Ctrl+F` | Focus search box (from anywhere) |
| `Escape` | Clear search and exit search box |
| `Enter` | Submit search / apply filters |
| `↓` | Move to search results (from search box) |

### Filter Controls

**While using filters:**

| Key | Action |
|-----|--------|
| `Tab` | Move between filter options |
| `Space` | Toggle checkbox filters |
| `Enter` | Apply filters |
| `Escape` | Close filter panel |

## Playlists

### Playlist Management

| Key | Action |
|-----|--------|
| `N` | Create new playlist (when on Playlists page) |
| `Enter` | Open focused playlist |
| `Delete` | Delete focused playlist (with confirmation) |

### Editing Playlists

**In edit mode:**

| Key | Action |
|-----|--------|
| `Tab` | Navigate between scenes |
| `Delete` | Remove focused scene from playlist |
| `Escape` | Exit edit mode |
| `Enter` | Save changes |

**Reordering scenes:**
- Use mouse drag-and-drop for reordering
- Keyboard reordering not currently supported

## TV Mode

!!! note "Work in Progress"
    TV Mode is being actively developed. Grid navigation works on most browse pages, but full remote-only navigation isn't complete yet.

### What is TV Mode?

TV Mode enables enhanced keyboard/remote navigation:

- **Large Focus Indicators** - Easy to see what's selected from across the room
- **Remote-Friendly Navigation** - Arrow keys and Enter for grid navigation
- **Auto-Scroll** - Page scrolls to keep focused element visible

**Current limitations:**

- Some pages (Settings, modals) still require mouse or Tab navigation
- Search/filter controls need Tab to navigate
- Best paired with a wireless keyboard for full functionality

### Using Peek on TV

**Recommended setup:**

1. Connect a computer to your TV (HDMI)
2. Access Peek via web browser on that computer
3. Use a **wireless keyboard** (e.g., Logitech K400) - recommended for best experience
4. Enable TV Mode from the user menu
5. Use arrow keys to navigate grids, Enter to select

**Alternative remotes** (limited support):

- Android TV remote apps
- Smart TV keyboards
- Game controllers (via browser support)

### TV Mode Tips

1. **Use fullscreen browser mode** (F11) for immersive experience
2. **Enable auto-hide cursor** in your OS settings
3. **Increase font size** in browser settings (Ctrl +)
4. **Use dark theme** for better viewing in dark rooms
5. **Keep a mouse nearby** for features not yet TV-navigable

## Settings Navigation

### Navigating Settings Pages

| Key | Action |
|-----|--------|
| `Tab` | Move between settings sections |
| `Enter` | Open/edit focused setting |
| `Space` | Toggle switches and checkboxes |
| `Escape` | Cancel without saving |

### Saving Settings

| Key | Action |
|-----|--------|
| `Enter` | Save changes (when focused on Save button) |
| `Escape` | Cancel changes |

## Modal Dialogs

### Dialog Controls

| Key | Action |
|-----|--------|
| `Enter` | Confirm action (OK, Save, Submit) |
| `Escape` | Cancel and close dialog |
| `Tab` | Navigate between dialog buttons |

**Examples:**
- Delete confirmation dialogs
- Playlist selector
- Add to playlist modal
- Login form

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
- Try a different theme in Peek (Settings → My Settings)
- Check browser zoom level (Ctrl + 0 to reset)
- Report as a bug if it persists

### Arrow keys scroll page instead of navigating

**Solution:**
- Click on the scene grid to focus it first
- Use `Tab` to focus an element, then arrow keys work
- Some areas use `Tab` navigation only

### Video player shortcuts not working

**Solution:**
- Make sure video player is focused (click on it)
- Some shortcuts only work during playback
- Check if another app is intercepting keys
- Try clicking the video before using shortcuts

## Tips for Power Users

### Speed Navigation

1. **Use `/` to search instantly** from any page
2. **Use number keys (0-9) to scrub through videos** quickly
3. **Press `Escape` repeatedly** to navigate back multiple levels
4. **Use `Tab + Enter` combo** for rapid clicking

### Couch Potato Mode

Perfect setup for couch browsing:

1. Open Peek in fullscreen (F11)
2. Create a "Favorites" playlist
3. Start playlist playback
4. Use only these keys:
   - `Space` - Play/Pause
   - `N` - Next video
   - `P` - Previous video
   - `↑/↓` - Volume
   - `F` - Fullscreen on/off

### Workflow Optimization

**Browse and queue efficiently:**

1. Navigate scene grid with arrow keys
2. Select the scenes you want to watch and add them to a "Watch Later" playlist from the selection bar
3. Open the playlist and press Play
4. Lean back and enjoy

## Next Steps

- [Watch History](watch-history.md) - Resume playback from where you left off
- [Playlists](playlists.md) - Create and manage custom playlists
- [Quick Start Guide](../getting-started/quick-start.md) - Get started with Peek
