import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, LucideStar } from "lucide-react";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useRatingHotkeys } from "../../hooks/useRatingHotkeys.js";
import { libraryApi } from "../../services/api.js";
import SceneSearch from "../scene-search/SceneSearch.jsx";
import {
  Button,
  FavoriteButton,
  LoadingSpinner,
  PageHeader,
  RatingSlider,
} from "../ui/index.js";

const TagDetail = () => {
  const { tagId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(true);
  const [tag, setTag] = useState(null);
  const [rating, setRating] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);

  // Set page title to tag name
  usePageTitle(tag?.name || "Tag");

  useEffect(() => {
    const fetchTag = async () => {
      try {
        setIsLoading(true);
        const tagData = await getTag(tagId);
        setTag(tagData);
        setRating(tagData.rating);
        setIsFavorite(tagData.favorite || false);
      } catch {
        // Error loading tag - will show loading spinner
      } finally {
        setIsLoading(false);
      }
    };

    fetchTag();
  }, [tagId]);

  const handleRatingChange = async (newRating) => {
    setRating(newRating);
    try {
      await libraryApi.updateRating("tag", tagId, newRating);
    } catch (error) {
      console.error("Failed to update rating:", error);
      setRating(tag.rating);
    }
  };

  // Rating hotkeys (r + 1-5 for ratings, r + 0 to clear)
  useRatingHotkeys({
    enabled: !isLoading && !!tag,
    setRating: handleRatingChange,
  });

  const handleFavoriteChange = async (newValue) => {
    setIsFavorite(newValue);
    try {
      await libraryApi.updateFavorite("tag", tagId, newValue);
    } catch (error) {
      console.error("Failed to update favorite:", error);
      setIsFavorite(tag.favorite || false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  // If tag not found after loading, show error and back button
  if (!tag) {
    return (
      <div className="min-h-screen px-4 lg:px-6 xl:px-8">
        <div className="max-w-none">
          <div className="mt-6 mb-6">
            <Button
              onClick={() => navigate(location.state?.referrerUrl || "/tags")}
              variant="secondary"
              icon={<ArrowLeft size={16} className="sm:w-4 sm:h-4" />}
              title="Back to Tags"
            >
              <span className="hidden sm:inline">Back to Tags</span>
            </Button>
          </div>
          <div className="flex flex-col items-center justify-center py-16">
            <h2
              className="text-2xl font-bold mb-4"
              style={{ color: "var(--text-primary)" }}
            >
              Tag Not Found
            </h2>
            <p
              className="text-center mb-6"
              style={{ color: "var(--text-muted)" }}
            >
              The tag you're looking for could not be found or you don't have
              permission to view it.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 lg:px-6 xl:px-8">
      <div className="max-w-none">
        {/* Back Button */}
        <div className="mt-6 mb-6">
          <Button
            onClick={() => navigate(location.state?.referrerUrl || "/tags")}
            variant="secondary"
            icon={<ArrowLeft size={16} className="sm:w-4 sm:h-4" />}
            title="Back to Tags"
          >
            <span className="hidden sm:inline">Back to Tags</span>
          </Button>
        </div>

        {/* Tag Header - Hero Treatment */}
        <div className="mb-8">
          <PageHeader
            title={
              <div className="flex gap-4 items-center">
                <span>{tag?.name || `Tag ${tagId}`}</span>
                <FavoriteButton
                  isFavorite={isFavorite}
                  onChange={handleFavoriteChange}
                  size="large"
                />
              </div>
            }
            subtitle={
              tag?.aliases?.length
                ? `Also known as: ${tag?.aliases.join(", ")}`
                : null
            }
          />

          {/* Rating Slider */}
          <div className="mt-4 max-w-md">
            <RatingSlider
              rating={rating}
              onChange={handleRatingChange}
              showClearButton={true}
            />
          </div>
        </div>

        {/* Two Column Layout - Image on left, Details on right (lg+) */}
        <div className="flex flex-col lg:flex-row gap-6 mb-8">
          {/* Left Column: Tag Image (1:1) */}
          <div className="w-full lg:w-1/2 flex-shrink-0">
            <TagImage tag={tag} />
          </div>

          {/* Right Column: Details (scrollable, matches image height) */}
          <div className="flex-1 lg:overflow-y-auto lg:max-h-[80vh]">
            {tag?.description && (
              <Card title="Details">
                <p
                  className="text-sm whitespace-pre-wrap"
                  style={{ color: "var(--text-primary)" }}
                >
                  {tag.description}
                </p>
              </Card>
            )}
          </div>
        </div>

        {/* Full Width Sections - Statistics, Parents, Children, Aliases */}
        <div className="space-y-6 mb-8">
          <TagStats tag={tag} />
          <TagDetails tag={tag} />
        </div>

        {/* Scenes Section */}
        <div className="mt-8">
          <SceneSearch
            context="scene_tag"
            permanentFilters={{
              tags: { value: [parseInt(tagId, 10)], modifier: "INCLUDES" },
            }}
            permanentFiltersMetadata={{
              tags: [{ id: tagId, name: tag?.name || "Unknown Tag" }],
            }}
            title={`Scenes tagged with ${tag?.name || "this tag"}`}
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

// Tag Image Component (16:9 aspect ratio to match tag cards)
const TagImage = ({ tag }) => {
  return (
    <div
      className="rounded-lg w-full aspect-video overflow-hidden shadow-lg flex items-center justify-center"
      style={{
        backgroundColor: "var(--bg-card)",
        maxHeight: "80vh",
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatField
          label="Scenes:"
          value={tag?.scene_count}
          valueColor="var(--accent-primary)"
        />
        <StatField
          label="Markers:"
          value={tag?.scene_marker_count}
          valueColor="var(--accent-primary)"
        />
        <StatField
          label="Images:"
          value={tag?.image_count}
          valueColor="var(--accent-primary)"
        />
        <StatField
          label="Galleries:"
          value={tag?.gallery_count}
          valueColor="var(--accent-primary)"
        />
        <StatField
          label="Performers:"
          value={tag?.performer_count}
          valueColor="var(--accent-primary)"
        />
        <StatField
          label="Studios:"
          value={tag?.studio_count}
          valueColor="var(--accent-primary)"
        />
        <StatField
          label="Movies:"
          value={tag?.movie_count}
          valueColor="var(--accent-primary)"
        />
        <StatField
          label="Collections:"
          value={tag?.group_count}
          valueColor="var(--accent-primary)"
        />
      </div>
    </Card>
  );
};

// Tag Details Component (Parent Tags, Child Tags, Aliases)
const TagDetails = ({ tag }) => {
  return (
    <>
      {tag?.parents && tag.parents.length > 0 && (
        <Card title="Parent Tags">
          <div className="flex flex-wrap gap-2">
            {tag.parents.map((parent) => {
              // Generate a color based on tag ID for consistency
              const hue = (parseInt(parent.id, 10) * 137.5) % 360;
              return (
                <Link
                  key={parent.id}
                  to={`/tag/${parent.id}`}
                  className="px-3 py-1 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: `hsl(${hue}, 70%, 45%)`,
                    color: "white",
                  }}
                >
                  {parent.name}
                </Link>
              );
            })}
          </div>
        </Card>
      )}

      {tag?.children && tag.children.length > 0 && (
        <Card title="Child Tags">
          <div className="flex flex-wrap gap-2">
            {tag.children.map((child) => {
              // Generate a color based on tag ID for consistency
              const hue = (parseInt(child.id, 10) * 137.5) % 360;
              return (
                <Link
                  key={child.id}
                  to={`/tag/${child.id}`}
                  className="px-3 py-1 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
                  style={{
                    backgroundColor: `hsl(${hue}, 70%, 45%)`,
                    color: "white",
                  }}
                >
                  {child.name}
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </>
  );
};

const getTag = async (id) => {
  return await libraryApi.findTagById(id);
};

export default TagDetail;
