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

1. Go to **Settings** → **Server Settings** → **User Management**
2. Click **+ Create User**
3. Enter:
   - **Username** (must be unique)
   - **Password** (minimum 8 characters, must include at least one letter and one number)
   - **Role** (User or Admin)
4. Click **Create**

The new user can now log in with these credentials. The setup wizard and accounts created by an admin follow the same password rule as a password change (see [Password Requirements](#password-requirements)).

---

## Managing Users

**Requirements:** Admin role

Click on any user row in the User Management table to open the **User Edit Modal**, which provides a comprehensive view of user settings:

### User Edit Modal Sections

| Section | Description |
|---------|-------------|
| **Basic Info** | The username (read-only) and the role |
| **Groups** | Manage group memberships for permission inheritance |
| **Permissions** | View and override individual permissions |
| **Content Restrictions** | Set what content the user can see |
| **Account Actions** | Reset the password, regenerate the recovery key, or delete the user |

Each change saves as you make it, and **Saved** appears beside the control (or the error, with the control back at its stored value). Changing the role asks you to confirm first. There is no Save button: **Close** closes the editor, and the user list updates.

### Quick Actions

From the user table, you can also:

| Action | Description |
|--------|-------------|
| **Sync from Stash** | Import ratings, favorites, O counts, plays, watch time and resume points from Stash for this user |
| **Edit** | Open the User Edit Modal |

To delete a user, open **Edit** and use **Delete User** under **Account Actions**. It removes the user account, all their data and their download files.

!!! warning "Cannot Modify Self"
    The User Edit Modal does not change your own account, and an admin cannot delete their own account. Another admin must do that. Use your own account settings (Settings → User Preferences → Account) for your password.

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

1. Go to **Settings** → **Server Settings** → **User Management**
2. In the **User Groups** panel at the top, click **Create Group**
3. Enter:
   - **Name** (must be unique)
   - **Description** (optional)
   - **Default Permissions** (toggle which permissions group members should have)
4. Click **Create**

### Group Permissions

| Permission | Description |
|------------|-------------|
| **Can Share** | Allow users to share their playlists with the groups they belong to |
| **Can Download Files** | Allow downloading individual scenes and images |
| **Can Download Playlists** | Allow downloading playlist zip archives |

### Adding Users to Groups

1. Click on a user in the User Management table
2. Go to the **Groups** section
3. Check the groups you want the user to belong to; each one saves at once

Adding or removing members in a group's own editor also saves at once, even if you then click **Cancel**.

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
| **Can Share** | Share your playlists with the groups you belong to |
| **Can Download Files** | Download individual scenes and images |
| **Can Download Playlists** | Download playlist zip archives |

### Setting Permissions

1. Click on a user in the User Management table
2. Go to the **Permissions** section
3. For each permission, choose:
   - **Inherit from groups**: Use the value from group memberships
   - **Force enabled**: Explicitly grant this permission
   - **Force disabled**: Explicitly deny this permission

Each choice saves as you make it.

!!! note "Override Priority"
    User-level overrides always take precedence over group permissions. A forced-disabled permission is blocked even if a group grants it.

!!! note "Admins Need a Grant Too"
    The admin role gives no permission to share or download. An admin gets Can Share, Can Download Files and Can Download Playlists from a group or a user setting, like anyone else. All three are denied until then.

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
| **Preview Quality** | Sprite, WebP, MP4 |
| **Theme** | Peek, Light, Midnight Blue, Deep Purple, The Hub, Custom |
| **Home Carousels** | Enable/disable and reorder |
| **Navigation** | Customize menu items |
| **Wall Playback** | Autoplay, Hover, Static |

### Accessing Settings

- Click **Settings** at the bottom of the sidebar
- Or navigate directly to the Settings page

---

## Syncing with Stash

### Sync from Stash (Import)

Imports a user's ratings, favorites, O counts, plays, watch time and resume points from Stash into Peek. Useful when:
- A new user already has data in Stash
- Recovering from a Peek database reset

**To sync:**
1. Go to **Settings** → **Server Settings** → **User Management**
2. Click **Sync from Stash** for the user
3. Select what to import, per type
4. Click **Start Sync**

What it imports, from every Stash server the user can see:

| Data | Types | What happens in Peek |
|------|-------|----------------------|
| **Ratings** | Scenes, performers, studios, galleries, groups, images | Each rated item gets Stash's rating. An unrated item in Stash changes nothing. |
| **Favorites** | Performers, studios, tags | Each Stash favorite becomes a Peek favorite. A Peek favorite is never removed. |
| **O counter and dates** | Scenes | Stash's O dates are added to the scene's history; the count is at least Stash's counter and never lower than Peek's. |
| **Plays, watch time and resume points** | Scenes | Stash's play dates are added the same way, and "last played" moves forward to the latest of them or of Stash's own last played date, if later; a scene with watch time or a resume point but no play dates still gets Stash's last played date, so it sorts correctly in Continue Watching and Watch History. Watch time becomes the larger of Peek's and Stash's (never the sum: Sync to Stash already adds Peek's watch time to Stash's). Stash's resume point is taken only for a scene where Peek has none, so a scene resumes where it was left in Peek. Scenes with watch time or a resume point but no plays in Stash are imported too. |

The dates merge, so an import never doubles a Peek event: a date Peek already holds within 60 seconds of one from Stash counts once, since an O or play pushed to Stash by Sync to Stash reappears there at nearly the same time. The rule assumes Peek and Stash agree on the time (Sync to Stash pushes each event as it happens, in the same request); two dates further apart count as two events. Peek's own dates and counts are always kept.

Stash keeps O and play dates from version 0.25 on; on an older Stash the O and play options fail for that server, and its ratings and favorites still import.

Only items that have the field set in Stash are read, in pages, so the import stays quick on large libraries.

Stash keeps one set of ratings, favorites, counters and dates for everyone who syncs to it: when several Peek users have Sync to Stash on, Stash's O counts, plays and watch time add up all of their activity (see the table below). Import only into the Peek user whose activity Stash holds, or expect that user to receive the others' activity too.

Once the import has written anything, the user's stats rankings and Recommended list are worked out again from the imported data the next time they open the stats page or Recommended, rather than within the hour.

### Sync to Stash (Export)

When enabled, user activity syncs back to Stash:

| Data | Sync Behavior |
|------|---------------|
| **O-Counter** | Aggregates across users (increments add up), for scenes and images; Remove last O takes away Stash's newest O |
| **Plays** | Each play is added to the scene in Stash, so plays add up across users |
| **Watch time and resume points** | Sent as you watch. Stash's watch time grows by what each user watches; its resume point is the last one written |
| **Ratings** | Overwrites (last user to rate wins), for scenes, performers, studios, galleries, collections and images. Stash has no rating on tags |
| **Favorites** | Overwrites (last user to change it wins), for performers, studios and tags; Stash has no favorite on scenes, galleries, collections or images |

!!! warning "Multi-User Considerations"
    If multiple users rate the same scene, the last rating wins in Stash. O-counters aggregate, so they'll be higher in Stash than for any individual user.

**To enable/disable:**
1. Go to **Settings** → **Server Settings** → **User Management**
2. Find the user in the table
3. Toggle the **Sync to Stash** column

Only admins can turn Sync to Stash on or off, from User Management. A user's own settings don't offer it, and the server refuses it from anyone else. Ratings, favorites, O counts, plays and resume points are recorded only for items the user can see.

---

## Hidden Items

Users can hide individual items they don't want to see. Unlike admin restrictions, users can unhide items themselves.

### Hiding Content

- On any card, click the **⋮** menu → **Hide**
- Or on detail pages, use the **Hide** action

### Managing Hidden Items

1. Go to **Settings** → **User Preferences** → **Content** → **Hidden Items**
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
- At most 72 bytes (a longer password is refused, since only the first 72 bytes of a password are used)

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

**Location:** Settings → Server Settings → Backup

### Creating a Backup

1. Click **Create Backup**
2. Peek creates an atomic snapshot of the entire SQLite database
3. The backup appears in the list with its creation date, size and file path

Two backups made in the same second are both kept: the second gets `-2` at the end of its name.

### What's Included

Backups contain all Peek data:

- User accounts (with their password hashes), preferences, and permissions
- Ratings, favorites, and watch history
- Playlists and playlist shares
- The Stash instances you connected, with their API keys
- Cached entity data from Stash
- Custom themes and carousels

Backups do **not** include Stash media files or Stash's own database.

### Kinds of Backup

The list shows every backup of the database in the data directory, labeled with what made it:

| Label | Made by | File name |
|---|---|---|
| Created in Peek | **Create Backup** in this tab | `peek-stash-browser.db.backup-20260924-101112` |
| Before upgrading to 3.5.0 | Peek itself, before it applied that version's database migrations | `peek-stash-browser.db.backup-20260924-101112-pre-3.5.0` |
| Before an upgrade (older Peek) | Versions before 3.4.0, when they upgraded a database from before 2.0.1 | `peek-stash-browser.db.backup.20260924_101112` |

Times in the names are UTC. Peek keeps the 3 newest "Before upgrading" backups and deletes older ones when it takes a new one; it never deletes the other kinds. A backup cut off because Peek stopped while writing it is never listed, and is deleted the next time Peek takes a backup. See [Upgrading](../getting-started/upgrading.md#automatic-backup-before-migrations) for when the automatic backup is taken and how to restore one.

### Managing Backups

- Backups are listed newest-first with their label, date, size and full path
- Click the trash icon to delete a backup of any kind (with confirmation)
- Backups are stored in the Peek data directory alongside the database: `/app/data` in the container (or `CONFIG_DIR` if you set it), which is the folder or volume you mount there on the host

### Getting a Backup Off the Server

There is no download in the browser. A backup holds every user's password hash and history and your Stash API keys, and Peek never sends those to a browser.

To keep a copy elsewhere, copy the backup's file from the data directory on the host (on unRAID, the appdata folder you mapped to `/app/data`). A finished backup, including an automatic "Before upgrading" one, is a complete database file and is safe to copy while Peek runs. To copy the live database (`peek-stash-browser.db`) instead, stop the container first.

!!! tip "Before Upgrading"
    Peek backs up the database by itself before any upgrade that changes it. You can still create a backup first and copy it off the server. If something goes wrong, restore a backup by replacing the database file: see [Restore from Backup](../getting-started/upgrading.md#restore-from-backup).

---

## Next Steps

- [Downloads](downloads.md) — Download scenes, images, and playlists
- [Hidden Items](hidden-items.md) — Manage your personal hidden content
- [Watch History](watch-history.md) — Track and resume playback
- [Configuration](../getting-started/configuration.md) — Server-level settings
