import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import SceneSearch from "../scene-search/SceneSearch.jsx";
import { libraryApi } from "../../services/api.js";
import LoadingSpinner from "../ui/LoadingSpinner.jsx";
import { usePageTitle } from "../../hooks/usePageTitle.js";

const TagDetail = () => {
  const { tagId } = useParams();
  const [isLoading, setIsLoading] = useState(true);
  const [tag, setTag] = useState(null);

  // Set page title to tag name
  usePageTitle(tag?.name || "Tag");


  useEffect(() => {
    const fetchTag = async () => {
      try {
        setIsLoading(true);
        const tagData = await getTag(tagId);
        setTag(tagData);
      } catch (error) {
      } finally {
        setIsLoading(false);
      }
    };

    fetchTag();
  }, [tagId]);

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
            to="/tags"
            className="inline-flex items-center px-3 py-2 rounded-md text-sm transition-colors"
            style={{
              color: "var(--accent-primary)",
              backgroundColor: "var(--bg-card)",
              borderColor: "var(--border-color)",
              border: "1px solid",
            }}
          >
            ← Back to Tags
          </Link>
        </div>

        {/* Tag Header - Name (always at top) */}
        <div className="mb-6">
          <h1
            className="text-4xl font-bold mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            {tag?.name || `Tag ${tagId}`}
          </h1>
        </div>

        {/* Two Column Layout - Image on left, content on right (md+) */}
        <div className="flex flex-col md:flex-row gap-6 mb-8">
          {/* Left Column: Tag Image */}
          <div className="w-full md:w-80 flex-shrink-0">
            <TagImage tag={tag} />
          </div>

          {/* Right Column: Stats and Details */}
          <div className="flex-1 space-y-6">
            <TagStats tag={tag} />
            <TagDetails tag={tag} />
          </div>
        </div>

        {/* Scenes Section */}
        <div className="mt-8">
          <SceneSearch
            permanentFilters={{
              tags: { value: [tagId], modifier: "INCLUDES" },
            }}
            title={`Scenes tagged with ${tag?.name || "this tag"}`}
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

// Tag Image Component
const TagImage = ({ tag }) => {
  return (
    <div
      className="rounded-lg w-full md:w-80 aspect-square rounded-xl overflow-hidden shadow-lg p-0"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
        border: "1px solid",
      }}
    >
      {tag?.image_path ? (
        <img
          src={tag.image_path}
          alt={tag.name}
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
            <path d="M7.5 3A1.5 1.5 0 006 4.5v15A1.5 1.5 0 007.5 21h9a1.5 1.5 0 001.5-1.5V7.621a1.5 1.5 0 00-.44-1.06L13.94 2.94A1.5 1.5 0 0012.879 2.5H7.5z" />
          </svg>
        </div>
      )}
    </div>
  );
};

// Tag Stats Component
const TagStats = ({ tag }) => {
  const StatField = ({ label, value }) => {
    if (!value && value !== 0) return null;
    return (
      <div className="flex justify-between">
        <span style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span className="font-medium" style={{ color: "var(--text-primary)" }}>
          {value}
        </span>
      </div>
    );
  };

  return (
    <Card title="Statistics">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatField label="Scenes:" value={tag?.scene_count} />
        <StatField label="Scene Markers:" value={tag?.scene_marker_count} />
        <StatField label="Images:" value={tag?.image_count} />
        <StatField label="Galleries:" value={tag?.gallery_count} />
        <StatField label="Performers:" value={tag?.performer_count} />
        <StatField label="Studios:" value={tag?.studio_count} />
        <StatField label="Movies:" value={tag?.movie_count} />
        <StatField label="Groups:" value={tag?.group_count} />
      </div>
    </Card>
  );
};

// Tag Details Component
const TagDetails = ({ tag }) => {
  return (
    <>
      {tag?.description && (
        <Card title="Description">
          <p
            className="text-sm whitespace-pre-wrap"
            style={{ color: "var(--text-primary)" }}
          >
            {tag.description}
          </p>
        </Card>
      )}

      {tag?.aliases && tag.aliases.length > 0 && (
        <Card title="Aliases">
          <div className="flex flex-wrap gap-2">
            {tag.aliases.map((alias, index) => (
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

      {tag?.parents && tag.parents.length > 0 && (
        <Card title="Parent Tags">
          <div className="flex flex-wrap gap-2">
            {tag.parents.map((parent) => (
              <Link
                key={parent.id}
                to={`/tags/${parent.id}`}
                className="px-3 py-1 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  backgroundColor: "var(--accent-primary)",
                  color: "white",
                }}
              >
                {parent.name}
              </Link>
            ))}
          </div>
        </Card>
      )}

      {tag?.children && tag.children.length > 0 && (
        <Card title="Child Tags">
          <div className="flex flex-wrap gap-2">
            {tag.children.map((child) => (
              <Link
                key={child.id}
                to={`/tags/${child.id}`}
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
    </>
  );
};

const getTag = async (id) => {
  const response = await libraryApi.findTags({
    ids: [id],
  });

  return response?.findTags?.tags?.[0] || null;
};

export default TagDetail;
