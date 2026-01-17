# Content Restrictions

Content Restrictions allow admins to control what content each user can access. Unlike [Hidden Items](hidden-items.md) (which users control themselves), Content Restrictions are admin-only and cannot be bypassed by users.

## Overview

| Feature | Who Controls | Who Sees |
|---------|--------------|----------|
| **Content Restrictions** | Admins only | Affects specific users |
| **Hidden Items** | Each user | Only that user |

**Key behaviors:**

- Admins bypass all Content Restrictions (they always see everything)
- Restrictions cascade throughout the UI—restricted items don't appear anywhere
- Users cannot see or modify their own restrictions

---

## Restriction Types

You can restrict content by four entity types:

| Type | Best For | Notes |
|------|----------|-------|
| **Collections (Groups)** | Primary filtering | Most reliable—static, manually curated |
| **Tags** | Content categories | May change if using Stash plugins that auto-tag |
| **Studios** | Production company limits | Useful for brand-specific access |
| **Galleries** | Image gallery access | Restricts gallery and its images |

!!! tip "Recommended Approach"
    Use **Collections (Groups)** as your primary restriction mechanism. Create groups in Stash to organize content by access level, then restrict users to appropriate groups in Peek.

---

## Restriction Modes

Each entity type can have one of three modes:

### None (Default)

No restrictions for this entity type. User sees all content.

### Exclude Mode

Hide specific items. Everything else is visible.

**Example:** Exclude the tag "Documentary"

- User won't see scenes tagged "Documentary"
- User won't see performers who only appear in "Documentary" scenes
- "Documentary" won't appear in tag filters or lists

### Include Mode

Show ONLY specific items. Everything else is hidden.

**Example:** Include only the collection "Family Friendly"

- User only sees scenes in "Family Friendly" group
- All other content is completely hidden
- This is the most restrictive mode

!!! warning "Include Mode is Restrictive"
    Include mode hides ALL content not in the specified list. Use carefully—combine multiple entity types thoughtfully.

---

## Setting Up Restrictions

**Requirements:** Admin role

### Step 1: Plan Your Approach

Before setting restrictions, decide:

1. **What content should this user see?** (or not see)
2. **Which entity type is most appropriate?** (Groups are recommended)
3. **Should you use Include or Exclude?**

### Step 2: Organize in Stash

Create appropriate groups/tags in Stash:

- For Include mode: Create groups containing allowed content
- For Exclude mode: Ensure restricted content has identifying tags/groups

### Step 3: Configure in Peek

1. Go to **Settings** → **User Management**
2. Find the target user
3. Click **Content Restrictions**
4. For each entity type you want to restrict:
   - Select the mode (Exclude or Include)
   - Search and select specific items
   - Enable **Restrict Empty** if desired (see below)
5. Click **Save**

### Restrict Empty Option

When enabled, hides content that has no metadata for that entity type:

| Entity Type | Restrict Empty Hides |
|-------------|---------------------|
| Tags | Scenes with no tags |
| Groups | Scenes not in any group |
| Studios | Scenes with no studio |
| Galleries | Scenes not linked to galleries |

This prevents unorganized content from appearing.

---

## How Cascading Works

Restrictions cascade to related content:

### Tag Restrictions

Restricting a tag hides:

- Scenes with that tag (direct or inherited)
- Performers primarily associated with restricted content
- Studios primarily associated with restricted content
- The tag itself in all filter dropdowns and lists

### Studio Restrictions

Restricting a studio hides:

- All scenes from that studio
- The studio in filter dropdowns
- Studio info on performer pages

### Group Restrictions

Restricting a group hides:

- Scenes in that group
- The group in browse views
- Group info on scene detail pages

### Gallery Restrictions

Restricting a gallery hides:

- The gallery itself
- Images in that gallery
- Gallery links on scene pages

---

## Common Patterns

### Age-Based Access

Create groups in Stash for different age ratings:

```
- "All Ages" group
- "Teen" group
- "Adult" group
```

Then use Include mode: Kids see only "All Ages", teens see "All Ages" + "Teen", etc.

### Category-Based Access

Use tags to categorize content, then Exclude unwanted categories:

- Tag content in Stash by category
- Exclude specific tags per user

### Studio-Based Access

Restrict by production company:

- Include only specific studios for limited access
- Exclude studios for blocking specific sources

---

## Combining Restrictions

You can set restrictions on multiple entity types. They combine as follows:

1. **Include rules** intersect (must match ALL includes)
2. **Exclude rules** union (must not match ANY excludes)

**Example:**

- Include: Groups = "Approved Content"
- Exclude: Tags = "Violence"

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
- Check if user is an admin (admins bypass restrictions)
- Ensure sync has completed after making changes in Stash

### Too much content is hidden

- Review Include mode restrictions—they're very restrictive
- Check for overlapping Exclude rules
- Verify Restrict Empty settings

### Restrictions don't cascade

- Wait for sync to complete after Stash changes
- Trigger manual sync if needed
- Check that related entities have proper associations in Stash

---

## Related Features

- **[Hidden Items](hidden-items.md)** — User-controlled hiding of individual items
- **[User Management](user-management.md)** — Full user administration guide
- **[FAQ](../getting-started/faq.md)** — Common questions including sync behavior
