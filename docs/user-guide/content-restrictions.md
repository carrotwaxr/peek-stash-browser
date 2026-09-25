# Content Restrictions

Content Restrictions allow admins to control what content each user can access. Unlike [Hidden Items](hidden-items.md) (which users control themselves), Content Restrictions are admin-only and cannot be bypassed by users.

## Overview

| Feature | Who Controls | Who Sees |
|---------|--------------|----------|
| **Content Restrictions** | Admins only | Affects specific users |
| **Hidden Items** | Each user | Only that user |

**Key behaviors:**

- Restrictions apply to user accounts only. Admin accounts are never restricted (they still see everything except the items they hide themselves), and the editor is not shown for admin accounts
- Restrictions cascade throughout the UI: restricted items don't appear anywhere, including galleries, images and clip markers
- This includes opening an item by a direct link and the related items listed in card tooltips
- A newly added Stash server appears once its first sync has finished and every user's restrictions cover it, so restricted content never shows while it syncs
- Items a sync adds or changes appear to restricted users once that sync finishes and their restrictions have been recomputed, never in between
- Users cannot see or modify their own restrictions

---

## Restriction Types

You can restrict content by four entity types:

| Type | Best For | Notes |
|------|----------|-------|
| **Collections (Groups)** | Primary filtering | Most reliable: static, manually curated |
| **Tags** | Content categories | May change if using Stash plugins that auto-tag. A listed tag covers its child tags |
| **Studios** | Production company limits | A listed studio covers its child studios |
| **Galleries** | Image gallery access | Restricts gallery and its images |

!!! tip "Recommended Approach"
    Use **Collections (Groups)** as your primary restriction mechanism. Create groups in Stash to organize content by access level, then restrict users to appropriate groups in Peek.

---

## The Two Lists

Each entity type has two lists. Either, both or neither can have items.

### Show only

If this list has items, the user sees only content with **at least one** of them. Content with none of the listed items is hidden.

**Example:** Show only the tag "Cartoons"

- Scenes, galleries and images tagged "Cartoons" (or one of its child tags) stay visible, even when they carry other tags too
- Everything tagged only with other tags is hidden
- The other tags themselves disappear from filters and lists; child tags of "Cartoons" stay

### Always hide

Listed items and all their content are hidden, whatever else is on the item.

**Example:** Always hide the tag "Documentary"

- User won't see scenes, galleries, images or clip markers tagged "Documentary"
- Performers who only appear in "Documentary" content disappear as well
- "Documentary" won't appear in tag filters or lists

### Always hide wins

An item can be in both lists; if it is, it is hidden. Use this to carve an exception out of a Show-only list.

**Example:** Show only "Cartoons", but never "Explicit"

- Show only: Tags = "Cartoons"
- Always hide: Tags = "Explicit"
- Result: the user sees "Cartoons" content, except anything also tagged "Explicit" (or one of its child tags)

The editor shows a note when the same item is in both lists.

### Child tags and studios

A listed tag covers every tag under it, and a listed studio covers every studio under it, in both lists. Parents are not covered by a child: listing "Anime" does not list "Cartoons" above it. Collections and galleries have no hierarchy in Peek.

---

## Setting Up Restrictions

**Requirements:** Admin role

### Step 1: Plan Your Approach

Before setting restrictions, decide:

1. **What content should this user see?** (or not see)
2. **Which entity type is most appropriate?** (Groups are recommended)
3. **Show only, Always hide, or both?**

### Step 2: Organize in Stash

Create appropriate groups/tags in Stash:

- For Show only: create groups containing allowed content
- For Always hide: ensure restricted content has identifying tags/groups

### Step 3: Configure in Peek

1. Go to **Settings** > **User Management**
2. Click **Edit** on the target user (a user account, not an admin)
3. Click **Manage Restrictions**
4. For each entity type you want to restrict:
   - Search and select items for **Show only** and/or **Always hide**
   - Check or uncheck **Also hide items with no ...** (see below)
5. Click **Save Restrictions**

Saving a list with no items is rejected; clear the list instead.

### The "Also hide items with no ..." Box

Each type has one box. It hides content that has no item of that type at all, so unorganized content cannot slip through:

| Entity Type | The box hides |
|-------------|---------------|
| Tags | Scenes, galleries and images with no tags |
| Groups | Scenes not in any group |
| Studios | Scenes, galleries and images with no studio |
| Galleries | Scenes not linked to a gallery, images not in a gallery |

The box is disabled until a list has an item. When you add the first item it takes a default: **ticked** with a Show-only list, **unticked** with only an Always-hide list. Once you set it by hand, or once it has been saved, it keeps its value.

- With a Show-only list, the box decides what happens to content with no item of that type: hidden when ticked, visible when unticked
- With only an Always-hide list, ticking the box hides content with no item of that type on top of the listed items

Images use their own tags here: an image in a tagged gallery still counts as having no tags of its own.

---

## How Cascading Works

Restrictions cascade to related content:

### Tag Restrictions

An always-hidden tag (and each of its child tags) hides:

- Scenes with that tag (direct or inherited)
- Galleries and images with that tag
- Clip markers with that tag
- Performers, studios and collections tagged with it
- The tag itself in all filter dropdowns and lists

### Studio Restrictions

An always-hidden studio (and each of its child studios) hides:

- All scenes, galleries and images from that studio
- The studio in filter dropdowns
- Studio info on performer pages

### Group Restrictions

An always-hidden group hides:

- Scenes in that group
- The group in browse views
- Group info on scene detail pages

### Gallery Restrictions

An always-hidden gallery hides:

- The gallery itself
- Images in that gallery
- Gallery links on scene pages

### Organizing entities

Performers, studios, collections and tags that are left with no visible content disappear from lists and filters. They come back as soon as some of their content is visible again.

---

## Common Patterns

### Age-Based Access

Create groups in Stash for different age ratings:

```
- "All Ages" group
- "Teen" group
- "Adult" group
```

Then use Show only: Kids see only "All Ages", teens see "All Ages" + "Teen", etc.

### Category-Based Access

Use tags to categorize content, then Always hide unwanted categories:

- Tag content in Stash by category
- Always hide specific tags per user

### Studio-Based Access

Restrict by production company:

- Show only specific studios for limited access
- Always hide studios for blocking specific sources

---

## Combining Restrictions

You can set restrictions on multiple entity types. They combine as follows:

1. **Types AND together**: content must pass every type's rules
2. **Within a type**: Always hide wins, then Show only needs one match, then the "no ..." box applies to content with no item of that type

**Example:**

- Show only: Groups = "Approved Content"
- Always hide: Tags = "Violence"

Result: User sees content from "Approved Content" that isn't tagged "Violence"

---

## Verifying Restrictions

After setting restrictions:

1. **Create a test account** with the same restrictions
2. **Log in as that user** (or use incognito)
3. **Browse the library** to verify expected content appears
4. **Check filters** to ensure restricted items don't appear in dropdowns
5. **View detail pages** to confirm cascading works

---

## Troubleshooting

### User sees restricted content

- Verify the restriction is saved (refresh User Management)
- Ensure sync has completed after making changes in Stash

### Too much content is hidden

- Review Show-only lists: content needs at least one listed item, and the "no ..." box hides content with none
- Check for overlapping Always-hide rules (child tags and studios are covered too)

### Admin accounts cannot be restricted

- Restrictions do not apply to admin accounts and cannot be saved for them
- Promoting a user to admin stops their restrictions applying; demoting an admin applies any saved restrictions again. Either change recomputes what the account sees

### Restrictions don't cascade

- Wait for sync to complete after Stash changes
- Trigger manual sync if needed
- Check that related entities have proper associations in Stash

---

## Related Features

- **[Hidden Items](hidden-items.md)**: User-controlled hiding of individual items
- **[User Management](user-management.md)**: Full user administration guide
- **[FAQ](../getting-started/faq.md)**: Common questions including sync behavior
