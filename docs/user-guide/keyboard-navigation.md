# Keyboard Navigation

Peek Stash Browser features comprehensive keyboard navigation designed for desktop users and TV remote controls. Navigate the entire app without touching your mouse or touchscreen.

## Overview

The keyboard navigation system provides:

- **Spatial 2D grid navigation** - Navigate scene cards like Netflix on TV
- **Media key support** - Control video playback with media keys or shortcuts
- **Focus indicators** - Clear visual feedback showing your current position
- **Tab trapping** - Keep focus within modals and dialogs
- **Auto-focus** - Pages automatically focus the first meaningful element

## Grid Navigation

When browsing any list page (Scenes, Performers, Studios, or Tags):

### Arrow Keys

- **Left Arrow** - Move to previous item
- **Right Arrow** - Move to next item
- **Up Arrow** - Move up one row
- **Down Arrow** - Move down one row

### Selection

- **Enter** or **Space** - Open the focused scene/item
- **Home** - Jump to first item
- **End** - Jump to last item

### Pagination

- **Page Up** - Go to previous page
- **Page Down** - Go to next page

### Visual Feedback

Focused items show a prominent blue glow with:

- Thick blue border
- Pulsing animation
- Slight scale increase
- Shadow highlighting

## Video Player Controls

### Playback Controls

- **Space** - Play/Pause toggle
- **M** - Mute/Unmute
- **F** - Toggle fullscreen

### Seeking

- **Ctrl + Right Arrow** (or **Cmd + Right Arrow** on Mac) - Seek forward 10 seconds
- **Ctrl + Left Arrow** (or **Cmd + Left Arrow** on Mac) - Seek backward 10 seconds

### Volume

- **Ctrl + Up Arrow** (or **Cmd + Up Arrow** on Mac) - Volume up
- **Ctrl + Down Arrow** (or **Cmd + Down Arrow** on Mac) - Volume down

### Playlist Navigation

When watching a playlist:

- **Media Next Track** - Play next scene in playlist
- **Media Previous Track** - Play previous scene in playlist

The next/previous track keys only work when you're in a playlist. They have no effect when watching a standalone scene.

## Media Remote Support

Peek supports standard media remote buttons:

- **Play/Pause Button** - Toggle video playback
- **Next Track Button** - Next scene in playlist
- **Previous Track Button** - Previous scene in playlist
- **Fast Forward Button** - Seek forward 10 seconds
- **Rewind Button** - Seek backward 10 seconds

These media keys work on:

- Keyboards with dedicated media keys
- Bluetooth media remotes
- TV remotes (via Bluetooth or HDMI-CEC)
- Wireless game controllers

## Modal and Dialog Navigation

When a modal or dialog is open:

- **Tab** - Move to next focusable element
- **Shift + Tab** - Move to previous focusable element
- **Escape** - Close the modal/dialog

Focus is automatically trapped within modals - you cannot Tab outside of them. When a modal closes, focus returns to the element that opened it.

## Initial Focus Behavior

Each page automatically focuses the first meaningful interactive element:

- **Home Page** - First scene card in the first carousel
- **Scenes Page** - First scene card in the grid
- **Scene Detail Page** - Video player play button
- **Settings Pages** - First input field or button

This allows you to start navigating immediately after page load.

## Text Input Handling

When typing in search boxes or text inputs:

- Arrow keys work normally within the input (move cursor)
- Tab moves to the next input field
- Escape clears focus from the input and returns to grid navigation

## Accessibility

The keyboard navigation system is designed to be accessible:

- **Focus visible** - Always clear what element has focus
- **Logical tab order** - Tab moves through elements in a logical sequence
- **ARIA labels** - Screen reader friendly
- **No keyboard traps** - Can always navigate away or close modals

## Tips for TV Usage

Using Peek on a TV with a Bluetooth remote:

1. **Navigate grids** - Use directional pad (D-pad) arrow keys
2. **Select items** - Use OK/Enter button on remote
3. **Control video** - Use remote's media keys (play/pause, etc.)
4. **Go back** - Use remote's Back button or browser back navigation
5. **Adjust volume** - Use remote's volume keys with Ctrl modifier

## Keyboard Shortcuts Quick Reference

### Scene Grid

| Key | Action |
|-----|--------|
| ← → ↑ ↓ | Navigate grid |
| Enter / Space | Select item |
| Page Up / Down | Change page |
| Home | First item |
| End | Last item |

### Video Player

| Key | Action |
|-----|--------|
| Space | Play/Pause |
| M | Mute |
| F | Fullscreen |
| Ctrl + ← → | Seek |
| Ctrl + ↑ ↓ | Volume |

### Playlist

| Key | Action |
|-----|--------|
| Media Next | Next scene |
| Media Previous | Previous scene |

### Modals

| Key | Action |
|-----|--------|
| Tab | Next element |
| Shift + Tab | Previous element |
| Escape | Close |

## Troubleshooting

### Arrow keys don't work

- **In search boxes**: Arrow keys move the cursor within the input. Press Escape to exit the input field first.
- **Page not loaded**: Wait for the page to fully load. The grid must be rendered before navigation works.
- **JavaScript disabled**: Keyboard navigation requires JavaScript to be enabled.

### Focus indicator not visible

- The focus indicator should be a prominent blue glow. If you don't see it:
  - Check that your browser supports CSS custom properties
  - Try refreshing the page
  - Check browser console for errors

### Media keys don't work

- Media keys only work when:
  - Video player is loaded (not on poster screen)
  - You're watching a video in a playlist (for next/prev)
  - Focus is not in a text input field

### Tab gets stuck in modal

- This is intentional! Modals trap focus.
- Press **Escape** to close the modal and return focus to the main page.

## Browser Compatibility

Keyboard navigation works in all modern browsers:

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Opera 76+

Older browsers may have limited keyboard support or visual glitches with focus indicators.
