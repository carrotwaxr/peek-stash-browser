# Personalization

Customize Peek's navigation and layout to match how you browse your library.

## Landing Page Preference

Choose which page to land on after logging in, instead of always starting at Home.

### Setting Your Landing Page

1. Go to **Settings** → **Navigation**
2. Under **Landing Page After Login**, select your preferred page
3. Click **Save**

### Available Landing Pages

| Page | Description |
|------|-------------|
| **Home** | Homepage with carousels (default) |
| **Scenes** | Scene browse page |
| **Performers** | Performer browse page |
| **Studios** | Studio browse page |
| **Tags** | Tag browse page |
| **Collections** | Collections/groups page |
| **Galleries** | Gallery browse page |
| **Images** | Image browse page |
| **Playlists** | Your playlists |
| **Recommended** | AI-recommended scenes |
| **Watch History** | Your viewing history |
| **User Stats** | Your statistics dashboard |

### Random Mode

For variety, enable **Random one of selected pages** to land on a different page each login:

1. Toggle on **Random one of selected pages**
2. Select 2 or more pages (checkboxes appear)
3. Click **Save**

Each time you log in, Peek randomly picks one of your selected pages.

### Peek Logo Navigation

Clicking the **Peek logo** in the navigation bar also respects your landing page preference:

- If you've set a specific page, clicking the logo takes you there
- In random mode, each click picks a different page from your selection
- This works in all layouts: mobile top bar, expanded sidebar, and collapsed sidebar

### When Preferences Apply

Your landing page preference applies when:

- **Logging in** from a fresh browser or after session expiry
- **Clicking the Peek logo** from any page

Your preference does **not** apply when:

- **Redirected to login**: If you were browsing `/performers` and your session expired, you'll return to `/performers` after login (not your preference)
- **Existing tab**: If you have a long-running tab open, Peek remembers your last URL and returns you there after re-authentication

!!! tip "Testing your preference"
    After changing your landing page setting, open a **new browser tab** to test. Existing tabs remember your last location.

---

## Navigation Menu Customization

Reorder or hide items in the main navigation sidebar to prioritize the pages you use most.

### Customizing the Menu

1. Go to **Settings** → **Navigation**
2. Under **Navigation Menu**, you'll see all available menu items
3. Use the drag handles (⋮⋮) to reorder items
4. Toggle the eye icon to show/hide items
5. Click **Save** to apply changes

### Available Navigation Items

- Scenes
- Recommended
- Performers
- Studios
- Tags
- Collections
- Galleries
- Images
- Playlists

### Tips

- **Hide rarely-used items** to declutter the sidebar
- **Put your most-used pages at the top** for faster access
- Hidden items are still accessible via direct URL
- Changes take effect immediately after saving (page reloads)

---

## Homepage Carousels

The homepage displays carousels of content. You can customize which carousels appear and their order.

### Managing Carousels

1. Go to **Settings** → **Navigation**
2. Under **Homepage Carousels**, you'll see all available carousels
3. Use arrows to reorder carousels
4. Toggle visibility with the eye icon
5. Changes save automatically

### Default Carousels

| Carousel | Content |
|----------|---------|
| **Continue Watching** | Scenes you've started but not finished |
| **Recently Watched** | Your recent viewing history |
| **Recommended** | AI-generated suggestions |
| **Favorites** | Your favorited scenes |
| **Recently Added** | Newest scenes in your library |

### Custom Carousels

Create your own carousels with custom filter rules. See [Custom Carousels](custom-carousels.md) for details on the carousel builder.

---

## Related

- [Custom Carousels](custom-carousels.md) — Create personalized homepage carousels
- [Browse and Display](browse-and-display.md) — View modes and card display options
- [User Management](user-management.md) — Account settings and preferences
