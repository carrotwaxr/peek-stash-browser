// client/src/components/folder/FolderTreeSidebar.jsx
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LucideChevronDown,
  LucideChevronRight,
  LucideFolder,
  LucideFolderOpen,
} from "lucide-react";
import { useIncrementalList } from "../../hooks/useIncrementalList";
import { buildTagTree, tagTreeKey } from "../../utils/buildTagTree";

interface TagItem {
  id: string;
  instanceId?: string | null;
  name: string;
  parents?: Array<{ id: string }>;
  image_path?: string | null;
}

interface TreeNodeData {
  id: string;
  instanceId?: string | null;
  name: string;
  children?: TreeNodeData[];
}

interface Props {
  tags: TagItem[];
  currentPath: string[];
  onNavigate: (path: string[]) => void;
  className?: string;
}

/**
 * Collapsible tree sidebar for folder view on desktop.
 * Shows tag hierarchy with expand/collapse controls.
 * Features sticky parent breadcrumb for scroll context.
 * Paths and expansion go by each tag's `tagTreeKey` ("id:instanceId"), as
 * the folder view's paths do.
 */
const FolderTreeSidebar = ({
  tags,
  currentPath,
  onNavigate,
  className = "",
}: Props) => {
  // Build tree from tags
  const tree: TreeNodeData[] = useMemo(
    () =>
      buildTagTree(tags, {
        sortField: "name",
        sortDirection: "ASC",
      }),
    [tags]
  );

  // Root folders mount in chunks; the sentinel after the last loads the next.
  // The open folder's root always shows, even while it is past the chunk.
  const {
    visible: visibleRoots,
    sentinelRef,
    hasMore: hasMoreRoots,
  } = useIncrementalList(tree);
  const pinnedRoot = useMemo(() => {
    const rootKey = currentPath[0];
    if (!hasMoreRoots || !rootKey) return null;
    if (visibleRoots.some((node) => tagTreeKey(node) === rootKey)) return null;
    return tree.find((node) => tagTreeKey(node) === rootKey) ?? null;
  }, [tree, visibleRoots, hasMoreRoots, currentPath]);
  const shownRoots = pinnedRoot ? [...visibleRoots, pinnedRoot] : visibleRoots;

  // Create a map of tag keys to names for breadcrumb display
  const tagNameMap = useMemo(
    () => new Map(tags.map((tag) => [tagTreeKey(tag), tag.name])),
    [tags]
  );

  // Ref for the sidebar container (for scrolling)
  const sidebarRef = useRef<HTMLDivElement>(null);
  const scrollContentRef = useRef<HTMLDivElement>(null);

  // Track expanded nodes
  const [expanded, setExpanded] = useState(() => {
    // Auto-expand nodes in current path
    return new Set(currentPath);
  });

  // Track sticky breadcrumb visibility
  const [showStickyBreadcrumb, setShowStickyBreadcrumb] = useState(false);

  // Auto-expand path and scroll to current node when path changes
  useEffect(() => {
    if (currentPath.length > 0) {
      // Expand all nodes in path
      setExpanded((prev) => {
        const next = new Set(prev);
        currentPath.forEach((id) => next.add(id));
        return next;
      });

      // Scroll to current node after a brief delay (to allow expansion to render)
      setTimeout(() => {
        // Use the full path as the selector to handle tags with multiple parents
        const pathKey = currentPath.join(",");
        const nodeElement = scrollContentRef.current?.querySelector(
          `[data-node-path="${pathKey}"]`
        );
        if (nodeElement) {
          nodeElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 50);
    }
  }, [currentPath]);

  // Handle scroll to show/hide sticky breadcrumb
  useEffect(() => {
    const scrollContainer = sidebarRef.current;
    if (!scrollContainer || currentPath.length < 2) {
      setShowStickyBreadcrumb(false);
      return;
    }

    const handleScroll = () => {
      // Show sticky breadcrumb when scrolled more than 60px
      setShowStickyBreadcrumb(scrollContainer.scrollTop > 60);
    };

    scrollContainer.addEventListener("scroll", handleScroll);
    return () => scrollContainer.removeEventListener("scroll", handleScroll);
  }, [currentPath]);

  const toggleExpanded = (tagId: string) => {
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

  // Build parent breadcrumb text (all but last item in path)
  const parentBreadcrumb = useMemo(() => {
    if (currentPath.length < 2) return null;
    const parentPath = currentPath.slice(0, -1);
    return parentPath.map((id) => tagNameMap.get(id) || id).join(" › ");
  }, [currentPath, tagNameMap]);

  return (
    <div
      ref={sidebarRef}
      className={`overflow-y-auto relative ${className}`}
      style={{
        backgroundColor: "var(--bg-primary)",
        borderRight: "1px solid var(--border-color)",
        boxShadow: "inset -4px 0 8px -4px rgba(0, 0, 0, 0.1)",
      }}
    >
      {/* Sticky parent breadcrumb header */}
      {showStickyBreadcrumb && parentBreadcrumb && (
        <div
          className="sticky top-0 z-10 px-3 py-2 text-xs font-medium truncate"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            borderBottom: "1px solid var(--border-color)",
            color: "var(--text-secondary)",
          }}
        >
          {parentBreadcrumb}
        </div>
      )}

      {/* Scrollable content */}
      <div ref={scrollContentRef} className="py-2">
        {/* Root level */}
        <button
          type="button"
          onClick={() => onNavigate([])}
          className={`w-full flex items-center gap-2 px-4 py-2 text-left hover:bg-[var(--bg-tertiary)] transition-colors ${
            currentPath.length === 0 ? "bg-[var(--bg-tertiary)]" : ""
          }`}
          style={{ color: "var(--text-primary)" }}
        >
          <LucideFolderOpen size={16} />
          <span className="font-medium">All Content</span>
        </button>

        {/* Tree nodes */}
        <div className="pb-2">
          {shownRoots.map((node) => (
            <TreeNode
              key={tagTreeKey(node)}
              node={node}
              nodePath={[tagTreeKey(node)]}
              depth={0}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
              currentPath={currentPath}
              onNavigate={onNavigate}
            />
          ))}
          {hasMoreRoots && (
            <div
              ref={sentinelRef}
              data-testid="folder-tree-sentinel"
              aria-hidden="true"
              className="h-px"
            />
          )}
        </div>
      </div>
    </div>
  );
};

interface TreeNodeProps {
  node: TreeNodeData;
  nodePath: string[];
  depth: number;
  expanded: Set<string>;
  toggleExpanded: (tagId: string) => void;
  currentPath: string[];
  onNavigate: (path: string[]) => void;
}

const TreeNode = ({
  node,
  nodePath,
  depth,
  expanded,
  toggleExpanded,
  currentPath,
  onNavigate,
}: TreeNodeProps) => {
  const children = node.children ?? [];
  const hasChildren = children.length > 0;
  const key = tagTreeKey(node);
  const isExpanded = expanded.has(key);
  const isInPath = currentPath.includes(key);
  // Check if this exact path matches the current path (handles multi-parent tags)
  const pathKey = nodePath.join(",");
  const currentPathKey = currentPath.join(",");
  const isCurrentNode = pathKey === currentPathKey;

  return (
    <div>
      <div
        data-node-path={pathKey}
        className={`flex items-center hover:bg-[var(--bg-tertiary)] transition-colors ${
          isCurrentNode ? "bg-[var(--bg-tertiary)]" : ""
        }`}
        style={{ paddingLeft: `${(depth + 1) * 12 + 12}px` }}
      >
        {/* Expand/collapse button */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggleExpanded(key);
          }}
          className="p-1 hover:bg-[var(--bg-primary)] rounded"
          style={{ visibility: hasChildren ? "visible" : "hidden" }}
        >
          {isExpanded ? (
            <LucideChevronDown
              size={14}
              style={{ color: "var(--text-tertiary)" }}
            />
          ) : (
            <LucideChevronRight
              size={14}
              style={{ color: "var(--text-tertiary)" }}
            />
          )}
        </button>

        {/* Node button */}
        <button
          type="button"
          onClick={() => onNavigate(nodePath)}
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
          {children.map((child) => (
            <TreeNode
              key={tagTreeKey(child)}
              node={child}
              nodePath={[...nodePath, tagTreeKey(child)]}
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

export default FolderTreeSidebar;
