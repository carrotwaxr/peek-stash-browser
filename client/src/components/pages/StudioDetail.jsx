import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import SceneSearch from "../scene-search/SceneSearch.jsx";
import { libraryApi } from "../../services/api.js";
import LoadingSpinner from "../ui/LoadingSpinner.jsx";
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
        <div className="mb-6">
          <Link
            to="/studios"
            className="inline-flex items-center px-3 py-2 rounded-md text-sm transition-colors"
            style={{
              color: "var(--accent-primary)",
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              border: "1px solid",
            }}
          >
            ← Back to Studios
          </Link>
        </div>

        {/* Studio Header - Name (always at top) */}
        <div className="mb-6">
          <h1
            className="text-4xl font-bold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            {studio?.name || `Studio ${studioId}`}
          </h1>
        </div>

        {/* Two Column Layout - Image on left, content on right (md+) */}
        <div className="flex flex-col md:flex-row gap-6 mb-8">
          {/* Left Column: Studio Image */}
          <div className="w-full md:w-80 flex-shrink-0">
            <StudioImage studio={studio} />
          </div>

          {/* Right Column: Stats and Details */}
          <div className="flex-1 space-y-6">
            <StudioStats studio={studio} />
            <StudioDetails studio={studio} />
          </div>
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

// Studio Image Component
const StudioImage = ({ studio }) => {
  return (
    <div
      className="rounded-lg w-full md:w-80 aspect-square rounded-xl overflow-hidden shadow-lg p-0"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
        border: "1px solid",
      }}
    >
      {studio?.image_path ? (
        <img
          src={studio.image_path}
          alt={studio.name}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <svg
            className="w-24 h-24"
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
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatField label="Scenes:" value={studio?.scene_count} />
        {studio?.rating100 && (
          <StatField
            label="Rating:"
            value={`${(studio.rating100 / 20).toFixed(1)}/5`}
            valueColor="var(--accent-primary)"
          />
        )}
        <StatField label="Images:" value={studio?.image_count} />
        <StatField label="Galleries:" value={studio?.gallery_count} />
        <StatField label="Performers:" value={studio?.performer_count} />
        <StatField label="Movies:" value={studio?.movie_count} />
        <StatField label="Groups:" value={studio?.group_count} />
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

      {studio?.aliases && studio.aliases.length > 0 && (
        <Card title="Aliases">
          <div className="flex flex-wrap gap-2">
            {studio.aliases.map((alias, index) => (
              <span
                key={index}
                className="px-3 py-1 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: "var(--bg-hover)",
                  color: "var(--text-primary)",
                }}
              >
                {alias}
              </span>
            ))}
          </div>
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
            {studio.tags.map((tag) => (
              <Link
                key={tag.id}
                to={`/tags/${tag.id}`}
                className="px-3 py-1 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: "var(--bg-hover)",
                  color: "var(--text-primary)",
                }}
              >
                {tag.name}
              </Link>
            ))}
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
