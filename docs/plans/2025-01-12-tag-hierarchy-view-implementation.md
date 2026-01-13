# Tag Hierarchy View Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Hierarchy view mode to the Tags page that displays tags as an expandable tree based on parent/child relationships.

**Architecture:** Client-side tree building from existing tag data. New TagHierarchyView and TagTreeNode components render the tree. ViewModeToggle extended to support configurable modes. SearchControls updated for flexible view mode handling.

**Tech Stack:** React, Tailwind CSS, Lucide icons, Vitest for testing

---

## Task 1: Create buildTagTree utility

**Files:**
- Create: `client/src/utils/buildTagTree.js`
- Create: `client/tests/utils/buildTagTree.test.js`

**Step 1: Write the failing tests**

```javascript
// client/tests/utils/buildTagTree.test.js
import { describe, it, expect } from "vitest";
import { buildTagTree } from "../../src/utils/buildTagTree.js";

describe("buildTagTree", () => {
  it("returns empty array for empty input", () => {
    expect(buildTagTree([])).toEqual([]);
  });

  it("returns root tags (no parents) at top level", () => {
    const tags = [
      { id: "1", name: "Root1", parents: [], children: [] },
      { id: "2", name: "Root2", parents: [], children: [] },
    ];
    const result = buildTagTree(tags);
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("1");
    expect(result[1].id).toBe("2");
  });

  it("nests children under their parents", () => {
    const tags = [
      { id: "1", name: "Parent", parents: [], children: [{ id: "2", name: "Child" }] },
      { id: "2", name: "Child", parents: [{ id: "1", name: "Parent" }], children: [] },
    ];
    const result = buildTagTree(tags);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1");
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].id).toBe("2");
  });

  it("duplicates tags under multiple parents", () => {
    const tags = [
      { id: "1", name: "Parent1", parents: [], children: [{ id: "3", name: "Child" }] },
      { id: "2", name: "Parent2", parents: [], children: [{ id: "3", name: "Child" }] },
      { id: "3", name: "Child", parents: [{ id: "1", name: "Parent1" }, { id: "2", name: "Parent2" }], children: [] },
    ];
    const result = buildTagTree(tags);
    expect(result).toHaveLength(2);
    // Child appears under both parents
    expect(result[0].children).toHaveLength(1);
    expect(result[0].children[0].id).toBe("3");
    expect(result[1].children).toHaveLength(1);
    expect(result[1].children[0].id).toBe("3");
  });

  it("handles deep nesting (grandchildren)", () => {
    const tags = [
      { id: "1", name: "Grandparent", parents: [], children: [{ id: "2", name: "Parent" }] },
      { id: "2", name: "Parent", parents: [{ id: "1", name: "Grandparent" }], children: [{ id: "3", name: "Child" }] },
      { id: "3", name: "Child", parents: [{ id: "2", name: "Parent" }], children: [] },
    ];
    const result = buildTagTree(tags);
    expect(result).toHaveLength(1);
    expect(result[0].children[0].children[0].id).toBe("3");
  });

  it("preserves original tag properties", () => {
    const tags = [
      { id: "1", name: "Tag", parents: [], children: [], scene_count: 42, favorite: true },
    ];
    const result = buildTagTree(tags);
    expect(result[0].scene_count).toBe(42);
    expect(result[0].favorite).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd C:/Users/carrotwaxr/code/peek-stash-browser/client && npm test -- --run buildTagTree`
Expected: FAIL - module not found

**Step 3: Write minimal implementation**

```javascript
// client/src/utils/buildTagTree.js
/**
 * Builds a tree structure from a flat array of tags with parent/child relationships.
 * Tags with multiple parents will appear under each parent (duplicated in tree).
 *
 * @param {Array} tags - Flat array of tag objects with `parents` and `children` arrays
 * @returns {Array} Array of root tree nodes, each with nested `children` array
 */
export function buildTagTree(tags) {
  if (!tags || tags.length === 0) {
    return [];
  }

  // Create a map for quick lookup
  const tagMap = new Map();
  tags.forEach((tag) => {
    tagMap.set(tag.id, { ...tag, children: [] });
  });

  // Build tree by nesting children under parents
  const roots = [];

  tags.forEach((tag) => {
    const treeNode = tagMap.get(tag.id);

    if (!tag.parents || tag.parents.length === 0) {
      // No parents = root node
      roots.push(treeNode);
    } else {
      // Add to each parent's children (handles multi-parent)
      tag.parents.forEach((parentRef) => {
        const parentNode = tagMap.get(parentRef.id);
        if (parentNode) {
          // Create a copy for each parent to avoid shared references
          const childCopy = { ...treeNode, children: [] };
          parentNode.children.push(childCopy);
        }
      });
    }
  });

  // Recursively populate children for non-root nodes
  function populateChildren(node) {
    const originalTag = tags.find((t) => t.id === node.id);
    if (originalTag?.children) {
      node.children = originalTag.children
        .map((childRef) => {
          const childTag = tagMap.get(childRef.id);
          if (childTag) {
            const childCopy = { ...childTag, children: [] };
            populateChildren(childCopy);
            return childCopy;
          }
          return null;
        })
        .filter(Boolean);
    }
  }

  roots.forEach(populateChildren);

  return roots;
}
```

**Step 4: Run test to verify it passes**

Run: `cd C:/Users/carrotwaxr/code/peek-stash-browser/client && npm test -- --run buildTagTree`
Expected: All tests PASS

**Step 5: Commit**

```bash
git -C C:/Users/carrotwaxr/code/peek-stash-browser add client/src/utils/buildTagTree.js client/tests/utils/buildTagTree.test.js
git -C C:/Users/carrotwaxr/code/peek-stash-browser commit -m "feat: add buildTagTree utility for hierarchy view"
```

---

## Task 2: Update ViewModeToggle to support configurable modes

**Files:**
- Modify: `client/src/components/ui/ViewModeToggle.jsx`
- Create: `client/tests/components/ui/ViewModeToggle.test.jsx`

**Step 1: Write the failing tests**

```jsx
// client/tests/components/ui/ViewModeToggle.test.jsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ViewModeToggle from "../../../src/components/ui/ViewModeToggle.jsx";

describe("ViewModeToggle", () => {
  it("renders default grid/wall modes when no modes prop", () => {
    render(<ViewModeToggle value="grid" onChange={() => {}} />);
    expect(screen.getByLabelText("Grid view")).toBeInTheDocument();
    expect(screen.getByLabelText("Wall view")).toBeInTheDocument();
  });

  it("renders custom modes when modes prop provided", () => {
    const modes = [
      { id: "grid", label: "Grid view" },
      { id: "hierarchy", label: "Hierarchy view" },
    ];
    render(<ViewModeToggle modes={modes} value="grid" onChange={() => {}} />);
    expect(screen.getByLabelText("Grid view")).toBeInTheDocument();
    expect(screen.getByLabelText("Hierarchy view")).toBeInTheDocument();
    expect(screen.queryByLabelText("Wall view")).not.toBeInTheDocument();
  });

  it("calls onChange with mode id when clicked", () => {
    const onChange = vi.fn();
    const modes = [
      { id: "grid", label: "Grid view" },
      { id: "hierarchy", label: "Hierarchy view" },
    ];
    render(<ViewModeToggle modes={modes} value="grid" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText("Hierarchy view"));
    expect(onChange).toHaveBeenCalledWith("hierarchy");
  });

  it("highlights the active mode", () => {
    const modes = [
      { id: "grid", label: "Grid view" },
      { id: "hierarchy", label: "Hierarchy view" },
    ];
    render(<ViewModeToggle modes={modes} value="hierarchy" onChange={() => {}} />);
    const hierarchyBtn = screen.getByLabelText("Hierarchy view");
    expect(hierarchyBtn).toHaveAttribute("aria-pressed", "true");
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd C:/Users/carrotwaxr/code/peek-stash-browser/client && npm test -- --run ViewModeToggle`
Expected: FAIL - custom modes not rendered

**Step 3: Update implementation**

```jsx
// client/src/components/ui/ViewModeToggle.jsx
import { LucideGrid2X2, LucideSquare, LucideNetwork } from "lucide-react";

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
};

/**
 * Toggle between view modes.
 *
 * @param {Array} modes - Optional custom modes array [{id, label, icon?}]
 *                        If not provided, defaults to grid/wall
 * @param {string} value - Currently selected mode id
 * @param {function} onChange - Called with mode id when selection changes
 */
const ViewModeToggle = ({ modes, value = "grid", onChange, className = "" }) => {
  // Use custom modes or fall back to defaults
  const effectiveModes = modes
    ? modes.map((mode) => ({
        ...mode,
        icon: mode.icon || MODE_ICONS[mode.id] || LucideGrid2X2,
      }))
    : DEFAULT_MODES;

  return (
    <div
      className={`inline-flex rounded-lg overflow-hidden ${className}`}
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
      }}
    >
      {effectiveModes.map((mode) => (
        <button
          key={mode.id}
          type="button"
          onClick={() => onChange(mode.id)}
          className="px-3 py-1.5 transition-colors"
          style={{
            backgroundColor: value === mode.id ? "var(--accent-primary)" : "transparent",
            color: value === mode.id ? "white" : "var(--text-secondary)",
          }}
          title={mode.label}
          aria-label={mode.label}
          aria-pressed={value === mode.id}
        >
          <mode.icon size={18} />
        </button>
      ))}
    </div>
  );
};

export default ViewModeToggle;
```

**Step 4: Run test to verify it passes**

Run: `cd C:/Users/carrotwaxr/code/peek-stash-browser/client && npm test -- --run ViewModeToggle`
Expected: All tests PASS

**Step 5: Commit**

```bash
git -C C:/Users/carrotwaxr/code/peek-stash-browser add client/src/components/ui/ViewModeToggle.jsx client/tests/components/ui/ViewModeToggle.test.jsx
git -C C:/Users/carrotwaxr/code/peek-stash-browser commit -m "feat: ViewModeToggle supports custom modes prop"
```

---

## Task 3: Update SearchControls for configurable view modes

**Files:**
- Modify: `client/src/components/ui/SearchControls.jsx`

**Step 1: Identify changes needed**

The current SearchControls uses `supportsWallView` boolean. We need to:
1. Add `viewModes` prop (array of mode configs)
2. Keep `supportsWallView` for backward compatibility (converts to viewModes internally)
3. Pass `modes` prop to ViewModeToggle

**Step 2: Update implementation**

In `SearchControls.jsx`, find the props destructuring (around line 100) and add:

```jsx
// View mode props
supportsWallView = false,
viewModes, // New: array of {id, label} for custom view modes
wallPlayback = "autoplay",
```

Find where ViewModeToggle is rendered (around line 758) and update:

```jsx
{/* View Mode Toggle - Show if supportsWallView or viewModes provided */}
{(supportsWallView || viewModes) && (
  <div
    data-tv-search-item="view-mode"
    ref={(el) => searchZoneNav.setItemRef(5, el)}
    className={searchZoneNav.isFocused(5) ? "keyboard-focus" : ""}
  >
    <ViewModeToggle
      modes={viewModes}
      value={viewMode}
      onChange={setViewMode}
    />
  </div>
)}

{/* Zoom Slider - Only shown in wall mode */}
{(supportsWallView || viewModes?.some(m => m.id === "wall")) && viewMode === "wall" && (
  <div
    data-tv-search-item="zoom-level"
    ref={(el) => searchZoneNav.setItemRef(6, el)}
    className={searchZoneNav.isFocused(6) ? "keyboard-focus" : ""}
  >
    <ZoomSlider value={zoomLevel} onChange={setZoomLevel} />
  </div>
)}
```

**Step 3: Verify existing tests still pass**

Run: `cd C:/Users/carrotwaxr/code/peek-stash-browser/client && npm test -- --run SearchControls`
Expected: Existing tests PASS (backward compatible)

**Step 4: Commit**

```bash
git -C C:/Users/carrotwaxr/code/peek-stash-browser add client/src/components/ui/SearchControls.jsx
git -C C:/Users/carrotwaxr/code/peek-stash-browser commit -m "feat: SearchControls accepts viewModes prop for custom modes"
```

---

## Task 4: Create TagTreeNode component

**Files:**
- Create: `client/src/components/tags/TagTreeNode.jsx`

**Step 1: Create the component**

```jsx
// client/src/components/tags/TagTreeNode.jsx
import { forwardRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { LucideChevronRight, LucideStar, LucideExternalLink } from "lucide-react";

/**
 * Individual tree node for tag hierarchy view.
 * Displays a compact "mini-card" with expand/collapse, thumbnail, and counts.
 */
const TagTreeNode = forwardRef(
  (
    {
      tag,
      depth = 0,
      isExpanded = false,
      onToggle,
      isAncestorOnly = false,
      focusedId,
      onFocus,
    },
    ref
  ) => {
    const navigate = useNavigate();
    const hasChildren = tag.children && tag.children.length > 0;
    const isFocused = focusedId === tag.id;

    const handleClick = useCallback(
      (e) => {
        e.stopPropagation();
        if (hasChildren) {
          onToggle(tag.id);
        }
        onFocus?.(tag.id);
      },
      [hasChildren, onToggle, onFocus, tag.id]
    );

    const handleDoubleClick = useCallback(
      (e) => {
        e.stopPropagation();
        navigate(`/tag/${tag.id}`, { state: { fromPageTitle: "Tags" } });
      },
      [navigate, tag.id]
    );

    const handleNavigateClick = useCallback(
      (e) => {
        e.stopPropagation();
        navigate(`/tag/${tag.id}`, { state: { fromPageTitle: "Tags" } });
      },
      [navigate, tag.id]
    );

    const handleKeyDown = useCallback(
      (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          navigate(`/tag/${tag.id}`, { state: { fromPageTitle: "Tags" } });
        }
      },
      [navigate, tag.id]
    );

    // Subtitle: child count or nothing
    const subtitle =
      tag.children?.length > 0
        ? `${tag.children.length} subtag${tag.children.length !== 1 ? "s" : ""}`
        : null;

    // Generate placeholder color from tag id
    const placeholderHue = (parseInt(tag.id, 10) * 137.5) % 360;

    return (
      <div>
        {/* Node row */}
        <div
          ref={ref}
          role="treeitem"
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-selected={isFocused}
          tabIndex={isFocused ? 0 : -1}
          className={`
            flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer
            transition-colors group
            ${isAncestorOnly ? "opacity-50" : ""}
          `}
          style={{
            marginLeft: `${depth * 24}px`,
            backgroundColor: isFocused
              ? "var(--bg-tertiary)"
              : "transparent",
          }}
          onClick={handleClick}
          onDoubleClick={handleDoubleClick}
          onKeyDown={handleKeyDown}
        >
          {/* Expand/collapse chevron */}
          <div className="w-5 flex-shrink-0">
            {hasChildren && (
              <LucideChevronRight
                size={18}
                className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
                style={{ color: "var(--text-muted)" }}
              />
            )}
          </div>

          {/* Thumbnail */}
          <div
            className="w-10 h-10 rounded flex-shrink-0 overflow-hidden"
            style={{
              backgroundColor: tag.image_path
                ? "var(--bg-tertiary)"
                : `hsl(${placeholderHue}, 40%, 30%)`,
            }}
          >
            {tag.image_path && (
              <img
                src={tag.image_path}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
              />
            )}
          </div>

          {/* Name and subtitle */}
          <div className="flex-1 min-w-0">
            <div
              className="font-medium truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {tag.name}
            </div>
            {subtitle && (
              <div
                className="text-xs truncate"
                style={{ color: "var(--text-muted)" }}
              >
                {subtitle}
              </div>
            )}
          </div>

          {/* Right side: counts, favorite, navigate */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Scene count badge */}
            {tag.scene_count > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  color: "var(--text-muted)",
                }}
              >
                {tag.scene_count} scenes
              </span>
            )}

            {/* Performer count badge */}
            {tag.performer_count > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  color: "var(--text-muted)",
                }}
              >
                {tag.performer_count} performers
              </span>
            )}

            {/* Favorite star */}
            {tag.favorite && (
              <LucideStar
                size={16}
                fill="var(--accent-primary)"
                style={{ color: "var(--accent-primary)" }}
              />
            )}

            {/* Navigate button - visible on hover */}
            <button
              type="button"
              onClick={handleNavigateClick}
              className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
              title="Go to tag"
              aria-label={`Go to ${tag.name}`}
            >
              <LucideExternalLink
                size={14}
                style={{ color: "var(--text-secondary)" }}
              />
            </button>
          </div>
        </div>

        {/* Children (recursive) */}
        {hasChildren && isExpanded && (
          <div role="group">
            {tag.children.map((child) => (
              <TagTreeNode
                key={`${tag.id}-${child.id}`}
                tag={child}
                depth={depth + 1}
                isExpanded={false}
                onToggle={onToggle}
                isAncestorOnly={isAncestorOnly}
                focusedId={focusedId}
                onFocus={onFocus}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);

TagTreeNode.displayName = "TagTreeNode";

export default TagTreeNode;
```

**Step 2: Commit**

```bash
git -C C:/Users/carrotwaxr/code/peek-stash-browser add client/src/components/tags/TagTreeNode.jsx
git -C C:/Users/carrotwaxr/code/peek-stash-browser commit -m "feat: add TagTreeNode component for hierarchy view"
```

---

## Task 5: Create TagHierarchyView component

**Files:**
- Create: `client/src/components/tags/TagHierarchyView.jsx`
- Create: `client/src/components/tags/index.js`

**Step 1: Create the main hierarchy view component**

```jsx
// client/src/components/tags/TagHierarchyView.jsx
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { buildTagTree } from "../../utils/buildTagTree.js";
import TagTreeNode from "./TagTreeNode.jsx";

/**
 * Hierarchy view for tags - displays tags as an expandable tree.
 */
const TagHierarchyView = ({ tags, isLoading, searchQuery }) => {
  // Track which nodes are expanded (by tag id)
  const [expandedIds, setExpandedIds] = useState(new Set());
  // Track focused node for keyboard navigation
  const [focusedId, setFocusedId] = useState(null);
  const containerRef = useRef(null);

  // Build tree structure from flat tags
  const tree = useMemo(() => buildTagTree(tags), [tags]);

  // Get all visible nodes (for keyboard nav)
  const visibleNodes = useMemo(() => {
    const nodes = [];
    const traverse = (node, depth = 0) => {
      nodes.push({ ...node, depth });
      if (expandedIds.has(node.id) && node.children) {
        node.children.forEach((child) => traverse(child, depth + 1));
      }
    };
    tree.forEach((root) => traverse(root));
    return nodes;
  }, [tree, expandedIds]);

  // Initialize: expand first level
  useEffect(() => {
    if (tree.length > 0 && expandedIds.size === 0) {
      const rootIds = new Set(tree.map((t) => t.id));
      setExpandedIds(rootIds);
    }
  }, [tree, expandedIds.size]);

  // Auto-expand to show search matches
  useEffect(() => {
    if (searchQuery && tree.length > 0) {
      // Find all ancestor IDs that need to be expanded to show matches
      const idsToExpand = new Set();
      const findAncestors = (node, ancestors = []) => {
        const matches =
          node.name?.toLowerCase().includes(searchQuery.toLowerCase());
        if (matches) {
          ancestors.forEach((id) => idsToExpand.add(id));
        }
        if (node.children) {
          node.children.forEach((child) =>
            findAncestors(child, [...ancestors, node.id])
          );
        }
      };
      tree.forEach((root) => findAncestors(root));
      if (idsToExpand.size > 0) {
        setExpandedIds((prev) => new Set([...prev, ...idsToExpand]));
      }
    }
  }, [searchQuery, tree]);

  const handleToggle = useCallback((id) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  const handleFocus = useCallback((id) => {
    setFocusedId(id);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e) => {
      if (!focusedId || visibleNodes.length === 0) return;

      const currentIndex = visibleNodes.findIndex((n) => n.id === focusedId);
      if (currentIndex === -1) return;

      const currentNode = visibleNodes[currentIndex];

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (currentIndex < visibleNodes.length - 1) {
            setFocusedId(visibleNodes[currentIndex + 1].id);
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          if (currentIndex > 0) {
            setFocusedId(visibleNodes[currentIndex - 1].id);
          }
          break;

        case "ArrowRight":
          e.preventDefault();
          if (currentNode.children?.length > 0) {
            if (!expandedIds.has(currentNode.id)) {
              handleToggle(currentNode.id);
            } else if (currentIndex < visibleNodes.length - 1) {
              // Already expanded, move to first child
              setFocusedId(visibleNodes[currentIndex + 1].id);
            }
          }
          break;

        case "ArrowLeft":
          e.preventDefault();
          if (expandedIds.has(currentNode.id)) {
            handleToggle(currentNode.id);
          } else {
            // Find parent and focus it
            const parentId = tags.find((t) => t.id === currentNode.id)?.parents?.[0]?.id;
            if (parentId) {
              setFocusedId(parentId);
            }
          }
          break;

        case "Home":
          e.preventDefault();
          setFocusedId(visibleNodes[0].id);
          break;

        case "End":
          e.preventDefault();
          setFocusedId(visibleNodes[visibleNodes.length - 1].id);
          break;

        default:
          break;
      }
    },
    [focusedId, visibleNodes, expandedIds, handleToggle, tags]
  );

  // Set initial focus
  useEffect(() => {
    if (visibleNodes.length > 0 && !focusedId) {
      setFocusedId(visibleNodes[0].id);
    }
  }, [visibleNodes, focusedId]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[...Array(8)].map((_, i) => (
          <div
            key={i}
            className="h-14 rounded-lg animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              marginLeft: `${(i % 3) * 24}px`,
            }}
          />
        ))}
      </div>
    );
  }

  if (tree.length === 0) {
    return (
      <div
        className="text-center py-12"
        style={{ color: "var(--text-muted)" }}
      >
        No tags found
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="tree"
      aria-label="Tag hierarchy"
      onKeyDown={handleKeyDown}
      className="space-y-1"
    >
      {tree.map((rootTag) => (
        <TagTreeNode
          key={rootTag.id}
          tag={rootTag}
          depth={0}
          isExpanded={expandedIds.has(rootTag.id)}
          onToggle={handleToggle}
          focusedId={focusedId}
          onFocus={handleFocus}
        />
      ))}
    </div>
  );
};

export default TagHierarchyView;
```

**Step 2: Create index file**

```javascript
// client/src/components/tags/index.js
export { default as TagHierarchyView } from "./TagHierarchyView.jsx";
export { default as TagTreeNode } from "./TagTreeNode.jsx";
```

**Step 3: Commit**

```bash
git -C C:/Users/carrotwaxr/code/peek-stash-browser add client/src/components/tags/
git -C C:/Users/carrotwaxr/code/peek-stash-browser commit -m "feat: add TagHierarchyView component"
```

---

## Task 6: Update Tags page to support hierarchy view

**Files:**
- Modify: `client/src/components/pages/Tags.jsx`

**Step 1: Update Tags.jsx**

Replace the entire file with:

```jsx
// client/src/components/pages/Tags.jsx
import { useCallback, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { STANDARD_GRID_CONTAINER_CLASSNAMES } from "../../constants/grids.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useGridColumns } from "../../hooks/useGridColumns.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useGridPageTVNavigation } from "../../hooks/useGridPageTVNavigation.js";
import { useCancellableQuery } from "../../hooks/useCancellableQuery.js";
import { libraryApi } from "../../services/api.js";
import { TagCard } from "../cards/index.js";
import { TagHierarchyView } from "../tags/index.js";
import {
  SyncProgressBanner,
  ErrorMessage,
  PageHeader,
  PageLayout,
  SearchControls,
} from "../ui/index.js";

// View modes for Tags page (no wall view - doesn't make sense for tags)
const TAG_VIEW_MODES = [
  { id: "grid", label: "Grid view" },
  { id: "hierarchy", label: "Hierarchy view" },
];

const Tags = () => {
  usePageTitle("Tags");
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const pageRef = useRef(null);
  const gridRef = useRef(null);
  const columns = useGridColumns("tags");

  const { data, isLoading, error, initMessage, execute } = useCancellableQuery();

  const handleQueryChange = useCallback(
    (newQuery) => {
      execute((signal) => getTags(newQuery, signal));
    },
    [execute]
  );

  const currentTags = data?.tags || [];
  const totalCount = data?.count || 0;

  // Track effective perPage from SearchControls state (fixes stale URL param bug)
  const [effectivePerPage, setEffectivePerPage] = useState(
    parseInt(searchParams.get("per_page")) || 24
  );
  const totalPages = totalCount ? Math.ceil(totalCount / effectivePerPage) : 0;

  // TV Navigation - use shared hook for all grid pages
  const {
    isTVMode,
    _tvNavigation,
    searchControlsProps,
    gridItemProps,
  } = useGridPageTVNavigation({
    items: currentTags,
    columns,
    totalPages,
    onItemSelect: (tag) =>
      navigate(`/tag/${tag.id}`, {
        state: { fromPageTitle: "Tags" },
      }),
  });

  // Initial focus
  useInitialFocus(
    pageRef,
    '[tabindex="0"]',
    !isLoading && currentTags.length > 0 && isTVMode
  );

  // Only show error page for non-initializing errors
  if (error && !initMessage) {
    return (
      <PageLayout>
        <PageHeader title="Tags" />
        <ErrorMessage error={error} />
      </PageLayout>
    );
  }

  return (
    <PageLayout>
      <div ref={pageRef}>
        <PageHeader title="Tags" subtitle="Browse tags in your library" />

        {initMessage && <SyncProgressBanner message={initMessage} />}

        {/* Controls Section */}
        <SearchControls
          artifactType="tag"
          initialSort="scenes_count"
          onQueryChange={handleQueryChange}
          onPerPageStateChange={setEffectivePerPage}
          totalPages={totalPages}
          totalCount={totalCount}
          viewModes={TAG_VIEW_MODES}
          {...searchControlsProps}
        >
          {({ viewMode }) => {
            // Hierarchy view
            if (viewMode === "hierarchy") {
              return (
                <TagHierarchyView
                  tags={currentTags}
                  isLoading={isLoading}
                  searchQuery={searchParams.get("q") || ""}
                />
              );
            }

            // Grid view (default)
            if (isLoading) {
              return (
                <div className={STANDARD_GRID_CONTAINER_CLASSNAMES}>
                  {[...Array(12)].map((_, i) => (
                    <div
                      key={i}
                      className="rounded-lg animate-pulse"
                      style={{
                        backgroundColor: "var(--bg-tertiary)",
                        height: "18rem",
                      }}
                    />
                  ))}
                </div>
              );
            }

            return (
              <div ref={gridRef} className={STANDARD_GRID_CONTAINER_CLASSNAMES}>
                {currentTags.map((tag, index) => {
                  const itemProps = gridItemProps(index);
                  return (
                    <TagCard
                      key={tag.id}
                      tag={tag}
                      fromPageTitle="Tags"
                      tabIndex={isTVMode ? itemProps.tabIndex : -1}
                      {...itemProps}
                    />
                  );
                })}
              </div>
            );
          }}
        </SearchControls>
      </div>
    </PageLayout>
  );
};

const getTags = async (query, signal) => {
  const response = await libraryApi.findTags(query, signal);

  // Extract tags and count from server response structure
  const findTags = response?.findTags;
  const result = {
    tags: findTags?.tags || [],
    count: findTags?.count || 0,
  };
  return result;
};

export default Tags;
```

**Step 2: Verify the app runs**

Run: `cd C:/Users/carrotwaxr/code/peek-stash-browser && docker-compose -f docker-compose.yml -f docker-compose.windows.yml up`

Open http://localhost:3000/tags and verify:
1. Grid/Hierarchy toggle appears
2. Grid view works as before
3. Hierarchy view shows tags in tree structure
4. Clicking expands/collapses nodes
5. Double-click navigates to tag detail

**Step 3: Commit**

```bash
git -C C:/Users/carrotwaxr/code/peek-stash-browser add client/src/components/pages/Tags.jsx
git -C C:/Users/carrotwaxr/code/peek-stash-browser commit -m "feat: Tags page supports Grid and Hierarchy view modes"
```

---

## Task 7: Add search filtering for hierarchy view

**Files:**
- Modify: `client/src/utils/buildTagTree.js`
- Modify: `client/tests/utils/buildTagTree.test.js`

**Step 1: Add tests for filtering**

Add to the existing test file:

```javascript
describe("buildTagTree with filter", () => {
  it("returns empty array when no matches", () => {
    const tags = [
      { id: "1", name: "Action", parents: [], children: [] },
    ];
    const result = buildTagTree(tags, "xyz");
    expect(result).toEqual([]);
  });

  it("returns matching tags and their ancestors", () => {
    const tags = [
      { id: "1", name: "Genre", parents: [], children: [{ id: "2", name: "Action" }] },
      { id: "2", name: "Action", parents: [{ id: "1", name: "Genre" }], children: [] },
    ];
    const result = buildTagTree(tags, "action");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("1"); // Genre (ancestor)
    expect(result[0].isAncestorOnly).toBe(true);
    expect(result[0].children[0].id).toBe("2"); // Action (match)
    expect(result[0].children[0].isAncestorOnly).toBeUndefined();
  });

  it("marks ancestors as isAncestorOnly", () => {
    const tags = [
      { id: "1", name: "Root", parents: [], children: [{ id: "2", name: "Middle" }] },
      { id: "2", name: "Middle", parents: [{ id: "1", name: "Root" }], children: [{ id: "3", name: "Leaf" }] },
      { id: "3", name: "Leaf", parents: [{ id: "2", name: "Middle" }], children: [] },
    ];
    const result = buildTagTree(tags, "leaf");
    expect(result[0].isAncestorOnly).toBe(true); // Root
    expect(result[0].children[0].isAncestorOnly).toBe(true); // Middle
    expect(result[0].children[0].children[0].isAncestorOnly).toBeUndefined(); // Leaf (match)
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd C:/Users/carrotwaxr/code/peek-stash-browser/client && npm test -- --run buildTagTree`
Expected: FAIL - filter not implemented

**Step 3: Update implementation**

Update `buildTagTree.js`:

```javascript
// client/src/utils/buildTagTree.js
/**
 * Builds a tree structure from a flat array of tags with parent/child relationships.
 * Tags with multiple parents will appear under each parent (duplicated in tree).
 *
 * @param {Array} tags - Flat array of tag objects with `parents` and `children` arrays
 * @param {string} filterQuery - Optional search query to filter tags (shows matches + ancestors)
 * @returns {Array} Array of root tree nodes, each with nested `children` array
 */
export function buildTagTree(tags, filterQuery = "") {
  if (!tags || tags.length === 0) {
    return [];
  }

  // Create a map for quick lookup
  const tagMap = new Map();
  tags.forEach((tag) => {
    tagMap.set(tag.id, { ...tag, children: [] });
  });

  // If filtering, determine which tags match and which are ancestors of matches
  let matchingIds = new Set();
  let ancestorIds = new Set();

  if (filterQuery) {
    const query = filterQuery.toLowerCase();

    // Find all matching tags
    tags.forEach((tag) => {
      if (tag.name?.toLowerCase().includes(query)) {
        matchingIds.add(tag.id);
      }
    });

    // If no matches, return empty
    if (matchingIds.size === 0) {
      return [];
    }

    // Find all ancestors of matching tags
    const findAncestors = (tagId, visited = new Set()) => {
      if (visited.has(tagId)) return;
      visited.add(tagId);

      const tag = tags.find((t) => t.id === tagId);
      if (tag?.parents) {
        tag.parents.forEach((parent) => {
          if (!matchingIds.has(parent.id)) {
            ancestorIds.add(parent.id);
          }
          findAncestors(parent.id, visited);
        });
      }
    };

    matchingIds.forEach((id) => findAncestors(id));
  }

  // Build tree by nesting children under parents
  const roots = [];

  // Recursive function to build tree node with children
  const buildNode = (tagId, visitedPath = new Set()) => {
    // Prevent infinite loops from circular references
    if (visitedPath.has(tagId)) return null;

    const tag = tagMap.get(tagId);
    if (!tag) return null;

    // When filtering, skip tags that aren't matches or ancestors
    if (filterQuery && !matchingIds.has(tagId) && !ancestorIds.has(tagId)) {
      return null;
    }

    const node = {
      ...tag,
      children: [],
      isAncestorOnly: filterQuery && ancestorIds.has(tagId) ? true : undefined,
    };

    // Build children
    const originalTag = tags.find((t) => t.id === tagId);
    if (originalTag?.children) {
      const newPath = new Set(visitedPath);
      newPath.add(tagId);

      node.children = originalTag.children
        .map((childRef) => buildNode(childRef.id, newPath))
        .filter(Boolean);
    }

    return node;
  };

  // Find root tags and build tree
  tags.forEach((tag) => {
    if (!tag.parents || tag.parents.length === 0) {
      const node = buildNode(tag.id);
      if (node) {
        roots.push(node);
      }
    }
  });

  return roots;
}
```

**Step 4: Run tests to verify they pass**

Run: `cd C:/Users/carrotwaxr/code/peek-stash-browser/client && npm test -- --run buildTagTree`
Expected: All tests PASS

**Step 5: Update TagHierarchyView to use filter**

In `TagHierarchyView.jsx`, update the useMemo:

```jsx
// Build tree structure from flat tags, filtered by search query
const tree = useMemo(
  () => buildTagTree(tags, searchQuery),
  [tags, searchQuery]
);
```

**Step 6: Commit**

```bash
git -C C:/Users/carrotwaxr/code/peek-stash-browser add client/src/utils/buildTagTree.js client/tests/utils/buildTagTree.test.js client/src/components/tags/TagHierarchyView.jsx
git -C C:/Users/carrotwaxr/code/peek-stash-browser commit -m "feat: hierarchy view filters to matches and shows ancestors dimmed"
```

---

## Task 8: Run linting and fix issues

**Step 1: Run ESLint**

Run: `cd C:/Users/carrotwaxr/code/peek-stash-browser/client && npm run lint`
Expected: No errors (or fix any that appear)

**Step 2: Run all tests**

Run: `cd C:/Users/carrotwaxr/code/peek-stash-browser/client && npm test -- --run`
Expected: All tests PASS

**Step 3: Commit any fixes**

```bash
git -C C:/Users/carrotwaxr/code/peek-stash-browser add -A
git -C C:/Users/carrotwaxr/code/peek-stash-browser commit -m "chore: lint fixes"
```

---

## Task 9: Manual verification

**Step 1: Start the app**

Run: `cd C:/Users/carrotwaxr/code/peek-stash-browser && docker-compose -f docker-compose.yml -f docker-compose.windows.yml up`

**Step 2: Verify functionality**

Open http://localhost:3000/tags and test:

1. **Grid/Hierarchy toggle visible** - Two-button toggle in controls bar
2. **Grid view unchanged** - Cards display as before
3. **Hierarchy view shows tree** - Tags organized by parent/child
4. **First level expanded by default** - Root tags show their children
5. **Click expands/collapses** - Single click toggles node
6. **Double-click navigates** - Goes to tag detail page
7. **Navigate button on hover** - Arrow icon appears on hover
8. **Rich nodes** - Thumbnail, name, child count, scene count, favorite star
9. **Keyboard navigation** - Arrow keys move focus, Enter navigates
10. **Search filters tree** - Only matching tags + ancestors shown
11. **Ancestors dimmed** - Non-matching ancestors have reduced opacity
12. **Multi-parent tags** - Appear under each parent

**Step 3: Document any issues found**

If issues are found, create additional commits to fix them.

---

## Summary

This plan implements Tag Hierarchy View in 9 tasks:

1. **buildTagTree utility** - Core tree-building logic with tests
2. **ViewModeToggle update** - Support custom modes
3. **SearchControls update** - Accept viewModes prop
4. **TagTreeNode** - Individual tree node component
5. **TagHierarchyView** - Main hierarchy container
6. **Tags page update** - Wire up Grid/Hierarchy toggle
7. **Search filtering** - Filter tree to matches + ancestors
8. **Lint and test** - Ensure code quality
9. **Manual verification** - Test all functionality
