import { useState, useEffect } from "react";
import { useParams, Link, useLocation, useNavigate } from "react-router-dom";
import SceneSearch from "../scene-search/SceneSearch.jsx";
import { libraryApi } from "../../services/api.js";
import LoadingSpinner from "../ui/LoadingSpinner.jsx";
import Button from "../ui/Button.jsx";
import RatingControls from "../ui/RatingControls.jsx";
import { ArrowLeft } from "lucide-react";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { formatDuration } from "../../utils/format.js";

const GroupDetail = () => {
  const { groupId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [group, setGroup] = useState(null);

  // Set page title to group name
  usePageTitle(group?.name || "Collection");

  useEffect(() => {
    const fetchGroup = async () => {
      try {
        setIsLoading(true);
        const groupData = await getGroup(groupId);
        setGroup(groupData);
      } catch {
        // Error loading group - will show loading spinner
      } finally {
        setIsLoading(false);
      }
    };

    fetchGroup();
  }, [groupId]);

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
          <Button
            onClick={() =>
              navigate(location.state?.referrerUrl || "/collections")
            }
            variant="secondary"
            icon={<ArrowLeft size={16} className="sm:w-4 sm:h-4" />}
            title="Back to Collections"
          >
            <span className="hidden sm:inline">Back to Collections</span>
          </Button>
        </div>

        {/* Group Header - Hero Treatment */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <h1
              className="text-5xl font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              {group?.name || `Collection ${groupId}`}
            </h1>
          </div>

          {group?.aliases && group.aliases.length > 0 && (
            <p
              className="text-xl mb-3"
              style={{ color: "var(--text-secondary)" }}
            >
              Also known as: {group.aliases.join(", ")}
            </p>
          )}

          {/* Rating Controls */}
          <div className="mt-4">
            <RatingControls
              entityType="group"
              entityId={group.id}
              initialRating={group.rating}
              initialFavorite={group.favorite || false}
              size={24}
            />
          </div>
        </div>

        {/* Two Column Layout - Image on left, content on right (lg+) */}
        <div className="flex flex-col lg:flex-row gap-6 mb-8">
          {/* Left Column: Group Image with Front/Back Flipper */}
          <div className="w-full lg:w-2/5 flex-shrink-0">
            <GroupImageFlipper group={group} />
          </div>

          {/* Right Column: Stats and Details */}
          <div className="flex-1 space-y-6">
            <GroupStats group={group} />
            <GroupDetails group={group} />
          </div>
        </div>

        {/* Scenes Section */}
        <div className="mt-8">
          <SceneSearch
            initialSort="scene_index"
            permanentFilters={{
              groups: { value: [parseInt(groupId, 10)], modifier: "INCLUDES" },
            }}
            permanentFiltersMetadata={{
              groups: [
                { id: groupId, name: group?.name || "Unknown Collection" },
              ],
            }}
            title={`Scenes in ${group?.name || "this collection"}`}
            captureReferrer={false}
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

// Group Image Flipper Component with Front/Back Toggle
const GroupImageFlipper = ({ group }) => {
  const [showFront, setShowFront] = useState(true);

  const hasFrontImage = group?.front_image_path;
  const hasBackImage = group?.back_image_path;
  const hasBothImages = hasFrontImage && hasBackImage;

  const currentImage = showFront
    ? group?.front_image_path
    : group?.back_image_path;
  const fallbackImage = !showFront
    ? group?.front_image_path
    : group?.back_image_path;
  const displayImage = currentImage || fallbackImage;

  return (
    <div className="relative">
      <div
        className="rounded-lg w-full aspect-[2/3] p-3 shadow-lg"
        style={{
          backgroundColor: "var(--bg-card)",
        }}
      >
        {displayImage ? (
          <img
            src={displayImage}
            alt={`${group?.name} - ${showFront ? "Front" : "Back"} Cover`}
            className="w-full h-full object-contain"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <svg
              className="w-24 h-24"
              style={{ color: "var(--text-muted)" }}
              fill="currentColor"
              viewBox="0 0 24 24"
            >
              <text
                x="50%"
                y="50%"
                dominantBaseline="middle"
                textAnchor="middle"
                fontSize="12"
              >
                🎬
              </text>
            </svg>
          </div>
        )}
      </div>

      {/* Front/Back Toggle Buttons */}
      {hasBothImages && (
        <div className="absolute top-4 right-4 flex gap-2">
          <button
            onClick={() => setShowFront(true)}
            className={`px-3 py-2 rounded-lg font-medium text-sm transition-all ${
              showFront ? "shadow-lg" : "opacity-70 hover:opacity-100"
            }`}
            style={{
              backgroundColor: showFront
                ? "var(--accent-primary)"
                : "var(--bg-card)",
              color: showFront ? "white" : "var(--text-primary)",
              border: `1px solid ${
                showFront ? "var(--accent-primary)" : "var(--border-color)"
              }`,
            }}
            title="Show front cover"
          >
            Front
          </button>
          <button
            onClick={() => setShowFront(false)}
            className={`px-3 py-2 rounded-lg font-medium text-sm transition-all ${
              !showFront ? "shadow-lg" : "opacity-70 hover:opacity-100"
            }`}
            style={{
              backgroundColor: !showFront
                ? "var(--accent-primary)"
                : "var(--bg-card)",
              color: !showFront ? "white" : "var(--text-primary)",
              border: `1px solid ${
                !showFront ? "var(--accent-primary)" : "var(--border-color)"
              }`,
            }}
            title="Show back cover"
          >
            Back
          </button>
        </div>
      )}
    </div>
  );
};

// Group Stats Component
const GroupStats = ({ group }) => {
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
      <div className="grid grid-cols-2 gap-4">
        <StatField
          label="Scenes:"
          value={group?.scene_count}
          valueColor="var(--accent-primary)"
        />
        <StatField
          label="Performers:"
          value={group?.performer_count}
          valueColor="var(--accent-primary)"
        />
        <StatField
          label="Duration:"
          value={group?.duration ? formatDuration(group.duration) : null}
          valueColor="var(--accent-primary)"
        />
        <StatField
          label="Date:"
          value={group?.date}
          valueColor="var(--accent-primary)"
        />
      </div>
    </Card>
  );
};

// Group Details Component
const GroupDetails = ({ group }) => {
  return (
    <>
      {group?.synopsis && (
        <Card title="Synopsis">
          <p
            className="text-sm whitespace-pre-wrap"
            style={{ color: "var(--text-primary)" }}
          >
            {group.synopsis}
          </p>
        </Card>
      )}

      {group?.studio && (
        <Card title="Studio">
          <Link
            to={`/studio/${group.studio.id}`}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            {group.studio.image_path && (
              <img
                src={group.studio.image_path}
                alt={group.studio.name}
                className="w-12 h-12 object-cover rounded"
              />
            )}
            <span
              className="font-medium"
              style={{ color: "var(--accent-primary)" }}
            >
              {group.studio.name}
            </span>
          </Link>
        </Card>
      )}

      {group?.director && (
        <Card title="Director">
          <p style={{ color: "var(--text-primary)" }}>{group.director}</p>
        </Card>
      )}

      {group?.containing_groups && group.containing_groups.length > 0 && (
        <Card title="Part Of">
          <div className="space-y-2">
            {group.containing_groups.map((cg) => (
              <Link
                key={cg.group.id}
                to={`/collection/${cg.group.id}`}
                className="block p-2 rounded hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="font-medium"
                    style={{ color: "var(--accent-primary)" }}
                  >
                    {cg.group.name}
                  </span>
                </div>
                {cg.description && (
                  <p
                    className="text-sm mt-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {cg.description}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </Card>
      )}

      {group?.sub_groups && group.sub_groups.length > 0 && (
        <Card title="Sub-Collections">
          <div className="space-y-2">
            {group.sub_groups.map((sg) => (
              <Link
                key={sg.group.id}
                to={`/collection/${sg.group.id}`}
                className="block p-2 rounded hover:bg-white/5 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <span
                    className="font-medium"
                    style={{ color: "var(--accent-primary)" }}
                  >
                    {sg.group.name}
                  </span>
                </div>
                {sg.description && (
                  <p
                    className="text-sm mt-1"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {sg.description}
                  </p>
                )}
              </Link>
            ))}
          </div>
        </Card>
      )}

      {group?.tags && group.tags.length > 0 && (
        <Card title="Tags">
          <div className="flex flex-wrap gap-2">
            {group.tags.map((tag) => {
              // Generate a color based on tag ID for consistency
              const hue = (parseInt(tag.id, 10) * 137.5) % 360;
              return (
                <Link
                  key={tag.id}
                  to={`/tag/${tag.id}`}
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

      {group?.urls && group.urls.length > 0 && (
        <Card title="Links">
          <div className="space-y-2">
            {group.urls.map((url, index) => (
              <a
                key={index}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm hover:opacity-80 transition-opacity"
                style={{ color: "var(--accent-primary)" }}
              >
                {url}
              </a>
            ))}
          </div>
        </Card>
      )}
    </>
  );
};

const getGroup = async (id) => {
  return await libraryApi.findGroupById(id);
};

export default GroupDetail;
