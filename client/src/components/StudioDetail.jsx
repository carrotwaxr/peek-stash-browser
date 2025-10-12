import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { SceneGrid } from "./SceneGrid/SceneGrid.jsx";
import { useScenesPaginated } from "../hooks/useLibrary.js";
import { PageHeader, ErrorMessage, LoadingSpinner } from "./ui/index.js";

const StudioDetail = () => {
  const { studioId } = useParams();
  const [studio, setStudio] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch scenes filtered by this studio
  const {
    data: paginatedData,
    loading: scenesLoading,
    error: scenesError,
  } = useScenesPaginated({
    page: currentPage,
    perPage: 24,
    studio_filter: { studios: { value: [studioId], modifier: "INCLUDES" } },
  });

  // Extract studio info from the first scene (since we don't have a dedicated studio endpoint)
  useEffect(() => {
    if (paginatedData?.scenes?.length > 0) {
      const firstScene = paginatedData.scenes[0];
      const studioInfo = firstScene.studio;
      if (studioInfo && studioInfo.id === studioId) {
        setStudio(studioInfo);
      }
    }
  }, [paginatedData, studioId]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const scenes = paginatedData?.scenes || [];
  const totalCount = paginatedData?.count || 0;

  if (scenesLoading && !studio) {
    return <LoadingSpinner />;
  }

  if (scenesError) {
    return <ErrorMessage message={scenesError.message} />;
  }

  return (
    <div className="min-h-screen px-4 lg:px-6 xl:px-8">
      <div className="max-w-none">
        {/* Studio Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Link
              to="/studios"
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              ← Back to Studios
            </Link>
          </div>

          <div className="flex items-start gap-6">
            {/* Studio Image */}
            {studio?.image_path && (
              <div className="flex-shrink-0">
                <img
                  src={studio.image_path}
                  alt={studio.name}
                  className="w-32 h-32 object-cover rounded-lg border border-border"
                  style={{ borderColor: "var(--border-color)" }}
                />
              </div>
            )}

            {/* Studio Info */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-2">
                {studio?.name || `Studio ${studioId}`}
              </h1>

              {studio?.url && (
                <p className="mb-2">
                  <span className="text-gray-400">Website:</span>{" "}
                  <a
                    href={studio.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    {studio.url}
                  </a>
                </p>
              )}

              {studio?.details && (
                <div className="mb-4">
                  <span className="text-gray-400">Details:</span>
                  <p className="mt-1 text-gray-300 whitespace-pre-wrap">
                    {studio.details}
                  </p>
                </div>
              )}

              <div className="text-sm text-gray-500">
                {totalCount} scene{totalCount !== 1 ? "s" : ""} from this studio
              </div>
            </div>
          </div>
        </div>

        {/* Scenes Section */}
        <div>
          <PageHeader
            title="Scenes"
            subtitle={`All scenes from ${studio?.name || "this studio"}`}
          />

          {scenes.length === 0 && !scenesLoading ? (
            <div className="text-center py-12">
              <p className="text-gray-400 mb-2">
                No scenes found for this studio
              </p>
              <p className="text-sm text-gray-500">
                This might indicate the studio filter isn't working correctly
              </p>
            </div>
          ) : (
            <SceneGrid
              scenes={scenes}
              loading={scenesLoading}
              error={scenesError}
              totalCount={totalCount}
              currentPage={currentPage}
              itemsPerPage={24}
              onPageChange={handlePageChange}
              enableKeyboard={true}
              emptyMessage="No scenes found for this studio"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default StudioDetail;
