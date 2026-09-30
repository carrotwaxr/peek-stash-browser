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
  STUDIO_FIELDS,
} from "@peek/shared-types";
import { ArrowLeft } from "lucide-react";
import { switchTabParams } from "@/utils/urlParams";
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
import {
  GalleryGrid,
  GroupGrid,
  PerformerGrid,
  StudioGrid,
} from "../grids/index";
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
  MediaImage,
  PageHeader,
  PaginatedImageGrid,
  RatingSlider,
  TabNavigation,
} from "../ui/index";

interface EntityRef {
  id: string;
  name?: string;
  instanceId?: string;
  image_path?: string;
  [key: string]: unknown;
}

/**
 * Whether each tab's tag filter takes sub-tags (a depth) in the shared
 * contract; Include sub-tags shows on the tabs that do (all of them today)
 */
const TAB_TAKES_SUB_TAGS: Readonly<Record<string, boolean>> = {
  scenes: SCENE_FIELDS.tags.hierarchical,
  galleries: GALLERY_FIELDS.tags.hierarchical,
  images: IMAGE_FIELDS.tags.hierarchical,
  performers: PERFORMER_FIELDS.tags.hierarchical,
  studios: STUDIO_FIELDS.tags.hierarchical,
  groups: GROUP_FIELDS.tags.hierarchical,
};

const TagDetail = () => {
  const { tagId } = useParams<{ tagId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [rating, setRating] = useState<number | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);

  // Navigation state for back button
  const { goBack, backButtonText } = useNavigationState();

  // Card display settings
  const { getSettings } = useCardDisplaySettings();
  const settings = getSettings("tag");

  // Get multi-instance config
  const { hasMultipleInstances } = useConfig();

  // Get instance from URL query param for multi-stash support
  const instanceId = searchParams.get("instance");

  const lookup = useEntityLookup(libraryApi.findTagById, tagId, instanceId);
  const tag = lookup.entity ?? null;
  const isLoading = lookup.status === "loading";

  // Include sub-tags toggle state (from URL param or default false)
  const includeSubTags = searchParams.get("includeSubTags") === "true";

  // Reads, tab filters and counts use the loaded tag's own server: a
  // bare-id link names none
  const tagInstanceId = tag?.instanceId as string | undefined;
  const tagRef = makeCompositeKey(tagId ?? "", tagInstanceId);

  // Each tab's count is the total of its list, as the viewer sees it; the
  // tabs show no badge and none opens until the counts answer
  const {
    data: countsData,
    error: countsError,
    refetch: refetchCounts,
  } = useRelationCounts("tag", tagId, tagInstanceId, {
    includeSubTags,
  });
  const counts = countsData?.counts;
  const contentTabs = [
    { id: "scenes", label: "Scenes", count: counts?.scenes },
    { id: "galleries", label: "Galleries", count: counts?.galleries },
    { id: "images", label: "Images", count: counts?.images },
    { id: "performers", label: "Performers", count: counts?.performers },
    { id: "studios", label: "Studios", count: counts?.studios },
    { id: "groups", label: "Collections", count: counts?.groups },
  ].map((t) => ({ ...t, count: t.count ?? TAB_COUNT_LOADING }));
  // The first tab with content, once the counts are in
  const effectiveDefaultTab = counts
    ? (contentTabs.find((t) => t.count > 0)?.id ?? "scenes")
    : "";

  // Get active tab from URL or default to first tab with content
  const activeTab = searchParams.get("tab") || effectiveDefaultTab;
  const tabTakesSubTags = TAB_TAKES_SUB_TAGS[activeTab] === true;

  // Handler for toggling include sub-tags
  const handleIncludeSubTagsChange = (checked: boolean) => {
    const newParams = new URLSearchParams(searchParams);
    // The tab's list starts again: a page from the other setting may not exist
    newParams.delete("page");
    if (checked) {
      newParams.set("includeSubTags", "true");
    } else {
      newParams.delete("includeSubTags");
    }
    setSearchParams(newParams);
  };

  // Check if tag has children (for showing toggle)
  const hasChildren = !!(
    tag?.children && (tag.children as EntityRef[]).length > 0
  );

  // Set page title to tag name
  usePageTitle((tag?.name as string) || "Tag");

  // The rating and favorite controls start from each loaded tag's,
  // set while rendering so they never show the previous one's
  const [controlsFor, setControlsFor] = useState(tag);
  if (controlsFor !== tag) {
    setControlsFor(tag);
    setRating((tag?.rating as number | null | undefined) ?? null);
    setIsFavorite(tag?.favorite === true);
  }

  const handleRatingChange = async (newRating: number | null) => {
    // Write on the loaded tag's own server: a bare-id link names none
    const entityInstanceId = tag?.instanceId as string | undefined;
    if (!entityInstanceId) return;
    setRating(newRating);
    try {
      await libraryApi.updateRating("tag", tagId!, newRating, entityInstanceId);
    } catch (error) {
      console.error("Failed to update rating:", error);
      setRating((tag as Record<string, unknown>)?.rating as number | null);
    }
  };

  const handleFavoriteChange = async (newValue: boolean) => {
    // Write on the loaded tag's own server: a bare-id link names none
    const entityInstanceId = tag?.instanceId as string | undefined;
    if (!entityInstanceId) return;
    setIsFavorite(newValue);
    try {
      await libraryApi.updateFavorite(
        "tag",
        tagId!,
        newValue,
        entityInstanceId
      );
    } catch (error) {
      console.error("Failed to update favorite:", error);
      setIsFavorite((tag?.favorite as boolean) || false);
    }
  };

  const toggleFavorite = () => {
    void handleFavoriteChange(!isFavorite);
  };

  // Rating and favorite hotkeys (r + 1-5 for ratings, r + 0 to clear, r + f to toggle favorite)
  useRatingHotkeys({
    enabled: !isLoading && !!tag,
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

  // Found always carries the tag; the second check narrows it for below
  if (lookup.status !== "found" || !tag) {
    return (
      <EntityNotFound
        entityType="tag"
        status={lookup.status === "found" ? "notFound" : lookup.status}
        matches={lookup.matches}
        error={lookup.error}
        onRetry={lookup.retry}
      />
    );
  }

  const tagName = typeof tag.name === "string" ? tag.name : "";

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

        {/* Tag Header - Hero Treatment */}
        <div className="mb-8">
          <PageHeader
            title={
              (
                <div className="flex gap-4 items-center">
                  <span>{(tag?.name as string) || `Tag ${tagId}`}</span>
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
                    stashUrl={tag?.stashUrl as string}
                    size={24}
                  />
                </div>
              ) as unknown as string
            }
            subtitle={
              (tag?.aliases as string[] | undefined)?.length
                ? `Also known as: ${(tag?.aliases as string[]).join(", ")}`
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
          {/* Left Column: Tag Image (1:1) */}
          <div className="w-full lg:w-2/5 flex-shrink-0">
            <TagImage tag={tag} />
          </div>

          {/* Right Column: Details (scrollable, matches image height) */}
          {!!settings.showDescriptionOnDetail && !!tag?.description && (
            <div className="flex-1 lg:overflow-y-auto lg:max-h-[80vh]">
              <Card title="Details">
                <p
                  className="text-sm whitespace-pre-wrap"
                  style={{ color: "var(--text-primary)" }}
                >
                  {tag.description as React.ReactNode}
                </p>
              </Card>
            </div>
          )}
        </div>

        {/* Full Width Sections - Statistics, Parents, Children, Aliases */}
        <div className="space-y-6 mb-8">
          <TagStats
            tag={tag}
            counts={counts}
            activeTab={activeTab}
            defaultTab={effectiveDefaultTab}
          />
          <TagDetails tag={tag} hasMultipleInstances={hasMultipleInstances} />
        </div>

        {/* Tabbed Content Section */}
        <div className="mt-8">
          {/* Include Sub-Tags Toggle: a tag with children, on a tab that takes them */}
          {hasChildren && tabTakesSubTags && (
            <div className="mb-4 flex items-center gap-2">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeSubTags}
                  onChange={(e) => handleIncludeSubTagsChange(e.target.checked)}
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
                  Include sub-tags ({(tag.children as EntityRef[]).length})
                </span>
              </label>
            </div>
          )}

          {counts && contentTabs.every((t) => t.count === 0) ? (
            <div
              className="py-16 text-center"
              style={{ color: "var(--text-muted)" }}
            >
              This tag has no content in Peek
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
                  key={`scenes-${includeSubTags}`}
                  context="scene_tag"
                  permanentFilters={{
                    tags: {
                      value: [tagRef],
                      modifier: "INCLUDES",
                      ...(includeSubTags && { depth: -1 }),
                    },
                  }}
                  permanentFiltersMetadata={{
                    tags: [
                      {
                        id: tagRef,
                        name: (tag?.name as string) || "Unknown Tag",
                      },
                    ],
                  }}
                  title={`Scenes tagged with ${(tag?.name as string) || "this tag"}${includeSubTags ? " (and sub-tags)" : ""}`}
                  fromPageTitle={(tag?.name as string) || "Tag"}
                />
              )}

              {activeTab === "galleries" && (
                <GalleryGrid
                  key={`galleries-${includeSubTags}`}
                  lockedFilters={{
                    gallery_filter: {
                      tags: {
                        value: [tagRef],
                        modifier: "INCLUDES",
                        ...(includeSubTags && { depth: -1 }),
                      },
                    },
                  }}
                  hideLockedFilters
                  emptyMessage={`No galleries found with tag "${tagName}"`}
                />
              )}

              {activeTab === "images" && (
                <ImagesTab
                  tagRef={tagRef}
                  tagName={tag?.name as string | undefined}
                  includeSubTags={includeSubTags}
                />
              )}

              {activeTab === "performers" && (
                <PerformerGrid
                  key={`performers-${includeSubTags}`}
                  lockedFilters={{
                    performer_filter: {
                      tags: {
                        value: [tagRef],
                        modifier: "INCLUDES",
                        ...(includeSubTags && { depth: -1 }),
                      },
                    },
                  }}
                  hideLockedFilters
                  emptyMessage={`No performers found with tag "${tagName}"`}
                />
              )}

              {activeTab === "studios" && (
                <StudioGrid
                  key={`studios-${includeSubTags}`}
                  lockedFilters={{
                    studio_filter: {
                      tags: {
                        value: [tagRef],
                        modifier: "INCLUDES",
                        ...(includeSubTags && { depth: -1 }),
                      },
                    },
                  }}
                  hideLockedFilters
                  emptyMessage={`No studios found with tag "${tagName}"`}
                />
              )}

              {activeTab === "groups" && (
                <GroupGrid
                  key={`groups-${includeSubTags}`}
                  lockedFilters={{
                    group_filter: {
                      tags: {
                        value: [tagRef],
                        modifier: "INCLUDES",
                        ...(includeSubTags && { depth: -1 }),
                      },
                    },
                  }}
                  hideLockedFilters
                  emptyMessage={`No collections found with tag "${tagName}"`}
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

// Tag Image Component (16:9 aspect ratio to match tag cards)
// Uses MediaImage to handle video tag images (e.g., from feederbox tag-import plugin)
interface TagImageProps {
  tag: Record<string, unknown> | null;
}

const TagImage = ({ tag }: TagImageProps) => {
  const [showPlaceholder, setShowPlaceholder] = useState(false);

  return (
    <div
      className="rounded-lg w-full aspect-video overflow-hidden shadow-lg flex items-center justify-center"
      style={{
        backgroundColor: "var(--bg-card)",
        maxHeight: "50vh",
      }}
    >
      {tag?.image_path && !showPlaceholder ? (
        <MediaImage
          src={tag.image_path as string}
          alt={tag.name as string | undefined}
          className="w-full h-full object-cover"
          onError={() => setShowPlaceholder(true)}
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
interface TagStatsProps {
  tag: Record<string, unknown> | null;
  /** The tabs' counts; undefined while they load */
  counts: RelationCountsByType["tag"] | undefined;
  activeTab: string;
  defaultTab: string;
}

const TagStats = ({ tag, counts, activeTab, defaultTab }: TagStatsProps) => {
  const [searchParams, setSearchParams] = useSearchParams();

  const handleTabSwitch = (tabId: string) => {
    setSearchParams(switchTabParams(searchParams, tabId, defaultTab));
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
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatField
          label="Scenes:"
          value={counts?.scenes}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch("scenes")}
          isActive={activeTab === "scenes"}
        />
        <StatField
          label="Markers:"
          value={tag?.scene_marker_count as number | undefined}
          valueColor="var(--accent-primary)"
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
          label="Performers:"
          value={counts?.performers}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch("performers")}
          isActive={activeTab === "performers"}
        />
        <StatField
          label="Studios:"
          value={counts?.studios}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch("studios")}
          isActive={activeTab === "studios"}
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

// Tag Details Component (Parent Tags, Child Tags, Aliases)
interface TagDetailsProps {
  tag: Record<string, unknown> | null;
  hasMultipleInstances: boolean;
}

const TagDetails = ({ tag, hasMultipleInstances }: TagDetailsProps) => {
  const parents = tag?.parents as EntityRef[] | undefined;
  const children = tag?.children as EntityRef[] | undefined;

  return (
    <>
      {parents && parents.length > 0 && (
        <Card title="Parent Tags">
          <div className="flex flex-wrap gap-2">
            {parents.map((parent: EntityRef) => {
              // Generate a color based on tag ID for consistency
              const hue = (parseInt(parent.id, 10) * 137.5) % 360;
              return (
                <Link
                  key={parent.id}
                  to={getEntityPath("tag", parent, hasMultipleInstances)}
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

      {children && children.length > 0 && (
        <Card title="Child Tags">
          <div className="flex flex-wrap gap-2">
            {children.map((child: EntityRef) => {
              // Generate a color based on tag ID for consistency
              const hue = (parseInt(child.id, 10) * 137.5) % 360;
              return (
                <Link
                  key={child.id}
                  to={getEntityPath("tag", child, hasMultipleInstances)}
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

// Images Tab Component with Lightbox
interface TagImagesTabProps {
  /** The tag as "id:instanceId" */
  tagRef: string;
  tagName: string | undefined;
  includeSubTags?: boolean;
}

const ImagesTab = ({
  tagRef,
  tagName,
  includeSubTags = false,
}: TagImagesTabProps) => {
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
          tags: {
            value: [tagRef],
            modifier: "INCLUDES",
            ...(includeSubTags && { depth: -1 }),
          },
        },
      })) as { findImages?: { images?: NormalizedImage[]; count?: number } };
      return {
        images: data.findImages?.images ?? [],
        count: data.findImages?.count || 0,
      };
    },
    [tagRef, includeSubTags]
  );

  const paginationResult = useImagesPagination<NormalizedImage>({
    fetchImages,
    dependencies: [tagRef, includeSubTags],
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
      emptyMessage={`No images found with tag "${tagName}"`}
      className="mt-6"
    />
  );
};

export default TagDetail;
