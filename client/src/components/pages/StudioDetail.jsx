import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import SceneGrid from "../scene-search/SceneGrid.jsx";
import { useScenesPaginated } from "../../hooks/useLibrary.js";
import { PageHeader, ErrorMessage, LoadingSpinner } from "../ui/index.js";

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
          <div className="flex items-center justify-between mb-6">
            <Link
              to="/studios"
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors hover:bg-primary/10"
              style={{ color: "var(--text-secondary)" }}
            >
              <svg
                className="w-4 h-4 mr-1.5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              Back to Studios
            </Link>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            {/* Studio Image */}
            <div className="flex-shrink-0 mx-auto lg:mx-0">
              {studio?.image_path ? (
                <img
                  src={studio.image_path}
                  alt={studio.name}
                  className="w-40 h-40 lg:w-48 lg:h-48 object-cover rounded-lg shadow-lg"
                  style={{
                    borderColor: "var(--border-color)",
                    border: "1px solid var(--border-color)",
                  }}
                />
              ) : (
                <div
                  className="w-40 h-40 lg:w-48 lg:h-48 rounded-lg flex items-center justify-center shadow-lg"
                  style={{
                    backgroundColor: "var(--background-secondary)",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <svg
                    className="w-16 h-16"
                    style={{ color: "var(--text-secondary)" }}
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Studio Info */}
            <div className="flex-1 text-center lg:text-left">
              <h1
                className="text-3xl lg:text-4xl font-bold mb-4"
                style={{ color: "var(--text-primary)" }}
              >
                {studio?.name || `Studio ${studioId}`}
              </h1>

              {/* Statistics Card */}
              <div
                className="p-4 rounded-lg mb-6 inline-block"
                style={{
                  backgroundColor: "var(--background-secondary)",
                  border: "1px solid var(--border-color)",
                }}
              >
                <div className="grid grid-cols-1 gap-2 text-sm">
                  <div>
                    <span style={{ color: "var(--text-secondary)" }}>
                      Total Scenes:{" "}
                    </span>
                    <span
                      className="font-semibold"
                      style={{ color: "var(--primary-color)" }}
                    >
                      {totalCount}
                    </span>
                  </div>
                </div>
              </div>

              {/* Website and Details Cards */}
              <div className="grid grid-cols-1 gap-4 mb-6">
                {studio?.url && (
                  <div
                    className="p-4 rounded-lg"
                    style={{
                      backgroundColor: "var(--background-secondary)",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <h3
                      className="font-semibold mb-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Website
                    </h3>
                    <a
                      href={studio.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center hover:underline transition-colors"
                      style={{ color: "var(--primary-color)" }}
                    >
                      {studio.url}
                      <svg
                        className="w-4 h-4 ml-1"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                        />
                      </svg>
                    </a>
                  </div>
                )}

                {studio?.details && (
                  <div
                    className="p-4 rounded-lg"
                    style={{
                      backgroundColor: "var(--background-secondary)",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <h3
                      className="font-semibold mb-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Details
                    </h3>
                    <p
                      className="whitespace-pre-wrap"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {studio.details}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Scenes Section */}
        <div>
          <div className="mb-6">
            <h2
              className="text-2xl font-bold mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              Scenes
              <span
                className="ml-2 text-lg font-normal"
                style={{ color: "var(--text-secondary)" }}
              >
                ({totalCount})
              </span>
            </h2>
            <p style={{ color: "var(--text-secondary)" }}>
              All scenes from {studio?.name || "this studio"}
            </p>
          </div>

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
