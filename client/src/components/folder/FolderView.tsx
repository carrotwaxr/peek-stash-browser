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
  type FolderCountField,
  UNTAGGED_FOLDER_ID,
  buildFolderTree,
  resolveFolderPath,
} from "../../utils/buildFolderTree";
import { EmptyState } from "../ui/index";
import FolderBreadcrumb from "./FolderBreadcrumb";
import FolderCard from "./FolderCard";
import FolderTreeSidebar from "./FolderTreeSidebar";

/** A tag tree row, as the folders and the sidebar read it */
interface FolderViewTag {
  id: string;
  instanceId?: string | null;
  name: string;
  parents?: Array<{ id: string }>;
  image_path?: string | null;
  scene_count?: number | null;
  gallery_count?: number | null;
  image_count?: number | null;
}

interface Props {
  /** The list's page: inside a folder, the folder's own items */
  items: Array<Record<string, unknown>>;
  /** The list's total, the folder's own items */
  itemCount: number;
  tags: FolderViewTag[];
  /** The tree's count of the page's type, the folders' badges */
  countField: FolderCountField;
  /**
   * The tree's count of the page's untagged items: the root shows Untagged
   * while it is above 0
   */
  untaggedCount?: number;
  /** The page's item, lower case: one and many ("gallery", "galleries") */
  entityLabel: { one: string; many: string };
  renderItem: (item: Record<string, unknown>) => ReactNode;
  gridDensity?: string;
  /** The tag tree is loading */
  loading?: boolean;
  /** The folder's page is loading */
  itemsLoading?: boolean;
  /**
   * The open folders' tag keys ("id:instanceId"), held by the owner (the
   * list's URL state); a folder or breadcrumb click is reported through
   * `onPathChange`, which writes it
   */
  path: readonly string[];
  onPathChange: (path: string[]) => void;
}

/**
 * Folder view for browsing content by tag hierarchy: the open folder's
 * sub-folders, unpaged, above its own items, the list's page as it is (the
 * owner asks for the folder's tag at depth 0 and pages it). At the root,
 * folders only, Untagged last while the page's type has untagged items.
 * Each folder shows how many items of the page's type carry its tag
 * directly.
 * Desktop: Split-pane with tree sidebar + content grid
 * Mobile: Stacked with breadcrumb + content grid
 * The path lists tag keys ("id:instanceId"); a path bookmarked with bare ids
 * is rewritten to them in the URL's `folderPath` in place.
 */
const FolderView = ({
  items,
  itemCount,
  tags,
  countField,
  untaggedCount = 0,
  entityLabel,
  renderItem,
  gridDensity = "medium",
  loading = false,
  itemsLoading = false,
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

  const { folders, breadcrumbs } = useMemo(
    () => buildFolderTree(tags, currentPath, countField, untaggedCount),
    [tags, currentPath, countField, untaggedCount]
  );
  const atRoot = currentPath.length === 0;
  const { many } = entityLabel;
  const counted = (n: number) =>
    `${n} ${n === 1 ? entityLabel.one : entityLabel.many}`;
  const folderName = breadcrumbs.at(-1)?.name ?? "";

  // Handle folder click - navigate into folder
  const handleFolderClick = useCallback(
    (folder: { id: string }) => {
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

  const skeleton = (count: number) => (
    <div className={gridClasses}>
      {Array.from({ length: count }).map((_, i) => (
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

  const renderItems = () => {
    if (itemsLoading) return skeleton(12);
    if (items.length === 0) {
      return (
        <EmptyState
          title={
            currentPath.at(-1) === UNTAGGED_FOLDER_ID
              ? `No untagged ${many}`
              : `No ${many} directly in ${folderName}`
          }
          {...(folders.length > 0 && {
            description: `Open a folder above for its ${many}`,
          })}
        />
      );
    }
    return (
      <>
        <p className="text-sm mb-3" style={{ color: "var(--text-muted)" }}>
          {counted(itemCount)} in this folder
        </p>
        <div className={gridClasses}>
          {items.map((item) => renderItem(item))}
        </div>
      </>
    );
  };

  const content = loading ? (
    skeleton(12)
  ) : (
    <div className="space-y-6">
      {folders.length > 0 && (
        <div className={gridClasses}>
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              folder={folder}
              countLabel={counted}
              onClick={handleFolderClick}
            />
          ))}
        </div>
      )}
      {atRoot
        ? folders.length === 0 && (
            <EmptyState
              title={`No folders with ${many}`}
              description={`No tag you can see is on any of your ${many}`}
            />
          )
        : renderItems()}
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

        {content}
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

        {content}
      </div>
    </div>
  );
};

export default FolderView;
