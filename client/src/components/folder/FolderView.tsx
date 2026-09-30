// client/src/components/folder/FolderView.jsx
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import { getGridClasses } from "../../constants/grids";
import {
  buildFolderTree,
  resolveFolderPath,
} from "../../utils/buildFolderTree";
import FolderBreadcrumb from "./FolderBreadcrumb";
import FolderCard from "./FolderCard";
import FolderTreeSidebar from "./FolderTreeSidebar";

interface TagItem {
  id: string;
  instanceId?: string | null;
  name: string;
  parents?: Array<{ id: string }>;
  image_path?: string | null;
}

interface Props {
  items: Array<Record<string, unknown>>;
  tags: TagItem[];
  renderItem: (item: Record<string, unknown>) => ReactNode;
  gridDensity?: string;
  loading?: boolean;
  emptyMessage?: string;
  /**
   * The open folders' tag keys ("id:instanceId"), held by the owner (the
   * list's URL state); a folder or breadcrumb click is reported through
   * `onPathChange`, which writes it
   */
  path: readonly string[];
  onPathChange: (path: string[]) => void;
}

/**
 * Folder view for browsing content by tag hierarchy.
 * Desktop: Split-pane with tree sidebar + content grid
 * Mobile: Stacked with breadcrumb + content grid
 * The path lists tag keys ("id:instanceId"); a path bookmarked with bare ids
 * is rewritten to them in the URL's `folderPath` in place.
 */
const FolderView = ({
  items,
  tags,
  renderItem,
  gridDensity = "medium",
  loading = false,
  emptyMessage = "No items found",
  path,
  onPathChange,
}: Props) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const urlPath = useMemo(() => [...path], [path]);
  const pageInstanceId = searchParams.get("instance");

  // A path bookmarked with bare ids resolves to the tags' keys once they load
  const currentPath = useMemo(
    () => [...resolveFolderPath(urlPath, tags, pageInstanceId)],
    [urlPath, tags, pageInstanceId]
  );

  // ...and is stored in the URL the new way from then on
  useEffect(() => {
    const resolved = currentPath.join(",");
    if (resolved === urlPath.join(",")) return;
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set("folderPath", resolved);
        return next;
      },
      { replace: true }
    );
  }, [currentPath, urlPath, setSearchParams]);

  // Build folder tree from items and tags
  const {
    folders,
    items: leafItems,
    breadcrumbs,
  } = useMemo(
    () => buildFolderTree(items, tags, currentPath),
    [items, tags, currentPath]
  );

  // Handle folder click - navigate into folder
  const handleFolderClick = useCallback(
    (folder: { id: string }) => {
      if (folder.id === "__untagged__") {
        // Can't navigate into untagged
        return;
      }
      onPathChange([...currentPath, folder.id]);
    },
    [currentPath, onPathChange]
  );

  // Handle breadcrumb navigation
  const handleBreadcrumbNavigate = useCallback(
    (path: string[]) => {
      onPathChange(path);
    },
    [onPathChange]
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

  // Loading skeleton for content area
  const loadingSkeleton = (
    <div className={gridClasses}>
      {Array.from({ length: 12 }).map((_, i) => (
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

  // Mobile layout
  if (isMobile) {
    return (
      <div className="space-y-4">
        {/* Breadcrumb */}
        <FolderBreadcrumb
          breadcrumbs={breadcrumbs}
          onNavigate={handleBreadcrumbNavigate}
        />

        {/* Content grid or loading skeleton */}
        {loading ? (
          loadingSkeleton
        ) : (
          <>
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
          </>
        )}
      </div>
    );
  }

  // Desktop layout with sidebar
  return (
    <div className="flex gap-4 -mx-4 sm:-mx-6 lg:-mx-8">
      {/* Sidebar */}
      {!sidebarCollapsed && (
        <FolderTreeSidebar
          tags={tags}
          currentPath={currentPath}
          onNavigate={onPathChange}
          className="w-64 flex-shrink-0 h-[calc(100vh-200px)] sticky top-4 ml-4 rounded-lg"
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

        {/* Content grid or loading skeleton */}
        {loading ? (
          loadingSkeleton
        ) : (
          <>
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
          </>
        )}
      </div>
    </div>
  );
};

export default FolderView;
