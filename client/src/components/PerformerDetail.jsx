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
          <div className="flex items-center gap-2 mb-6">
            <Link
              to="/performers"
              className="inline-flex items-center px-3 py-2 rounded-md text-sm transition-colors"
              style={{
                color: "var(--accent-primary)",
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
                border: "1px solid",
              }}
            >
              ← Back to Performers
            </Link>
          </div>

          <div className="flex flex-col lg:flex-row items-start gap-8">
            {/* Performer Image */}
            <div className="flex-shrink-0">
              <div
                className="w-64 h-80 rounded-xl overflow-hidden shadow-lg"
                style={{ backgroundColor: "var(--bg-card)" }}
              >
                {performer?.image_path ? (
                  <img
                    src={performer.image_path}
                    alt={performer.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <svg
                      className="w-24 h-24"
                      style={{ color: "var(--text-muted)" }}
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </div>
                )}
              </div>

              {/* Stats Card */}
              <div
                className="mt-6 p-4 rounded-lg"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  border: "1px solid",
                }}
              >
                <h3
                  className="text-lg font-semibold mb-3"
                  style={{ color: "var(--text-primary)" }}
                >
                  Statistics
                </h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span style={{ color: "var(--text-secondary)" }}>
                      Scenes:
                    </span>
                    <span
                      className="font-medium"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {totalCount}
                    </span>
                  </div>
                  {performer?.rating100 && (
                    <div className="flex justify-between">
                      <span style={{ color: "var(--text-secondary)" }}>
                        Rating:
                      </span>
                      <span
                        className="font-medium"
                        style={{ color: "var(--accent-primary)" }}
                      >
                        {(performer.rating100 / 20).toFixed(1)}/5
                      </span>
                    </div>
                  )}
                  {performer?.o_counter && (
                    <div className="flex justify-between">
                      <span style={{ color: "var(--text-secondary)" }}>
                        O Count:
                      </span>
                      <span
                        className="font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {performer.o_counter}
                      </span>
                    </div>
                  )}
                  {performer?.play_count && (
                    <div className="flex justify-between">
                      <span style={{ color: "var(--text-secondary)" }}>
                        Play Count:
                      </span>
                      <span
                        className="font-medium"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {performer.play_count}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Performer Info */}
            <div className="flex-1">
              <div className="mb-6">
                <h1
                  className="text-4xl font-bold mb-2"
                  style={{ color: "var(--text-primary)" }}
                >
                  {performer?.name || `Performer ${performerId}`}
                </h1>
                {performer?.disambiguation && (
                  <p
                    className="text-lg mb-3"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {performer.disambiguation}
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {performer?.favorite && (
                    <span
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium"
                      style={{
                        backgroundColor: "var(--accent-warning)",
                        color: "white",
                      }}
                    >
                      ⭐ Favorite
                    </span>
                  )}
                  {performer?.gender && (
                    <span
                      className="inline-flex items-center px-3 py-1 rounded-full text-sm"
                      style={{
                        backgroundColor: "var(--bg-tertiary)",
                        color: "var(--text-primary)",
                      }}
                    >
                      {performer.gender}
                    </span>
                  )}
                </div>
              </div>

              {/* Details Section */}
              <div
                className="p-6 rounded-lg mb-6"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  border: "1px solid",
                }}
              >
                <h2
                  className="text-xl font-semibold mb-4"
                  style={{ color: "var(--text-primary)" }}
                >
                  Details
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {performer?.birthdate && (
                    <div>
                      <dt
                        className="text-sm font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Born
                      </dt>
                      <dd
                        className="text-sm"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {new Date(performer.birthdate).toLocaleDateString()}
                        {age && ` (${age} years old)`}
                      </dd>
                    </div>
                  )}

                  {performer?.career_length && (
                    <div>
                      <dt
                        className="text-sm font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Career
                      </dt>
                      <dd
                        className="text-sm"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {performer.career_length}
                      </dd>
                    </div>
                  )}

                  {performer?.country && (
                    <div>
                      <dt
                        className="text-sm font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Country
                      </dt>
                      <dd
                        className="text-sm"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {performer.country}
                      </dd>
                    </div>
                  )}

                  {performer?.ethnicity && (
                    <div>
                      <dt
                        className="text-sm font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Ethnicity
                      </dt>
                      <dd
                        className="text-sm"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {performer.ethnicity}
                      </dd>
                    </div>
                  )}

                  {performer?.eye_color && (
                    <div>
                      <dt
                        className="text-sm font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Eye Color
                      </dt>
                      <dd
                        className="text-sm"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {performer.eye_color}
                      </dd>
                    </div>
                  )}

                  {performer?.hair_color && (
                    <div>
                      <dt
                        className="text-sm font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Hair Color
                      </dt>
                      <dd
                        className="text-sm"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {performer.hair_color}
                      </dd>
                    </div>
                  )}

                  {performer?.height_cm && (
                    <div>
                      <dt
                        className="text-sm font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Height
                      </dt>
                      <dd
                        className="text-sm"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {performer.height_cm} cm
                      </dd>
                    </div>
                  )}

                  {performer?.weight && (
                    <div>
                      <dt
                        className="text-sm font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Weight
                      </dt>
                      <dd
                        className="text-sm"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {performer.weight} kg
                      </dd>
                    </div>
                  )}

                  {performer?.measurements && (
                    <div>
                      <dt
                        className="text-sm font-medium"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Measurements
                      </dt>
                      <dd
                        className="text-sm"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {performer.measurements}
                      </dd>
                    </div>
                  )}
                </div>
              </div>

              {/* Website and Details */}
              {(performer?.url || performer?.details) && (
                <div
                  className="p-4 rounded-lg"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    borderColor: "var(--border-color)",
                    border: "1px solid",
                  }}
                >
                  {performer?.url && (
                    <div className="mb-4">
                      <h3
                        className="text-sm font-medium mb-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Website
                      </h3>
                      <a
                        href={performer.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center text-sm hover:underline"
                        style={{ color: "var(--accent-primary)" }}
                      >
                        {performer.url} ↗
                      </a>
                    </div>
                  )}

                  {performer?.details && (
                    <div>
                      <h3
                        className="text-sm font-medium mb-2"
                        style={{ color: "var(--text-secondary)" }}
                      >
                        Details
                      </h3>
                      <p
                        className="text-sm whitespace-pre-wrap"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {performer.details}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scenes Section */}
        <div className="mt-8">
          <div className="mb-6">
            <h2
              className="text-2xl font-bold mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              Scenes
            </h2>
            <p style={{ color: "var(--text-secondary)" }}>
              {totalCount} scene{totalCount !== 1 ? "s" : ""} featuring{" "}
              {performer?.name || "this performer"}
            </p>
          </div>

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
