import { useEffect, useState } from "react";
import axios from "axios";
import SceneGrid from "../scene-search/SceneGrid.jsx";
import Pagination from "./Pagination.jsx";

const ScenesLikeThis = ({ sceneId }) => {
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const perPage = 12;

  // Fetch similar scenes for a specific page
  const fetchSimilarScenes = async (pageNum) => {
    try {
      setLoading(true);
      setError(null);

      const response = await axios.get(
        `/api/library/scenes/${sceneId}/similar?page=${pageNum}`,
        { withCredentials: true }
      );

      const { scenes: newScenes, count } = response.data;
      setScenes(newScenes);
      setTotalCount(count);
    } catch (err) {
      console.error("Error fetching similar scenes:", err);
      setError(err.response?.data?.error || "Failed to load similar scenes");
    } finally {
      setLoading(false);
    }
  };

  // Fetch data when sceneId or page changes
  useEffect(() => {
    fetchSimilarScenes(page);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sceneId, page]);

  // Reset to page 1 when sceneId changes
  useEffect(() => {
    setPage(1);
  }, [sceneId]);

  const handlePageChange = (newPage) => {
    setPage(newPage);
    // Scroll to top of section
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Handle successful hide - remove scene from state
  const handleHideSuccess = (hiddenSceneId) => {
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
        onPageChange={null}
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
