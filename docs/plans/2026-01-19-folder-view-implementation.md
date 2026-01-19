# Folder View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Folder" view mode that lets users browse content (Scenes, Galleries, Images) by navigating through the tag hierarchy visually, similar to Fossify Gallery's folder browsing.

**Architecture:** Folder view is a client-side presentation layer. Filtered content is fetched normally via existing APIs, then grouped by tag hierarchy for display. Desktop uses split-pane layout (tree sidebar + content grid); mobile uses stacked layout (breadcrumb + grid). Tag IDs in URL enable bookmarking/sharing.

**Tech Stack:** React, existing tag hierarchy utils (`buildTagTree.js`), Tailwind CSS, Lucide icons

**Design doc:** `docs/plans/2026-01-19-folder-view-design.md`

---

## Task 1: Add Folder Icon to ViewModeToggle

**Files:**
- Modify: `client/src/components/ui/ViewModeToggle.jsx:11-17`

**Step 1: Add folder icon to MODE_ICONS**

Add `LucideFolderOpen` import and mapping:

```jsx
import { useState, useEffect } from "react";
import { LucideGrid2X2, LucideSquare, LucideNetwork, LucideList, LucideCalendar, LucideFolderOpen } from "lucide-react";

// Default modes for backward compatibility
const DEFAULT_MODES = [
  { id: "grid", icon: LucideGrid2X2, label: "Grid view" },
  { id: "wall", icon: LucideSquare, label: "Wall view" },
];

// Icon mapping for custom mode definitions
const MODE_ICONS = {
  grid: LucideGrid2X2,
  wall: LucideSquare,
  hierarchy: LucideNetwork,
  table: LucideList,
  timeline: LucideCalendar,
  folder: LucideFolderOpen,
};
```

**Step 2: Verify change**

Run: `cd client && npm run lint -- --quiet`
Expected: No errors

**Step 3: Commit**

```bash
git add client/src/components/ui/ViewModeToggle.jsx
git commit -m "feat: add folder icon to ViewModeToggle icon mapping"
```

---

## Task 2: Add Folder View Mode to Entity Config

**Files:**
- Modify: `client/src/config/entityDisplayConfig.js:10-15, 50-55, 88-92`

**Step 1: Add folder mode to scene config**

Update scene viewModes array (after timeline):

```javascript
  scene: {
    label: "Scene",
    viewModes: [
      { id: "grid", label: "Grid" },
      { id: "wall", label: "Wall" },
      { id: "table", label: "Table" },
      { id: "timeline", label: "Timeline" },
      { id: "folder", label: "Folder" },
    ],
```

**Step 2: Add folder mode to gallery config**

Update gallery viewModes array (after timeline):

```javascript
  gallery: {
    label: "Gallery",
    viewModes: [
      { id: "grid", label: "Grid" },
      { id: "wall", label: "Wall" },
      { id: "table", label: "Table" },
      { id: "timeline", label: "Timeline" },
      { id: "folder", label: "Folder" },
    ],
```

**Step 3: Add folder mode to image config**

Update image viewModes array (after timeline):

```javascript
  image: {
    label: "Image",
    viewModes: [
      { id: "grid", label: "Grid" },
      { id: "wall", label: "Wall" },
      { id: "timeline", label: "Timeline" },
      { id: "folder", label: "Folder" },
    ],
```

**Step 4: Verify change**

Run: `cd client && npm run lint -- --quiet`
Expected: No errors

**Step 5: Commit**

```bash
git add client/src/config/entityDisplayConfig.js
git commit -m "feat: add folder view mode to scene, gallery, image entity configs"
```

---

## Task 3: Create FolderNode Type and Tree Builder Utility

**Files:**
- Create: `client/src/utils/buildFolderTree.js`
- Create: `client/src/utils/buildFolderTree.test.js`

**Step 1: Write the failing test**

```javascript
// client/src/utils/buildFolderTree.test.js
import { describe, it, expect } from "vitest";
import { buildFolderTree, UNTAGGED_FOLDER_ID } from "./buildFolderTree.js";

describe("buildFolderTree", () => {
  const mockTags = [
    { id: "1", name: "Color", parents: [], children: [{ id: "2" }, { id: "3" }], image_path: "/tag1.jpg" },
    { id: "2", name: "Red", parents: [{ id: "1" }], children: [], image_path: null },
    { id: "3", name: "Blue", parents: [{ id: "1" }], children: [], image_path: "/tag3.jpg" },
    { id: "4", name: "Size", parents: [], children: [], image_path: null },
  ];

  describe("buildFolderTree at root level", () => {
    it("returns top-level tags as folders at root", () => {
      const items = [
        { id: "s1", tags: [{ id: "2", name: "Red" }] },
      ];
      const result = buildFolderTree(items, mockTags, []);

      // Should have Color, Size folders + Untagged
      const folderIds = result.folders.map((f) => f.tag?.id || f.id);
      expect(folderIds).toContain("1"); // Color (parent of Red)
      expect(folderIds).toContain("4"); // Size (no content but is root tag)
      expect(folderIds).toContain(UNTAGGED_FOLDER_ID);
    });

    it("calculates recursive item count for folders", () => {
      const items = [
        { id: "s1", tags: [{ id: "2", name: "Red" }] },
        { id: "s2", tags: [{ id: "2", name: "Red" }] },
        { id: "s3", tags: [{ id: "3", name: "Blue" }] },
      ];
      const result = buildFolderTree(items, mockTags, []);

      const colorFolder = result.folders.find((f) => f.tag?.id === "1");
      expect(colorFolder.totalCount).toBe(3); // 2 Red + 1 Blue
    });

    it("puts untagged items in Untagged folder", () => {
      const items = [
        { id: "s1", tags: [] },
        { id: "s2", tags: [{ id: "2", name: "Red" }] },
      ];
      const result = buildFolderTree(items, mockTags, []);

      const untaggedFolder = result.folders.find((f) => f.id === UNTAGGED_FOLDER_ID);
      expect(untaggedFolder.totalCount).toBe(1);
    });

    it("hides folders with no matching content", () => {
      const items = [
        { id: "s1", tags: [{ id: "2", name: "Red" }] },
      ];
      const result = buildFolderTree(items, mockTags, []);

      // Size has no content, should be hidden
      const sizeFolder = result.folders.find((f) => f.tag?.id === "4");
      expect(sizeFolder).toBeUndefined();
    });
  });

  describe("buildFolderTree with path navigation", () => {
    it("shows child folders and content when navigating into a tag", () => {
      const items = [
        { id: "s1", tags: [{ id: "1", name: "Color" }, { id: "2", name: "Red" }] },
        { id: "s2", tags: [{ id: "1", name: "Color" }] }, // Tagged with Color but not a child
      ];
      const result = buildFolderTree(items, mockTags, ["1"]); // Navigate into Color

      // Should show Red, Blue as child folders
      const folderIds = result.folders.map((f) => f.tag?.id);
      expect(folderIds).toContain("2"); // Red
      expect(folderIds).toContain("3"); // Blue

      // s2 is directly tagged with Color (leaf content at this level)
      expect(result.items).toContainEqual(expect.objectContaining({ id: "s2" }));
    });

    it("returns breadcrumb path for navigation", () => {
      const items = [{ id: "s1", tags: [{ id: "2", name: "Red" }] }];
      const result = buildFolderTree(items, mockTags, ["1", "2"]); // Color > Red

      expect(result.breadcrumbs).toEqual([
        { id: "1", name: "Color" },
        { id: "2", name: "Red" },
      ]);
    });
  });

  describe("folder thumbnail", () => {
    it("uses tag image_path if available", () => {
      const items = [{ id: "s1", tags: [{ id: "1", name: "Color" }] }];
      const result = buildFolderTree(items, mockTags, []);

      const colorFolder = result.folders.find((f) => f.tag?.id === "1");
      expect(colorFolder.thumbnail).toBe("/tag1.jpg");
    });

    it("falls back to first item thumbnail if no tag image", () => {
      const items = [
        { id: "s1", tags: [{ id: "4", name: "Size" }], paths: { screenshot: "/scene1.jpg" } },
      ];
      const result = buildFolderTree(items, mockTags, []);

      const sizeFolder = result.folders.find((f) => f.tag?.id === "4");
      expect(sizeFolder.thumbnail).toBe("/scene1.jpg");
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npm test -- buildFolderTree.test.js --run`
Expected: FAIL - module not found

**Step 3: Write the implementation**

```javascript
// client/src/utils/buildFolderTree.js

export const UNTAGGED_FOLDER_ID = "__untagged__";

/**
 * Get thumbnail from an item (scene, gallery, or image)
 */
const getItemThumbnail = (item) => {
  // Scene
  if (item.paths?.screenshot) return item.paths.screenshot;
  // Gallery
  if (item.cover?.paths?.thumbnail) return item.cover.paths.thumbnail;
  // Image
  if (item.paths?.thumbnail) return item.paths.thumbnail;
  return null;
};

/**
 * Build a folder tree structure from items and tag hierarchy.
 *
 * @param {Array} items - Content items (scenes, galleries, images) with tags array
 * @param {Array} tags - All tags with hierarchy (parents/children arrays)
 * @param {Array} currentPath - Array of tag IDs representing current navigation path
 * @returns {Object} { folders: FolderNode[], items: Item[], breadcrumbs: Breadcrumb[] }
 */
export function buildFolderTree(items, tags, currentPath = []) {
  if (!items || !tags) {
    return { folders: [], items: [], breadcrumbs: [] };
  }

  // Build tag lookup map
  const tagMap = new Map();
  tags.forEach((tag) => tagMap.set(tag.id, tag));

  // Build breadcrumbs from path
  const breadcrumbs = currentPath.map((id) => {
    const tag = tagMap.get(id);
    return { id, name: tag?.name || "Unknown" };
  });

  // Determine which tags to show as folders at this level
  const currentTagId = currentPath[currentPath.length - 1] || null;
  const currentTag = currentTagId ? tagMap.get(currentTagId) : null;

  // Get child tag IDs for current level
  let childTagIds;
  if (currentTag) {
    // Inside a tag - show its children
    childTagIds = new Set((currentTag.children || []).map((c) => c.id));
  } else {
    // At root - show top-level tags (no parents)
    childTagIds = new Set(
      tags.filter((t) => !t.parents || t.parents.length === 0).map((t) => t.id)
    );
  }

  // Group items by which folder they belong to at this level
  const folderContents = new Map(); // tagId -> items[]
  const leafItems = []; // Items that are "directly" at this level
  const untaggedItems = [];

  items.forEach((item) => {
    const itemTagIds = new Set((item.tags || []).map((t) => t.id));

    // Check if item has no tags
    if (itemTagIds.size === 0) {
      if (currentPath.length === 0) {
        // Only show untagged at root
        untaggedItems.push(item);
      }
      return;
    }

    // Check if item belongs to any child folder at this level
    let belongsToChildFolder = false;
    childTagIds.forEach((childId) => {
      // Item belongs to this folder if it has the tag or any descendant
      if (itemHasTagOrDescendant(item, childId, tagMap)) {
        if (!folderContents.has(childId)) {
          folderContents.set(childId, []);
        }
        folderContents.get(childId).push(item);
        belongsToChildFolder = true;
      }
    });

    // If at root and item doesn't belong to any root-level folder, it's a leaf
    // If inside a tag and item is directly tagged with current tag but not children, it's a leaf
    if (!belongsToChildFolder) {
      if (currentTagId && itemTagIds.has(currentTagId)) {
        leafItems.push(item);
      } else if (!currentTagId) {
        // At root with tags but none are root-level tags - treat as leaf
        leafItems.push(item);
      }
    }
  });

  // Build folder nodes (only folders with content)
  const folders = [];

  childTagIds.forEach((tagId) => {
    const tag = tagMap.get(tagId);
    if (!tag) return;

    const folderItems = folderContents.get(tagId) || [];
    if (folderItems.length === 0) return; // Hide empty folders

    // Calculate total count (recursive)
    const totalCount = folderItems.length;

    // Get thumbnail
    const thumbnail = tag.image_path || getItemThumbnail(folderItems[0]) || null;

    folders.push({
      id: tagId,
      tag,
      name: tag.name,
      thumbnail,
      totalCount,
      isFolder: true,
    });
  });

  // Add untagged folder if at root and has items
  if (currentPath.length === 0 && untaggedItems.length > 0) {
    folders.push({
      id: UNTAGGED_FOLDER_ID,
      tag: null,
      name: "Untagged",
      thumbnail: getItemThumbnail(untaggedItems[0]),
      totalCount: untaggedItems.length,
      isFolder: true,
    });
  }

  // Sort folders alphabetically
  folders.sort((a, b) => a.name.localeCompare(b.name));

  // Combine leaf items with untagged if at root
  const displayItems = currentPath.length === 0
    ? [...leafItems, ...untaggedItems]
    : leafItems;

  return {
    folders,
    items: displayItems,
    breadcrumbs,
  };
}

/**
 * Check if an item has a tag or any of its descendants
 */
function itemHasTagOrDescendant(item, tagId, tagMap, visited = new Set()) {
  if (visited.has(tagId)) return false;
  visited.add(tagId);

  const itemTagIds = new Set((item.tags || []).map((t) => t.id));

  // Direct match
  if (itemTagIds.has(tagId)) return true;

  // Check descendants
  const tag = tagMap.get(tagId);
  if (tag?.children) {
    for (const child of tag.children) {
      if (itemHasTagOrDescendant(item, child.id, tagMap, visited)) {
        return true;
      }
    }
  }

  return false;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd client && npm test -- buildFolderTree.test.js --run`
Expected: PASS (all tests)

**Step 5: Commit**

```bash
git add client/src/utils/buildFolderTree.js client/src/utils/buildFolderTree.test.js
git commit -m "feat: add buildFolderTree utility for folder view grouping"
```

---

## Task 4: Create FolderCard Component

**Files:**
- Create: `client/src/components/folder/FolderCard.jsx`

**Step 1: Create FolderCard component**

```jsx
// client/src/components/folder/FolderCard.jsx
import { LucideFolder, LucideTag } from "lucide-react";
import { UNTAGGED_FOLDER_ID } from "../../utils/buildFolderTree.js";

/**
 * Card component for displaying a folder (tag) in folder view.
 * Shows thumbnail, folder name, and item count.
 */
const FolderCard = ({ folder, onClick, className = "" }) => {
  const { name, thumbnail, totalCount, id } = folder;
  const isUntagged = id === UNTAGGED_FOLDER_ID;

  return (
    <button
      type="button"
      onClick={() => onClick(folder)}
      className={`group relative rounded-lg overflow-hidden transition-all hover:ring-2 hover:ring-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)] ${className}`}
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {/* Thumbnail area */}
      <div className="aspect-video relative overflow-hidden">
        {thumbnail ? (
          <img
            src={thumbnail}
            alt={name}
            className="w-full h-full object-cover transition-transform group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            {isUntagged ? (
              <LucideTag size={48} style={{ color: "var(--text-tertiary)" }} />
            ) : (
              <LucideFolder size={48} style={{ color: "var(--text-tertiary)" }} />
            )}
          </div>
        )}

        {/* Folder overlay icon */}
        <div
          className="absolute bottom-2 right-2 p-1.5 rounded-md"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
        >
          <LucideFolder size={16} className="text-white" />
        </div>
      </div>

      {/* Label area */}
      <div className="p-3">
        <h3
          className="font-medium truncate text-left"
          style={{ color: "var(--text-primary)" }}
        >
          {name}
        </h3>
        <p
          className="text-sm text-left"
          style={{ color: "var(--text-secondary)" }}
        >
          {totalCount} {totalCount === 1 ? "item" : "items"}
        </p>
      </div>
    </button>
  );
};

export default FolderCard;
```

**Step 2: Verify change**

Run: `cd client && npm run lint -- --quiet`
Expected: No errors

**Step 3: Commit**

```bash
git add client/src/components/folder/FolderCard.jsx
git commit -m "feat: add FolderCard component for folder view"
```

---

## Task 5: Create Breadcrumb Component

**Files:**
- Create: `client/src/components/folder/FolderBreadcrumb.jsx`

**Step 1: Create breadcrumb component**

```jsx
// client/src/components/folder/FolderBreadcrumb.jsx
import { LucideChevronRight, LucideHome } from "lucide-react";

/**
 * Breadcrumb navigation for folder view.
 * Shows current path and allows jumping to any level.
 */
const FolderBreadcrumb = ({ breadcrumbs, onNavigate, className = "" }) => {
  return (
    <nav
      className={`flex items-center gap-1 text-sm flex-wrap ${className}`}
      aria-label="Folder navigation"
    >
      {/* Root/Home */}
      <button
        type="button"
        onClick={() => onNavigate([])}
        className="flex items-center gap-1 px-2 py-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
        style={{ color: breadcrumbs.length === 0 ? "var(--text-primary)" : "var(--text-secondary)" }}
      >
        <LucideHome size={14} />
        <span>All</span>
      </button>

      {breadcrumbs.map((crumb, index) => {
        const isLast = index === breadcrumbs.length - 1;
        const pathToHere = breadcrumbs.slice(0, index + 1).map((b) => b.id);

        return (
          <span key={crumb.id} className="flex items-center gap-1">
            <LucideChevronRight
              size={14}
              style={{ color: "var(--text-tertiary)" }}
            />
            <button
              type="button"
              onClick={() => onNavigate(pathToHere)}
              className="px-2 py-1 rounded hover:bg-[var(--bg-tertiary)] transition-colors truncate max-w-[150px]"
              style={{ color: isLast ? "var(--text-primary)" : "var(--text-secondary)" }}
              title={crumb.name}
            >
              {crumb.name}
            </button>
          </span>
        );
      })}
    </nav>
  );
};

export default FolderBreadcrumb;
```

**Step 2: Verify change**

Run: `cd client && npm run lint -- --quiet`
Expected: No errors

**Step 3: Commit**

```bash
git add client/src/components/folder/FolderBreadcrumb.jsx
git commit -m "feat: add FolderBreadcrumb component for folder navigation"
```

---

## Task 6: Create FolderTreeSidebar Component (Desktop)

**Files:**
- Create: `client/src/components/folder/FolderTreeSidebar.jsx`

**Step 1: Create tree sidebar component**

```jsx
// client/src/components/folder/FolderTreeSidebar.jsx
import { useState, useMemo } from "react";
import { LucideChevronRight, LucideChevronDown, LucideFolder, LucideFolderOpen } from "lucide-react";
import { buildTagTree } from "../../utils/buildTagTree.js";

/**
 * Collapsible tree sidebar for folder view on desktop.
 * Shows tag hierarchy with expand/collapse controls.
 */
const FolderTreeSidebar = ({ tags, currentPath, onNavigate, className = "" }) => {
  // Build tree from tags
  const tree = useMemo(() => buildTagTree(tags, { sortField: "name", sortDirection: "ASC" }), [tags]);

  // Track expanded nodes
  const [expanded, setExpanded] = useState(() => {
    // Auto-expand nodes in current path
    return new Set(currentPath);
  });

  const toggleExpanded = (tagId) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) {
        next.delete(tagId);
      } else {
        next.add(tagId);
      }
      return next;
    });
  };

  const handleNodeClick = (tagId) => {
    // Build path to this node
    const path = findPathToTag(tree, tagId);
    onNavigate(path);
  };

  return (
    <div
      className={`overflow-y-auto ${className}`}
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderRight: "1px solid var(--border-color)",
      }}
    >
      {/* Root level */}
      <button
        type="button"
        onClick={() => onNavigate([])}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--bg-tertiary)] transition-colors ${
          currentPath.length === 0 ? "bg-[var(--bg-tertiary)]" : ""
        }`}
        style={{ color: "var(--text-primary)" }}
      >
        <LucideFolderOpen size={16} />
        <span className="font-medium">All Content</span>
      </button>

      {/* Tree nodes */}
      <div className="pb-4">
        {tree.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            depth={0}
            expanded={expanded}
            toggleExpanded={toggleExpanded}
            currentPath={currentPath}
            onNavigate={handleNodeClick}
          />
        ))}
      </div>
    </div>
  );
};

const TreeNode = ({ node, depth, expanded, toggleExpanded, currentPath, onNavigate }) => {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isInPath = currentPath.includes(node.id);
  const isCurrentNode = currentPath[currentPath.length - 1] === node.id;

  return (
    <div>
      <div
        className={`flex items-center hover:bg-[var(--bg-tertiary)] transition-colors ${
          isCurrentNode ? "bg-[var(--bg-tertiary)]" : ""
        }`}
        style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}
      >
        {/* Expand/collapse button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded(node.id);
          }}
          className="p-1 hover:bg-[var(--bg-primary)] rounded"
          style={{ visibility: hasChildren ? "visible" : "hidden" }}
        >
          {isExpanded ? (
            <LucideChevronDown size={14} style={{ color: "var(--text-tertiary)" }} />
          ) : (
            <LucideChevronRight size={14} style={{ color: "var(--text-tertiary)" }} />
          )}
        </button>

        {/* Node button */}
        <button
          type="button"
          onClick={() => onNavigate(node.id)}
          className="flex-1 flex items-center gap-2 py-1.5 pr-3 text-left truncate"
          style={{
            color: isInPath ? "var(--accent-primary)" : "var(--text-primary)",
            fontWeight: isCurrentNode ? 600 : 400,
          }}
        >
          {isExpanded ? (
            <LucideFolderOpen size={14} />
          ) : (
            <LucideFolder size={14} />
          )}
          <span className="truncate">{node.name}</span>
        </button>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
              currentPath={currentPath}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * Find path from root to a given tag ID
 */
function findPathToTag(tree, targetId, currentPath = []) {
  for (const node of tree) {
    if (node.id === targetId) {
      return [...currentPath, node.id];
    }
    if (node.children && node.children.length > 0) {
      const found = findPathToTag(node.children, targetId, [...currentPath, node.id]);
      if (found) return found;
    }
  }
  return null;
}

export default FolderTreeSidebar;
```

**Step 2: Verify change**

Run: `cd client && npm run lint -- --quiet`
Expected: No errors

**Step 3: Commit**

```bash
git add client/src/components/folder/FolderTreeSidebar.jsx
git commit -m "feat: add FolderTreeSidebar component for desktop folder view"
```

---

## Task 7: Create Main FolderView Component

**Files:**
- Create: `client/src/components/folder/FolderView.jsx`
- Create: `client/src/components/folder/index.js`

**Step 1: Create FolderView component**

```jsx
// client/src/components/folder/FolderView.jsx
import { useState, useMemo, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { getGridClasses } from "../../constants/grids.js";
import { buildFolderTree } from "../../utils/buildFolderTree.js";
import FolderCard from "./FolderCard.jsx";
import FolderBreadcrumb from "./FolderBreadcrumb.jsx";
import FolderTreeSidebar from "./FolderTreeSidebar.jsx";

/**
 * Folder view for browsing content by tag hierarchy.
 * Desktop: Split-pane with tree sidebar + content grid
 * Mobile: Stacked with breadcrumb + content grid
 */
const FolderView = ({
  items,
  tags,
  entityType,
  renderItem,
  gridDensity = "medium",
  loading = false,
  emptyMessage = "No items found",
}) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse path from URL
  const currentPath = useMemo(() => {
    const pathParam = searchParams.get("folderPath");
    return pathParam ? pathParam.split(",").filter(Boolean) : [];
  }, [searchParams]);

  // Update URL when path changes
  const setCurrentPath = useCallback(
    (newPath) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (newPath.length > 0) {
          next.set("folderPath", newPath.join(","));
        } else {
          next.delete("folderPath");
        }
        return next;
      });
    },
    [setSearchParams]
  );

  // Build folder tree from items and tags
  const { folders, items: leafItems, breadcrumbs } = useMemo(
    () => buildFolderTree(items, tags, currentPath),
    [items, tags, currentPath]
  );

  // Handle folder click - navigate into folder
  const handleFolderClick = useCallback(
    (folder) => {
      if (folder.id === "__untagged__") {
        // Can't navigate into untagged
        return;
      }
      setCurrentPath([...currentPath, folder.id]);
    },
    [currentPath, setCurrentPath]
  );

  // Handle breadcrumb navigation
  const handleBreadcrumbNavigate = useCallback(
    (path) => {
      setCurrentPath(path);
    },
    [setCurrentPath]
  );

  // Sidebar collapsed state (desktop only)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Check if we're on mobile
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  const gridClasses = getGridClasses("standard", gridDensity);

  // Loading state
  if (loading) {
    return (
      <div className={gridClasses}>
        {[...Array(12)].map((_, i) => (
          <div
            key={i}
            className="rounded-lg animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              height: "12rem",
            }}
          />
        ))}
      </div>
    );
  }

  // Mobile layout
  if (isMobile) {
    return (
      <div className="space-y-4">
        {/* Breadcrumb */}
        <FolderBreadcrumb
          breadcrumbs={breadcrumbs}
          onNavigate={handleBreadcrumbNavigate}
        />

        {/* Content grid */}
        <div className={gridClasses}>
          {/* Folders first */}
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              onClick={handleFolderClick}
            />
          ))}

          {/* Then leaf items */}
          {leafItems.map((item) => renderItem(item))}
        </div>

        {/* Empty state */}
        {folders.length === 0 && leafItems.length === 0 && (
          <div
            className="text-center py-12"
            style={{ color: "var(--text-secondary)" }}
          >
            {emptyMessage}
          </div>
        )}
      </div>
    );
  }

  // Desktop layout with sidebar
  return (
    <div className="flex gap-0 -mx-4 sm:-mx-6 lg:-mx-8">
      {/* Sidebar */}
      {!sidebarCollapsed && (
        <FolderTreeSidebar
          tags={tags}
          currentPath={currentPath}
          onNavigate={setCurrentPath}
          className="w-64 flex-shrink-0 h-[calc(100vh-200px)] sticky top-4"
        />
      )}

      {/* Main content */}
      <div className="flex-1 px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb + collapse toggle */}
        <div className="flex items-center gap-4 mb-4">
          <button
            type="button"
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="p-2 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
            title={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="currentColor"
              style={{ color: "var(--text-secondary)" }}
            >
              <rect x="1" y="2" width="4" height="12" rx="1" />
              <rect x="7" y="2" width="8" height="12" rx="1" opacity="0.5" />
            </svg>
          </button>

          <FolderBreadcrumb
            breadcrumbs={breadcrumbs}
            onNavigate={handleBreadcrumbNavigate}
            className="flex-1"
          />
        </div>

        {/* Content grid */}
        <div className={gridClasses}>
          {/* Folders first */}
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              onClick={handleFolderClick}
            />
          ))}

          {/* Then leaf items */}
          {leafItems.map((item) => renderItem(item))}
        </div>

        {/* Empty state */}
        {folders.length === 0 && leafItems.length === 0 && (
          <div
            className="text-center py-12"
            style={{ color: "var(--text-secondary)" }}
          >
            {emptyMessage}
          </div>
        )}
      </div>
    </div>
  );
};

export default FolderView;
```

**Step 2: Create index export**

```javascript
// client/src/components/folder/index.js
export { default as FolderView } from "./FolderView.jsx";
export { default as FolderCard } from "./FolderCard.jsx";
export { default as FolderBreadcrumb } from "./FolderBreadcrumb.jsx";
export { default as FolderTreeSidebar } from "./FolderTreeSidebar.jsx";
```

**Step 3: Verify changes**

Run: `cd client && npm run lint -- --quiet`
Expected: No errors

**Step 4: Commit**

```bash
git add client/src/components/folder/
git commit -m "feat: add FolderView component with desktop/mobile layouts"
```

---

## Task 8: Create Hook for Fetching All Tags

**Files:**
- Create: `client/src/hooks/useFolderViewTags.js`

**Step 1: Create the hook**

```javascript
// client/src/hooks/useFolderViewTags.js
import { useState, useEffect, useRef } from "react";
import { libraryApi } from "../services/api.js";

/**
 * Hook to fetch all tags with hierarchy for folder view.
 * Only fetches when folder view is active.
 */
export function useFolderViewTags(isActive) {
  const [tags, setTags] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (!isActive || fetchedRef.current) return;

    const fetchTags = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await libraryApi.findTags({
          filter: {
            per_page: -1,
            sort: "name",
            direction: "ASC",
          },
        });

        const fetchedTags = result?.findTags?.tags || [];
        setTags(fetchedTags);
        fetchedRef.current = true;
      } catch (err) {
        console.error("Failed to fetch tags for folder view:", err);
        setError(err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchTags();
  }, [isActive]);

  return { tags, isLoading, error };
}
```

**Step 2: Verify change**

Run: `cd client && npm run lint -- --quiet`
Expected: No errors

**Step 3: Commit**

```bash
git add client/src/hooks/useFolderViewTags.js
git commit -m "feat: add useFolderViewTags hook for folder view"
```

---

## Task 9: Integrate Folder View into Galleries Page

**Files:**
- Modify: `client/src/components/pages/Galleries.jsx`

**Step 1: Add imports**

Add at top of file after existing imports:

```jsx
import { FolderView } from "../folder/index.js";
import { useFolderViewTags } from "../../hooks/useFolderViewTags.js";
```

**Step 2: Add folder view mode to VIEW_MODES array**

Update the VIEW_MODES constant:

```jsx
// View modes available for galleries page
const VIEW_MODES = [
  { id: "grid", label: "Grid view" },
  { id: "wall", label: "Wall view" },
  { id: "table", label: "Table view" },
  { id: "timeline", label: "Timeline view" },
  { id: "folder", label: "Folder view" },
];
```

**Step 3: Add useFolderViewTags hook**

Inside the Galleries component, after the useTableColumns hook:

```jsx
  // Fetch tags for folder view (only when folder view is active)
  const { tags: folderTags, isLoading: tagsLoading } = useFolderViewTags(
    currentViewMode === "folder"
  );
```

**Step 4: Add folder view rendering**

In the render function, add folder view case after timeline and before the loading/grid fallback. Find the section that starts with `viewMode === "timeline" ?` and add after its closing paren:

```jsx
            ) : viewMode === "folder" ? (
              <FolderView
                items={currentGalleries}
                tags={folderTags}
                entityType="gallery"
                gridDensity={gridDensity}
                loading={isLoading || tagsLoading}
                emptyMessage="No galleries found"
                renderItem={(gallery) => (
                  <GalleryCard
                    key={gallery.id}
                    gallery={gallery}
                    fromPageTitle="Galleries"
                    tabIndex={0}
                  />
                )}
              />
```

**Step 5: Verify changes**

Run: `cd client && npm run lint -- --quiet`
Expected: No errors

**Step 6: Commit**

```bash
git add client/src/components/pages/Galleries.jsx
git commit -m "feat: integrate folder view into Galleries page"
```

---

## Task 10: Integrate Folder View into SceneSearch Page

**Files:**
- Modify: `client/src/components/scene-search/SceneSearch.jsx`

**Step 1: Add imports**

Add after existing imports:

```jsx
import { FolderView } from "../folder/index.js";
import { useFolderViewTags } from "../../hooks/useFolderViewTags.js";
```

**Step 2: Add folder view mode to VIEW_MODES array**

Find and update the VIEW_MODES constant to include folder:

```jsx
const VIEW_MODES = [
  { id: "grid", label: "Grid view" },
  { id: "wall", label: "Wall view" },
  { id: "table", label: "Table view" },
  { id: "timeline", label: "Timeline view" },
  { id: "folder", label: "Folder view" },
];
```

**Step 3: Add useFolderViewTags hook**

Inside the component, add the hook call (you'll need to track current view mode state first if not already tracked):

```jsx
  // Fetch tags for folder view
  const { tags: folderTags, isLoading: tagsLoading } = useFolderViewTags(
    viewMode === "folder"
  );
```

**Step 4: Add folder view rendering**

Add folder view case in the render function after timeline view.

**Step 5: Verify changes**

Run: `cd client && npm run lint -- --quiet`
Expected: No errors

**Step 6: Commit**

```bash
git add client/src/components/scene-search/SceneSearch.jsx
git commit -m "feat: integrate folder view into SceneSearch page"
```

---

## Task 11: Integrate Folder View into Images Page

**Files:**
- Modify: `client/src/components/pages/Images.jsx`

**Step 1: Add imports**

Add after existing imports:

```jsx
import { FolderView } from "../folder/index.js";
import { useFolderViewTags } from "../../hooks/useFolderViewTags.js";
```

**Step 2: Add folder view mode to VIEW_MODES array**

Update the VIEW_MODES constant:

```jsx
const VIEW_MODES = [
  { id: "grid", label: "Grid view" },
  { id: "wall", label: "Wall view" },
  { id: "timeline", label: "Timeline view" },
  { id: "folder", label: "Folder view" },
];
```

**Step 3: Add useFolderViewTags hook**

Inside the component:

```jsx
  // Fetch tags for folder view
  const { tags: folderTags, isLoading: tagsLoading } = useFolderViewTags(
    currentViewMode === "folder"
  );
```

**Step 4: Add folder view rendering**

Add folder view case in the render function after timeline view.

**Step 5: Verify changes**

Run: `cd client && npm run lint -- --quiet`
Expected: No errors

**Step 6: Commit**

```bash
git add client/src/components/pages/Images.jsx
git commit -m "feat: integrate folder view into Images page"
```

---

## Task 12: Manual Testing and Bug Fixes

**Step 1: Start dev environment**

Run: `docker-compose up --build -d`

**Step 2: Test folder view on Galleries**

1. Navigate to Galleries page
2. Click folder view icon in view mode toggle
3. Verify folders appear for tags that have galleries
4. Click a folder to drill down
5. Verify breadcrumb shows path
6. Click breadcrumb to navigate back
7. Test on mobile viewport (resize browser)

**Step 3: Test folder view on Scenes**

Repeat same tests for Scenes page.

**Step 4: Test folder view on Images**

Repeat same tests for Images page.

**Step 5: Test filter interaction**

1. Apply a filter (e.g., studio filter)
2. Verify only folders with matching content appear
3. Verify counts reflect filtered totals

**Step 6: Test URL persistence**

1. Navigate into a folder
2. Copy URL
3. Refresh page
4. Verify same folder is shown

**Step 7: Fix any bugs discovered**

Document and fix any issues found during testing.

**Step 8: Commit fixes**

```bash
git add -A
git commit -m "fix: address folder view bugs from manual testing"
```

---

## Task 13: Final Cleanup and PR Preparation

**Step 1: Run full lint check**

Run: `cd client && npm run lint`
Expected: No errors or warnings

**Step 2: Run all tests**

Run: `cd client && npm test -- --run`
Expected: All tests pass

**Step 3: Update design doc status**

Change status from "Design" to "Implemented" in `docs/plans/2026-01-19-folder-view-design.md`.

**Step 4: Commit**

```bash
git add -A
git commit -m "docs: mark folder view design as implemented"
```

**Step 5: Create PR**

```bash
gh pr create --title "feat: Add folder view mode for browsing content by tag hierarchy" --body "$(cat <<'EOF'
## Summary
- Adds new "Folder" view mode to Scenes, Galleries, and Images pages
- Browse content by navigating through tag hierarchy visually (like Fossify Gallery)
- Desktop: Split-pane layout with collapsible tree sidebar
- Mobile: Breadcrumb navigation with stacked grid

## Changes
- New `FolderView` component with responsive layouts
- New `FolderCard`, `FolderBreadcrumb`, `FolderTreeSidebar` components
- New `buildFolderTree` utility for grouping items by tag hierarchy
- New `useFolderViewTags` hook for fetching tag data
- Integration into Galleries, SceneSearch, Images pages

## Test plan
- [ ] Test folder navigation on Galleries page
- [ ] Test folder navigation on Scenes page
- [ ] Test folder navigation on Images page
- [ ] Test with filters applied
- [ ] Test URL persistence (refresh maintains folder path)
- [ ] Test desktop layout with sidebar toggle
- [ ] Test mobile layout with breadcrumb
- [ ] Test empty states and untagged folder

Closes #223

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Add folder icon to ViewModeToggle | ViewModeToggle.jsx |
| 2 | Add folder mode to entity config | entityDisplayConfig.js |
| 3 | Create buildFolderTree utility + tests | buildFolderTree.js, test |
| 4 | Create FolderCard component | FolderCard.jsx |
| 5 | Create FolderBreadcrumb component | FolderBreadcrumb.jsx |
| 6 | Create FolderTreeSidebar component | FolderTreeSidebar.jsx |
| 7 | Create main FolderView component | FolderView.jsx, index.js |
| 8 | Create useFolderViewTags hook | useFolderViewTags.js |
| 9 | Integrate into Galleries page | Galleries.jsx |
| 10 | Integrate into SceneSearch page | SceneSearch.jsx |
| 11 | Integrate into Images page | Images.jsx |
| 12 | Manual testing and bug fixes | Various |
| 13 | Final cleanup and PR | docs, PR |
