# User Management

Peek supports multiple users with separate preferences, watch history, and content access. Admins can create accounts, set content restrictions, and manage user settings.

## User Roles

Peek has two user roles:

| Role | Description |
|------|-------------|
| **Admin** | Full access including user management, server settings, and bypasses all content restrictions |
| **User** | Standard access with personal preferences, playlists, and watch history |

!!! note "Admin Content Access"
    Admins always see all content, regardless of any restrictions. This allows admins to manage and organize content that may be restricted for other users.

---

## Creating Users

**Requirements:** Admin role

1. Go to **Settings** → **User Management** tab
2. Click **+ Create User**
3. Enter:
   - **Username** (must be unique)
   - **Password** (minimum 6 characters)
   - **Role** (User or Admin)
4. Click **Create**

The new user can now log in with these credentials.

---

## Managing Users

**Requirements:** Admin role

The User Management tab displays all users in a table with:

- Username and role
- Sync to Stash status
- Account creation date
- Action buttons

### Available Actions

| Action | Description |
|--------|-------------|
| **Sync from Stash** | Import ratings and favorites from Stash for this user |
| **Content Restrictions** | Set what content this user can see |
| **Change Role** | Toggle between User and Admin |
| **Delete** | Remove the user account |

!!! warning "Cannot Delete Self"
    Admins cannot delete their own account. Another admin must perform this action.

---

## Content Restrictions

Admins can restrict what content users see. Restrictions cascade throughout the UI—restricted items won't appear in lists, cards, dropdowns, or detail pages.

### Restriction Types

| Type | Best For |
|------|----------|
| **Collections (Groups)** | Most reliable—static, manually curated sets |
| **Tags** | Content categories (may change if using Stash plugins) |
| **Studios** | Limiting by production company |
| **Galleries** | Restricting specific gallery content |

!!! tip "Recommended Approach"
    Use **Collections (Groups)** as your primary restriction mechanism. Create groups in Stash for content categories, then restrict users to specific groups in Peek.

### Restriction Modes

| Mode | Behavior |
|------|----------|
| **None** | No restrictions (default) |
| **Exclude** | Hide selected items and all associated content |
| **Include** | Show ONLY selected items—user sees nothing else |

### Setting Restrictions

1. Go to **Settings** → **User Management**
2. Find the user and click **Content Restrictions**
3. For each entity type (Collections, Tags, Studios, Galleries):
   - Select a mode (None, Exclude, or Include)
   - Choose specific items to include or exclude
   - Optionally enable **Restrict Empty** to hide content with no metadata for that type
4. Click **Save**

### How Restrictions Work

**Exclude mode example:**
- Exclude the tag "Documentary"
- User won't see any scenes, performers, or studios tagged "Documentary"

**Include mode example:**
- Include only the collection "Favorites"
- User only sees scenes in the "Favorites" group—nothing else

**Cascading behavior:**
- Restricted tags don't appear in filter dropdowns
- Restricted studios don't appear on performer detail pages
- Scene counts exclude restricted content

---

## User Settings

### What Users Can Configure

Each user can customize their own experience:

| Setting | Options |
|---------|---------|
| **Video Quality** | Auto, 1080p, 720p, 480p, 360p |
| **Playback Mode** | Direct, Transcode, Auto |
| **Preview Quality** | Sprite, WebP, MP4 |
| **Theme** | Light, Dark, Deep Purple, The Hub, Custom |
| **Home Carousels** | Enable/disable and reorder |
| **Navigation** | Customize menu items |
| **Wall Playback** | Autoplay, Hover, Static |

### Accessing Settings

- Click your username in the header → **Settings**
- Or navigate directly to the Settings page

---

## Syncing with Stash

### Sync from Stash (Import)

Imports a user's ratings and favorites from Stash into Peek. Useful when:
- A new user already has data in Stash
- Recovering from a Peek database reset

**To sync:**
1. Go to **User Management**
2. Click **Sync from Stash** for the user
3. Select what to import (ratings, favorites, O-counter)
4. Click **Start Sync**

### Sync to Stash (Export)

When enabled, user activity syncs back to Stash:

| Data | Sync Behavior |
|------|---------------|
| **O-Counter** | Aggregates across users (increments add up) |
| **Ratings** | Overwrites (last user to rate wins) |
| **Favorites** | Individual per user |

!!! warning "Multi-User Considerations"
    If multiple users rate the same scene, the last rating wins in Stash. O-counters aggregate, so they'll be higher in Stash than for any individual user.

**To enable/disable:**
1. Go to **User Management**
2. Find the user in the table
3. Toggle the **Sync to Stash** column

---

## Hidden Items

Users can hide individual items they don't want to see. Unlike admin restrictions, users can unhide items themselves.

### Hiding Content

- On any card, click the **⋮** menu → **Hide**
- Or on detail pages, use the **Hide** action

### Managing Hidden Items

1. Go to **Settings** → **Hidden Items** tab
2. View all hidden items by type
3. Click **Unhide** to restore visibility

See [Hidden Items](hidden-items.md) for details.

---

## User Menu

The user menu (top-right corner) provides quick access to:

- **Watch History** — Resume where you left off
- **My Stats** — Personal viewing statistics
- **TV Mode** — Toggle enhanced keyboard navigation
- **Sign Out** — Log out of your account

---

## Proxy Authentication (SSO)

Peek supports single sign-on via reverse proxy authentication. When configured:

- Users are automatically logged in based on proxy headers
- Usernames must match exactly between proxy and Peek
- See [Configuration - Proxy Authentication](../getting-started/configuration.md#proxy-authentication) for setup

---

## Security Notes

- Passwords are hashed with bcrypt (never stored in plain text)
- Sessions expire after 24 hours of activity
- Inactive sessions expire after 4 hours
- Change the default admin password immediately after setup

---

## Next Steps

- [Hidden Items](hidden-items.md) — Manage your personal hidden content
- [Watch History](watch-history.md) — Track and resume playback
- [Configuration](../getting-started/configuration.md) — Server-level settings
