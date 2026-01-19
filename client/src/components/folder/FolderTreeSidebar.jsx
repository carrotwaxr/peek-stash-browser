// client/src/components/folder/FolderTreeSidebar.jsx
import { useState, useMemo, useEffect, useRef } from "react";
import { LucideChevronRight, LucideChevronDown, LucideFolder, LucideFolderOpen } from "lucide-react";
import { buildTagTree } from "../../utils/buildTagTree.js";

/**
 * Collapsible tree sidebar for folder view on desktop.
 * Shows tag hierarchy with expand/collapse controls.
 * Features sticky parent breadcrumb for scroll context.
 */
const FolderTreeSidebar = ({ tags, currentPath, onNavigate, className = "" }) => {
  // Build tree from tags
  const tree = useMemo(() => buildTagTree(tags, { sortField: "name", sortDirection: "ASC" }), [tags]);

  // Create a map of tag IDs to names for breadcrumb display
  const tagNameMap = useMemo(() => {
    const map = new Map();
    const addToMap = (nodes) => {
      for (const node of nodes) {
        map.set(node.id, node.name);
        if (node.children?.length > 0) {
          addToMap(node.children);
        }
      }
    };
    addToMap(tree);
    return map;
  }, [tree]);

  // Ref for the sidebar container (for scrolling)
  const sidebarRef = useRef(null);
  const scrollContentRef = useRef(null);

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
        const nodeElement = scrollContentRef.current?.querySelector(`[data-node-path="${pathKey}"]`);
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
          {tree.map((node) => (
            <TreeNode
              key={node.id}
              node={node}
              nodePath={[node.id]}
              depth={0}
              expanded={expanded}
              toggleExpanded={toggleExpanded}
              currentPath={currentPath}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

const TreeNode = ({ node, nodePath, depth, expanded, toggleExpanded, currentPath, onNavigate }) => {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isInPath = currentPath.includes(node.id);
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
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              nodePath={[...nodePath, child.id]}
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
