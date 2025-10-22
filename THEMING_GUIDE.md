# Peek Theme Customization Guide

This guide explains how theming works in Peek and documents which CSS variables are actually used throughout the application.

## Theme File Location

**Main files**:
- `client/src/themes/themes.js` - Theme definitions
- `client/src/utils/colorScale.js` - Color generation utilities

## Theme Architecture

Peek uses CSS custom properties (CSS variables) for theming with **automatic color scale generation**. Three themes are provided:
- **`peek`** (default) - Purple/pink/orange brand colors with deep dark backgrounds
- **`light`** - Light mode with blue accents
- **`midnight`** - Midnight blue theme with cyan accents

## ✨ Major Improvements!

**Color Scale Generators** - Themes now use utility functions to auto-generate color scales:
- **Background colors** (6 vars) → Generated from 1 base color + mode
- **Text colors** (3 vars) → Generated from 1 base color + mode
- **Shadows** (3 vars) → Generated from accent color with proper opacity
- **Focus states** (5 vars) → Generated from accent color with rgba variants

**Result**: Much simpler theme definitions - just define base colors and the system generates all the scales!

## Variable Usage Status

### ✅ HEAVILY USED (Core Variables)

These variables are used extensively throughout the application. **Changing these will have immediate visible impact.**

#### Typography
```css
--font-brand: "'Lilita One', cursive"          /* Logo/branding text (2 uses) */
--font-heading: "'Space Grotesk', sans-serif"  /* H1-H6 headings (1 use in base.css) */
--font-body: "'Inter', sans-serif"             /* All body text (1 use in base.css) */
--font-mono: "'JetBrains Mono', monospace"     /* Code/technical text (1 use) */
```

**Where used**: `base.css`, `PeekLogo.jsx`

#### Backgrounds (Most Important)
```css
--bg-primary: "#0a0a0b"       /* Main page background (12 uses) */
--bg-secondary: "#141418"     /* Secondary areas, controls (68 uses) ⭐ */
--bg-tertiary: "#1e1e24"      /* Tertiary backgrounds (6 uses) */
--bg-card: "#181820"          /* Card backgrounds (78 uses) ⭐ */
--bg-hover: "#22222a"         /* Hover states (4 uses) */
--bg-overlay: "rgba(0,0,0,0.85)" /* Modal overlays (1 use) */
```

**Where used**: Nearly every component for cards, panels, hover states
**Examples**: SceneCard, Performers, Studios, Tags, Pagination, SearchControls, etc.

#### Text Colors (Critical)
```css
--text-primary: "#ffffff"     /* Primary text (179 uses) ⭐⭐⭐ MOST USED */
--text-secondary: "#c8c8cc"   /* Secondary text (98 uses) ⭐⭐ */
--text-muted: "#8a8a92"       /* Muted text, timestamps (74 uses) ⭐ */
```

**Where used**: Everywhere - all text elements
**Examples**: All page components, card titles, metadata, timestamps

#### Accent Colors
```css
--accent-primary: "#6D2CE3"   /* Purple brand color (72 uses) ⭐⭐ */
--accent-secondary: "#FD6B86" /* Pink for secondary actions (5 uses) */
--accent-success: "#0F7173"   /* Teal for success (9 uses) */
--accent-info: "#3993DD"      /* Blue for info (9 uses) */
--accent-warning: "#FA8C2A"   /* Orange for warnings (9 uses) */
--accent-error: "#FD6B86"     /* Pink/red for errors (13 uses) */
```

**Where used**:
- **accent-primary**: Buttons, links, focus states, progress bars
- **accent-secondary**: Home.jsx icons, SceneMetadata
- **accent-success**: OCounterButton, success states
- **accent-error**: ErrorMessage, validation errors

#### Borders (Critical)
```css
--border-color: "#2a2a32"     /* Default borders (143 uses) ⭐⭐⭐ 2ND MOST USED */
--border-focus: "#6D2CE3"     /* Focused element borders (3 uses) */
```

**Where used**: All cards, inputs, panels, dividers

#### Shadows
```css
--shadow-sm: "0 1px 2px rgba(109,44,227,0.05)"     /* Small shadows (1 use) */
--shadow-md: "0 4px 6px rgba(109,44,227,0.1)"      /* Medium shadows (2 uses) */
--shadow-lg: "0 10px 15px rgba(109,44,227,0.15)"   /* Large shadows (1 use) */
```

**Where used**: `base.css`, `VideoPlayer.css`

#### Focus & Selection
```css
--focus-ring-color: "#6D2CE3"              /* Keyboard focus indicators (4 uses) */
--focus-ring-shadow: "0 0 0 3px rgba(...)" /* Focus ring shadow (7 uses) */
--selection-color: "#6D2CE3"               /* Selection outline (6 uses) */
--selection-bg: "rgba(109,44,227,0.1)"     /* Selection background (3 uses) */
```

**Where used**: `index.css` keyboard navigation, multiselect components

### ⚠️ MODERATELY USED (Specialized)

#### Video Player
```css
--player-bg: "#000000"                     /* Video background (3 uses) */
--controls-bg: "rgba(10,10,11,0.8)"        /* Player controls overlay (1 use) */
--progress-bg: "#2a2a32"                   /* Progress bar background (1 use) */
```

**Where used**: `VideoPlayer.css`, video player components

#### Rating Colors (5 uses total)
```css
--rating-excellent: "#22c55e"  /* 80-100: Green */
--rating-good: "#84cc16"       /* 60-79: Lime */
--rating-average: "#eab308"    /* 40-59: Yellow */
--rating-poor: "#f97316"       /* 20-39: Orange */
--rating-bad: "#ef4444"        /* 0-19: Red */
```

**Where used**: `SceneStats.jsx` - Color-coded rating display

#### Icon Colors (Stat Icons)
```css
--icon-play-count: "#0F7173"   /* Teal play icon (1 use) */
--icon-rating: "#FA8C2A"       /* Orange rating icon (1 use) */
--icon-organized: "#22c55e"    /* Green checkmark (1 use) */
```

**Where used**: `SceneStats.jsx`, `Home.jsx`

#### Role Badges (4 uses total)
```css
--role-admin-bg: "rgba(168,85,247,0.1)"    /* Admin background */
--role-admin-text: "#a855f7"               /* Admin text */
--role-user-bg: "rgba(100,116,139,0.1)"    /* User background */
--role-user-text: "#64748b"                /* User text */
```

**Where used**: `Users.jsx` page for role display

#### Status States (Partial Implementation)
```css
/* IMPLEMENTED */
--status-error-bg: "rgba(239,68,68,0.1)"    /* Error background (2 uses) */
--status-error-border: "rgba(239,68,68,0.3)" /* Error border (1 use) */
--status-error-text: "#ef4444"              /* Error text (3 uses) */
--status-info-bg: "rgba(59,130,246,0.1)"    /* Info background (3 uses) */
--status-info-border: "rgba(59,130,246,0.3)" /* Info border (1 use) */
--status-info-text: "#3b82f6"               /* Info text (1 use) */
```

**Where used**: `ErrorMessage.jsx`, `InfoMessage.jsx`, `SceneMetadata.jsx`

#### Toast Notifications (Partial Implementation)
```css
/* IMPLEMENTED */
--toast-error-bg: "#dc2626"                /* Toast error BG (1 use) */
--toast-error-border: "#f87171"            /* Toast error border (1 use) */
--toast-error-shadow: "rgba(220,38,38,0.4)" /* Toast error shadow (2 uses) */
--toast-info-bg: "#1d4ed8"                 /* Toast info BG (1 use) */
--toast-info-border: "#60a5fa"             /* Toast info border (1 use) */
--toast-info-shadow: "rgba(29,78,216,0.4)" /* Toast info shadow (1 use) */
```

**Where used**: `ErrorMessage.jsx`, `InfoMessage.jsx` toast notification styles

---

### ✅ ALL UNUSED VARIABLES REMOVED

**All 26 unused variables have been cleaned up!** The themes now only contain actively used CSS variables, making customization simpler and more straightforward.

#### What Was Removed:
- ❌ `--text-accent` - Never used
- ❌ `--accent-tertiary` (peek only) - Never used
- ❌ `--border-hover` (peek only) - Never used
- ❌ `--progress-fill` - Never used
- ❌ All button variables (`--btn-primary-bg`, `--btn-*-hover`, etc.) - Buttons use `--accent-primary` directly
- ❌ `--icon-o-counter` - Never referenced
- ❌ `--role-admin-border` and `--role-user-border` - Not implemented
- ❌ All success/warning status variables - Not implemented (only error/info exist)
- ❌ All success/warning toast variables - Not implemented (only error/info exist)

#### How Buttons Actually Work:
Buttons use the generic color system, not dedicated button variables:
- **Base buttons** → `--bg-card` + `--bg-hover` (neutral gray)
- **Primary buttons** → `--accent-primary` + opacity on hover
- **Most buttons** → Inline styles with direct CSS variable references

---

## How Buttons Actually Work

### Current Button Implementation

**Base button class** (`base.css`):
```css
.btn {
  background-color: var(--bg-card);    /* Uses neutral gray, not button colors */
  border: 1px solid var(--border-color);
  color: var(--text-primary);
}

.btn:hover {
  background-color: var(--bg-hover);   /* Generic hover, not --btn-*-hover */
  border-color: var(--border-focus);
}

.btn-primary {
  background-color: var(--accent-primary);  /* Uses accent, not --btn-primary-bg */
  border-color: var(--accent-primary);
}

.btn-primary:hover {
  opacity: 0.9;  /* Just reduces opacity, doesn't use --btn-primary-hover */
}
```

**Most buttons use inline styles**:
```jsx
<button style={{ backgroundColor: "var(--bg-card)", border: "1px solid var(--border-color)" }}>
```

### ⚠️ The Problem

The dedicated button color variables (`--btn-primary-bg`, `--btn-secondary-bg`, etc.) **are defined but never used**. This means:

1. **Regular buttons** look gray/neutral (using `--bg-card`) instead of colored
2. **Primary buttons** use `--accent-primary` directly, not `--btn-primary-bg`
3. **No secondary or tertiary button styles** are implemented
4. **Hover states** don't use the defined hover colors

### 💡 Recommendation

**Option 1: Remove unused button variables** from themes.js (simpler)
**Option 2: Update base.css to use the button variables** (more complex but more flexible)

---

## Common Usage Patterns

### Inline Styles (Most Common)
```jsx
style={{
  color: "var(--text-primary)",
  backgroundColor: "var(--bg-card)",
  borderColor: "var(--border-color)"
}}
```

### CSS Classes
```css
.my-component {
  background-color: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
}
```

### Conditional Styling
```jsx
backgroundColor: isActive ? "var(--accent-primary)" : "var(--bg-secondary)"
```

---

## Quick Customization Tips

### Easy Theme Customization (New Approach!)

To customize a theme, you only need to change **base colors** in `themes.js` - the rest is auto-generated:

**Example: Customizing the Peek theme**
```javascript
peek: {
  name: "Peek",
  properties: {
    // 1. Change base background (all bg variants auto-generated)
    ...generateBackgroundScale("#0a0a0b", "dark"),  // ← Change this hex

    // 2. Change base text color (all text variants auto-generated)
    ...generateTextScale("#ffffff", "dark"),        // ← Change this hex

    // 3. Change primary accent (shadows + focus states auto-generated)
    "--accent-primary": "#6D2CE3",                  // ← Change for whole theme shift
    ...generateShadows("#6D2CE3", "dark"),          // ← Uses same color
    ...generateFocusRing("#6D2CE3"),                // ← Uses same color

    // 4. Other accent colors
    "--accent-secondary": "#FD6B86",
    "--accent-success": "#0F7173",
    "--accent-warning": "#FA8C2A",
    "--accent-error": "#FD6B86",

    // 5. Border color
    "--border-color": "#2a2a32",

    // Rest stays the same...
  }
}
```

### Color Scale Generator Functions

Located in `client/src/utils/colorScale.js`:

- **`generateBackgroundScale(baseColor, mode)`** - Creates bg-primary, bg-secondary, bg-card, bg-tertiary, bg-hover, bg-overlay
- **`generateTextScale(baseColor, mode)`** - Creates text-primary, text-secondary, text-muted
- **`generateShadows(accentColor, mode)`** - Creates shadow-sm, shadow-md, shadow-lg with proper rgba opacity
- **`generateFocusRing(accentColor)`** - Creates focus-ring-color, focus-ring-shadow, selection-color, selection-bg, border-focus

All with proper lightness adjustments for dark/light modes!

### Future: Theme Builder UI

These generators are ready for a future theme builder form where users can:
1. Pick base background color
2. Choose dark/light mode
3. Pick accent color
4. Pick border color
→ **Full theme generated automatically!**

---

## Files to Check When Styling

### Core Theme Files
- `client/src/themes/themes.js` - Theme definitions
- `client/src/themes/base.css` - Base styles using theme variables
- `client/src/index.css` - Keyboard navigation styles

### Heavy CSS Variable Users
- `client/src/components/playlist/PlaylistStatusCard.jsx` (50+ variables)
- `client/src/components/video-player/VideoPlayer.css` (player theming)
- `client/src/components/pages/*.jsx` (all page components)
- `client/src/components/ui/*.jsx` (reusable UI components)

---

## Testing Theme Changes

1. Edit `client/src/themes/themes.js`
2. Change color values in the theme you're using (default: `peek`)
3. Refresh browser (hot reload should pick up changes)
4. Check these pages for visual changes:
   - Home page (cards, navigation)
   - Scenes page (grid, filters, pagination)
   - Video player (controls, progress bar)
   - Settings page (forms, buttons)

---

## Summary: What Actually Matters

**With the new color scale generators, focus on just 5 BASE COLORS to customize a theme:**

### Core Inputs (Everything else auto-generated!)

1. **Base Background** → Generates 6 background variants (bg-primary, bg-secondary, bg-card, bg-tertiary, bg-hover, bg-overlay)
2. **Base Text Color** → Generates 3 text variants (text-primary, text-secondary, text-muted)
3. **Primary Accent** → Generates shadows (3 vars) + focus states (5 vars) + used throughout app (72 uses)
4. **Border Color** → Used for all borders (143 uses)
5. **Theme Mode** → "dark" or "light" (affects how scales are generated)

**Optional accent colors:**
- accent-secondary, accent-success, accent-info, accent-warning, accent-error

### Before vs After

**Old approach:** Manually define ~54 CSS variables per theme
**New approach:** Define 5 base colors → 17+ variables auto-generated with proper scales!

This makes theme customization **much simpler** and prepares the codebase for a future theme builder UI where users can create custom themes with just a few color pickers.
