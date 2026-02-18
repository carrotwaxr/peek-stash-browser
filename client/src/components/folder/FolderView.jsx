// client/src/components/folder/FolderView.jsx
import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { getGridClasses } from "../../constants/grids.js";
import { buildFolderTree } from "../../utils/buildFolderTree.js";
import FolderCard from "./FolderCard.jsx";
import FolderBreadcrumb from "./FolderBreadcrumb.jsx";
import FolderTreeSidebar from "./FolderTreeSidebar.jsx";

/**
 * Folder view for browsing content by tag hierarchy.
 * Desktop: Split-pane with tree sidebar + content grid
 * Mobile: Stacked with breadcrumb + content grid
 */
const FolderView = ({
  items,
  tags,
  renderItem,
  gridDensity = "medium",
  loading = false,
  emptyMessage = "No items found",
  onFolderPathChange, // Callback when folder path changes (for API filtering)
  filters = null, // eslint-disable-line no-unused-vars -- Not used directly but for API consistency
}) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Parse path from URL
  const currentPath = useMemo(() => {
    const pathParam = searchParams.get("folderPath");
    return pathParam ? pathParam.split(",").filter(Boolean) : [];
  }, [searchParams]);

  // Track last notified tag to avoid duplicate notifications
  const lastNotifiedTagRef = useRef(undefined);

  // Sync parent when path changes from any source (handler, browser back/forward, URL edit)
  useEffect(() => {
    const currentTagId = currentPath.length > 0 ? currentPath[currentPath.length - 1] : null;
    if (currentTagId !== lastNotifiedTagRef.current) {
      lastNotifiedTagRef.current = currentTagId;
      onFolderPathChange?.(currentTagId);
    }
  }, [currentPath, onFolderPathChange]);

  // Update URL when path changes - also reset page to 1
  const setCurrentPath = useCallback(
    (newPath) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        if (newPath.length > 0) {
          next.set("folderPath", newPath.join(","));
        } else {
          next.delete("folderPath");
        }
        // Reset to page 1 when navigating folders to avoid stale pagination state
        next.delete("page");
        return next;
      });
      // Eagerly notify parent (effect will deduplicate via ref)
      const currentTagId = newPath.length > 0 ? newPath[newPath.length - 1] : null;
      lastNotifiedTagRef.current = currentTagId;
      onFolderPathChange?.(currentTagId);
    },
    [setSearchParams, onFolderPathChange]
  );

  // Build folder tree from items and tags
  const { folders, items: leafItems, breadcrumbs } = useMemo(
    () => buildFolderTree(items, tags, currentPath),
    [items, tags, currentPath]
  );

  // Handle folder click - navigate into folder
  const handleFolderClick = useCallback(
    (folder) => {
      if (folder.id === "__untagged__") {
        // Can't navigate into untagged
        return;
      }
      setCurrentPath([...currentPath, folder.id]);
    },
    [currentPath, setCurrentPath]
  );

  // Handle breadcrumb navigation
  const handleBreadcrumbNavigate = useCallback(
    (path) => {
      setCurrentPath(path);
    },
    [setCurrentPath]
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
      {[...Array(12)].map((_, i) => (
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
          onNavigate={setCurrentPath}
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
