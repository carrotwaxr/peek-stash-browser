// client/src/components/tags/TagHierarchyView.jsx
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { buildTagTree } from "../../utils/buildTagTree.js";
import TagTreeNode from "./TagTreeNode.jsx";

/**
 * Hierarchy view for tags - displays tags as an expandable tree.
 */
const TagHierarchyView = ({ tags, isLoading, searchQuery, sortField = "name", sortDirection = "ASC" }) => {
  // Track which nodes are expanded (by tag id)
  const [expandedIds, setExpandedIds] = useState(new Set());
  // Track focused node for keyboard navigation
  const [focusedId, setFocusedId] = useState(null);
  const containerRef = useRef(null);

  // Build tree structure from flat tags, filtered by search query and sorted
  const tree = useMemo(
    () => buildTagTree(tags, { filterQuery: searchQuery, sortField, sortDirection }),
    [tags, searchQuery, sortField, sortDirection]
  );

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
          expandedIds={expandedIds}
          onToggle={handleToggle}
          focusedId={focusedId}
          onFocus={handleFocus}
        />
      ))}
    </div>
  );
};

export default TagHierarchyView;
