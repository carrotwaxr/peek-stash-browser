import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { SceneGrid } from "./SceneGrid/SceneGrid.jsx";
import { useScenesPaginated } from "../hooks/useLibrary.js";
import { PageHeader, ErrorMessage, LoadingSpinner } from "./ui/index.js";

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
          <div className="flex items-center gap-2 mb-4">
            <Link
              to="/tags"
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              ← Back to Tags
            </Link>
          </div>

          <div className="flex items-start gap-6">
            {/* Tag Image */}
            {tag?.image_path && (
              <div className="flex-shrink-0">
                <img
                  src={tag.image_path}
                  alt={tag.name}
                  className="w-32 h-32 object-cover rounded-lg border border-border"
                  style={{ borderColor: "var(--border-color)" }}
                />
              </div>
            )}

            {/* Tag Info */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-4">
                {tag?.name || `Tag ${tagId}`}
              </h1>

              {/* Tag Badge */}
              <div className="mb-4">
                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  #{tag?.name || tagId}
                </span>
              </div>

              {tag?.description && (
                <div className="mb-4">
                  <span className="text-gray-400">Description:</span>
                  <p className="mt-1 text-gray-300 whitespace-pre-wrap">
                    {tag.description}
                  </p>
                </div>
              )}

              {/* Tag Aliases */}
              {tag?.aliases && tag.aliases.length > 0 && (
                <div className="mb-4">
                  <span className="text-gray-400">Aliases:</span>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {tag.aliases.map((alias, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-2 py-1 rounded text-xs bg-gray-700 text-gray-300"
                      >
                        {alias}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="text-sm text-gray-500">
                {totalCount} scene{totalCount !== 1 ? "s" : ""} with this tag
              </div>
            </div>
          </div>
        </div>

        {/* Scenes Section */}
        <div>
          <PageHeader
            title="Scenes"
            subtitle={`All scenes tagged with ${tag?.name || "this tag"}`}
          />

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
