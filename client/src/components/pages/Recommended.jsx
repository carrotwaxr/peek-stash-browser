import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import axios from "axios";
import { useInitialFocus } from "../../hooks/useFocusTrap.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useTVMode } from "../../hooks/useTVMode.js";
import SceneGrid from "../scene-search/SceneGrid.jsx";
import {
  SyncProgressBanner,
  PageHeader,
  PageLayout,
  Pagination,
} from "../ui/index.js";

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
  const [initMessage, setInitMessage] = useState(null);

  // Get pagination params from URL
  const page = parseInt(searchParams.get("page")) || 1;
  const perPage = parseInt(searchParams.get("per_page")) || 24;

  // Calculate total pages
  const totalPages = Math.ceil(totalCount / perPage);

  // Fetch recommended scenes
  useEffect(() => {
    let retryCount = 0;
    const MAX_RETRIES = 60;

    const fetchRecommended = async () => {
      try {
        setLoading(true);
        setError(null);
        setMessage(null);
        setInitMessage(null);

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
        setLoading(false);
      } catch (err) {
        console.error("Error fetching recommended scenes:", err);

        // Check if server is initializing cache
        const isInitializing =
          err.response?.status === 503 && err.response?.data?.ready === false;

        if (isInitializing && retryCount < MAX_RETRIES) {
          setInitMessage("Server is syncing library, please wait...");
          retryCount++;
          setTimeout(() => {
            fetchRecommended();
          }, 5000);
          return;
        }

        setError(err.response?.data?.error || "Failed to load recommendations");
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

    // Scroll to page container (always rendered, unlike pagination which unmounts during loading)
    setTimeout(() => {
      if (pageRef.current) {
        pageRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }, 50);
  };

  // Handle per page change
  const handlePerPageChange = (newPerPage) => {
    const newParams = new URLSearchParams(searchParams);
    newParams.set("per_page", newPerPage.toString());
    newParams.set("page", "1"); // Reset to page 1 when changing per page
    setSearchParams(newParams);

    // Scroll to page container (always rendered, unlike pagination which unmounts during loading)
    setTimeout(() => {
      if (pageRef.current) {
        pageRef.current.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }, 50);
  };

  // Handle successful hide - remove scene from state
  const handleHideSuccess = (sceneId) => {
    setScenes((prev) => prev.filter((s) => s.id !== sceneId));
    setTotalCount((prev) => Math.max(0, prev - 1));
  };

  // Initial focus for TV mode
  useInitialFocus(
    pageRef,
    '[tabindex="0"]',
    !loading && scenes.length > 0 && isTVMode
  );

  return (
    <PageLayout>
      <div ref={pageRef}>
        <PageHeader
          title="Recommended"
          subtitle="Personalized recommendations based on your favorites and ratings"
        />

        {initMessage && <SyncProgressBanner message={initMessage} />}

        {/* Top Pagination */}
        {!loading && !error && !message && !initMessage && totalPages > 1 && (
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

        {/* Scene Grid (includes bottom pagination) */}
        <SceneGrid
          scenes={scenes}
          loading={loading}
          error={!initMessage ? error : null}
          currentPage={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          onHideSuccess={handleHideSuccess}
          perPage={perPage}
          onPerPageChange={handlePerPageChange}
          totalCount={totalCount}
          emptyMessage="No Recommendations Yet"
          emptyDescription="Rate or Favorite more items to get personalized recommendations."
        />
      </div>
    </PageLayout>
  );
};

export default Recommended;
