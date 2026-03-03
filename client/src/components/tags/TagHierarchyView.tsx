// client/src/components/tags/TagHierarchyView.jsx
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  ChevronsDownUp as LucideChevronsDownUp,
  ChevronsUpDown as LucideChevronsUpDown,
} from "lucide-react";
import { buildTagTree } from "../../utils/buildTagTree";
import TagTreeNode from "./TagTreeNode";
import Button from "../ui/Button";

/**
 * Hierarchy view for tags - displays tags as an expandable tree.
 */
interface TagItem {
  id: string;
  name?: string;
  parents?: Array<{ id: string }>;
  children?: TagItem[];
  [key: string]: unknown;
}

interface TagHierarchyViewProps {
  tags: TagItem[];
  isLoading: boolean;
  searchQuery: string;
  sortField?: string;
  sortDirection?: string;
}

const TagHierarchyView = ({ tags, isLoading, searchQuery, sortField = "name", sortDirection = "ASC" }: TagHierarchyViewProps) => {
  // Track which nodes are expanded (by tag id)
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  // Track focused node for keyboard navigation
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const containerRef = useRef(null);
  // Track if initial expansion has happened (prevents re-expanding after Collapse All)
  const hasInitializedRef = useRef(false);

  // Build tree structure from flat tags, filtered by search query and sorted
  const tree = useMemo(
    () => buildTagTree(tags, { filterQuery: searchQuery, sortField, sortDirection }),
    [tags, searchQuery, sortField, sortDirection]
  );

  // Get all IDs of nodes that have children (expandable nodes)
  const allExpandableIds = useMemo(() => {
    const ids = new Set<string>();
    const traverse = (node: Record<string, unknown>) => {
      if ((node.children as unknown[] | undefined)?.length) {
        ids.add(node.id as string);
        (node.children as Record<string, unknown>[]).forEach(traverse);
      }
    };
    tree.forEach(traverse);
    return ids;
  }, [tree]);

  // Get all visible nodes (for keyboard nav)
  const visibleNodes = useMemo(() => {
    const nodes: Array<Record<string, unknown> & { depth: number }> = [];
    const traverse = (node: Record<string, unknown>, depth = 0) => {
      nodes.push({ ...node, depth });
      if (expandedIds.has(node.id as string) && node.children) {
        (node.children as Record<string, unknown>[]).forEach((child: Record<string, unknown>) => traverse(child, depth + 1));
      }
    };
    tree.forEach((root) => traverse(root));
    return nodes;
  }, [tree, expandedIds]);

  // Initialize: expand first level (only on first load, not after Collapse All)
  useEffect(() => {
    if (tree.length > 0 && expandedIds.size === 0 && !hasInitializedRef.current) {
      hasInitializedRef.current = true;
      const rootIds = new Set<string>(tree.map((t: Record<string, unknown>) => t.id as string));
      setExpandedIds(rootIds);
    }
  }, [tree, expandedIds.size]);

  // Auto-expand to show search matches
  useEffect(() => {
    if (searchQuery && tree.length > 0) {
      // Find all ancestor IDs that need to be expanded to show matches
      const idsToExpand = new Set<string>();
      const findAncestors = (node: Record<string, unknown>, ancestors: string[] = []) => {
        const matches =
          (node.name as string | undefined)?.toLowerCase().includes(searchQuery.toLowerCase());
        if (matches) {
          ancestors.forEach((id: string) => idsToExpand.add(id));
        }
        if (node.children) {
          (node.children as Record<string, unknown>[]).forEach((child: Record<string, unknown>) =>
            findAncestors(child, [...ancestors, node.id as string])
          );
        }
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

      const currentIndex = visibleNodes.findIndex((n) => (n.id as string) === focusedId);
      if (currentIndex === -1) return;

      const currentNode = visibleNodes[currentIndex];

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (currentIndex < visibleNodes.length - 1) {
            setFocusedId(visibleNodes[currentIndex + 1].id as string);
          }
          break;

        case "ArrowUp":
          e.preventDefault();
          if (currentIndex > 0) {
            setFocusedId(visibleNodes[currentIndex - 1].id as string);
          }
          break;

        case "ArrowRight":
          e.preventDefault();
          if ((currentNode.children as unknown[] | undefined)?.length) {
            if (!expandedIds.has(currentNode.id as string)) {
              handleToggle(currentNode.id as string);
            } else if (currentIndex < visibleNodes.length - 1) {
              // Already expanded, move to first child
              setFocusedId(visibleNodes[currentIndex + 1].id as string);
            }
          }
          break;

        case "ArrowLeft":
          e.preventDefault();
          if (expandedIds.has(currentNode.id as string)) {
            handleToggle(currentNode.id as string);
          } else {
            // Find parent and focus it
            const parentId = tags.find((t: TagItem) => t.id === (currentNode.id as string))?.parents?.[0]?.id;
            if (parentId) {
              setFocusedId(parentId);
            }
          }
          break;

        case "Home":
          e.preventDefault();
          setFocusedId(visibleNodes[0].id as string);
          break;

        case "End":
          e.preventDefault();
          setFocusedId(visibleNodes[visibleNodes.length - 1].id as string);
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
      setFocusedId(visibleNodes[0].id as string);
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
        {tree.map((rootTag: Record<string, unknown>) => (
          <TagTreeNode
            key={rootTag.id as string}
            tag={rootTag as unknown as React.ComponentProps<typeof TagTreeNode>["tag"]}
            depth={0}
            isExpanded={expandedIds.has(rootTag.id as string)}
            expandedIds={expandedIds}
            onToggle={handleToggle}
            focusedId={focusedId}
            onFocus={handleFocus}
          />
        ))}
      </div>
    </div>
  );
};

export default TagHierarchyView;
