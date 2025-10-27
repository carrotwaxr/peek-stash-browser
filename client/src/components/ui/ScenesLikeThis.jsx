import { useState, useEffect } from "react";
import axios from "axios";
import SceneGrid from "../scene-search/SceneGrid.jsx";
import Button from "./Button.jsx";

const ScenesLikeThis = ({ sceneId }) => {
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const perPage = 12;

  // Fetch similar scenes
  const fetchSimilarScenes = async (pageNum, isLoadMore = false) => {
    try {
      if (isLoadMore) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const response = await axios.get(
        `/api/library/scenes/${sceneId}/similar?page=${pageNum}`,
        { withCredentials: true }
      );

      const { scenes: newScenes, count } = response.data;

      if (pageNum === 1) {
        setScenes(newScenes);
      } else {
        // Append for "Load More"
        setScenes((prev) => [...prev, ...newScenes]);
      }

      setTotalCount(count);
      setHasMore((pageNum * perPage) < count);
    } catch (err) {
      console.error("Error fetching similar scenes:", err);
      setError(err.response?.data?.error || "Failed to load similar scenes");
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Fetch data after component mounts (lazy loading)
  useEffect(() => {
    setPage(1);
    setScenes([]);
    fetchSimilarScenes(1);
  }, [sceneId]);

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchSimilarScenes(nextPage, true);
  };

  // Don't render anything if error or no results
  if (error) {
    return null; // Silently fail - this is a nice-to-have feature
  }

  if (!loading && scenes.length === 0) {
    return null; // No similar scenes found - don't show section
  }

  return (
    <div className="w-full py-8">
      {/* Section Header */}
      <div className="mb-6">
        <h2
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Recommended Scenes
        </h2>
      </div>

      {/* Scene Grid - reuse existing component */}
      <SceneGrid
        scenes={scenes}
        loading={loading}
        error={null}
        currentPage={1}
        totalPages={1}
        onPageChange={null}
        enableKeyboard={false}
        emptyMessage="No similar scenes found"
        emptyDescription=""
      />

      {/* Load More Button */}
      {!loading && !loadingMore && hasMore && (
        <div className="flex justify-center mt-8">
          <Button
            onClick={handleLoadMore}
            variant="secondary"
            className="px-8 py-3"
          >
            Load More
          </Button>
        </div>
      )}

      {/* Loading More Indicator */}
      {loadingMore && (
        <div className="flex justify-center mt-8">
          <div className="text-sm" style={{ color: "var(--text-muted)" }}>
            Loading more scenes...
          </div>
        </div>
      )}
    </div>
  );
};

export default ScenesLikeThis;
