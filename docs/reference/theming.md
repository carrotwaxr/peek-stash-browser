# Theming Guide

Peek uses a comprehensive CSS variable system that allows complete customization of the visual appearance. This guide explains how themes work, what variables are available, and best practices for creating custom themes.

## Theme Architecture

Peek's theme system is built on **CSS Custom Properties (CSS Variables)**. Each theme defines ~60 variables that control every aspect of the UI's appearance.

### Current Themes

Peek includes three built-in themes:

1. **Peek (Default)** - Dark theme with purple accents
2. **Light** - Clean light theme with blue accents
3. **Midnight** - Pure black theme optimized for OLED displays

### Theme File Structure

Themes are defined in `client/src/themes/themes.js`:

```javascript
export const themes = {
  peek: {
    name: "Peek",
    properties: {
      "--bg-primary": "#0f0f0f",
      "--text-primary": "#ffffff",
      // ... ~60 more variables
    }
  }
};
```

## CSS Variable Reference

### Base Colors

These form the foundation of your theme's color palette.

#### Background Colors

| Variable | Usage | Recommendations |
|----------|-------|-----------------|
| `--bg-primary` | Main page background | **Dark themes:** Very dark (#0f0f0f to #1a1a1a)<br>**Light themes:** Very light (#f5f5f5 to #ffffff) |
| `--bg-secondary` | Secondary backgrounds (sidebar, headers) | **Dark:** Slightly lighter than primary (#1a1a1a to #2a2a2a)<br>**Light:** Slightly darker than primary (#e5e5e5 to #f0f0f0) |
| `--bg-tertiary` | Tertiary backgrounds (disabled states, placeholders) | **Dark:** Between secondary and card (#2a2a2a to #3a3a3a)<br>**Light:** Between secondary and card (#d5d5d5 to #e0e0e0) |
| `--bg-card` | Cards, modals, dropdowns | **Dark:** Lighter than primary for depth (#1f1f1f to #2f2f2f)<br>**Light:** White or near-white (#ffffff to #fafafa) |

**Example Usage:**
- Scene cards, performer cards, playlists
- Modals and dialogs
- Dropdown menus
- Input fields

**Contrast Tips:**
- Maintain clear hierarchy: primary → secondary → tertiary → card
- Dark themes: Each level should be progressively lighter
- Light themes: Each level should be progressively darker
- Aim for subtle differences (10-20 points in hex values)

#### Text Colors

| Variable | Usage | Recommendations |
|----------|-------|-----------------|
| `--text-primary` | Primary text, headings, important content | **Dark themes:** Pure or near-white (#ffffff, #f5f5f5)<br>**Light themes:** Very dark (#0f0f0f, #1a1a1a)<br>**Contrast ratio:** 7:1 minimum against bg-primary |
| `--text-secondary` | Secondary text, subtitles, metadata | **Dark themes:** Light gray (#b3b3b3 to #cccccc)<br>**Light themes:** Dark gray (#4a4a4a to #666666)<br>**Contrast ratio:** 4.5:1 minimum against bg-primary |
| `--text-muted` | Tertiary text, timestamps, less important info | **Dark themes:** Medium gray (#808080 to #999999)<br>**Light themes:** Medium-dark gray (#737373 to #8c8c8c)<br>**Contrast ratio:** 3:1 minimum |

**Example Usage:**
- Headings, body text (primary)
- Scene descriptions, performer counts (secondary)
- File sizes, resolutions, timestamps (muted)

**Accessibility Notes:**
- WCAG AA requires 4.5:1 contrast for normal text, 3:1 for large text
- WCAG AAA requires 7:1 contrast for normal text, 4.5:1 for large text
- Test your colors at [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

#### Border Colors

| Variable | Usage | Recommendations |
|----------|-------|-----------------|
| `--border-color` | Default borders (cards, inputs, dividers) | **Dark themes:** Subtle gray (#404040 to #4a4a4a)<br>**Light themes:** Light gray (#d0d0d0 to #e0e0e0)<br>Should be visible but not dominating |
| `--border-focus` | Focused input borders | Use your primary accent color or a brighter variant<br>Must stand out from default borders |

**Example Usage:**
- Card outlines
- Input field borders
- Dividers between sections
- Table borders

### Accent Colors

Accent colors provide visual interest and brand identity. Choose colors that complement your base palette.

| Variable | Usage | Recommendations |
|----------|-------|-----------------|
| `--accent-primary` | Primary actions, links, main brand color | **Choose a vibrant color** that stands out<br>**Dark themes:** Bright, saturated colors (#3b82f6, #6D2CE3)<br>**Light themes:** Slightly muted versions<br>**Contrast:** Must be readable on both dark and light backgrounds |
| `--accent-secondary` | Secondary actions, alternative highlights | Complementary to primary<br>Different hue but similar vibrancy |
| `--accent-tertiary` | Tertiary actions, subtle accents | Can be analogous to primary |
| `--accent-success` | Success states, completion | Green shades (#22c55e, #10b981) |
| `--accent-warning` | Warnings, caution states | Yellow/orange (#eab308, #f59e0b) |
| `--accent-error` | Errors, destructive actions | Red shades (#ef4444, #dc2626) |
| `--accent-info` | Informational states | Blue shades (#3b82f6, #0ea5e9) |

**Example Usage:**
- Buttons, links (primary)
- Tags, badges (secondary, tertiary)
- Progress bars (success)
- Error messages (error)
- Warning dialogs (warning)

### Focus & Selection States

These variables control how focused and selected elements appear. Critical for keyboard navigation and accessibility.

| Variable | Usage | Recommendations |
|----------|-------|-----------------|
| `--focus-ring-color` | Focus ring color for keyboard navigation | Use `--accent-primary` or a bright accent<br>Must be highly visible |
| `--focus-ring-shadow` | Focus ring shadow effect | `0 0 0 3px rgba(your-color, 0.3)`<br>Use your focus color with transparency |
| `--selection-color` | Selected item borders/highlights | Usually same as `--focus-ring-color`<br>Can be slightly different for distinction |
| `--selection-bg` | Selected item background tint | Your selection color at low opacity<br>`rgba(your-color, 0.1)` to `rgba(your-color, 0.2)` |

**Example Usage:**
- Keyboard-focused scene cards
- Selected items in lists
- Text selection highlighting
- Active navigation items

**Accessibility Requirements:**
- Focus indicators must have **3:1 contrast** against adjacent colors (WCAG 2.1)
- Should be clearly visible without relying on color alone
- Consider adding both color AND border weight changes

### Rating Gradient

The rating system uses a 5-color gradient from bad (0-19) to excellent (80-100).

| Variable | Range | Recommendations |
|----------|-------|-----------------|
| `--rating-bad` | 0-19 | Red (#ef4444, #dc2626) |
| `--rating-poor` | 20-39 | Orange (#f97316, #ea580c) |
| `--rating-average` | 40-59 | Yellow (#eab308, #facc15) |
| `--rating-good` | 60-79 | Lime/yellow-green (#84cc16, #a3e635) |
| `--rating-excellent` | 80-100 | Green (#22c55e, #10b981) |

**Example Usage:**
- Scene rating displays
- Rating indicators on cards
- Statistics and analytics

**Gradient Tips:**
- Use universally recognizable colors (red = bad, green = good)
- Maintain consistent saturation across the gradient
- Ensure all colors are readable on your backgrounds
- Consider colorblind-friendly alternatives (use icons alongside colors)

### Icon Colors

Theme-aware colors for specific icon types. These provide semantic meaning through color.

| Variable | Usage | Recommendations |
|----------|-------|-----------------|
| `--icon-o-counter` | O counter icon (💦) color | Pink/magenta (#FD6B86, #ec4899)<br>Playful, distinct from other icons |
| `--icon-play-count` | Play count icon (▶) color | Teal/cyan (#0F7173, #14b8a6)<br>Media-related, distinct from o-counter |
| `--icon-rating` | Rating star icon color | Orange/gold (#FA8C2A, #f59e0b)<br>Traditional star color |
| `--icon-organized` | Organized checkmark (✓) color | Green (#22c55e, #10b981)<br>Positive confirmation |

**Example Usage:**
- Statistics on scene cards
- Metadata displays
- Scene detail pages

**Color Psychology:**
- **Pink (o-counter):** Playful, attention-grabbing
- **Teal (play count):** Professional, media-related
- **Orange (rating):** Warm, valuable
- **Green (organized):** Complete, organized

### Status States

Status indicators for success, info, warning, and error states. Each has 3 variants for backgrounds, text, and borders.

#### Success States (Green)

| Variable | Usage | Recommendations |
|----------|-------|-----------------|
| `--status-success-bg` | Success notification/badge background | Light green with transparency<br>`rgba(34, 197, 94, 0.1)` for dark themes<br>`rgba(34, 197, 94, 0.15)` for light themes |
| `--status-success-text` | Success message text | Bright green (#22c55e) for dark themes<br>Darker green (#16a34a) for light themes |
| `--status-success-border` | Success badge/notification border | Medium green (#10b981) |

**Example Usage:**
- Upload success messages
- Completion notifications
- "Organized" badges

#### Info States (Blue)

| Variable | Usage | Recommendations |
|----------|-------|-----------------|
| `--status-info-bg` | Info badge/notification background | Light blue with transparency<br>`rgba(59, 130, 246, 0.1)` |
| `--status-info-text` | Info message text | Bright blue (#3b82f6) for dark<br>Darker blue (#2563eb) for light |
| `--status-info-border` | Info badge border | Medium blue (#0ea5e9) |

**Example Usage:**
- Performer/tag count badges
- Informational tooltips
- Help text

#### Warning States (Yellow/Orange)

| Variable | Usage | Recommendations |
|----------|-------|-----------------|
| `--status-warning-bg` | Warning background | Light yellow/orange with transparency<br>`rgba(234, 179, 8, 0.1)` |
| `--status-warning-text` | Warning text | Bright yellow (#eab308) for dark<br>Darker orange (#ca8a04) for light |
| `--status-warning-border` | Warning border | Medium orange (#f59e0b) |

**Example Usage:**
- Cautionary messages
- Validation warnings
- Deprecation notices

#### Error States (Red)

| Variable | Usage | Recommendations |
|----------|-------|-----------------|
| `--status-error-bg` | Error background | Light red with transparency<br>`rgba(239, 68, 68, 0.1)` |
| `--status-error-text` | Error message text | Bright red (#ef4444) for dark<br>Darker red (#dc2626) for light |
| `--status-error-border` | Error border | Medium red (#f87171) |

**Example Usage:**
- Error messages
- Failed operations
- Validation errors

### Toast Notifications

Toast notifications use enhanced versions of status colors with shadows for floating UI elements.

Each toast type has 3 variants:

| Variable Pattern | Usage |
|-----------------|-------|
| `--toast-{type}-bg` | Toast background (usually solid, not transparent) |
| `--toast-{type}-border` | Toast border color |
| `--toast-{type}-shadow` | Toast drop shadow color (for depth) |

**Types:** `success`, `info`, `warning`, `error`

**Shadow Recommendations:**
```css
/* Dark themes */
box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5),
            0 8px 10px -6px rgba(0, 0, 0, 0.3);

/* Light themes */
box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1),
            0 8px 10px -6px rgba(0, 0, 0, 0.1);
```

**Example Toast Colors:**

```javascript
// Success Toast (Dark Theme)
"--toast-success-bg": "#10b981",      // Solid green
"--toast-success-border": "#22c55e",   // Lighter green
"--toast-success-shadow": "rgba(16, 185, 129, 0.5)",

// Error Toast (Dark Theme)
"--toast-error-bg": "#dc2626",         // Solid red
"--toast-error-border": "#ef4444",     // Lighter red
"--toast-error-shadow": "rgba(220, 38, 38, 0.5)",
```

### Role Badges

User and admin role badge colors. Used in user management interfaces.

#### Admin Role

| Variable | Usage | Recommendations |
|----------|-------|-----------------|
| `--role-admin-bg` | Admin badge background | Purple/blue tint<br>`rgba(139, 92, 246, 0.1)` |
| `--role-admin-text` | Admin badge text | Bright purple (#8b5cf6) for dark<br>Darker purple (#7c3aed) for light |
| `--role-admin-border` | Admin badge border | Medium purple (#a78bfa) |

#### User Role

| Variable | Usage | Recommendations |
|----------|-------|-----------------|
| `--role-user-bg` | User badge background | Gray/neutral tint<br>`rgba(148, 163, 184, 0.1)` |
| `--role-user-text` | User badge text | Light gray (#94a3b8) for dark<br>Darker gray (#64748b) for light |
| `--role-user-border` | User badge border | Medium gray (#cbd5e1) |

**Example Usage:**
- Settings > User Management
- User profile indicators
- Permission displays

## Creating Custom Themes

### Method 1: Modify Built-in Themes (Current)

Edit `client/src/themes/themes.js`:

```javascript
export const themes = {
  myTheme: {
    name: "My Custom Theme",
    properties: {
      // Base colors
      "--bg-primary": "#1a1a2e",
      "--bg-secondary": "#16213e",
      "--bg-tertiary": "#0f3460",
      "--bg-card": "#1f2a44",

      "--text-primary": "#eaeaea",
      "--text-secondary": "#b8b8b8",
      "--text-muted": "#8c8c8c",

      // Accent colors
      "--accent-primary": "#00adb5",
      "--accent-secondary": "#ff2e63",
      "--accent-tertiary": "#ffa45b",

      // ... rest of variables
    }
  }
};
```

### Method 2: Custom Theme Builder UI (Coming Soon)

A visual theme builder will be added in a future update, allowing you to:

- Pick colors with a color picker
- Preview changes in real-time
- Export theme JSON
- Import community themes

## Theme Design Best Practices

### 1. Start with Base Colors

Choose your foundation first:
1. Background primary (darkest/lightest)
2. Text primary (highest contrast)
3. Accent primary (brand color)

All other colors should harmonize with these three.

### 2. Maintain Contrast Ratios

Use tools to verify accessibility:

- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Coolors Contrast Checker](https://coolors.co/contrast-checker)
- Chrome DevTools Accessibility Panel

**Minimum ratios:**
- **Large text (18pt+):** 3:1
- **Normal text:** 4.5:1
- **Interactive elements:** 3:1 (WCAG 2.1)

### 3. Test Across Components

Preview your theme on:
- Scene grids (card density)
- Video player (dark overlay backgrounds)
- Forms and inputs (readability)
- Modals and dialogs (depth perception)
- Toasts and notifications (visibility)

### 4. Consider Color Blindness

**Protanopia/Deuteranopia (red-green):**
- Don't rely solely on red/green for ratings
- Use red/blue or red/yellow combinations
- Add icons alongside color indicators

**Tritanopia (blue-yellow):**
- Avoid blue/yellow exclusive distinctions
- Use red/green or blue/red combinations

**Test your theme:**
- [Coblis Color Blindness Simulator](https://www.color-blindness.com/coblis-color-blindness-simulator/)
- Chrome DevTools Vision Deficiency Emulation

### 5. Dark Theme Considerations

**Backgrounds:**
- Avoid pure black (#000000) - causes eye strain
- Use near-black (#0f0f0f to #1a1a1a)
- OLED themes: Pure black is okay (saves power)

**Text:**
- Avoid pure white (#ffffff) on dark backgrounds
- Use off-white (#f5f5f5, #eaeaea)
- Reduces eye strain and glare

**Colors:**
- Desaturate bright colors slightly (reduce vibrancy by 10-20%)
- Bright saturated colors cause halation on dark backgrounds

### 6. Light Theme Considerations

**Backgrounds:**
- Use off-white or very light gray (#f5f5f5 to #fafafa)
- Pure white (#ffffff) works but can be harsh
- Add subtle warmth (slight beige tint) for comfort

**Text:**
- Use very dark gray (#1a1a1a) instead of pure black
- Pure black can appear too harsh

**Colors:**
- Can use fuller saturation than dark themes
- Ensure colors don't appear washed out

### 7. Spacing & Hierarchy

While not directly theme-related, consider:

- **Card shadows:** Lighter in light themes, heavier in dark themes
- **Borders:** Subtle in dark themes, more pronounced in light themes
- **Focus indicators:** Always visible regardless of theme

## Color Palette Generators

Tools to help create harmonious themes:

- **[Coolors](https://coolors.co/)** - Generate color schemes
- **[Adobe Color](https://color.adobe.com/)** - Color wheel and harmony rules
- **[Paletton](https://paletton.com/)** - Advanced palette generator
- **[Material Design Color Tool](https://material.io/resources/color/)** - Accessibility-focused
- **[Realtime Colors](https://realtimecolors.com/)** - Preview colors on UI mockups

## Example: Creating a "Forest" Theme

Let's create a nature-inspired dark theme:

```javascript
forest: {
  name: "Forest",
  properties: {
    // Base - Dark greens and browns
    "--bg-primary": "#0d1b0e",           // Very dark green-black
    "--bg-secondary": "#1a2e1c",         // Dark forest green
    "--bg-tertiary": "#2a4029",          // Medium forest green
    "--bg-card": "#1f3320",              // Card green

    // Text - Off-white with slight green tint
    "--text-primary": "#e8f5e9",         // Very light green-white
    "--text-secondary": "#a5d6a7",       // Light green-gray
    "--text-muted": "#66bb6a",           // Muted green

    // Borders - Subtle green-gray
    "--border-color": "#2e4a2e",
    "--border-focus": "#4caf50",

    // Accents - Vibrant natural colors
    "--accent-primary": "#4caf50",       // Bright green (leaves)
    "--accent-secondary": "#ff9800",     // Orange (sunset)
    "--accent-tertiary": "#8d6e63",      // Brown (bark)
    "--accent-success": "#66bb6a",
    "--accent-warning": "#ffb74d",
    "--accent-error": "#e57373",
    "--accent-info": "#64b5f6",

    // Focus & Selection - Bright green
    "--focus-ring-color": "#4caf50",
    "--focus-ring-shadow": "0 0 0 3px rgba(76, 175, 80, 0.3)",
    "--selection-color": "#4caf50",
    "--selection-bg": "rgba(76, 175, 80, 0.1)",

    // Rating - Nature-inspired gradient
    "--rating-excellent": "#4caf50",     // Vibrant green
    "--rating-good": "#8bc34a",          // Light green
    "--rating-average": "#fdd835",       // Golden yellow
    "--rating-poor": "#ff9800",          // Orange
    "--rating-bad": "#f44336",           // Red

    // Icons - Earthy tones
    "--icon-o-counter": "#ff9800",       // Warm orange
    "--icon-play-count": "#00bcd4",      // Water blue
    "--icon-rating": "#fdd835",          // Golden
    "--icon-organized": "#66bb6a",       // Leaf green

    // Status states (keep standard colors for familiarity)
    "--status-success-bg": "rgba(102, 187, 106, 0.1)",
    "--status-success-text": "#66bb6a",
    "--status-success-border": "#4caf50",
    // ... etc
  }
}
```

## Testing Your Theme

### Browser DevTools

Test theme variables in real-time:

1. Open DevTools (F12)
2. Select an element
3. In Styles panel, edit CSS variables:
   ```css
   :root {
     --accent-primary: #ff00ff; /* Test new color */
   }
   ```
4. See changes immediately

### Component Checklist

Test your theme on these key components:

- [ ] Home page with scene carousels
- [ ] Scene grid view
- [ ] Scene detail page
- [ ] Video player controls
- [ ] Search and filters
- [ ] Playlists
- [ ] Settings pages
- [ ] Login screen
- [ ] Modals and dialogs
- [ ] Toast notifications
- [ ] Form inputs
- [ ] Buttons (all states: normal, hover, focus, disabled)
- [ ] Cards (scene, performer, studio, tag)
- [ ] Navigation (sidebar, breadcrumbs)

## Sharing Custom Themes

Once the Custom Theme Builder UI is available, you'll be able to:

1. **Export** your theme as JSON
2. **Share** on GitHub Discussions or Discord
3. **Import** community themes with one click

**Example export:**

```json
{
  "name": "Forest",
  "author": "YourUsername",
  "version": "1.0.0",
  "properties": {
    "--bg-primary": "#0d1b0e",
    ...
  }
}
```

## Troubleshooting

### Colors not applying

**Check:**
- Variable names are spelled correctly (case-sensitive)
- Variables are defined in theme object
- Theme is selected in Settings

### Low contrast warnings

**Fix:**
- Use a contrast checker tool
- Lighten text colors on dark backgrounds
- Darken text colors on light backgrounds
- Avoid mid-tone grays

### Theme flashing on load

**Normal behavior:**
- Theme loads from localStorage after initial render
- Brief flash of default theme is expected
- Will be optimized in future updates

## Future Enhancements

Planned theme system improvements:

- **Visual Theme Builder** - GUI for creating custom themes
- **Theme Marketplace** - Browse and download community themes
- **Per-Page Themes** - Different themes for video player, grids, etc.
- **Dynamic Theming** - Theme changes based on time of day
- **Theme Presets** - One-click theme templates (Cyberpunk, Pastel, etc.)
- **Import/Export** - Share themes via JSON files
- **CSS Variable Inspector** - Visualize all theme variables in DevTools panel

## Contributing Themes

Want to contribute a theme to Peek's built-in collection?

1. Create your theme following this guide
2. Test thoroughly across all components
3. Verify accessibility (WCAG AA minimum)
4. Open a Pull Request on GitHub with:
   - Theme definition in `themes.js`
   - Screenshot showcase
   - Description and inspiration
   - Accessibility test results

**We especially welcome:**
- High-contrast themes
- Colorblind-friendly themes
- Culturally-inspired themes
- Minimalist themes
- Retro/vintage themes

Happy theming! 🎨
