import { useCallback, useEffect, useState } from "react";
import {
  Link,
  useParams,
  useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useImagesPagination } from "../../hooks/useImagesPagination.js";
import { useNavigationState } from "../../hooks/useNavigationState.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useRatingHotkeys } from "../../hooks/useRatingHotkeys.js";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";
import { useConfig } from "../../contexts/ConfigContext.jsx";
import { libraryApi } from "../../services/api.js";
import { getEntityPath } from "../../utils/entityLinks.js";
import SceneSearch from "../scene-search/SceneSearch.jsx";
import {
  Button,
  FavoriteButton,
  LazyImage,
  LoadingSpinner,
  PageHeader,
  PaginatedImageGrid,
  RatingSlider,
  TabNavigation,
  TagChips,
} from "../ui/index.js";
import { GalleryGrid, GroupGrid, PerformerGrid } from "../grids/index.js";
import ViewInStashButton from "../ui/ViewInStashButton.jsx";

const StudioDetail = () => {
  const { studioId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [studio, setStudio] = useState(null);
  const [rating, setRating] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);

  // Navigation state for back button
  const { goBack, backButtonText } = useNavigationState();

  // Card display settings
  const { getSettings } = useCardDisplaySettings();
  const settings = getSettings("studio");

  // Get multi-instance config
  const { hasMultipleInstances } = useConfig();

  // Get instance from URL query param for multi-stash support
  const instanceId = searchParams.get("instance");

  // Include sub-studios toggle state (from URL param or default false)
  const includeSubStudios = searchParams.get("includeSubStudios") === "true";

  // Compute tabs with counts for smart default selection
  const contentTabs = [
    { id: "scenes", label: "Scenes", count: studio?.scene_count || 0 },
    { id: "galleries", label: "Galleries", count: studio?.gallery_count || 0 },
    { id: "images", label: "Images", count: studio?.image_count || 0 },
    { id: "performers", label: "Performers", count: studio?.performer_count || 0 },
    { id: "groups", label: "Collections", count: studio?.group_count || 0 },
  ];
  const effectiveDefaultTab = contentTabs.find(t => t.count > 0)?.id || "scenes";

  // Get active tab from URL or default to first tab with content
  const activeTab = searchParams.get("tab") || effectiveDefaultTab;

  // Handler for toggling include sub-studios
  const handleIncludeSubStudiosChange = (checked) => {
    const newParams = new URLSearchParams(searchParams);
    if (checked) {
      newParams.set("includeSubStudios", "true");
    } else {
      newParams.delete("includeSubStudios");
    }
    setSearchParams(newParams);
  };

  // Check if studio has children (for showing toggle)
  const hasChildren = studio?.child_studios && studio.child_studios.length > 0;

  // Set page title to studio name
  usePageTitle(studio?.name || "Studio");

  useEffect(() => {
    const fetchStudio = async () => {
      try {
        setIsLoading(true);
        const studioData = await libraryApi.findStudioById(studioId, instanceId);
        setStudio(studioData);
        setRating(studioData.rating);
        setIsFavorite(studioData.favorite || false);
      } catch {
        // Error loading studio - will show loading spinner
      } finally {
        setIsLoading(false);
      }
    };

    fetchStudio();
  }, [studioId, instanceId]);

  const handleRatingChange = async (newRating) => {
    setRating(newRating);
    try {
      await libraryApi.updateRating("studio", studioId, newRating, instanceId);
    } catch (error) {
      console.error("Failed to update rating:", error);
      setRating(studio.rating);
    }
  };

  const handleFavoriteChange = async (newValue) => {
    setIsFavorite(newValue);
    try {
      await libraryApi.updateFavorite("studio", studioId, newValue, instanceId);
    } catch (error) {
      console.error("Failed to update favorite:", error);
      setIsFavorite(studio.favorite || false);
    }
  };

  const toggleFavorite = () => {
    handleFavoriteChange(!isFavorite);
  };

  // Rating and favorite hotkeys (r + 1-5 for ratings, r + 0 to clear, r + f to toggle favorite)
  useRatingHotkeys({
    enabled: !isLoading && !!studio,
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

        {/* Studio Header */}
        <div className="mb-8">
          <PageHeader
            title={
              <div className="flex gap-4 items-center">
                <span>{studio?.name || `Studio ${studioId}`}</span>
                {settings.showFavorite && (
                  <FavoriteButton
                    isFavorite={isFavorite}
                    onChange={handleFavoriteChange}
                    size="large"
                  />
                )}
                <ViewInStashButton stashUrl={studio?.stashUrl} size={24} />
              </div>
            }
            subtitle={
              studio?.aliases?.length
                ? `Also known as: ${studio.aliases.join(", ")}`
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
          {/* Left Column: Studio Image (1:1 for logos) */}
          <div className="w-full lg:w-1/4 flex-shrink-0">
            <StudioImage studio={studio} />
          </div>

          {/* Right Column: Details (scrollable, matches image height) */}
          {settings.showDescriptionOnDetail && studio?.details && (
            <div className="flex-1 lg:overflow-y-auto lg:max-h-[80vh]">
              <Card title="Details">
                <p
                  className="text-sm whitespace-pre-wrap"
                  style={{ color: "var(--text-primary)" }}
                >
                  {studio.details}
                </p>
              </Card>
            </div>
          )}
        </div>

        {/* Full Width Sections - Statistics, Parent Studio, Tags, Website */}
        <div className="space-y-6 mb-8">
          <StudioStats studio={studio} studioId={studioId} />
          <StudioDetails studio={studio} settings={settings} hasMultipleInstances={hasMultipleInstances} />
        </div>

        {/* Tabbed Content Section */}
        <div className="mt-8">
          {/* Include Sub-Studios Toggle - only show if studio has children */}
          {hasChildren && (
            <div className="mb-4 flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeSubStudios}
                  onChange={(e) =>
                    handleIncludeSubStudiosChange(e.target.checked)
                  }
                  className="w-4 h-4 rounded border-2 cursor-pointer"
                  style={{
                    borderColor: "var(--border-color)",
                    accentColor: "var(--accent-primary)" }}
                />
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Include sub-studios ({studio.child_studios.length})
                </span>
              </label>
            </div>
          )}

          {contentTabs.every(t => t.count === 0) ? (
            <div className="py-16 text-center" style={{ color: 'var(--text-muted)' }}>
              This studio has no content in Peek
            </div>
          ) : (
            <>
              <TabNavigation
                tabs={contentTabs}
                defaultTab={effectiveDefaultTab}
              />

              {/* Tab Content */}
              {activeTab === "scenes" && (
                <SceneSearch
                  key={`scenes-${includeSubStudios}`}
                  context="scene_studio"
                  permanentFilters={{
                    studios: {
                      value: [parseInt(studioId, 10)],
                      modifier: "INCLUDES",
                      ...(includeSubStudios && { depth: -1 }) } }}
                  permanentFiltersMetadata={{
                    studios: [
                      { id: studioId, name: studio?.name || "Unknown Studio" },
                    ] }}
                  title={`Scenes from ${studio?.name || "this studio"}${includeSubStudios ? " (and sub-studios)" : ""}`}
                  fromPageTitle={studio?.name || "Studio"}
                />
              )}

              {activeTab === "galleries" && (
                <GalleryGrid
                  key={`galleries-${includeSubStudios}`}
                  lockedFilters={{
                    gallery_filter: {
                      studios: {
                        value: [parseInt(studioId, 10)],
                        modifier: "INCLUDES",
                        ...(includeSubStudios && { depth: -1 }) } } }}
                  hideLockedFilters
                  emptyMessage={`No galleries found for ${studio?.name}`}
                />
              )}

              {activeTab === "images" && (
                <ImagesTab
                  studioId={studioId}
                  studioName={studio?.name}
                  includeSubStudios={includeSubStudios}
                />
              )}

              {activeTab === "performers" && (
                <PerformerGrid
                  lockedFilters={{
                    performer_filter: {
                      studios: {
                        value: [parseInt(studioId, 10)],
                        modifier: "INCLUDES" } } }}
                  hideLockedFilters
                  emptyMessage={`No performers found for ${studio?.name}`}
                />
              )}

              {activeTab === "groups" && (
                <GroupGrid
                  lockedFilters={{
                    group_filter: {
                      studios: {
                        value: [parseInt(studioId, 10)],
                        modifier: "INCLUDES" } } }}
                  hideLockedFilters
                  emptyMessage={`No collections found for ${studio?.name}`}
                />
              )}
            </>
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

// Studio Image Component (Logo - 1:1 aspect ratio)
const StudioImage = ({ studio }) => {
  return (
    <div
      className="rounded-xl overflow-hidden shadow-lg flex items-center justify-center"
      style={{
        backgroundColor: "var(--bg-card)",
        aspectRatio: "1/1",
        width: "100%",
        maxHeight: "50vh" }}
    >
      {studio?.image_path ? (
        <img
          src={studio.image_path}
          alt={studio.name}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain" }}
        />
      ) : (
        <svg
          className="w-16 h-16"
          style={{ color: "var(--text-muted)" }}
          fill="currentColor"
          viewBox="0 0 24 24"
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
        </svg>
      )}
    </div>
  );
};

// Studio Stats Component
const StudioStats = ({ studio, studioId: _studioId }) => { // eslint-disable-line no-unused-vars
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "scenes";

  const handleTabSwitch = (tabId) => {
    const newParams = new URLSearchParams(searchParams);
    if (tabId === "scenes") {
      newParams.delete("tab");
    } else {
      newParams.set("tab", tabId);
    }
    setSearchParams(newParams);
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const StatField = ({
    label,
    value,
    valueColor = "var(--text-primary)",
    onClick,
    isActive }) => {
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
              cursor: isActive ? "default" : "pointer",
              textDecoration: isActive ? "underline" : "none" }}
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
      {/* Visual Rating Display */}
      {studio?.rating100 > 0 && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              Rating
            </span>
            <span
              className="text-2xl font-bold"
              style={{ color: "var(--accent-primary)" }}
            >
              {studio.rating100}/100
            </span>
          </div>
          <div
            className="w-full h-3 rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${studio.rating100}%`,
                backgroundColor: "var(--accent-primary)" }}
            />
          </div>
        </div>
      )}

      {/* Other Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatField
          label="Scenes:"
          value={studio?.scene_count}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch("scenes")}
          isActive={activeTab === "scenes"}
        />
        <StatField
          label="Performers:"
          value={studio?.performer_count}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch("performers")}
          isActive={activeTab === "performers"}
        />
        <StatField
          label="Images:"
          value={studio?.image_count}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch("images")}
          isActive={activeTab === "images"}
        />
        <StatField
          label="Galleries:"
          value={studio?.gallery_count}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch("galleries")}
          isActive={activeTab === "galleries"}
        />
        <StatField
          label="Collections:"
          value={studio?.group_count}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch("groups")}
          isActive={activeTab === "groups"}
        />
      </div>
    </Card>
  );
};

// Studio Details Component
const StudioDetails = ({ studio, settings, hasMultipleInstances }) => {
  const showDetails = settings?.showDescriptionOnDetail !== false;

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

      {showDetails && studio?.details && (
        <Card title="Details">
          <p
            className="text-sm whitespace-pre-wrap"
            style={{ color: "var(--text-primary)" }}
          >
            {studio.details}
          </p>
        </Card>
      )}

      {studio?.parent_studio?.id && (
        <Card title="Parent Studio">
          <Link
            to={getEntityPath('studio', studio.parent_studio, hasMultipleInstances)}
            className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "var(--accent-primary)",
              color: "white" }}
          >
            {studio.parent_studio.name || `Studio ${studio.parent_studio.id}`}
          </Link>
        </Card>
      )}

      {studio?.child_studios && studio.child_studios.length > 0 && (
        <Card title="Child Studios">
          <div className="flex flex-wrap gap-2">
            {studio.child_studios.map((child) => (
              <Link
                key={child.id}
                to={getEntityPath('studio', child, hasMultipleInstances)}
                className="px-3 py-1 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
                style={{
                  color: "var(--text-primary)" }}
              >
                {child.name}
              </Link>
            ))}
          </div>
        </Card>
      )}

      {studio?.tags && studio.tags.length > 0 && (
        <Card title="Tags">
          <TagChips tags={studio.tags} />
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

// Images Tab Component with Lightbox
const ImagesTab = ({ studioId, studioName, includeSubStudios = false }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-based page state for image pagination
  const urlPage = parseInt(searchParams.get('page')) || 1;

  const handleImagePageChange = useCallback((newPage) => {
    const params = new URLSearchParams(searchParams);
    if (newPage === 1) {
      params.delete('page');
    } else {
      params.set('page', String(newPage));
    }
    // Preserve tab param
    setSearchParams(params);
  }, [searchParams, setSearchParams]);

  const fetchImages = useCallback(
    async (page, perPage) => {
      const data = await libraryApi.findImages({
        filter: { page, per_page: perPage },
        image_filter: {
          studios: {
            value: [parseInt(studioId, 10)],
            modifier: "INCLUDES",
            ...(includeSubStudios && { depth: -1 }),
          },
        },
      });
      return {
        images: data.findImages?.images || [],
        count: data.findImages?.count || 0,
      };
    },
    [studioId, includeSubStudios]
  );

  const { images, totalCount, isLoading, lightbox, setImages } = useImagesPagination({
    fetchImages,
    dependencies: [studioId, includeSubStudios],
    externalPage: urlPage,
    onExternalPageChange: handleImagePageChange,
  });

  return (
    <PaginatedImageGrid
      images={images}
      totalCount={totalCount}
      isLoading={isLoading}
      lightbox={lightbox}
      setImages={setImages}
      emptyMessage={`No images found for ${studioName}`}
      className="mt-6"
    />
  );
};

export default StudioDetail;
