# Hidden Items

Hide specific content from your personal view without affecting other users.

## Overview

Hidden Items let you personally hide content you don't want to see. Unlike [Content Restrictions](content-restrictions.md) (admin-controlled), Hidden Items are entirely user-controlled.

| Feature | Who Controls | Scope |
|---------|--------------|-------|
| **Hidden Items** | You | Only your view |
| **[Content Restrictions](content-restrictions.md)** | Admins | Per-user access control |

## How to Hide Items

### From Scene Cards

1. Click the three-dot menu (⋮) on any scene card
2. Select "Hide Scene"
3. Confirm in the dialog (or check "Don't ask again" to skip future confirmations)

### From Entity Cards

The same three-dot menu is available on:
- Performer cards
- Studio cards
- Tag cards
- Group/Collection cards
- Gallery cards

### Bulk Actions (Scenes)

1. Enable multi-select mode by clicking the checkbox icon
2. Select multiple scenes
3. Click "Hide Selected" in the bulk action bar

## Managing Hidden Items

### Viewing Hidden Items

1. Go to **My Settings**
2. Scroll to the "Hidden Items" section
3. Click **View Hidden Items**

### Restoring Hidden Items

From the Hidden Items page:
- Click **Restore** on individual items to unhide them
- Click **Restore All** to restore all hidden items at once
- Use the tabs to filter by entity type (Scenes, Performers, Studios, etc.)

### Don't Ask Again

If you frequently hide items and want to skip the confirmation dialog:
1. Check "Don't ask me again" when hiding an item, OR
2. Go to **My Settings** > Hidden Items section
3. Check "Don't ask for confirmation when hiding items"

You can toggle this setting on/off at any time.

## How It Works

### For Regular Users
- Hidden items are filtered from all views (search, carousels, recommendations)
- Hidden items persist across sessions and page refreshes
- Other users are not affected by your hidden items

### For Admin Users
- Admins can hide content for themselves just like regular users
- Content Restrictions (INCLUDE/EXCLUDE rules) are bypassed for admins
- Hidden Items filtering is ALWAYS applied, even for admins
- This allows admins to maintain full admin access while personalizing their own view

### Cascading Behavior

When you hide an entity:
- **Hiding a Scene**: Only that scene is hidden
- **Hiding a Performer**: That performer and scenes where they appear may be affected
- **Hiding a Studio**: That studio and scenes from it may be affected
- **Hiding a Tag**: That tag and related content may be affected

**Note**: The exact cascading behavior depends on your Content Restrictions settings and whether hidden entities are the only content associated with related items.

## FAQ

### Can I accidentally hide something important?
You can always restore hidden items from **My Settings** > **View Hidden Items**. The Restore All button makes it easy to undo bulk actions.

### Do hidden items count toward my stats?
Hidden items are excluded from most views but may still appear in certain statistics or reports.

### Can admins see what I've hidden?
Admins can see that you have hidden items (via database access) but the hidden items feature is designed for personal use. Each user's hidden items are private to them.

### What happens if content I've hidden is updated in Stash?
Hidden items remain hidden even if the underlying content is modified in Stash. The hiding is based on entity ID, not content characteristics.

---

## Related

- [Content Restrictions](content-restrictions.md) — Admin-controlled access restrictions
- [User Management](user-management.md) — Full user administration guide
