import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { isLibraryInitializing } from "../../api/hooks/useLibraryReady";
import { useSimilarScenes } from "../../api/hooks/useScenes";
import SceneGrid from "../scene-search/SceneGrid";
import Pagination from "./Pagination";

interface Props {
  sceneId: string;
  instanceId: string;
  onCountChange?: (count: number) => void;
}

const PER_PAGE = 12;

/**
 * The Similar Scenes tab of the Scene page: one page of "Scenes like this",
 * read through useSimilarScenes (shared with the Recommended sidebar, so
 * page 1 is requested once), paged through the URL's `page`.
 */
const ScenesLikeThis = ({ sceneId, instanceId, onCountChange }: Props) => {
  const [searchParams, setSearchParams] = useSearchParams();
  // The scene the URL's page belongs to: another scene starts on page 1
  const [pageScene, setPageScene] = useState(sceneId);
  // Scenes hidden from this list since it loaded
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  // Get page from URL, default to 1
  const page = parseInt(searchParams.get("page") ?? "1") || 1;

  // Scene changed while mounted: back to page 1 first, then adopt the scene
  useEffect(() => {
    if (pageScene === sceneId) return;
    if (page !== 1) {
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("page");
      setSearchParams(newParams);
      return;
    }
    setHiddenIds(new Set());
    setPageScene(sceneId);
  }, [pageScene, sceneId, page, searchParams, setSearchParams]);

  const { data, error, isPending, isPlaceholderData, isError } =
    useSimilarScenes(sceneId, instanceId, pageScene === sceneId ? page : 1);

  // Notify parent of count change for tab badge
  useEffect(() => {
    if (data && onCountChange) {
      onCountChange(data.count);
    }
  }, [data, onCountChange]);

  const handlePageChange = useCallback(
    (newPage: number) => {
      const newParams = new URLSearchParams(searchParams);
      if (newPage === 1) {
        newParams.delete("page");
      } else {
        newParams.set("page", String(newPage));
      }
      setSearchParams(newParams);
    },
    [searchParams, setSearchParams]
  );

  // Handle successful hide - drop the scene from this list
  const handleHideSuccess = (hiddenSceneId: string) => {
    setHiddenIds((prev) => new Set(prev).add(hiddenSceneId));
  };

  // The library's first sync is running: loading, not failed
  const initializing = isLibraryInitializing(error);
  const loading = isPending || isPlaceholderData || initializing;
  const scenes = (data?.scenes ?? []).filter((s) => !hiddenIds.has(s.id));
  const totalCount = data?.count ?? 0;

  // Show loading/error states, but don't completely hide if empty
  if (isError && !initializing) {
    return (
      <div className="text-center py-8" style={{ color: "var(--text-muted)" }}>
        Failed to load similar scenes
      </div>
    );
  }

  if (!loading && scenes.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: "var(--text-muted)" }}>
        No similar scenes found
      </div>
    );
  }

  const totalPages = Math.ceil(totalCount / PER_PAGE);

  return (
    <>
      {/* Pagination - Top */}
      {!loading && totalPages > 1 && (
        <div className="mb-4">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            perPage={PER_PAGE}
            totalCount={totalCount}
            showInfo={true}
            showPerPageSelector={false}
          />
        </div>
      )}

      {/* Scene Grid - reuse existing component */}
      <SceneGrid
        scenes={scenes}
        loading={loading}
        error={null}
        currentPage={page}
        totalPages={totalPages}
        onPageChange={undefined}
        onSceneClick={undefined}
        fromPageTitle="Similar Scenes"
        onHideSuccess={handleHideSuccess}
        enableKeyboard={false}
        emptyMessage="No similar scenes found"
        emptyDescription=""
      />

      {/* Pagination - Bottom */}
      {!loading && totalPages > 1 && (
        <div className="mt-4">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            perPage={PER_PAGE}
            totalCount={totalCount}
            showInfo={true}
            showPerPageSelector={false}
          />
        </div>
      )}
    </>
  );
};

export default ScenesLikeThis;
