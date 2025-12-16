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
  const [criteria, setCriteria] = useState(null);

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

        const {
          scenes: fetchedScenes,
          count,
          message: msg,
          criteria: criteriaCounts,
        } = response.data;

        setScenes(fetchedScenes);
        setTotalCount(count);
        setCriteria(criteriaCounts || null);
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

        setError({
          message: err.response?.data?.error || "Failed to load recommendations",
          errorType: err.response?.data?.errorType || null,
        });
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

  // Render criteria feedback for empty state
  const renderCriteriaFeedback = () => {
    if (!criteria) return null;

    const hasAnyActivity =
      criteria.favoritedPerformers > 0 ||
      criteria.ratedPerformers > 0 ||
      criteria.favoritedStudios > 0 ||
      criteria.ratedStudios > 0 ||
      criteria.favoritedTags > 0 ||
      criteria.ratedTags > 0 ||
      criteria.favoritedScenes > 0 ||
      criteria.ratedScenes > 0;

    if (!hasAnyActivity) {
      return (
        <div className="text-gray-400 text-sm mt-2">
          <p>
            To get personalized suggestions, try favoriting or rating (7.0+)
            performers, studios, tags, or scenes you enjoy.
          </p>
        </div>
      );
    }

    return (
      <div className="text-gray-400 text-sm mt-2">
        <p className="mb-2">Your current activity:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            {criteria.favoritedPerformers} favorited performer
            {criteria.favoritedPerformers !== 1 ? "s" : ""},{" "}
            {criteria.ratedPerformers} highly-rated
          </li>
          <li>
            {criteria.favoritedStudios} favorited studio
            {criteria.favoritedStudios !== 1 ? "s" : ""},{" "}
            {criteria.ratedStudios} highly-rated
          </li>
          <li>
            {criteria.favoritedTags} favorited tag
            {criteria.favoritedTags !== 1 ? "s" : ""}, {criteria.ratedTags}{" "}
            highly-rated
          </li>
          <li>
            {criteria.favoritedScenes} favorited scene
            {criteria.favoritedScenes !== 1 ? "s" : ""}, {criteria.ratedScenes}{" "}
            rated scene
            {criteria.ratedScenes !== 1 ? "s" : ""}
          </li>
        </ul>
        <p className="mt-2 italic">
          Tip: Rating more scenes helps us learn your preferences!
        </p>
      </div>
    );
  };

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

        {/* Error type display */}
        {error && error.errorType && (
          <div className="mb-4 text-sm text-gray-500">
            (Error type: {error.errorType})
          </div>
        )}

        {/* Scene Grid (includes bottom pagination) */}
        <SceneGrid
          scenes={scenes}
          loading={loading}
          error={!initMessage && error ? error.message : null}
          currentPage={page}
          totalPages={totalPages}
          onPageChange={handlePageChange}
          onHideSuccess={handleHideSuccess}
          perPage={perPage}
          onPerPageChange={handlePerPageChange}
          totalCount={totalCount}
          emptyMessage={message || "No Recommendations Yet"}
          emptyDescription={
            criteria
              ? renderCriteriaFeedback()
              : "Rate or Favorite more items to get personalized recommendations."
          }
        />
      </div>
    </PageLayout>
  );
};

export default Recommended;
