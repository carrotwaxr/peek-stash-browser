import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { NormalizedScene } from "@peek/shared-types";
import { apiGet } from "../../api";
import SceneGrid from "../scene-search/SceneGrid";
import Pagination from "./Pagination";

interface Props {
  sceneId: string;
  onCountChange?: (count: number) => void;
}

const ScenesLikeThis = ({ sceneId, onCountChange }: Props) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [scenes, setScenes] = useState<NormalizedScene[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const perPage = 12;
  const prevSceneIdRef = useRef(sceneId);

  // Get page from URL, default to 1
  const page = parseInt(searchParams.get("page") ?? "1") || 1;

  // Memoized fetch function
  const fetchSimilarScenes = useCallback(async (pageNum: number, currentSceneId: string) => {
    try {
      setLoading(true);
      setError(null);

      const data = await apiGet(
        `/library/scenes/${currentSceneId}/similar?page=${pageNum}`,
      );

      const { scenes: newScenes, count } = data as { scenes: NormalizedScene[]; count: number };
      setScenes(newScenes);
      setTotalCount(count);
      // Notify parent of count change for tab badge
      if (onCountChange) {
        onCountChange(count);
      }
    } catch (err) {
      console.error("Error fetching similar scenes:", err);
      setError((err as Error).message || "Failed to load similar scenes");
    } finally {
      setLoading(false);
    }
  }, [onCountChange]);

  // Combined effect: reset page on scene change, then fetch
  // This prevents the race condition of two separate effects
  useEffect(() => {
    const sceneChanged = prevSceneIdRef.current !== sceneId;
    prevSceneIdRef.current = sceneId;

    if (sceneChanged && page !== 1) {
      // Scene changed and we're not on page 1 - reset to page 1
      // This will trigger this effect again with page=1
      const newParams = new URLSearchParams(searchParams);
      newParams.delete("page");
      setSearchParams(newParams);
      return; // Don't fetch yet, wait for page reset
    }

    // Either scene didn't change, or we're already on page 1
    fetchSimilarScenes(page, sceneId);
  }, [sceneId, page, searchParams, setSearchParams, fetchSimilarScenes]);

  const handlePageChange = useCallback((newPage: number) => {
    const newParams = new URLSearchParams(searchParams);
    if (newPage === 1) {
      newParams.delete("page");
    } else {
      newParams.set("page", String(newPage));
    }
    setSearchParams(newParams);
  }, [searchParams, setSearchParams]);

  // Handle successful hide - remove scene from state
  const handleHideSuccess = (hiddenSceneId: string) => {
    setScenes((prev) => prev.filter((s) => s.id !== hiddenSceneId));
  };

  // Show loading/error states, but don't completely hide if empty
  if (error) {
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

  const totalPages = Math.ceil(totalCount / perPage);

  return (
    <>
      {/* Pagination - Top */}
      {!loading && totalPages > 1 && (
        <div className="mb-4">
          <Pagination
            currentPage={page}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            perPage={perPage}
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
            perPage={perPage}
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
