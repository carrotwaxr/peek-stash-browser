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
