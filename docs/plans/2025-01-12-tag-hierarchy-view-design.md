# Tag Hierarchy View Design

**Date:** 2025-01-12
**Status:** Design Complete
**Branch:** `feature/tag-hierarchy-view`

## Overview

Tag Hierarchy View is a new view mode for the Tags page that displays tags as an expandable tree structure based on parent/child relationships. This gives users a way to visualize and navigate the tag taxonomy, which the current grid view doesn't convey.

## Core Behavior

- **View toggle:** Adds "Hierarchy" option to ViewModeToggle (Grid | Hierarchy). Wall view doesn't apply to tags.
- **Tree structure:** Root tags (no parents) appear at the top level. Child tags are indented under their parents.
- **Multi-parent handling:** Tags with multiple parents appear under each parent (duplicated in the tree).
- **Initial state:** Root tags visible with their immediate children expanded (first level expanded).
- **Click behavior:** Single click expands/collapses a node. Double-click or icon button navigates to tag detail page.
- **Search/filter:** Tree is filtered to only show matching tags plus their ancestors (to maintain tree structure). Non-matching tags are hidden.

## Tree Node Design

Each tree node displays as a compact "mini-card":

**Left side:**
- Expand/collapse chevron (only if tag has children)
- Small thumbnail (tag's `image_path`, ~40x40px, fallback to colored placeholder)

**Center:**
- Tag name (primary text)
- Subtitle line: child count if any (e.g., "3 subtags"), or parent names for context

**Right side:**
- Inline count badges: scene count, performer count (most relevant metrics, muted style)
- Favorite star (if favorited)
- Navigate icon button (arrow/external-link icon, visible on hover, always visible on touch devices)

**Visual styling:**
- Indentation per level (~24px per depth level)
- Subtle left border or connector lines to show hierarchy relationship
- Hover state with background highlight
- Selected/focused state for keyboard navigation
- Dimmed style when tag is shown only as ancestor of a match (not a match itself)

## Data & Performance

**Data requirements:**
- The existing `findTags` GraphQL query already returns `parents` and `children` arrays with `{id, name}` for each tag
- No new API endpoints needed - tree is built client-side from the flat tag list

**Tree building approach:**
- Fetch all tags matching current filters
- Build tree structure in memory: identify root tags (no parents), then nest children recursively
- Handle multi-parent by inserting tag reference under each parent node

**Performance approach:**
- Start simple: fetch all matching tags, build tree client-side
- Hierarchy view ignores per-page pagination (needs full tag set to build tree)
- Add lazy loading/virtualization only if performance becomes an issue (most libraries have <500 tags)

## Component Architecture

**New components:**

1. **`TagHierarchyView.jsx`** - Main container
   - Receives tags array, builds tree structure, manages expanded state, renders the tree
   - Props: `tags`, `isLoading`, `onTagNavigate`, `searchQuery`
   - State: `expandedIds` (Set of expanded tag IDs)

2. **`TagTreeNode.jsx`** - Individual tree node (rich mini-card)
   - Props: `tag`, `depth`, `isExpanded`, `hasChildren`, `onToggle`, `onNavigate`, `isAncestorOnly`
   - Recursive: renders its children as nested `TagTreeNode` components

**Modified components:**

1. **`ViewModeToggle.jsx`** - Add support for custom mode arrays via props
   - Currently hardcoded to grid/wall
   - Accept optional `modes` prop: `[{id, icon, label}]`
   - Tags page passes `modes={["grid", "hierarchy"]}`

2. **`Tags.jsx`** - Add view mode support
   - Use render prop from SearchControls to receive `viewMode`
   - Conditionally render `TagHierarchyView` or existing grid
   - Pass view modes config to SearchControls

3. **`SearchControls.jsx`** - Accept configurable view modes
   - Replace `supportsWallView` boolean with more flexible `viewModes` prop
   - Maintain backward compatibility with existing `supportsWallView` usage

**Utility function:**

- **`buildTagTree(tags)`** - Pure function in `utils/`
  - Takes flat tag array, returns tree structure with nested children
  - Handles multi-parent duplication
  - Returns array of root nodes, each with recursive `children` array

## User Interaction

**Keyboard navigation:**
- Arrow Up/Down: Move focus between visible nodes
- Arrow Right: Expand focused node (if collapsed) or move to first child
- Arrow Left: Collapse focused node (if expanded) or move to parent
- Enter: Navigate to tag detail page
- Home/End: Jump to first/last visible node

**Expand/collapse:**
- Chevron click or single-click on node row: Toggle expand/collapse
- State persists while on the page (resets on navigation away)

**Navigation to tag detail:**
- Double-click anywhere on the node
- Single-click the navigate icon button (visible on hover, always visible on touch)
- Enter key when node is focused

**Search/filter interaction:**
- When filters active: tree shows only matching tags + ancestors
- Ancestors shown in dimmed style (structural, not matches)
- Tree auto-expands to reveal all matches
- Clearing search restores full tree with first-level-expanded default

## Scope

**In scope:**
- New `TagHierarchyView` and `TagTreeNode` components
- `buildTagTree` utility function
- Update `ViewModeToggle` to accept configurable modes
- Update `Tags.jsx` to support view mode switching (Grid | Hierarchy)
- Update `SearchControls.jsx` to handle configurable view modes
- Rich tree nodes with thumbnails, counts, favorite indicator, navigate button
- Keyboard navigation support
- Search filtering with ancestor preservation

**Out of scope (YAGNI):**
- Drag-and-drop to reorganize tag hierarchy
- Inline editing of tag names
- Expand all / collapse all buttons
- Virtualized rendering
- Lazy-loading children on expand
- Persisting expanded state to localStorage
- Wall view for tags

## Files

**Create:**
- `client/src/components/tags/TagHierarchyView.jsx`
- `client/src/components/tags/TagTreeNode.jsx`
- `client/src/utils/buildTagTree.js`

**Modify:**
- `client/src/components/ui/ViewModeToggle.jsx`
- `client/src/components/ui/SearchControls.jsx`
- `client/src/components/pages/Tags.jsx`
