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
  tagTreeRowKey,
} from "../../utils/buildTagTree";
import { isTVModeOn } from "../../utils/keyTargets";
import Button from "../ui/Button";
import TagTreeNode from "./TagTreeNode";

/**
 * Hierarchy view for tags - displays tags as an expandable tree. Expansion
 * goes by each tag's `tagTreeKey` ("id:instanceId"), so two instances'
 * same-numbered tags expand apart; focus goes by the row's `tagTreeRowKey`
 * (its path), since a tag under two parents is two rows.
 *
 * The arrow keys move DOM focus from row to row (roving tabindex). An arrow
 * with nowhere to go in the tree (Up on the first row, Left on a closed root)
 * is left unhandled in TV mode, so TV focus takes it out of the tree; rows
 * are TV items, so TV focus can come back in.
 */
type TreeNode = TagTreeNodeData<TagTreeSource>;

/** The first view opens every root only while it shows fewer rows than this */
const INITIAL_EXPAND_MAX_ROWS = 500;

/** A row of the expanded tree, for keyboard navigation */
interface VisibleNode {
  /** The row's key: its path (`tagTreeRowKey`) */
  key: string;
  /** The tag's key, which expansion goes by */
  tagKey: string;
  /** The row it sits under, null at the root */
  parentKey: string | null;
  hasChildren: boolean;
  /** The index of its root in the tree, to mount the chunk holding it */
  rootIndex: number;
}

/** Focuses a row and scrolls it just into view, as TV focus does */
const focusElement = (el: HTMLElement) => {
  el.focus({ preventScroll: true });
  el.scrollIntoView({ block: "nearest", inline: "nearest" });
};

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
  // The focused row's key (a path), for the roving tabindex
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const containerRef = useRef(null);
  // Each mounted row's element by row key
  const rowRefs = useRef(new Map<string, HTMLDivElement>());
  // A row a key moved to before its chunk mounted: focus it once it does
  const pendingFocusRef = useRef<string | null>(null);
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
    showAtLeast: showRoots,
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

  // Every row of the expanded tree, mounted or not (for keyboard nav: a move
  // past the last mounted row mounts the chunk it lands in)
  const visibleNodes = useMemo(() => {
    const nodes: VisibleNode[] = [];
    const traverse = (
      node: TreeNode,
      parentKey: string | null,
      rootIndex: number
    ) => {
      const key = tagTreeRowKey(parentKey, node);
      const tagKey = tagTreeKey(node);
      nodes.push({
        key,
        tagKey,
        parentKey,
        hasChildren: node.children.length > 0,
        rootIndex,
      });
      if (expandedIds.has(tagKey)) {
        node.children.forEach((child) => traverse(child, key, rootIndex));
      }
    };
    tree.forEach((root, rootIndex) => traverse(root, null, rootIndex));
    return nodes;
  }, [tree, expandedIds]);

  const nodeIndex = useMemo(
    () => new Map(visibleNodes.map((node, index) => [node.key, index])),
    [visibleNodes]
  );

  // The tabbable row: the focused one while it is still in the tree, else
  // the first
  const activeRowKey =
    focusedId !== null && nodeIndex.has(focusedId)
      ? focusedId
      : (visibleNodes[0]?.key ?? null);

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

  const registerRow = useCallback(
    (rowKey: string, el: HTMLDivElement | null) => {
      if (el) rowRefs.current.set(rowKey, el);
      else rowRefs.current.delete(rowKey);
    },
    []
  );

  // Moves DOM focus to a row, mounting its chunk first when it is not yet
  const focusRow = useCallback(
    (node: VisibleNode) => {
      setFocusedId(node.key);
      const el = rowRefs.current.get(node.key);
      if (el) {
        focusElement(el);
        return;
      }
      pendingFocusRef.current = node.key;
      showRoots(node.rootIndex + 1);
    },
    [showRoots]
  );

  // A row a key moved to mounted in this render: focus it
  useEffect(() => {
    const key = pendingFocusRef.current;
    if (key === null) return;
    const el = rowRefs.current.get(key);
    if (!el) return;
    pendingFocusRef.current = null;
    focusElement(el);
  });

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (activeRowKey === null) return;

      const currentIndex = nodeIndex.get(activeRowKey);
      if (currentIndex === undefined) return;

      const currentNode = visibleNodes[currentIndex];
      if (!currentNode) return;
      // Undefined at either end of the list
      const nextNode = visibleNodes[currentIndex + 1];
      const previousNode = visibleNodes[currentIndex - 1];
      const firstNode = visibleNodes[0];
      const lastNode = visibleNodes[visibleNodes.length - 1];

      // Whether the tree used the key; one it did not (an arrow with
      // nowhere to go here) is TV focus's in TV mode
      let handled = true;
      switch (e.key) {
        case "ArrowDown":
          if (nextNode) focusRow(nextNode);
          else handled = false;
          break;

        case "ArrowUp":
          if (previousNode) focusRow(previousNode);
          else handled = false;
          break;

        case "ArrowRight":
          if (!currentNode.hasChildren) {
            handled = false;
          } else if (!expandedIds.has(currentNode.tagKey)) {
            handleToggle(currentNode.tagKey);
          } else if (nextNode) {
            // Already expanded, move to first child
            focusRow(nextNode);
          }
          break;

        case "ArrowLeft":
          // (the first view's expansion holds every root, leaves included)
          if (currentNode.hasChildren && expandedIds.has(currentNode.tagKey)) {
            handleToggle(currentNode.tagKey);
          } else {
            // Focus the row it sits under; a closed root has none
            const parentIndex =
              currentNode.parentKey === null
                ? undefined
                : nodeIndex.get(currentNode.parentKey);
            const parentNode =
              parentIndex === undefined ? undefined : visibleNodes[parentIndex];
            if (parentNode) focusRow(parentNode);
            else handled = false;
          }
          break;

        case "Home":
          if (firstNode) focusRow(firstNode);
          break;

        case "End":
          // Mounts every chunk up to the true last row
          if (lastNode) focusRow(lastNode);
          break;

        default:
          return;
      }
      if (handled || !isTVModeOn()) e.preventDefault();
    },
    [activeRowKey, nodeIndex, visibleNodes, expandedIds, handleToggle, focusRow]
  );

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
            focusedId={activeRowKey}
            onFocus={handleFocus}
            registerRow={registerRow}
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
