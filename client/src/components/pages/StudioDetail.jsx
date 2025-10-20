import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import SceneSearch from "../scene-search/SceneSearch.jsx";
import { libraryApi } from "../../services/api.js";
import LoadingSpinner from "../ui/LoadingSpinner.jsx";
import { LucideStar } from "lucide-react";
import { usePageTitle } from "../../hooks/usePageTitle.js";

const StudioDetail = () => {
  const { studioId } = useParams();
  const [isLoading, setIsLoading] = useState(true);
  const [studio, setStudio] = useState(null);

  // Set page title to studio name
  usePageTitle(studio?.name || "Studio");


  useEffect(() => {
    const fetchStudio = async () => {
      try {
        setIsLoading(true);
        const studioData = await getStudio(studioId);
        setStudio(studioData);
      } catch {
        // Error loading studio - will show loading spinner
      } finally {
        setIsLoading(false);
      }
    };

    fetchStudio();
  }, [studioId]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 lg:px-6 xl:px-8">
      <div className="max-w-none">
        {/* Back Button */}
        <div className="mt-6 mb-6">
          <Link
            to="/studios"
            className="inline-flex items-center gap-2 px-4 py-3 rounded-md text-sm transition-colors"
            style={{
              color: "var(--accent-primary)",
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              border: "1px solid",
            }}
          >
            <span>←</span>
            <span>Back to Studios</span>
          </Link>
        </div>

        {/* Studio Header with Logo Floating Right on Large Screens */}
        <div className="mb-8 flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          {/* Studio Name and Aliases */}
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-3">
              <h1
                className="text-5xl font-bold"
                style={{ color: "var(--text-primary)" }}
              >
                {studio?.name || `Studio ${studioId}`}
              </h1>
              {studio?.favorite && <LucideStar size={32} color="#efdd03" fill="#efdd03" />}
            </div>

            {/* Aliases */}
            {studio?.aliases && studio.aliases.length > 0 && (
              <p
                className="text-xl"
                style={{ color: "var(--text-secondary)" }}
              >
                Also known as: {studio.aliases.join(", ")}
              </p>
            )}
          </div>

          {/* Studio Logo - Below name on mobile, floats right on large screens */}
          <div className="w-full lg:w-48 flex-shrink-0">
            <StudioImage studio={studio} />
          </div>
        </div>

        {/* Content Section */}
        <div className="space-y-6 mb-8">
          <StudioStats studio={studio} />
          <StudioDetails studio={studio} />
        </div>

        {/* Scenes Section */}
        <div className="mt-8">
          <SceneSearch
            permanentFilters={{
              studios: { value: [studioId], modifier: "INCLUDES" },
            }}
            permanentFiltersMetadata={{
              studios: [{ id: studioId, name: studio?.name || "Unknown Studio" }],
            }}
            title={`Scenes from ${studio?.name || "this studio"}`}
          />
        </div>
      </div>
    </div>
  );
};

// Reusable component for Card wrapper
const Card = ({ title, children }) => {
  return (
    <div
      className="p-6 rounded-lg border"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      {title && (
        <h3
          className="text-lg font-semibold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h3>
      )}
      {children}
    </div>
  );
};

// Studio Image Component (Logo)
const StudioImage = ({ studio }) => {
  return (
    <div className="w-full" style={{ maxHeight: "200px" }}>
      {studio?.image_path ? (
        <img
          src={studio.image_path}
          alt={studio.name}
          className="w-full h-full object-contain"
          style={{ maxHeight: "200px" }}
        />
      ) : (
        <div className="w-full flex items-center justify-center" style={{ height: "150px" }}>
          <svg
            className="w-16 h-16"
            style={{ color: "var(--text-muted)" }}
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </div>
      )}
    </div>
  );
};

// Studio Stats Component
const StudioStats = ({ studio }) => {
  const StatField = ({ label, value, valueColor = "var(--text-primary)" }) => {
    if (!value && value !== 0) return null;
    return (
      <div className="flex justify-between">
        <span style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span className="font-medium" style={{ color: valueColor }}>
          {value}
        </span>
      </div>
    );
  };

  return (
    <Card title="Statistics">
      {/* Visual Rating Display */}
      {studio?.rating100 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              Rating
            </span>
            <span className="text-2xl font-bold" style={{ color: "var(--accent-primary)" }}>
              {studio.rating100}/100
            </span>
          </div>
          <div className="w-full h-3 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-secondary)" }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${studio.rating100}%`,
                backgroundColor: "var(--accent-primary)",
              }}
            />
          </div>
        </div>
      )}

      {/* Other Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatField label="Scenes:" value={studio?.scene_count} valueColor="var(--accent-primary)" />
        <StatField label="Performers:" value={studio?.performer_count} valueColor="var(--accent-primary)" />
        <StatField label="Images:" value={studio?.image_count} valueColor="var(--accent-primary)" />
        <StatField label="Galleries:" value={studio?.gallery_count} valueColor="var(--accent-primary)" />
        <StatField label="Movies:" value={studio?.movie_count} valueColor="var(--accent-primary)" />
        <StatField label="Groups:" value={studio?.group_count} valueColor="var(--accent-primary)" />
      </div>
    </Card>
  );
};

// Studio Details Component
const StudioDetails = ({ studio }) => {
  return (
    <>
      {studio?.url && (
        <Card title="Website">
          <a
            href={studio.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:underline transition-colors"
            style={{ color: "var(--accent-primary)" }}
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
        </Card>
      )}

      {studio?.details && (
        <Card title="Details">
          <p
            className="text-sm whitespace-pre-wrap"
            style={{ color: "var(--text-primary)" }}
          >
            {studio.details}
          </p>
        </Card>
      )}

      {studio?.parent_studio && (
        <Card title="Parent Studio">
          <Link
            to={`/studio/${studio.parent_studio.id}`}
            className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "var(--accent-primary)",
              color: "white",
            }}
          >
            {studio.parent_studio.name}
          </Link>
        </Card>
      )}

      {studio?.child_studios && studio.child_studios.length > 0 && (
        <Card title="Child Studios">
          <div className="flex flex-wrap gap-2">
            {studio.child_studios.map((child) => (
              <Link
                key={child.id}
                to={`/studio/${child.id}`}
                className="px-3 py-1 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: "var(--bg-hover)",
                  color: "var(--text-primary)",
                }}
              >
                {child.name}
              </Link>
            ))}
          </div>
        </Card>
      )}

      {studio?.tags && studio.tags.length > 0 && (
        <Card title="Tags">
          <div className="flex flex-wrap gap-2">
            {studio.tags.map((tag) => {
              // Generate a color based on tag ID for consistency
              const hue = (parseInt(tag.id, 10) * 137.5) % 360;
              return (
                <Link
                  key={tag.id}
                  to={`/tags/${tag.id}`}
                  className="px-3 py-1 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: `hsl(${hue}, 70%, 45%)`,
                    color: "white",
                  }}
                >
                  {tag.name}
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {studio?.movies && studio.movies.length > 0 && (
        <Card title="Movies">
          <div className="space-y-1">
            {studio.movies.map((movie) => (
              <div
                key={movie.id}
                className="text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {movie.name}
              </div>
            ))}
          </div>
        </Card>
      )}

      {studio?.groups && studio.groups.length > 0 && (
        <Card title="Groups">
          <div className="space-y-1">
            {studio.groups.map((group) => (
              <div
                key={group.id}
                className="text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                {group.name}
              </div>
            ))}
          </div>
        </Card>
      )}

      {studio?.stash_ids && studio.stash_ids.length > 0 && (
        <Card title="StashDB Links">
          <div className="space-y-2">
            {studio.stash_ids.map((stashId, index) => (
              <a
                key={index}
                href={`${stashId.endpoint.replace("/graphql", "")}/studios/${
                  stashId.stash_id
                }`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center text-sm hover:underline transition-colors"
                style={{ color: "var(--accent-primary)" }}
              >
                {stashId.endpoint.includes("stashdb.org")
                  ? "StashDB"
                  : "External"}
                : {stashId.stash_id.substring(0, 8)}...
                <svg
                  className="w-3 h-3 ml-1"
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
            ))}
          </div>
        </Card>
      )}
    </>
  );
};

const getStudio = async (id) => {
  return await libraryApi.findStudioById(id);
};

export default StudioDetail;
