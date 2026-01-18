# Merge Detection & Data Recovery

When scenes are merged in Stash, Peek automatically detects this and preserves your user activity data like watch history, ratings, and favorites.

## How Scene Merging Works in Stash

In Stash, you can merge duplicate scenes together. This is useful when:

- You download a higher resolution version of a scene you already had
- You discover duplicates after adding new content
- You have alternate versions (director's cut, different endings)

When merging in Stash, the source scene is completely deleted - all its file fingerprints are transferred to the destination scene, but the source scene ID no longer exists.

## The Problem Peek Solves

Without merge detection, when Peek syncs with Stash:

1. Peek sees the source scene is missing from Stash
2. Peek soft-deletes the source scene
3. Your watch history, ratings, and favorites become "orphaned"
4. When you view the merged (destination) scene, your activity data is missing

**With merge detection**, Peek automatically transfers your activity to the surviving scene.

## Automatic Merge Detection

### How It Works

Peek uses PHASH (perceptual hash) fingerprints to detect merges:

1. When a scene is about to be soft-deleted during sync, Peek checks its PHASH
2. If another scene has the same PHASH, it's likely a merge target
3. Peek automatically transfers all user activity data to the target scene
4. The source scene is then soft-deleted as normal

### What Gets Transferred

For each user with activity on the merged scene:

| Data Type | Transfer Logic |
|-----------|---------------|
| Play count | Added together |
| Play duration | Added together |
| O count | Added together |
| Resume time | Target scene's value kept (if any) |
| Last played | Most recent timestamp kept |
| Rating | Target scene's rating kept (if set) |
| Favorite | OR logic - if either was favorited, result is favorited |

!!! tip "Automatic and Seamless"
    You don't need to do anything - merge detection happens automatically during normal syncs.

## Admin Recovery Tool

For scenes that were merged before this feature was implemented, or where automatic detection couldn't find a match, admins can manually recover orphaned data.

### Accessing the Tool

1. Go to **Settings** (gear icon)
2. Click the **Server** tab
3. Select **Merge Recovery**

### Understanding the Interface

The Merge Recovery tab shows:

- **Total orphaned scenes** with user activity
- For each orphan:
    - Scene title and when it was deleted
    - PHASH value (if available)
    - Activity summary: total plays, ratings, favorites
    - Potential PHASH matches

### Recovering Orphaned Data

**For a single scene:**

1. Click on an orphaned scene to expand it
2. Review the potential matches (sorted by likelihood)
3. Either:
    - Click **Transfer** next to a match to transfer activity to that scene
    - Enter a scene ID manually if you know the correct target
4. The activity data is transferred and an audit record is created

**For all scenes at once:**

1. Click **Auto-Reconcile All**
2. Peek transfers activity for all orphans with exact PHASH matches
3. Orphans without matches are skipped (handle manually later)

### Discarding Orphaned Data

If an orphaned scene's data is no longer relevant (e.g., you deleted the scene intentionally):

1. Expand the orphan
2. Click **Discard Activity**
3. Confirm the action

!!! warning "Permanent Action"
    Discarding orphaned data permanently deletes the watch history and ratings. This cannot be undone.

## Limitations

### When Automatic Detection Fails

PHASH-based detection may not work when:

- **Scene had no PHASH** - Fingerprinting wasn't run in Stash before the scene was synced to Peek
- **Scene was deleted before PHASH sync** - Peek didn't have the PHASH stored
- **Scene was split, not merged** - Different operation, same result in Peek

In these cases, use the admin recovery tool to manually reconcile.

### PHASH Not Available

If a scene shows "No PHASH" in the recovery tool:

1. The scene was synced before fingerprint syncing was implemented
2. You can manually enter the target scene ID if you know it
3. Future syncs will include PHASH data for new scenes

## Audit Trail

Every merge reconciliation (automatic or manual) creates an audit record containing:

- Source and target scene IDs
- Which PHASH matched them (if automatic)
- All transferred data values
- When the reconciliation happened
- Who performed it (system for automatic, admin username for manual)

This ensures full traceability of data transfers.

## Best Practices

### Before Merging in Stash

1. **Run a full sync** in Peek first to ensure PHASHes are stored
2. **Merge scenes in Stash** as normal
3. **Run another sync** - merge detection happens automatically

### Checking Results

After a sync where merges occurred:

1. Check the sync log for "Detected merge" messages
2. Verify your watch history appears on the destination scene
3. If something is missing, check the admin recovery tool

### For Admins

- Periodically check the Merge Recovery tab for orphaned scenes
- Use Auto-Reconcile All to quickly process exact matches
- Manually review and reconcile scenes without PHASH matches

## Troubleshooting

### Activity Not Transferred

**Possible causes:**

- PHASH wasn't available at sync time
- Multiple potential matches exist (check admin tool)
- Scene was deleted, not merged

**Solution:** Use the admin recovery tool to manually reconcile.

### Wrong Scene Got the Activity

If activity was transferred to the wrong scene:

1. Currently, there's no automatic undo
2. Contact your admin to manually adjust records if needed
3. Future enhancement: undo capability using audit records

### Orphaned Scenes Keep Appearing

If the same scenes keep showing as orphaned:

- They may have been deleted in Stash (not merged)
- Check if they should be discarded rather than reconciled
- If they're legitimately orphaned, use the recovery tool

## Next Steps

- [Watch History](watch-history.md) - Learn more about watch history tracking
- [User Management](user-management.md) - Admin features and user management
