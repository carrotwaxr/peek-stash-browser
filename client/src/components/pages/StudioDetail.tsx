import React, { useCallback, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
  GALLERY_FIELDS,
  GROUP_FIELDS,
  IMAGE_FIELDS,
  type NormalizedImage,
  PERFORMER_FIELDS,
  type RelationCountsByType,
  SCENE_FIELDS,
  type TagRef,
} from "@peek/shared-types";
import { ArrowLeft } from "lucide-react";
import { libraryApi } from "../../api";
import { useRelationCounts } from "../../api/hooks";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext";
import { useConfig } from "../../contexts/ConfigContext";
import { useEntityLookup } from "../../hooks/useEntityLookup";
import { useImagesPagination } from "../../hooks/useImagesPagination";
import { useNavigationState } from "../../hooks/useNavigationState";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRatingHotkeys } from "../../hooks/useRatingHotkeys";
import { makeCompositeKey } from "../../utils/compositeKey";
import { getEntityPath } from "../../utils/entityLinks";
import { GalleryGrid, GroupGrid, PerformerGrid } from "../grids/index";
import SceneSearch from "../scene-search/SceneSearch";
import RelationCountsError from "../ui/RelationCountsError";
import { TAB_COUNT_LOADING } from "../ui/TabNavigation";
import ViewInStashButton from "../ui/ViewInStashButton";
import {
  Button,
  EntityNotFound,
  FavoriteButton,
  LazyImage,
  LibraryInitializingBanner,
  LoadingSpinner,
  PageHeader,
  PaginatedImageGrid,
  RatingSlider,
  TabNavigation,
  TagChips,
} from "../ui/index";

interface EntityRef {
  id: string;
  name?: string;
  instanceId?: string;
  image_path?: string;
  [key: string]: unknown;
}

interface StashId {
  endpoint: string;
  stash_id: string;
}

/**
 * Whether each tab's studio filter takes sub-studios (a depth) in the
 * shared contract: a performer's studios come through their scenes and
 * take none, so Include sub-studios is hidden on the Performers tab
 */
const TAB_TAKES_SUB_STUDIOS: Readonly<Record<string, boolean>> = {
  scenes: SCENE_FIELDS.studios.hierarchical,
  galleries: GALLERY_FIELDS.studios.hierarchical,
  images: IMAGE_FIELDS.studios.hierarchical,
  performers: PERFORMER_FIELDS.studios.hierarchical,
  groups: GROUP_FIELDS.studios.hierarchical,
};

const StudioDetail = () => {
  const { studioId } = useParams<{ studioId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rating, setRating] = useState<number | null>(null);
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

  const lookup = useEntityLookup(
    libraryApi.findStudioById,
    studioId,
    instanceId
  );
  const studio = lookup.entity ?? null;
  const isLoading = lookup.status === "loading";

  // Include sub-studios toggle state (from URL param or default false)
  const includeSubStudios = searchParams.get("includeSubStudios") === "true";

  // Reads, tab filters and counts use the loaded studio's own server: a
  // bare-id link names none
  const studioInstanceId = studio?.instanceId as string | undefined;
  const studioRef = makeCompositeKey(studioId ?? "", studioInstanceId);

  // Each tab's count is the total of its list, as the viewer sees it; the
  // tabs show no badge and none opens until the counts answer
  const {
    data: countsData,
    error: countsError,
    refetch: refetchCounts,
  } = useRelationCounts("studio", studioId, studioInstanceId, {
    includeSubStudios,
  });
  const counts = countsData?.counts;
  const contentTabs = [
    { id: "scenes", label: "Scenes", count: counts?.scenes },
    { id: "galleries", label: "Galleries", count: counts?.galleries },
    { id: "images", label: "Images", count: counts?.images },
    { id: "performers", label: "Performers", count: counts?.performers },
    { id: "groups", label: "Collections", count: counts?.groups },
  ].map((t) => ({ ...t, count: t.count ?? TAB_COUNT_LOADING }));
  // The first tab with content, once the counts are in
  const effectiveDefaultTab = counts
    ? (contentTabs.find((t) => t.count > 0)?.id ?? "scenes")
    : "";

  // Get active tab from URL or default to first tab with content
  const activeTab = searchParams.get("tab") || effectiveDefaultTab;
  const tabTakesSubStudios = TAB_TAKES_SUB_STUDIOS[activeTab] === true;

  // Handler for toggling include sub-studios
  const handleIncludeSubStudiosChange = (checked: boolean) => {
    const newParams = new URLSearchParams(searchParams);
    if (checked) {
      newParams.set("includeSubStudios", "true");
    } else {
      newParams.delete("includeSubStudios");
    }
    setSearchParams(newParams);
  };

  // Check if studio has children (for showing toggle)
  const childStudios = studio?.child_studios as
    | Record<string, unknown>[]
    | undefined;
  const hasChildren = childStudios && childStudios.length > 0;

  // Set page title to studio name
  usePageTitle((studio?.name as string) || "Studio");

  // The rating and favorite controls start from each loaded studio's,
  // set while rendering so they never show the previous one's
  const [controlsFor, setControlsFor] = useState(studio);
  if (controlsFor !== studio) {
    setControlsFor(studio);
    setRating((studio?.rating as number | null | undefined) ?? null);
    setIsFavorite(studio?.favorite === true);
  }

  const handleRatingChange = async (newRating: number | null) => {
    // Write on the loaded studio's own server: a bare-id link names none
    const entityInstanceId = studio?.instanceId as string | undefined;
    if (!entityInstanceId) return;
    setRating(newRating);
    try {
      await libraryApi.updateRating(
        "studio",
        studioId!,
        newRating,
        entityInstanceId
      );
    } catch (error) {
      console.error("Failed to update rating:", error);
      setRating((studio as Record<string, unknown>)?.rating as number | null);
    }
  };

  const handleFavoriteChange = async (newValue: boolean) => {
    // Write on the loaded studio's own server: a bare-id link names none
    const entityInstanceId = studio?.instanceId as string | undefined;
    if (!entityInstanceId) return;
    setIsFavorite(newValue);
    try {
      await libraryApi.updateFavorite(
        "studio",
        studioId!,
        newValue,
        entityInstanceId
      );
    } catch (error) {
      console.error("Failed to update favorite:", error);
      setIsFavorite((studio?.favorite as boolean) || false);
    }
  };

  const toggleFavorite = () => {
    void handleFavoriteChange(!isFavorite);
  };

  // Rating and favorite hotkeys (r + 1-5 for ratings, r + 0 to clear, r + f to toggle favorite)

  useRatingHotkeys({
    enabled: !isLoading && !!studio,
    setRating: (newRating) => void handleRatingChange(newRating),
    toggleFavorite,
  });

  if (lookup.status === "loading") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <LibraryInitializingBanner />
        <LoadingSpinner />
      </div>
    );
  }

  if (lookup.status !== "found") {
    return (
      <EntityNotFound
        entityType="studio"
        status={lookup.status}
        matches={lookup.matches}
        error={lookup.error}
        onRetry={lookup.retry}
      />
    );
  }

  const studioName = typeof studio?.name === "string" ? studio.name : "";

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
              (
                <div className="flex gap-4 items-center">
                  <span>
                    {(studio?.name as string) || `Studio ${studioId}`}
                  </span>
                  {!!settings.showFavorite && (
                    <FavoriteButton
                      isFavorite={isFavorite}
                      onChange={(newValue) =>
                        void handleFavoriteChange(newValue)
                      }
                      size="large"
                    />
                  )}
                  <ViewInStashButton
                    stashUrl={studio?.stashUrl as string}
                    size={24}
                  />
                </div>
              ) as unknown as string
            }
            subtitle={
              (studio?.aliases as string[] | undefined)?.length
                ? `Also known as: ${(studio!.aliases as string[]).join(", ")}`
                : null
            }
          />

          {/* Rating Slider */}
          {!!settings.showRating && (
            <div className="mt-4 max-w-md">
              <RatingSlider
                rating={rating}
                onChange={(newRating) => void handleRatingChange(newRating)}
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
          {!!settings.showDescriptionOnDetail && !!studio?.details && (
            <div className="flex-1 lg:overflow-y-auto lg:max-h-[80vh]">
              <Card title="Details">
                <p
                  className="text-sm whitespace-pre-wrap"
                  style={{ color: "var(--text-primary)" }}
                >
                  {studio.details as React.ReactNode}
                </p>
              </Card>
            </div>
          )}
        </div>

        {/* Full Width Sections - Statistics, Parent Studio, Tags, Website */}
        <div className="space-y-6 mb-8">
          <StudioStats
            studio={studio}
            counts={counts}
            activeTab={activeTab}
            defaultTab={effectiveDefaultTab}
          />
          <StudioDetails
            studio={studio}
            settings={settings}
            hasMultipleInstances={hasMultipleInstances}
          />
        </div>

        {/* Tabbed Content Section */}
        <div className="mt-8">
          {/* Include Sub-Studios Toggle: a studio with children, on a tab that takes them */}
          {hasChildren && tabTakesSubStudios && (
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
                    accentColor: "var(--accent-primary)",
                  }}
                />
                <span
                  className="text-sm font-medium"
                  style={{ color: "var(--text-primary)" }}
                >
                  Include sub-studios (
                  {(studio!.child_studios as EntityRef[]).length})
                </span>
              </label>
            </div>
          )}

          {counts && contentTabs.every((t) => t.count === 0) ? (
            <div
              className="py-16 text-center"
              style={{ color: "var(--text-muted)" }}
            >
              This studio has no content in Peek
            </div>
          ) : (
            <>
              <TabNavigation
                tabs={contentTabs}
                defaultTab={effectiveDefaultTab}
              />
              <RelationCountsError
                error={counts ? null : countsError}
                onRetry={() => void refetchCounts()}
              />

              {/* Tab Content */}
              {activeTab === "scenes" && (
                <SceneSearch
                  key={`scenes-${includeSubStudios}`}
                  context="scene_studio"
                  permanentFilters={{
                    studios: {
                      value: [studioRef],
                      modifier: "INCLUDES",
                      ...(includeSubStudios && { depth: -1 }),
                    },
                  }}
                  permanentFiltersMetadata={{
                    studios: [
                      {
                        id: studioRef,
                        name: studio?.name || "Unknown Studio",
                      },
                    ],
                  }}
                  title={`Scenes from ${studioName || "this studio"}${includeSubStudios ? " (and sub-studios)" : ""}`}
                  fromPageTitle={(studio?.name as string) || "Studio"}
                />
              )}

              {activeTab === "galleries" && (
                <GalleryGrid
                  key={`galleries-${includeSubStudios}`}
                  lockedFilters={{
                    gallery_filter: {
                      studios: {
                        value: [studioRef],
                        modifier: "INCLUDES",
                        ...(includeSubStudios && { depth: -1 }),
                      },
                    },
                  }}
                  hideLockedFilters
                  emptyMessage={`No galleries found for ${studioName}`}
                />
              )}

              {activeTab === "images" && (
                <ImagesTab
                  studioRef={studioRef}
                  studioName={studio?.name as string | undefined}
                  includeSubStudios={includeSubStudios}
                />
              )}

              {activeTab === "performers" && (
                <PerformerGrid
                  lockedFilters={{
                    performer_filter: {
                      studios: {
                        value: [studioRef],
                        modifier: "INCLUDES",
                      },
                    },
                  }}
                  hideLockedFilters
                  emptyMessage={`No performers found for ${studioName}`}
                />
              )}

              {activeTab === "groups" && (
                <GroupGrid
                  key={`groups-${includeSubStudios}`}
                  lockedFilters={{
                    group_filter: {
                      studios: {
                        value: [studioRef],
                        modifier: "INCLUDES",
                        ...(includeSubStudios && { depth: -1 }),
                      },
                    },
                  }}
                  hideLockedFilters
                  emptyMessage={`No collections found for ${studioName}`}
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
interface CardProps {
  title?: string;
  children: React.ReactNode;
}

const Card = ({ title, children }: CardProps) => {
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

// Studio Image Component (Logo - 1:1 aspect ratio)
interface StudioImageProps {
  studio: Record<string, unknown> | null;
}

const StudioImage = ({ studio }: StudioImageProps) => {
  return (
    <div
      className="rounded-xl overflow-hidden shadow-lg flex items-center justify-center"
      style={{
        backgroundColor: "var(--bg-card)",
        aspectRatio: "1/1",
        width: "100%",
        maxHeight: "50vh",
      }}
    >
      {studio?.image_path ? (
        <img
          src={studio.image_path as string}
          alt={studio.name as string | undefined}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
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
interface StudioStatsProps {
  studio: Record<string, unknown> | null;
  /** The tabs' counts; undefined while they load */
  counts: RelationCountsByType["studio"] | undefined;
  activeTab: string;
  defaultTab: string;
}

const StudioStats = ({
  studio,
  counts,
  activeTab,
  defaultTab,
}: StudioStatsProps) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const handleTabSwitch = (tabId: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (tabId === defaultTab) {
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
    isActive,
  }: {
    label: string;
    value: string | number | null | undefined;
    valueColor?: string;
    onClick?: () => void;
    isActive?: boolean;
  }) => {
    if (!value && value !== 0) return null;

    const clickable = onClick && Number(value) > 0;

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
              textDecoration: isActive ? "underline" : "none",
            }}
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
      {studio && (studio.rating100 as number) > 0 && (
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
              {studio.rating100 as React.ReactNode}/100
            </span>
          </div>
          <div
            className="w-full h-3 rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Number(studio.rating100)}%`,
                backgroundColor: "var(--accent-primary)",
              }}
            />
          </div>
        </div>
      )}

      {/* Other Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatField
          label="Scenes:"
          value={counts?.scenes}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch("scenes")}
          isActive={activeTab === "scenes"}
        />
        <StatField
          label="Performers:"
          value={counts?.performers}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch("performers")}
          isActive={activeTab === "performers"}
        />
        <StatField
          label="Images:"
          value={counts?.images}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch("images")}
          isActive={activeTab === "images"}
        />
        <StatField
          label="Galleries:"
          value={counts?.galleries}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch("galleries")}
          isActive={activeTab === "galleries"}
        />
        <StatField
          label="Collections:"
          value={counts?.groups}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch("groups")}
          isActive={activeTab === "groups"}
        />
      </div>
    </Card>
  );
};

// Studio Details Component
interface StudioDetailsProps {
  studio: Record<string, unknown> | null;
  settings: Record<string, unknown>;
  hasMultipleInstances: boolean;
}

const StudioDetails = ({
  studio,
  settings,
  hasMultipleInstances,
}: StudioDetailsProps) => {
  const showDetails = settings?.showDescriptionOnDetail !== false;

  return (
    <>
      {studio?.url && (
        <Card title="Website">
          <a
            href={studio.url as string}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center hover:underline transition-colors"
            style={{ color: "var(--accent-primary)" }}
          >
            {studio.url as React.ReactNode}
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
            {studio.details as React.ReactNode}
          </p>
        </Card>
      )}

      {(studio?.parent_studio as EntityRef | undefined)?.id && (
        <Card title="Parent Studio">
          <Link
            to={getEntityPath(
              "studio",
              studio!.parent_studio as EntityRef,
              hasMultipleInstances
            )}
            className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              backgroundColor: "var(--accent-primary)",
              color: "white",
            }}
          >
            {(studio!.parent_studio as EntityRef).name ||
              `Studio ${(studio!.parent_studio as EntityRef).id}`}
          </Link>
        </Card>
      )}

      {studio?.child_studios &&
        (studio.child_studios as EntityRef[]).length > 0 && (
          <Card title="Child Studios">
            <div className="flex flex-wrap gap-2">
              {(studio.child_studios as EntityRef[]).map((child: EntityRef) => (
                <Link
                  key={child.id}
                  to={getEntityPath("studio", child, hasMultipleInstances)}
                  className="px-3 py-1 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
                  style={{
                    color: "var(--text-primary)",
                  }}
                >
                  {child.name}
                </Link>
              ))}
            </div>
          </Card>
        )}

      {studio?.tags && (studio.tags as TagRef[]).length > 0 && (
        <Card title="Tags">
          <TagChips tags={studio.tags as TagRef[]} />
        </Card>
      )}

      {studio?.movies && (studio.movies as EntityRef[]).length > 0 && (
        <Card title="Movies">
          <div className="space-y-1">
            {(studio.movies as EntityRef[]).map((movie: EntityRef) => (
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

      {studio?.stash_ids && (studio.stash_ids as StashId[]).length > 0 && (
        <Card title="StashDB Links">
          <div className="space-y-2">
            {(studio.stash_ids as StashId[]).map(
              (stashId: StashId, index: number) => (
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
              )
            )}
          </div>
        </Card>
      )}
    </>
  );
};

// Images Tab Component with Lightbox
interface StudioImagesTabProps {
  /** The studio as "id:instanceId" */
  studioRef: string;
  studioName: string | undefined;
  includeSubStudios?: boolean;
}

const ImagesTab = ({
  studioRef,
  studioName,
  includeSubStudios = false,
}: StudioImagesTabProps) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-based page state for image pagination
  const urlPage = parseInt(searchParams.get("page") || "1") || 1;

  const handleImagePageChange = useCallback(
    (newPage: number) => {
      const params = new URLSearchParams(searchParams);
      if (newPage === 1) {
        params.delete("page");
      } else {
        params.set("page", String(newPage));
      }
      // Preserve tab param
      setSearchParams(params);
    },
    [searchParams, setSearchParams]
  );

  const fetchImages = useCallback(
    async (page: number, perPage: number) => {
      const data = (await libraryApi.findImages({
        filter: { page, per_page: perPage },
        image_filter: {
          studios: {
            value: [studioRef],
            modifier: "INCLUDES",
            ...(includeSubStudios && { depth: -1 }),
          },
        },
      })) as { findImages?: { images?: NormalizedImage[]; count?: number } };
      return {
        images: data.findImages?.images ?? [],
        count: data.findImages?.count || 0,
      };
    },
    [studioRef, includeSubStudios]
  );

  const paginationResult = useImagesPagination<NormalizedImage>({
    fetchImages,
    dependencies: [studioRef, includeSubStudios],
    externalPage: urlPage,
    onExternalPageChange: handleImagePageChange,
  });

  return (
    <PaginatedImageGrid
      images={paginationResult.images}
      totalCount={paginationResult.totalCount}
      isLoading={paginationResult.isLoading}
      lightbox={paginationResult.lightbox}
      setImages={paginationResult.setImages}
      emptyMessage={`No images found for ${studioName}`}
      className="mt-6"
    />
  );
};

export default StudioDetail;
