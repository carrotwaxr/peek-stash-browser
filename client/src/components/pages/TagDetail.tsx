import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useImagesPagination } from "../../hooks/useImagesPagination";
import { useNavigationState } from "../../hooks/useNavigationState";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRatingHotkeys } from "../../hooks/useRatingHotkeys";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext";
import { useConfig } from "../../contexts/ConfigContext";
import { libraryApi } from "../../api";
import { makeCompositeKey } from "../../utils/compositeKey";
import { getEntityPath } from "../../utils/entityLinks";
import SceneSearch from "../scene-search/SceneSearch";
import {
  Button,
  FavoriteButton,
  LazyImage,
  LoadingSpinner,
  MediaImage,
  PageHeader,
  PaginatedImageGrid,
  RatingSlider,
  TabNavigation,
} from "../ui/index";
import { GalleryGrid, GroupGrid, PerformerGrid, StudioGrid } from "../grids/index";
import ViewInStashButton from "../ui/ViewInStashButton";
import type { NormalizedImage } from "@peek/shared-types";

interface EntityRef {
  id: string;
  name?: string;
  instanceId?: string;
  image_path?: string;
  [key: string]: unknown;
}

const TagDetail = () => {
  const { tagId } = useParams<{ tagId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isLoading, setIsLoading] = useState(true);
  const [tag, setTag] = useState<Record<string, unknown> | null>(null);
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

  // Include sub-tags toggle state (from URL param or default false)
  const includeSubTags = searchParams.get('includeSubTags') === 'true';

  // Compute tabs with counts for smart default selection
  const contentTabs = [
    { id: 'scenes', label: 'Scenes', count: (tag?.scene_count as number) || 0 },
    { id: 'galleries', label: 'Galleries', count: (tag?.gallery_count as number) || 0 },
    { id: 'images', label: 'Images', count: (tag?.image_count as number) || 0 },
    { id: 'performers', label: 'Performers', count: (tag?.performer_count as number) || 0 },
    { id: 'studios', label: 'Studios', count: (tag?.studio_count as number) || 0 },
    { id: 'groups', label: 'Collections', count: (tag?.group_count as number) || 0 },
  ];
  const effectiveDefaultTab = contentTabs.find(t => t.count > 0)?.id || 'scenes';

  // Get active tab from URL or default to first tab with content
  const activeTab = searchParams.get('tab') || effectiveDefaultTab;

  // Handler for toggling include sub-tags
  const handleIncludeSubTagsChange = (checked: boolean) => {
    const newParams = new URLSearchParams(searchParams);
    if (checked) {
      newParams.set('includeSubTags', 'true');
    } else {
      newParams.delete('includeSubTags');
    }
    setSearchParams(newParams);
  };

  // Check if tag has children (for showing toggle)
  const hasChildren = !!(tag?.children && (tag.children as EntityRef[]).length > 0);

  // Set page title to tag name
  usePageTitle((tag?.name as string) || "Tag");

  useEffect(() => {
    const fetchTag = async () => {
      try {
        setIsLoading(true);
        const tagData = await libraryApi.findTagById(tagId!, instanceId!) as Record<string, unknown> | null;
        setTag(tagData);
        setRating((tagData as Record<string, unknown> | null)?.rating as number | null ?? null);
        setIsFavorite(((tagData as Record<string, unknown> | null)?.favorite as boolean) || false);
      } catch {
        // Error loading tag - will show loading spinner
      } finally {
        setIsLoading(false);
      }
    };

    fetchTag();
  }, [tagId, instanceId]);

  const handleRatingChange = async (newRating: number | null) => {
    setRating(newRating);
    try {
      await libraryApi.updateRating("tag", tagId!, newRating, instanceId!);
    } catch (error) {
      console.error("Failed to update rating:", error);
      setRating((tag as Record<string, unknown>)?.rating as number | null);
    }
  };

  const handleFavoriteChange = async (newValue: boolean) => {
    setIsFavorite(newValue);
    try {
      await libraryApi.updateFavorite("tag", tagId!, newValue, instanceId!);
    } catch (error) {
      console.error("Failed to update favorite:", error);
      setIsFavorite((tag?.favorite as boolean) || false);
    }
  };

  const toggleFavorite = () => {
    handleFavoriteChange(!isFavorite);
  };

  // Rating and favorite hotkeys (r + 1-5 for ratings, r + 0 to clear, r + f to toggle favorite)
  useRatingHotkeys({
    enabled: !isLoading && !!tag,
    setRating: handleRatingChange,
    toggleFavorite,
  });

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
              onClick={goBack}
              variant="secondary"
              icon={<ArrowLeft size={16} className="sm:w-4 sm:h-4" />}
              title={backButtonText}
            >
              <span className="hidden sm:inline">{backButtonText}</span>
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
                      onChange={handleFavoriteChange}
                      size="large"
                    />
                  )}
                  <ViewInStashButton stashUrl={tag?.stashUrl as string} size={24} />
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
                onChange={handleRatingChange}
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
          <TagStats tag={tag} tagId={tagId} />
          <TagDetails tag={tag} hasMultipleInstances={hasMultipleInstances} />
        </div>

        {/* Tabbed Content Section */}
        <div className="mt-8">
          {/* Include Sub-Tags Toggle - only show if tag has children */}
          {hasChildren && (
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

          {contentTabs.every(t => t.count === 0) ? (
            <div className="py-16 text-center" style={{ color: 'var(--text-muted)' }}>
              This tag has no content in Peek
            </div>
          ) : (
            <>
              <TabNavigation
                tabs={contentTabs}
                defaultTab={effectiveDefaultTab}
              />

              {/* Tab Content */}
              {activeTab === 'scenes' && (
                <SceneSearch
                  key={`scenes-${includeSubTags}`}
                  context="scene_tag"
                  permanentFilters={{
                    tags: {
                      value: [makeCompositeKey(tagId!, instanceId)],
                      modifier: "INCLUDES",
                      ...(includeSubTags && { depth: -1 }),
                    },
                  }}
                  permanentFiltersMetadata={{
                    tags: [{ id: makeCompositeKey(tagId!, instanceId), name: (tag?.name as string) || "Unknown Tag" }],
                  }}
                  title={`Scenes tagged with ${(tag?.name as string) || "this tag"}${includeSubTags ? " (and sub-tags)" : ""}`}
                  fromPageTitle={(tag?.name as string) || "Tag"}
                />
              )}

              {activeTab === 'galleries' && (
                <GalleryGrid
                  key={`galleries-${includeSubTags}`}
                  lockedFilters={{
                    gallery_filter: {
                      tags: {
                        value: [makeCompositeKey(tagId!, instanceId)],
                        modifier: "INCLUDES",
                        ...(includeSubTags && { depth: -1 }),
                      },
                    },
                  }}
                  hideLockedFilters
                  emptyMessage={`No galleries found with tag "${tag?.name}"`}
                />
              )}

              {activeTab === 'images' && (
                <ImagesTab tagId={tagId} instanceId={instanceId} tagName={tag?.name as string | undefined} includeSubTags={includeSubTags} />
              )}

              {activeTab === 'performers' && (
                <PerformerGrid
                  lockedFilters={{
                    performer_filter: {
                      tags: {
                        value: [makeCompositeKey(tagId!, instanceId)],
                        modifier: "INCLUDES",
                      },
                    },
                  }}
                  hideLockedFilters
                  emptyMessage={`No performers found with tag "${tag?.name}"`}
                />
              )}

              {activeTab === 'studios' && (
                <StudioGrid
                  lockedFilters={{
                    studio_filter: {
                      tags: {
                        value: [makeCompositeKey(tagId!, instanceId)],
                        modifier: "INCLUDES",
                      },
                    },
                  }}
                  hideLockedFilters
                  emptyMessage={`No studios found with tag "${tag?.name}"`}
                />
              )}

              {activeTab === 'groups' && (
                <GroupGrid
                  lockedFilters={{
                    group_filter: {
                      tags: {
                        value: [makeCompositeKey(tagId!, instanceId)],
                        modifier: "INCLUDES",
                      },
                    },
                  }}
                  hideLockedFilters
                  emptyMessage={`No collections found with tag "${tag?.name}"`}
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
  tagId: string | undefined;
}

const TagStats = ({ tag, tagId: _tagId }: TagStatsProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || 'scenes';

  const handleTabSwitch = (tabId: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (tabId === 'scenes') {
      newParams.delete('tab');
    } else {
      newParams.set('tab', tabId);
    }
    setSearchParams(newParams);
    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  };

  const StatField = ({ label, value, valueColor = "var(--text-primary)", onClick, isActive }: { label: string; value: string | number | null | undefined; valueColor?: string; onClick?: () => void; isActive?: boolean }) => {
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
              cursor: isActive ? 'default' : 'pointer',
              textDecoration: isActive ? 'underline' : 'none',
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
          value={tag?.scene_count as number | undefined}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch('scenes')}
          isActive={activeTab === 'scenes'}
        />
        <StatField
          label="Markers:"
          value={tag?.scene_marker_count as number | undefined}
          valueColor="var(--accent-primary)"
        />
        <StatField
          label="Images:"
          value={tag?.image_count as number | undefined}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch('images')}
          isActive={activeTab === 'images'}
        />
        <StatField
          label="Galleries:"
          value={tag?.gallery_count as number | undefined}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch('galleries')}
          isActive={activeTab === 'galleries'}
        />
        <StatField
          label="Performers:"
          value={tag?.performer_count as number | undefined}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch('performers')}
          isActive={activeTab === 'performers'}
        />
        <StatField
          label="Studios:"
          value={tag?.studio_count as number | undefined}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch('studios')}
          isActive={activeTab === 'studios'}
        />
        <StatField
          label="Collections:"
          value={tag?.group_count as number | undefined}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch('groups')}
          isActive={activeTab === 'groups'}
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
                  to={getEntityPath('tag', parent, hasMultipleInstances)}
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
                  to={getEntityPath('tag', child, hasMultipleInstances)}
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
  tagId: string | undefined;
  instanceId: string | null;
  tagName: string | undefined;
  includeSubTags?: boolean;
}

const ImagesTab = ({ tagId, instanceId, tagName, includeSubTags = false }: TagImagesTabProps) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-based page state for image pagination
  const urlPage = parseInt(searchParams.get('page') || '1') || 1;

  const handleImagePageChange = useCallback((newPage: number) => {
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
    async (page: number, perPage: number) => {
      const data = await libraryApi.findImages({
        filter: { page, per_page: perPage },
        image_filter: {
          tags: {
            value: [makeCompositeKey(tagId!, instanceId)],
            modifier: "INCLUDES",
            ...(includeSubTags && { depth: -1 }),
          },
        },
      }) as { findImages?: { images?: NormalizedImage[]; count?: number } };
      return {
        images: data.findImages?.images || [],
        count: data.findImages?.count || 0,
      };
    },
    [tagId, instanceId, includeSubTags]
  );

  const paginationResult = useImagesPagination<NormalizedImage>({
    fetchImages,
    dependencies: [tagId, instanceId, includeSubTags],
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
