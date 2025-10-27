import { useState, useRef, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { PageHeader, PageLayout } from "../ui/index.js";
import SceneGrid from "../scene-search/SceneGrid.jsx";
import Pagination from "../ui/Pagination.jsx";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { useTVMode } from "../../hooks/useTVMode.js";

const Recommended = () => {
  usePageTitle("Recommended");
  const [searchParams, setSearchParams] = useSearchParams();
  const pageRef = useRef(null);
  const { isTVMode } = useTVMode();

  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalCount, setTotalCount] = useState(0);
  const [message, setMessage] = useState(null);

  // Get pagination params from URL
  const page = parseInt(searchParams.get("page")) || 1;
  const perPage = parseInt(searchParams.get("per_page")) || 24;

  // Calculate total pages
  const totalPages = Math.ceil(totalCount / perPage);

  // Fetch recommended scenes
  useEffect(() => {
    const fetchRecommended = async () => {
      try {
        setLoading(true);
        setError(null);
        setMessage(null);

        const response = await axios.get(
          `/api/library/scenes/recommended?page=${page}&per_page=${perPage}`,
          { withCredentials: true }
        );

        const { scenes: fetchedScenes, count, message: msg } = response.data;

        setScenes(fetchedScenes);
        setTotalCount(count);
        if (msg) {
          setMessage(msg);
        }
      } catch (err) {
        console.error("Error fetching recommended scenes:", err);
        setError(err.response?.data?.error || "Failed to load recommendations");
      } finally {
        setLoading(false);
      }
    };

    fetchRecommended();
  }, [page, perPage]);

  // Handle page change
  const handlePageChange = (newPage) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("page", newPage.toString());
    setSearchParams(newParams);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Handle per page change
  const handlePerPageChange = (newPerPage) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("per_page", newPerPage.toString());
    newParams.set("page", "1"); // Reset to page 1 when changing per page
    setSearchParams(newParams);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Initial focus for TV mode
  useInitialFocus(pageRef, '[tabindex="0"]', !loading && scenes.length > 0 && isTVMode);

  return (
    <PageLayout>
      <div ref={pageRef}>
        <PageHeader
          title="Recommended"
          subtitle="Personalized recommendations based on your favorites and ratings"
        />

        {/* Top Pagination */}
        {!loading && !error && !message && totalPages > 1 && (
          <div className="mb-6">
            <Pagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={handlePageChange}
              perPage={perPage}
              onPerPageChange={handlePerPageChange}
              totalCount={totalCount}
            />
          </div>
        )}

        {/* Empty state message */}
        {!loading && message && (
          <div className="flex items-center justify-center py-16">
            <div className="text-center max-w-md">
              <div className="text-6xl mb-4" style={{ color: "var(--text-muted)" }}>
                ⭐
              </div>
              <h3
                className="text-xl font-medium mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                No Recommendations Yet
              </h3>
              <p className="text-base" style={{ color: "var(--text-secondary)" }}>
                {message}
              </p>
            </div>
          </div>
        )}

        {/* Scene Grid (includes bottom pagination) */}
        <SceneGrid
          scenes={scenes}
          loading={loading}
          error={error}
          currentPage={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          perPage={perPage}
          onPerPageChange={handlePerPageChange}
          totalCount={totalCount}
          emptyMessage="No recommendations found"
          emptyDescription="This shouldn't happen - please report this issue"
        />
      </div>
    </PageLayout>
  );
};

export default Recommended;
