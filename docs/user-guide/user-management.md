# User Management

Peek supports multiple users with separate preferences, watch history, and content access. Admins can create accounts, set content restrictions, manage user groups, and control permissions.

## User Roles

Peek has two user roles:

| Role | Description |
|------|-------------|
| **Admin** | Full access including user management and server settings; content restrictions never apply |
| **User** | Standard access with personal preferences, playlists, and watch history |

!!! note "Admin Content Access"
    Admins always see all content, regardless of any restrictions, except items they hide themselves. This allows admins to manage and organize content that may be restricted for other users.

---

## Creating Users

**Requirements:** Admin role

1. Go to **Settings** → **User Management** tab
2. Click **+ Create User**
3. Enter:
   - **Username** (must be unique)
   - **Password** (minimum 8 characters, must include at least one letter and one number)
   - **Role** (User or Admin)
4. Click **Create**

The new user can now log in with these credentials.

---

## Managing Users

**Requirements:** Admin role

Click on any user row in the User Management table to open the **User Edit Modal**, which provides a comprehensive view of user settings:

### User Edit Modal Sections

| Section | Description |
|---------|-------------|
| **Account** | Change username, password, and role |
| **Groups** | Manage group memberships for permission inheritance |
| **Permissions** | View and override individual permissions |
| **Content Restrictions** | Set what content the user can see |

### Quick Actions

From the user table, you can also:

| Action | Description |
|--------|-------------|
| **Sync from Stash** | Import ratings and favorites from Stash for this user |
| **Delete** | Remove the user account |

!!! warning "Cannot Delete Self"
    Admins cannot delete their own account. Another admin must perform this action.

---

## User Groups

User groups allow you to manage permissions for multiple users at once. Users inherit permissions from all groups they belong to.

### How Groups Work

- Each group defines default permissions (sharing, downloading files, downloading playlists)
- Users can belong to multiple groups
- Permissions use "most permissive wins" logic—if any group grants a permission, the user has it
- Individual user overrides can further customize permissions

### Managing Groups

**Requirements:** Admin role

1. Go to **Settings** → **Groups** tab
2. Click **+ Create Group** to add a new group
3. Enter:
   - **Name** (must be unique)
   - **Description** (optional)
   - **Default Permissions** (toggle which permissions group members should have)
4. Click **Create**

### Group Permissions

| Permission | Description |
|------------|-------------|
| **Can Share** | Allow users to share content links (future feature) |
| **Can Download Files** | Allow downloading individual scenes and images |
| **Can Download Playlists** | Allow downloading playlist zip archives |

### Adding Users to Groups

1. Click on a user in the User Management table
2. Go to the **Groups** section
3. Check the groups you want the user to belong to
4. Click **Save**

### Permission Resolution

When determining a user's effective permissions:

1. Start with all permissions disabled
2. For each group the user belongs to, if the group grants a permission, enable it
3. Apply any user-level overrides (explicit allow or deny)

!!! tip "Permission Inheritance"
    The Groups section in the User Edit Modal shows which permissions are inherited from groups vs. overridden at the user level.

---

## Permissions

Permissions control what actions users can perform beyond viewing content.

### Available Permissions

| Permission | Description |
|------------|-------------|
| **Can Share** | Share content links with others |
| **Can Download Files** | Download individual scenes and images |
| **Can Download Playlists** | Download playlist zip archives |

### Setting Permissions

1. Click on a user in the User Management table
2. Go to the **Permissions** section
3. For each permission, choose:
   - **Inherit** — Use the value from group memberships
   - **Allow** — Explicitly grant this permission
   - **Deny** — Explicitly deny this permission
4. Click **Save**

!!! note "Override Priority"
    User-level overrides always take precedence over group permissions. An explicit "Deny" will block a permission even if a group grants it.

---

## Content Restrictions

Admins can restrict what content users see. Restrictions cascade throughout the UI: restricted items won't appear in lists, cards, dropdowns, or detail pages, and they reach galleries, images and clip markers.

### Restriction Types

| Type | Best For |
|------|----------|
| **Collections (Groups)** | Most reliable: static, manually curated sets |
| **Tags** | Content categories (may change if using Stash plugins). A listed tag covers its child tags |
| **Studios** | Limiting by production company. A listed studio covers its child studios |
| **Galleries** | Restricting specific gallery content |

!!! tip "Recommended Approach"
    Use **Collections (Groups)** as your primary restriction mechanism. Create groups in Stash for content categories, then restrict users to specific groups in Peek.

### The Two Lists

Each type has two lists; either, both or neither can have items.

| List | Behavior |
|------|----------|
| **Show only** | The user sees only content with at least one listed item |
| **Always hide** | Listed items and all their content are hidden, even if also in Show only |

The **Also hide items with no ...** box hides content with no item of that type. It is disabled until a list has an item, starts ticked with a Show-only list and unticked with only an Always-hide list, and keeps a value you set by hand.

### Setting Restrictions

1. Click **Edit** on a user in the User Management table (a user account; the editor is not shown for admin accounts)
2. Go to the **Content Restrictions** section and click **Manage Restrictions**
3. For each entity type (Collections, Tags, Studios, Galleries):
   - Choose items for **Show only** and/or **Always hide**
   - Check or uncheck **Also hide items with no ...**
4. Click **Save Restrictions**

### How Restrictions Work

**Always hide example:**
- Always hide the tag "Documentary"
- User won't see any scenes, galleries, images, clip markers, performers or studios tagged "Documentary" (or one of its child tags)

**Show only example:**
- Show only the collection "Favorites"
- User only sees scenes in the "Favorites" group, and nothing else

**Always hide wins:**
- Show only "Cartoons" and always hide "Explicit": the user sees "Cartoons" content except anything also tagged "Explicit"

**Cascading behavior:**
- Restricted tags don't appear in filter dropdowns
- Restricted studios don't appear on performer detail pages
- Performers, studios, collections and tags with no visible content disappear
- Scene counts exclude restricted content

Promoting a user to admin stops their restrictions applying; demoting an admin applies any saved restrictions again. See [Content Restrictions](content-restrictions.md) for the full guide.

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
- **Downloads** — View and manage your download history
- **TV Mode** — Toggle enhanced keyboard navigation
- **Sign Out** — Log out of your account

---

## Proxy Authentication (SSO)

Peek supports single sign-on via reverse proxy authentication. When configured:

- Users are automatically logged in based on proxy headers
- Usernames must match exactly between proxy and Peek
- See [Configuration - Proxy Authentication](../getting-started/configuration.md#proxy-authentication) for setup

---

## Security

### Password Requirements

Passwords must meet these requirements:

- Minimum 8 characters
- At least one letter (a-z or A-Z)
- At least one number (0-9)

### Account Lockout

To protect against brute-force attacks:

- **5 failed sign-ins** for one username from one address lock that username for **15 minutes** from that address only; the owner can still sign in from elsewhere
- Admins cannot manually unlock accounts—wait for the lockout to expire

### Rate Limiting

Authentication endpoints are rate-limited:

- **10 failed attempts per 15 minutes** per address, across sign-in and password recovery; successful sign-ins don't count
- Helps prevent automated attacks

### Recovery Keys

A recovery key resets your password if you forget it. Peek stores only a fingerprint of each key, so it can show a key only once, when it is created.

**Getting your recovery key:**
1. Your first key is shown once at your first sign-in, in the welcome screen
2. Copy it and store it in a safe place (password manager recommended)

**Creating a new key:**
1. Go to **Settings** → **Account** tab
2. Under **Recovery Key**, enter your current password and click **Create new key** (**Create key** if you have none)
3. Copy the new key: Peek won't show it again. The old key stops working.

Peek cannot show an existing key. If you lost yours, create a new one.

**Using a recovery key:**
1. On the login page, click **Forgot Password**
2. Enter your username
3. Enter your recovery key
4. Set a new password

Resetting a password with a recovery key signs out every existing session of that user.

!!! warning "Keep Your Recovery Key Safe"
    Recovery keys are the only way to reset a forgotten password without admin intervention. Store yours securely. If you lose both your password and your recovery key, an admin must reset your password.

### Admin Password Reset

Admins can reset any user's password:

1. Click on the user in User Management
2. In the Account section, enter a new password
3. Click **Save**

The reset signs the user out everywhere. The user should change their password after logging in.

### Security Best Practices

- Passwords are hashed with bcrypt (never stored in plain text)
- A session ends after 2 hours without activity, and 30 days after you signed in with your password even while active. Changing or resetting a password signs out every other session.
- Store recovery keys in a password manager
- Use unique passwords for each user account

---

## Database Backup

Admins can create and manage backups of the Peek database from the settings UI.

**Location:** Settings → Server Configuration → Backup

### Creating a Backup

1. Click **Create Backup**
2. Peek creates an atomic snapshot of the entire SQLite database
3. The backup appears in the list with its creation date and file size

### What's Included

Backups contain all Peek data:

- User accounts, preferences, and permissions
- Ratings, favorites, and watch history
- Playlists and playlist shares
- Cached entity data from Stash
- Custom themes and carousels

Backups do **not** include Stash media files or Stash server configuration.

### Managing Backups

- Backups are listed newest-first with creation date and file size
- Click the trash icon to delete a backup (with confirmation)
- Backups are stored in the Peek data directory alongside the database

!!! tip "Before Upgrading"
    Create a backup before upgrading Peek to a new version. If something goes wrong, you can restore the backup by replacing the database file.

---

## Next Steps

- [Downloads](downloads.md) — Download scenes, images, and playlists
- [Hidden Items](hidden-items.md) — Manage your personal hidden content
- [Watch History](watch-history.md) — Track and resume playback
- [Configuration](../getting-started/configuration.md) — Server-level settings
