import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { SceneGrid } from "./SceneGrid/SceneGrid.jsx";
import { useScenesPaginated } from "../hooks/useLibrary.js";
import { PageHeader, ErrorMessage, LoadingSpinner } from "./ui/index.js";

const PerformerDetail = () => {
  const { performerId } = useParams();
  const [performer, setPerformer] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);

  // Fetch scenes filtered by this performer
  const {
    data: paginatedData,
    loading: scenesLoading,
    error: scenesError,
  } = useScenesPaginated({
    page: currentPage,
    perPage: 24,
    scene_filter: {
      performers: { value: [performerId], modifier: "INCLUDES" },
    },
  });

  // Extract performer info from the first scene (since we don't have a dedicated performer endpoint)
  useEffect(() => {
    if (paginatedData?.scenes?.length > 0) {
      for (const scene of paginatedData.scenes) {
        const performerInfo = scene.performers?.find(
          (p) => p.id === performerId
        );
        if (performerInfo) {
          setPerformer(performerInfo);
          break;
        }
      }
    }
  }, [paginatedData, performerId]);

  const handlePageChange = (page) => {
    setCurrentPage(page);
  };

  const scenes = paginatedData?.scenes || [];
  const totalCount = paginatedData?.count || 0;

  // Calculate age from birthdate
  const getAge = (birthdate) => {
    if (!birthdate) return null;
    const birth = new Date(birthdate);
    const today = new Date();
    const age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      return age - 1;
    }
    return age;
  };

  if (scenesLoading && !performer) {
    return <LoadingSpinner />;
  }

  if (scenesError) {
    return <ErrorMessage message={scenesError.message} />;
  }

  const age = performer?.birthdate ? getAge(performer.birthdate) : null;

  return (
    <div className="min-h-screen px-4 lg:px-6 xl:px-8">
      <div className="max-w-none">
        {/* Performer Header */}
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <Link
              to="/performers"
              className="text-blue-400 hover:text-blue-300 text-sm"
            >
              ← Back to Performers
            </Link>
          </div>

          <div className="flex items-start gap-6">
            {/* Performer Image */}
            {performer?.image_path && (
              <div className="flex-shrink-0">
                <img
                  src={performer.image_path}
                  alt={performer.name}
                  className="w-48 h-64 object-cover rounded-lg border border-border"
                  style={{ borderColor: "var(--border-color)" }}
                />
              </div>
            )}

            {/* Performer Info */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold mb-4">
                {performer?.name || `Performer ${performerId}`}
              </h1>

              {/* Basic Info Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {performer?.birthdate && (
                  <div>
                    <span className="text-gray-400">Born:</span>
                    <p className="font-medium">
                      {new Date(performer.birthdate).toLocaleDateString()}
                      {age && ` (${age} years old)`}
                    </p>
                  </div>
                )}

                {performer?.career_length && (
                  <div>
                    <span className="text-gray-400">Career:</span>
                    <p className="font-medium">{performer.career_length}</p>
                  </div>
                )}

                {performer?.country && (
                  <div>
                    <span className="text-gray-400">Country:</span>
                    <p className="font-medium">{performer.country}</p>
                  </div>
                )}

                {performer?.ethnicity && (
                  <div>
                    <span className="text-gray-400">Ethnicity:</span>
                    <p className="font-medium">{performer.ethnicity}</p>
                  </div>
                )}

                {performer?.eye_color && (
                  <div>
                    <span className="text-gray-400">Eye Color:</span>
                    <p className="font-medium">{performer.eye_color}</p>
                  </div>
                )}

                {performer?.hair_color && (
                  <div>
                    <span className="text-gray-400">Hair Color:</span>
                    <p className="font-medium">{performer.hair_color}</p>
                  </div>
                )}

                {performer?.height_cm && (
                  <div>
                    <span className="text-gray-400">Height:</span>
                    <p className="font-medium">{performer.height_cm} cm</p>
                  </div>
                )}

                {performer?.weight && (
                  <div>
                    <span className="text-gray-400">Weight:</span>
                    <p className="font-medium">{performer.weight} kg</p>
                  </div>
                )}

                {performer?.measurements && (
                  <div>
                    <span className="text-gray-400">Measurements:</span>
                    <p className="font-medium">{performer.measurements}</p>
                  </div>
                )}
              </div>

              {performer?.url && (
                <p className="mb-4">
                  <span className="text-gray-400">Website:</span>{" "}
                  <a
                    href={performer.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-400 hover:text-blue-300"
                  >
                    {performer.url}
                  </a>
                </p>
              )}

              {performer?.details && (
                <div className="mb-4">
                  <span className="text-gray-400">Details:</span>
                  <p className="mt-1 text-gray-300 whitespace-pre-wrap">
                    {performer.details}
                  </p>
                </div>
              )}

              <div className="text-sm text-gray-500">
                {totalCount} scene{totalCount !== 1 ? "s" : ""} featuring this
                performer
              </div>
            </div>
          </div>
        </div>

        {/* Scenes Section */}
        <div>
          <PageHeader
            title="Scenes"
            subtitle={`All scenes featuring ${
              performer?.name || "this performer"
            }`}
          />

          {scenes.length === 0 && !scenesLoading ? (
            <div className="text-center py-12">
              <p className="text-gray-400 mb-2">
                No scenes found for this performer
              </p>
              <p className="text-sm text-gray-500">
                This might indicate the performer filter isn't working correctly
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
              emptyMessage="No scenes found for this performer"
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default PerformerDetail;
