// client/src/components/folder/FolderTreeSidebar.jsx
import { useState, useMemo, useEffect, useRef } from "react";
import { LucideChevronRight, LucideChevronDown, LucideFolder, LucideFolderOpen } from "lucide-react";
import { buildTagTree } from "../../utils/buildTagTree.js";

/**
 * Collapsible tree sidebar for folder view on desktop.
 * Shows tag hierarchy with expand/collapse controls.
 */
const FolderTreeSidebar = ({ tags, currentPath, onNavigate, className = "" }) => {
  // Build tree from tags
  const tree = useMemo(() => buildTagTree(tags, { sortField: "name", sortDirection: "ASC" }), [tags]);

  // Ref for the sidebar container (for scrolling)
  const sidebarRef = useRef(null);

  // Track expanded nodes
  const [expanded, setExpanded] = useState(() => {
    // Auto-expand nodes in current path
    return new Set(currentPath);
  });

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
        const currentNodeId = currentPath[currentPath.length - 1];
        const nodeElement = sidebarRef.current?.querySelector(`[data-node-id="${currentNodeId}"]`);
        if (nodeElement) {
          nodeElement.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }, 50);
    }
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

  const handleNodeClick = (tagId) => {
    // Build path to this node
    const path = findPathToTag(tree, tagId);
    onNavigate(path);
  };

  return (
    <div
      ref={sidebarRef}
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
        data-node-id={node.id}
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
