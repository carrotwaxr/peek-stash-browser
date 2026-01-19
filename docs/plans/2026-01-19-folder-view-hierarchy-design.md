# Folder View Hierarchy Fix

## Problem

When opening folder view, all 23,000+ scenes appear at the top level alongside tag folders. The folder view is intended to be a hierarchy drilling view where items only appear when directly attached to the currently selected tag.

## Desired Behavior

### Root Level
- Show only root-level tag folders (tags with no parents)
- Show "Untagged" folder containing items with zero tags
- Show NO loose items

### Inside a Tag Folder
- Show child tag folders (sorted alphabetically, always displayed first)
- Show items that have this exact tag directly AND do not have any child tag of this folder
- Items "sink" to their most specific tag level

### Multi-Tag Items
- Items appear in all folders where they have a direct tag match
- Example: A scene tagged "Action" and "Comedy" appears in both folders

### Nested Tag Handling
- If an item has both a parent tag and a child tag, it only appears in the child folder
- Items only surface at the exact tag level they're tagged with
- Example: Scene tagged "Slasher" (child of "Horror") only appears when viewing "Slasher", not when viewing "Horror"

### Folder Counts
- Folder cards continue to show recursive total count (all items in folder and descendants)

### "Untagged" Folder
- Only appears at root level
- Contains items with zero tags

## Algorithm

```
At ROOT level:
  - Show folders for each root-level tag (tags with no parents)
  - Show "Untagged" folder containing items with zero tags
  - Show NO loose items

Inside a TAG folder (currentTagId):
  - Get child tags of currentTagId
  - For each item in results:
    - Does item have currentTagId directly?
      - YES: Does item also have ANY child tag of currentTagId?
        - YES → item belongs in that child folder (don't show here)
        - NO → item is a loose item at this level
      - NO → item shouldn't appear here (it's here via deeper descendant)
  - Show child tag folders (sorted alphabetically, always first)
  - Show loose items (after folders)
```

## Files to Change

| File | Change |
|------|--------|
| `client/src/utils/buildFolderTree.js` | Rewrite core grouping algorithm |
| `client/src/utils/buildFolderTree.test.js` | Update tests for new behavior |

## Files NOT Changing

- `FolderView.jsx` - component logic unchanged
- `FolderCard.jsx`, `FolderBreadcrumb.jsx`, `FolderTreeSidebar.jsx` - display unchanged
- API endpoints - filtering behavior unchanged
- Page integrations (Galleries, SceneSearch, Images) - already wired correctly

The fix is isolated to client-side grouping logic in `buildFolderTree.js`.
