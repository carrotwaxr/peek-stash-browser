import { useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useNavigationState } from "../../hooks/useNavigationState.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useRatingHotkeys } from "../../hooks/useRatingHotkeys.js";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";
import { useConfig } from "../../contexts/ConfigContext.jsx";
import { libraryApi } from "../../services/api.js";
import { formatDuration } from "../../utils/format.js";
import { getEntityPath } from "../../utils/entityLinks.js";
import SceneSearch from "../scene-search/SceneSearch.jsx";
import {
  Button,
  FavoriteButton,
  LoadingSpinner,
  PageHeader,
  RatingSlider,
  TabNavigation,
  TagChips,
} from "../ui/index.js";
import { PerformerGrid } from "../grids/index.js";
import ViewInStashButton from "../ui/ViewInStashButton.jsx";

const GroupDetail = () => {
  const { groupId } = useParams();
  const [searchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [group, setGroup] = useState(null);
  const [rating, setRating] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);

  // Navigation state for back button
  const { goBack, backButtonText } = useNavigationState();

  // Card display settings
  const { getSettings } = useCardDisplaySettings();
  const settings = getSettings("group");

  // Get multi-instance config
  const { hasMultipleInstances } = useConfig();

  // Get instance from URL query param for multi-stash support
  const instanceId = searchParams.get("instance");

  // Get active tab from URL or default to 'scenes'
  const activeTab = searchParams.get('tab') || 'scenes';

  // Set page title to group name
  usePageTitle(group?.name || "Collection");

  useEffect(() => {
    const fetchGroup = async () => {
      try {
        setIsLoading(true);
        const groupData = await libraryApi.findGroupById(groupId, instanceId);
        setGroup(groupData);
        setRating(groupData.rating);
        setIsFavorite(groupData.favorite || false);
      } catch {
        // Error loading group - will show loading spinner
      } finally {
        setIsLoading(false);
      }
    };

    fetchGroup();
  }, [groupId, instanceId]);

  const handleRatingChange = async (newRating) => {
    setRating(newRating);
    try {
      await libraryApi.updateRating("group", groupId, newRating, instanceId);
    } catch (error) {
      console.error("Failed to update rating:", error);
      setRating(group.rating);
    }
  };

  const handleFavoriteChange = async (newValue) => {
    setIsFavorite(newValue);
    try {
      await libraryApi.updateFavorite("group", groupId, newValue, instanceId);
    } catch (error) {
      console.error("Failed to update favorite:", error);
      setIsFavorite(group.favorite || false);
    }
  };

  const toggleFavorite = () => {
    handleFavoriteChange(!isFavorite);
  };

  // Rating and favorite hotkeys (r + 1-5 for ratings, r + 0 to clear, r + f to toggle favorite)
  useRatingHotkeys({
    enabled: !isLoading && !!group,
    setRating: handleRatingChange,
    toggleFavorite });

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
            onClick={goBack}
            variant="secondary"
            icon={<ArrowLeft size={16} className="sm:w-4 sm:h-4" />}
            title={backButtonText}
          >
            <span className="hidden sm:inline">{backButtonText}</span>
          </Button>
        </div>

        {/* Group Header - Hero Treatment */}
        <div className="mb-8">
          <PageHeader
            title={
              <div className="flex gap-4 items-center">
                <span>{group?.name || `Collection ${groupId}`}</span>
                {settings.showFavorite && (
                  <FavoriteButton
                    isFavorite={isFavorite}
                    onChange={handleFavoriteChange}
                    size="large"
                  />
                )}
                <ViewInStashButton stashUrl={group?.stashUrl} size={24} />
              </div>
            }
            subtitle={
              group?.aliases?.length
                ? `Also known as: ${group.aliases.join(", ")}`
                : null
            }
          />

          {/* Rating Slider */}
          {settings.showRating && (
            <div className="mt-4 max-w-md">
              <RatingSlider
                rating={rating}
                onChange={handleRatingChange}
                showClearButton={true}
              />
            </div>
          )}
        </div>

        {/* Two Column Layout - Image on left, Details on right (lg+) */}
        <div className="flex flex-col lg:flex-row gap-6 mb-8">
          {/* Left Column: Group Image with Front/Back Flipper (2:3 DVD cover) */}
          <div className="w-full lg:w-1/3 flex-shrink-0">
            <GroupImageFlipper group={group} />
          </div>

          {/* Right Column: Details (scrollable, matches image height) */}
          {settings.showDescriptionOnDetail && group?.synopsis && (
            <div className="flex-1 lg:overflow-y-auto lg:max-h-[80vh]">
              <Card title="Details">
                <p
                  className="text-sm whitespace-pre-wrap"
                  style={{ color: "var(--text-primary)" }}
                >
                  {group.synopsis}
                </p>
              </Card>
            </div>
          )}
        </div>

        {/* Full Width Sections - Statistics, Studio, Tags, Parent/Sub Collections */}
        <div className="space-y-6 mb-8">
          <GroupStats group={group} />
          <GroupDetails group={group} hasMultipleInstances={hasMultipleInstances} />
        </div>

        {/* Tabbed Content Section */}
        <div className="mt-8">
          <TabNavigation
            tabs={[
              { id: 'scenes', label: 'Scenes', count: group?.scene_count || 0 },
              { id: 'performers', label: 'Performers', count: group?.performer_count || 0 },
            ]}
            defaultTab="scenes"
          />

          {/* Tab Content */}
          {activeTab === 'scenes' && (
            <SceneSearch
              context="scene_group"
              initialSort="scene_index"
              permanentFilters={{
                groups: { value: [parseInt(groupId, 10)], modifier: "INCLUDES" } }}
              permanentFiltersMetadata={{
                groups: [
                  { id: groupId, name: group?.name || "Unknown Collection" },
                ] }}
              title={`Scenes in ${group?.name || "this collection"}`}
              fromPageTitle={group?.name || "Collection"}
            />
          )}

          {activeTab === 'performers' && (
            <PerformerGrid
              lockedFilters={{
                performer_filter: {
                  groups: {
                    value: [parseInt(groupId, 10)],
                    modifier: "INCLUDES" } } }}
              hideLockedFilters
              emptyMessage={`No performers found in "${group?.name}"`}
            />
          )}
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
        borderColor: "var(--border-color)" }}
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
    <div className="relative w-full" style={{ maxHeight: "50vh" }}>
      <div
        className="rounded-xl overflow-hidden shadow-lg flex items-center justify-center"
        style={{
          backgroundColor: "var(--bg-card)",
          aspectRatio: "2/3",
          width: "100%",
          maxHeight: "50vh" }}
      >
        {displayImage ? (
          <img
            src={displayImage}
            alt={`${group?.name} - ${showFront ? "Front" : "Back"} Cover`}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain" }}
          />
        ) : (
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
              }` }}
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
              }` }}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'scenes';

  const handleTabSwitch = (tabId) => {
    const newParams = new URLSearchParams(searchParams);
    if (tabId === 'scenes') {
      newParams.delete('tab');
    } else {
      newParams.set('tab', tabId);
    }
    setSearchParams(newParams);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const StatField = ({ label, value, valueColor = "var(--text-primary)", onClick, isActive }) => {
    if (!value && value !== 0) return null;

    const clickable = onClick && value > 0;

    return (
      <div className="flex justify-between">
        <span style={{ color: "var(--text-secondary)" }}>{label}</span>
        {clickable ? (
          <button
            onClick={onClick}
            disabled={isActive}
            className="font-medium transition-opacity hover:opacity-70 disabled:cursor-default disabled:opacity-100"
            style={{
              color: valueColor,
              cursor: isActive ? 'default' : 'pointer',
              textDecoration: isActive ? 'underline' : 'none' }}
          >
            {value}
          </button>
        ) : (
          <span className="font-medium" style={{ color: valueColor }}>
            {value}
          </span>
        )}
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
          onClick={() => handleTabSwitch('scenes')}
          isActive={activeTab === 'scenes'}
        />
        <StatField
          label="Performers:"
          value={group?.performer_count}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch('performers')}
          isActive={activeTab === 'performers'}
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

// Group Details Component (Studio, Tags, Parent/Sub Collections)
const GroupDetails = ({ group, hasMultipleInstances }) => {
  return (
    <>
      {group?.studio && (
        <Card title="Studio">
          <Link
            to={getEntityPath('studio', group.studio, hasMultipleInstances)}
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
                to={getEntityPath('group', cg.group, hasMultipleInstances)}
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
                to={getEntityPath('group', sg.group, hasMultipleInstances)}
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
          <TagChips tags={group.tags} />
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

export default GroupDetail;
