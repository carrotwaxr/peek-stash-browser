// client/src/components/tags/TagHierarchyView.jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronsDownUp as LucideChevronsDownUp,
  ChevronsUpDown as LucideChevronsUpDown,
} from "lucide-react";
import { useIncrementalList } from "../../hooks/useIncrementalList";
import {
  type TagTreeNode as TagTreeNodeData,
  type TagTreeSource,
  buildTagTree,
  tagTreeKey,
} from "../../utils/buildTagTree";
import Button from "../ui/Button";
import TagTreeNode from "./TagTreeNode";

/**
 * Hierarchy view for tags - displays tags as an expandable tree. Expansion
 * and focus go by each tag's `tagTreeKey` ("id:instanceId"), so two
 * instances' same-numbered tags expand apart.
 */
type TreeNode = TagTreeNodeData<TagTreeSource>;

/** The first view opens every root only while it shows fewer rows than this */
const INITIAL_EXPAND_MAX_ROWS = 500;

/** A row of the expanded tree, for keyboard navigation */
interface VisibleNode {
  key: string;
  /** The row it sits under, null at the root */
  parentKey: string | null;
  hasChildren: boolean;
}

interface TagHierarchyViewProps {
  tags: readonly TagTreeSource[];
  isLoading: boolean;
  searchQuery: string;
  sortField?: string;
  sortDirection?: string;
}

const TagHierarchyView = ({
  tags,
  isLoading,
  searchQuery,
  sortField = "name",
  sortDirection = "ASC",
}: TagHierarchyViewProps) => {
  // Track which nodes are expanded (by tag key)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Track focused node for keyboard navigation
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const containerRef = useRef(null);
  // Track if initial expansion has happened (prevents re-expanding after Collapse All)
  const hasInitializedRef = useRef(false);

  // Build tree structure from flat tags, filtered by search query and sorted
  const tree = useMemo(
    () =>
      buildTagTree(tags, {
        filterQuery: searchQuery,
        sortField,
        sortDirection,
      }),
    [tags, searchQuery, sortField, sortDirection]
  );

  // Roots mount in chunks; the sentinel after the last one loads the next
  const {
    visible: visibleRoots,
    sentinelRef,
    hasMore: hasMoreRoots,
  } = useIncrementalList(tree);

  // Get all keys of nodes that have children (expandable nodes)
  const allExpandableIds = useMemo(() => {
    const keys = new Set<string>();
    const traverse = (node: TreeNode) => {
      if (node.children.length > 0) {
        keys.add(tagTreeKey(node));
        node.children.forEach(traverse);
      }
    };
    tree.forEach(traverse);
    return keys;
  }, [tree]);

  // Get all visible nodes (for keyboard nav)
  const visibleNodes = useMemo(() => {
    const nodes: VisibleNode[] = [];
    const traverse = (node: TreeNode, parentKey: string | null) => {
      const key = tagTreeKey(node);
      nodes.push({ key, parentKey, hasChildren: node.children.length > 0 });
      if (expandedIds.has(key)) {
        node.children.forEach((child) => traverse(child, key));
      }
    };
    visibleRoots.forEach((root) => traverse(root, null));
    return nodes;
  }, [visibleRoots, expandedIds]);

  // Initialize: expand first level (only on first load, not after Collapse All),
  // and only while that keeps the rows under INITIAL_EXPAND_MAX_ROWS
  useEffect(() => {
    if (
      tree.length > 0 &&
      expandedIds.size === 0 &&
      !hasInitializedRef.current
    ) {
      hasInitializedRef.current = true;
      const rows = tree.reduce(
        (sum, root) => sum + 1 + root.children.length,
        0
      );
      if (rows < INITIAL_EXPAND_MAX_ROWS) {
        setExpandedIds(new Set(tree.map(tagTreeKey)));
      }
    }
  }, [tree, expandedIds.size]);

  // Auto-expand to show search matches
  useEffect(() => {
    if (searchQuery && tree.length > 0) {
      // Find all ancestor keys that need to be expanded to show matches
      const idsToExpand = new Set<string>();
      const findAncestors = (node: TreeNode, ancestors: string[] = []) => {
        const matches = node.name
          ?.toLowerCase()
          .includes(searchQuery.toLowerCase());
        if (matches) {
          ancestors.forEach((key) => idsToExpand.add(key));
        }
        node.children.forEach((child) =>
          findAncestors(child, [...ancestors, tagTreeKey(node)])
        );
      };
      tree.forEach((root) => findAncestors(root));
      if (idsToExpand.size > 0) {
        setExpandedIds((prev) => new Set([...prev, ...idsToExpand]));
      }
    }
  }, [searchQuery, tree]);

  const handleToggle = useCallback((id: string) => {
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

  const handleExpandAll = useCallback(() => {
    setExpandedIds(new Set(allExpandableIds));
  }, [allExpandableIds]);

  const handleCollapseAll = useCallback(() => {
    setExpandedIds(new Set());
  }, []);

  const handleFocus = useCallback((id: string) => {
    setFocusedId(id);
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!focusedId || visibleNodes.length === 0) return;

      const currentIndex = visibleNodes.findIndex((n) => n.key === focusedId);
      if (currentIndex === -1) return;

      const currentNode = visibleNodes[currentIndex];
      if (!currentNode) return;
      // Undefined at either end of the list
      const nextNode = visibleNodes[currentIndex + 1];
      const previousNode = visibleNodes[currentIndex - 1];
      const firstNode = visibleNodes[0];
      const lastNode = visibleNodes[visibleNodes.length - 1];

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (nextNode) {
            setFocusedId(nextNode.key);
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          if (previousNode) {
            setFocusedId(previousNode.key);
          }
          break;

        case "ArrowRight":
          e.preventDefault();
          if (currentNode.hasChildren) {
            if (!expandedIds.has(currentNode.key)) {
              handleToggle(currentNode.key);
            } else if (nextNode) {
              // Already expanded, move to first child
              setFocusedId(nextNode.key);
            }
          }
          break;

        case "ArrowLeft":
          e.preventDefault();
          if (expandedIds.has(currentNode.key)) {
            handleToggle(currentNode.key);
          } else if (currentNode.parentKey) {
            // Focus the row it sits under
            setFocusedId(currentNode.parentKey);
          }
          break;

        case "Home":
          e.preventDefault();
          if (firstNode) {
            setFocusedId(firstNode.key);
          }
          break;

        case "End":
          e.preventDefault();
          if (lastNode) {
            setFocusedId(lastNode.key);
          }
          break;

        default:
          break;
      }
    },
    [focusedId, visibleNodes, expandedIds, handleToggle]
  );

  // Set initial focus
  useEffect(() => {
    const firstNode = visibleNodes[0];
    if (firstNode && !focusedId) {
      setFocusedId(firstNode.key);
    }
  }, [visibleNodes, focusedId]);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
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
      <div className="text-center py-12" style={{ color: "var(--text-muted)" }}>
        No tags found
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Expand/Collapse All buttons */}
      {allExpandableIds.size > 0 && (
        <div className="flex gap-2 mb-3">
          <Button
            variant="secondary"
            size="sm"
            icon={<LucideChevronsUpDown size={16} />}
            onClick={handleExpandAll}
          >
            Expand All
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<LucideChevronsDownUp size={16} />}
            onClick={handleCollapseAll}
          >
            Collapse All
          </Button>
        </div>
      )}

      {/* Tree content */}
      <div
        ref={containerRef}
        role="tree"
        aria-label="Tag hierarchy"
        onKeyDown={handleKeyDown}
        className="space-y-1"
      >
        {visibleRoots.map((rootTag) => (
          <TagTreeNode
            key={tagTreeKey(rootTag)}
            tag={
              rootTag as unknown as React.ComponentProps<
                typeof TagTreeNode
              >["tag"]
            }
            depth={0}
            isExpanded={expandedIds.has(tagTreeKey(rootTag))}
            expandedIds={expandedIds}
            onToggle={handleToggle}
            focusedId={focusedId}
            onFocus={handleFocus}
          />
        ))}
        {hasMoreRoots && (
          <div
            ref={sentinelRef}
            data-testid="tree-sentinel"
            aria-hidden="true"
            className="h-px"
          />
        )}
      </div>
    </div>
  );
};

export default TagHierarchyView;
