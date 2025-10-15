import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import SceneGrid from "../scene-search/SceneGrid.jsx";
import { useScenesPaginated } from "../../hooks/useLibrary.js";
import { PageHeader, ErrorMessage, LoadingSpinner } from "../ui/index.js";

const TagDetail = () => {
  const { tagId } = useParams();
  const [tag, setTag] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch scenes filtered by this tag
  const {
    data: paginatedData,
    loading: scenesLoading,
    error: scenesError,
  } = useScenesPaginated({
    page: currentPage,
    perPage: 24,
    scene_filter: { tags: { value: [tagId], modifier: "INCLUDES" } },
  });

  // Extract tag info from the first scene (since we don't have a dedicated tag endpoint)
  useEffect(() => {
    if (paginatedData?.scenes?.length > 0) {
      for (const scene of paginatedData.scenes) {
        const tagInfo = scene.tags?.find((t) => t.id === tagId);
        if (tagInfo) {
          setTag(tagInfo);
          break;
        }
      }
    }
  }, [paginatedData, tagId]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const scenes = paginatedData?.scenes || [];
  const totalCount = paginatedData?.count || 0;

  if (scenesLoading && !tag) {
    return <LoadingSpinner />;
  }

  if (scenesError) {
    return <ErrorMessage message={scenesError.message} />;
  }

  return (
    <div className="min-h-screen px-4 lg:px-6 xl:px-8">
      <div className="max-w-none">
        {/* Tag Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-6">
            <Link
              to="/tags"
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
              Back to Tags
            </Link>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-start gap-6">
            {/* Tag Image */}
            <div className="flex-shrink-0 mx-auto lg:mx-0">
              {tag?.image_path ? (
                <img
                  src={tag.image_path}
                  alt={tag.name}
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
                    <path d="M7.5 3A1.5 1.5 0 006 4.5v15A1.5 1.5 0 007.5 21h9a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06L13.94 2.94A1.5 1.5 0 0012.879 2.5H7.5z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Tag Info */}
            <div className="flex-1 text-center lg:text-left">
              <div className="mb-6">
                <h1
                  className="text-3xl lg:text-4xl font-bold mb-3"
                  style={{ color: "var(--text-primary)" }}
                >
                  {tag?.name || `Tag ${tagId}`}
                </h1>

                {/* Tag Badge */}
                <div
                  className="inline-flex items-center px-4 py-2 rounded-full text-sm font-semibold"
                  style={{
                    backgroundColor: "var(--primary-color)",
                    color: "var(--background-primary)",
                  }}
                >
                  #{tag?.name || tagId}
                </div>
              </div>

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

              {/* Description and Aliases Cards */}
              <div className="grid grid-cols-1 gap-4 mb-6">
                {tag?.description && (
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
                      Description
                    </h3>
                    <p
                      className="whitespace-pre-wrap"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      {tag.description}
                    </p>
                  </div>
                )}

                {/* Tag Aliases */}
                {tag?.aliases && tag.aliases.length > 0 && (
                  <div
                    className="p-4 rounded-lg"
                    style={{
                      backgroundColor: "var(--background-secondary)",
                      border: "1px solid var(--border-color)",
                    }}
                  >
                    <h3
                      className="font-semibold mb-3"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Aliases
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {tag.aliases.map((alias, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                          style={{
                            backgroundColor: "var(--primary-color)",
                            color: "var(--background-primary)",
                            opacity: "0.8",
                          }}
                        >
                          {alias}
                        </span>
                      ))}
                    </div>
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
              All scenes tagged with {tag?.name || "this tag"}
            </p>
          </div>

          {scenes.length === 0 && !scenesLoading ? (
            <div className="text-center py-12">
              <p className="text-gray-400 mb-2">No scenes found for this tag</p>
              <p className="text-sm text-gray-500">
                This might indicate the tag filter isn't working correctly
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
              emptyMessage="No scenes found for this tag"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default TagDetail;
