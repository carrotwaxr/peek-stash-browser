import React, { useCallback, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type {
  NormalizedImage,
  RelationCountsByType,
  TagRef,
} from "@peek/shared-types";
import { ArrowLeft } from "lucide-react";
import { libraryApi } from "../../api";
import { useRelationCounts } from "../../api/hooks";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext";
import { useUnitPreference } from "../../contexts/UnitPreferenceContext";
import { useEntityLookup } from "../../hooks/useEntityLookup";
import { useImagesPagination } from "../../hooks/useImagesPagination";
import { useNavigationState } from "../../hooks/useNavigationState";
import { useOpenTabAndScroll } from "../../hooks/useOpenTabAndScroll";
import { usePageTitle } from "../../hooks/usePageTitle";
import type { PageChangeOptions } from "../../hooks/usePaginatedLightbox";
import { useRatingHotkeys } from "../../hooks/useRatingHotkeys";
import { makeCompositeKey } from "../../utils/compositeKey";
import {
  formatHeight,
  formatLength,
  formatWeight,
} from "../../utils/unitConversions";
import { GalleryGrid, GroupGrid } from "../grids/index";
import SceneSearch from "../scene-search/SceneSearch";
import RelationCountsError from "../ui/RelationCountsError";
import { TAB_COUNT_LOADING } from "../ui/TabNavigation";
import ViewInStashButton from "../ui/ViewInStashButton";
import {
  Button,
  EntityNotFound,
  FavoriteButton,
  GenderIcon,
  LazyImage,
  LibraryInitializingBanner,
  LoadingSpinner,
  PageHeader,
  PaginatedImageGrid,
  RatingSlider,
  SectionLink,
  TabNavigation,
  TagChips,
} from "../ui/index";

const PerformerDetail = () => {
  const { performerId } = useParams<{ performerId: string }>();
  const [searchParams] = useSearchParams();
  const [rating, setRating] = useState<number | null>(null);
  const [isFavorite, setIsFavorite] = useState(false);

  // Navigation state for back button
  const { goBack, backButtonText } = useNavigationState();

  // Card display settings
  const { getSettings } = useCardDisplaySettings();
  const settings = getSettings("performer");

  // Get instance from URL query param for multi-stash support
  const instanceId = searchParams.get("instance");

  const lookup = useEntityLookup(
    libraryApi.findPerformerById,
    performerId,
    instanceId
  );
  const performer = lookup.entity ?? null;
  const isLoading = lookup.status === "loading";

  // Reads, tab filters and counts use the loaded performer's own server: a
  // bare-id link names none
  const performerInstanceId = performer?.instanceId as string | undefined;
  const performerRef = makeCompositeKey(performerId ?? "", performerInstanceId);

  // Each tab's count is the total of its list, as the viewer sees it; the
  // tabs show no badge and none opens until the counts answer
  const {
    data: countsData,
    error: countsError,
    refetch: refetchCounts,
  } = useRelationCounts("performer", performerId, performerInstanceId);
  const counts = countsData?.counts;
  const contentTabs = [
    { id: "scenes", label: "Scenes", count: counts?.scenes },
    { id: "galleries", label: "Galleries", count: counts?.galleries },
    { id: "images", label: "Images", count: counts?.images },
    { id: "groups", label: "Collections", count: counts?.groups },
  ].map((t) => ({ ...t, count: t.count ?? TAB_COUNT_LOADING }));
  // The first tab with content, once the counts are in
  const effectiveDefaultTab = counts
    ? (contentTabs.find((t) => t.count > 0)?.id ?? "scenes")
    : "";

  // Get active tab from URL or default to first tab with content
  const activeTab = searchParams.get("tab") || effectiveDefaultTab;

  // Set page title to performer name
  usePageTitle((performer?.name as string) || "Performer");

  // The rating and favorite controls start from each loaded performer's,
  // set while rendering so they never show the previous one's
  const [controlsFor, setControlsFor] = useState(performer);
  if (controlsFor !== performer) {
    setControlsFor(performer);
    setRating((performer?.rating as number | null | undefined) ?? null);
    setIsFavorite(performer?.favorite === true);
  }

  const handleRatingChange = async (newRating: number | null) => {
    // Write on the loaded performer's own server: a bare-id link names none
    const entityInstanceId = performer?.instanceId as string | undefined;
    if (!entityInstanceId) return;
    setRating(newRating);
    try {
      await libraryApi.updateRating(
        "performer",
        performerId!,
        newRating,
        entityInstanceId
      );
    } catch (error) {
      console.error("Failed to update rating:", error);
      setRating(
        (performer as Record<string, unknown>)?.rating as number | null
      ); // Revert on error
    }
  };

  const handleFavoriteChange = async (newValue: boolean) => {
    // Write on the loaded performer's own server: a bare-id link names none
    const entityInstanceId = performer?.instanceId as string | undefined;
    if (!entityInstanceId) return;
    setIsFavorite(newValue);
    try {
      await libraryApi.updateFavorite(
        "performer",
        performerId!,
        newValue,
        entityInstanceId
      );
    } catch (error) {
      console.error("Failed to update favorite:", error);
      setIsFavorite((performer?.favorite as boolean) || false); // Revert on error
    }
  };

  const toggleFavorite = () => {
    void handleFavoriteChange(!isFavorite);
  };

  // Rating and favorite hotkeys (r + 1-5 for ratings, r + 0 to clear, r + f to toggle favorite)

  useRatingHotkeys({
    enabled: !isLoading && !!performer,
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
        entityType="performer"
        status={lookup.status}
        matches={lookup.matches}
        error={lookup.error}
        onRetry={lookup.retry}
      />
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

        {/* Performer Header - Hero Treatment */}
        <div className="mb-8">
          <PageHeader
            title={
              <div className="flex flex-wrap items-center gap-4 min-w-0">
                <span className="min-w-0 break-words">
                  {performer?.name as React.ReactNode}
                </span>
                <GenderIcon gender={performer?.gender as string} size={32} />
                {(settings.showFavorite as boolean) && (
                  <FavoriteButton
                    isFavorite={isFavorite}
                    onChange={(newValue) => void handleFavoriteChange(newValue)}
                    size="large"
                  />
                )}
                <ViewInStashButton
                  stashUrl={(performer?.stashUrl as string) || ""}
                  size={24}
                />
              </div>
            }
            subtitle={
              (performer?.alias_list as string[] | undefined)?.length
                ? `Also known as: ${(performer?.alias_list as string[]).join(", ")}`
                : null
            }
          />

          {/* Rating Slider */}
          {(settings.showRating as boolean) && (
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
          {/* Left Column: Performer Image */}
          <div className="w-full lg:w-1/3 flex-shrink-0">
            <PerformerImage performer={performer} />
          </div>

          {/* Right Column: Details (scrollable, matches image height) */}
          {(settings.showDescriptionOnDetail as boolean) && (
            <div className="flex-1 lg:overflow-y-auto lg:max-h-[80vh]">
              <PerformerDetails performer={performer} />
            </div>
          )}
        </div>

        {/* Full Width Sections - Statistics, Tags, Links */}
        <div className="space-y-6 mb-8">
          <PerformerStats
            performer={performer}
            counts={counts}
            activeTab={activeTab}
            defaultTab={effectiveDefaultTab}
          />
          <PerformerLinks performer={performer} settings={settings} />
        </div>

        {/* Tabbed Content Section */}
        <div className="mt-8">
          {counts && contentTabs.every((t) => t.count === 0) ? (
            <div
              className="py-16 text-center"
              style={{ color: "var(--text-muted)" }}
            >
              This performer has no content in Peek
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
                  context="scene_performer"
                  permanentFilters={{
                    performers: {
                      value: [performerRef],
                      modifier: "INCLUDES",
                    },
                  }}
                  permanentFiltersMetadata={{
                    performers: [
                      {
                        id: performerRef,
                        name: performer?.name as string,
                      },
                    ],
                  }}
                  subtitle={undefined}
                  title={`Scenes featuring ${performer?.name as string}`}
                  fromPageTitle={(performer?.name as string) || "Performer"}
                />
              )}

              {activeTab === "galleries" && (
                <GalleryGrid
                  lockedFilters={{
                    gallery_filter: {
                      performers: {
                        value: [performerRef],
                        modifier: "INCLUDES",
                      },
                    },
                  }}
                  hideLockedFilters
                  emptyMessage={`No galleries found for ${performer?.name as string}`}
                />
              )}

              {activeTab === "images" && (
                <ImagesTab
                  performerRef={performerRef}
                  performerName={performer?.name as string | undefined}
                />
              )}

              {activeTab === "groups" && (
                <GroupGrid
                  lockedFilters={{
                    group_filter: {
                      performers: {
                        value: [performerRef],
                        modifier: "INCLUDES",
                      },
                    },
                  }}
                  hideLockedFilters
                  emptyMessage={`No collections found for ${performer?.name as string}`}
                />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Reusable component for detail field (label/value pair)
interface DetailFieldProps {
  label: string;
  value: React.ReactNode;
}

const DetailField = ({ label, value }: DetailFieldProps) => {
  if (!value) return null;

  return (
    <div>
      <dt
        className="text-sm font-medium"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </dt>
      <dd className="text-sm" style={{ color: "var(--text-primary)" }}>
        {value}
      </dd>
    </div>
  );
};

// Reusable component for stat field (label/value pair in stats card)
interface StatFieldProps {
  label: string;
  value: string | number | null | undefined;
  valueColor?: string;
  onClick?: () => void;
  isActive?: boolean;
}

const StatField = ({
  label,
  value,
  valueColor = "var(--text-primary)",
  onClick,
  isActive,
}: StatFieldProps) => {
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

// Reusable component for section headings
interface SectionHeaderProps {
  children: React.ReactNode;
}

const SectionHeader = ({ children }: SectionHeaderProps) => {
  return (
    <h3
      className="text-sm font-medium mb-2"
      style={{ color: "var(--text-secondary)" }}
    >
      {children}
    </h3>
  );
};

// Reusable component for card containers
interface CardProps {
  children: React.ReactNode;
  title?: string;
}

const Card = ({ children, title }: CardProps) => {
  return (
    <div
      className="p-4 rounded-lg p-6 mb-6"
      style={{
        backgroundColor: "var(--bg-card)",
      }}
    >
      {title && (
        <h2
          className="text-xl font-semibold mb-4"
          style={{ color: "var(--text-primary)" }}
        >
          {title}
        </h2>
      )}

      {children}
    </div>
  );
};

interface PerformerDetailsProps {
  performer: Record<string, unknown> | null;
}

const PerformerDetails = ({ performer }: PerformerDetailsProps) => {
  const { unitPreference, isLoading: isLoadingUnits } = useUnitPreference();

  // Calculate age from birthdate
  const getAge = (birthdate: string): number | null => {
    if (!birthdate) return null;
    const birth = new Date(birthdate);
    const today = new Date();
    const age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (
      monthDiff < 0 ||
      (monthDiff === 0 && today.getDate() < birth.getDate())
    ) {
      return age - 1;
    }
    return age;
  };

  const age = performer?.birthdate
    ? getAge(performer.birthdate as string)
    : null;

  return (
    <Card title="Details">
      {/* Personal Information */}
      <div className="mb-6">
        <h3
          className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
          style={{
            color: "var(--text-primary)",
            borderBottom: "2px solid var(--accent-primary)",
          }}
        >
          Personal Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DetailField
            label="Born"
            value={
              performer?.birthdate
                ? new Date(performer.birthdate as string).toLocaleDateString() +
                  (age ? ` (${age} years old)` : "")
                : null
            }
          />
          <DetailField
            label="Died"
            value={
              performer?.death_date
                ? new Date(performer.death_date as string).toLocaleDateString()
                : null
            }
          />
          <DetailField
            label="Career"
            value={performer?.career_length as string | undefined}
          />
          <DetailField
            label="Country"
            value={performer?.country as string | undefined}
          />
          <DetailField
            label="Ethnicity"
            value={performer?.ethnicity as string | undefined}
          />
        </div>
      </div>

      {/* Physical Attributes */}
      <div className="mb-6">
        <h3
          className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
          style={{
            color: "var(--text-primary)",
            borderBottom: "2px solid var(--accent-primary)",
          }}
        >
          Physical Attributes
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <DetailField
            label="Eye Color"
            value={performer?.eye_color as string | undefined}
          />
          <DetailField
            label="Hair Color"
            value={performer?.hair_color as string | undefined}
          />
          <DetailField
            label="Height"
            value={
              isLoadingUnits
                ? "..."
                : performer?.height_cm
                  ? formatHeight(performer.height_cm as number, unitPreference)
                  : null
            }
          />
          <DetailField
            label="Weight"
            value={
              isLoadingUnits
                ? "..."
                : performer?.weight
                  ? formatWeight(performer.weight as number, unitPreference)
                  : null
            }
          />
          <DetailField
            label="Measurements"
            value={performer?.measurements as string | undefined}
          />
          <DetailField
            label="Fake Tits"
            value={performer?.fake_tits as string | undefined}
          />
          <DetailField
            label="Penis Length"
            value={
              isLoadingUnits
                ? "..."
                : performer?.penis_length
                  ? formatLength(
                      performer.penis_length as number,
                      unitPreference
                    )
                  : null
            }
          />
          <DetailField
            label="Circumcised"
            value={performer?.circumcised as string | undefined}
          />
        </div>
      </div>

      {/* Body Modifications */}
      {!!(performer?.tattoos || performer?.piercings) && (
        <div className="mb-6">
          <h3
            className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
            style={{
              color: "var(--text-primary)",
              borderBottom: "2px solid var(--accent-primary)",
            }}
          >
            Body Modifications
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <DetailField
              label="Tattoos"
              value={performer?.tattoos as string | undefined}
            />
            <DetailField
              label="Piercings"
              value={performer?.piercings as string | undefined}
            />
          </div>
        </div>
      )}

      {/* Other */}
      {!!performer?.disambiguation && (
        <div>
          <h3
            className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
            style={{
              color: "var(--text-primary)",
              borderBottom: "2px solid var(--accent-primary)",
            }}
          >
            Other
          </h3>
          <div className="grid grid-cols-1 gap-4">
            <DetailField
              label="Disambiguation"
              value={performer?.disambiguation as string | undefined}
            />
          </div>
        </div>
      )}
    </Card>
  );
};

interface PerformerStatsProps {
  performer: Record<string, unknown> | null;
  /** The tabs' counts; undefined while they load */
  counts: RelationCountsByType["performer"] | undefined;
  activeTab: string;
  defaultTab: string;
}

const PerformerStats = ({
  performer,
  counts,
  activeTab,
  defaultTab,
}: PerformerStatsProps) => {
  const handleTabSwitch = useOpenTabAndScroll(defaultTab);

  // Calculate O-Count percentage
  const oCountPercentage =
    counts?.scenes && performer?.o_counter
      ? (((performer.o_counter as number) / counts.scenes) * 100).toFixed(1)
      : null;

  // Cap the progress bar width at 100% but show actual percentage
  const oCountBarWidth = oCountPercentage
    ? Math.min(parseFloat(oCountPercentage), 100)
    : 0;

  return (
    <Card title="Statistics">
      {/* Basic Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <StatField
          label="Scenes:"
          value={counts?.scenes}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch("scenes")}
          isActive={activeTab === "scenes"}
        />
        <StatField
          label="O-Count:"
          value={(performer?.o_counter as number) || 0}
          valueColor="var(--accent-primary)"
        />
        <StatField
          label="Galleries:"
          value={counts?.galleries}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch("galleries")}
          isActive={activeTab === "galleries"}
        />
        <StatField
          label="Images:"
          value={counts?.images}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch("images")}
          isActive={activeTab === "images"}
        />
        <StatField
          label="Collections:"
          value={counts?.groups}
          valueColor="var(--accent-primary)"
          onClick={() => handleTabSwitch("groups")}
          isActive={activeTab === "groups"}
        />
      </div>

      {/* Visual Rating Display */}
      {!!performer?.rating100 && (performer.rating100 as number) > 0 && (
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
              {performer.rating100 as React.ReactNode}/100
            </span>
          </div>
          <div
            className="w-full h-3 rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${performer.rating100 as number}%`,
                backgroundColor: "var(--accent-primary)",
              }}
            />
          </div>
        </div>
      )}

      {/* O-Count Percentage Visual */}
      {oCountPercentage && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <span
              className="text-sm font-medium"
              style={{ color: "var(--text-secondary)" }}
            >
              O-Count Rate
            </span>
            <span
              className="text-2xl font-bold"
              style={{ color: "var(--accent-primary)" }}
            >
              {oCountPercentage}%
            </span>
          </div>
          <div
            className="w-full h-3 rounded-full overflow-hidden"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${oCountBarWidth}%`,
                backgroundColor: "var(--accent-primary)",
              }}
            />
          </div>
          <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
            {performer?.o_counter as React.ReactNode} O-Counts in{" "}
            {counts?.scenes} scenes
          </div>
        </div>
      )}
    </Card>
  );
};

interface PerformerImageProps {
  performer: Record<string, unknown> | null;
}

const PerformerImage = ({ performer }: PerformerImageProps) => {
  return (
    <div
      className="rounded-xl overflow-hidden shadow-lg flex items-center justify-center"
      style={{
        backgroundColor: "var(--bg-card)",
        aspectRatio: "7/10",
        width: "100%",
        maxHeight: "50vh",
      }}
    >
      {performer?.image_path ? (
        <img
          src={performer.image_path as string}
          alt={performer.name as string}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
          }}
        />
      ) : (
        <svg
          className="w-24 h-24"
          style={{ color: "var(--text-muted)" }}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </div>
  );
};

interface PerformerLinksProps {
  performer: Record<string, unknown> | null;
  settings: Record<string, unknown>;
}

const PerformerLinks = ({ performer, settings }: PerformerLinksProps) => {
  const urls = performer?.urls as string[] | undefined;
  const tags = performer?.tags as TagRef[] | undefined;
  const hasLinks =
    performer?.twitter ||
    performer?.instagram ||
    performer?.url ||
    (urls?.length ?? 0) > 0;
  const hasTags = (tags?.length ?? 0) > 0;
  const showDetails = settings?.showDescriptionOnDetail !== false;

  if (!hasLinks && !hasTags && !(performer?.details && showDetails))
    return null;

  return (
    <>
      {/* Links Section */}
      {hasLinks && (
        <Card title="Links">
          <div className="flex flex-wrap gap-2">
            {!!performer?.url && <SectionLink url={performer.url as string} />}
            {!!performer?.twitter && (
              <SectionLink
                url={`https://twitter.com/${performer.twitter as string}`}
              />
            )}
            {!!performer?.instagram && (
              <SectionLink
                url={`https://instagram.com/${performer.instagram as string}`}
              />
            )}
            {urls?.map((url: string, idx: number) => (
              <SectionLink key={idx} url={url} />
            ))}
          </div>
        </Card>
      )}

      {/* Tags Section */}
      {hasTags && (
        <Card title="Tags">
          <TagChips tags={tags} />
        </Card>
      )}

      {/* Details Section */}
      {showDetails && performer?.details && (
        <Card title="Details">
          <p
            className="text-sm whitespace-pre-wrap"
            style={{ color: "var(--text-primary)" }}
          >
            {performer.details as React.ReactNode}
          </p>
        </Card>
      )}
    </>
  );
};

// Images Tab Component with Lightbox
interface ImagesTabProps {
  /** The performer as "id:instanceId" */
  performerRef: string;
  performerName: string | undefined;
}

const ImagesTab = ({ performerRef, performerName }: ImagesTabProps) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // URL-based page state for image pagination
  const urlPage = parseInt(searchParams.get("page") || "1", 10) || 1;

  // Keeps the tab and the open image; a page turned from the lightbox
  // replaces the entry
  const handleImagePageChange = useCallback(
    (newPage: number, options?: PageChangeOptions) => {
      const params = new URLSearchParams(searchParams);
      if (newPage === 1) {
        params.delete("page");
      } else {
        params.set("page", String(newPage));
      }
      setSearchParams(params, { replace: options?.replace === true });
    },
    [searchParams, setSearchParams]
  );

  const fetchImages = useCallback(
    async (page: number, perPage: number) => {
      const data = (await libraryApi.findImages({
        filter: { page, per_page: perPage },
        image_filter: {
          performers: {
            value: [performerRef],
            modifier: "INCLUDES",
          },
        },
      })) as { findImages?: { images?: NormalizedImage[]; count?: number } };
      return {
        images: data.findImages?.images ?? [],
        count: data.findImages?.count || 0,
      };
    },
    [performerRef]
  );

  const { images, totalCount, isLoading, lightbox, setImages } =
    useImagesPagination<NormalizedImage>({
      fetchImages,
      dependencies: [performerRef],
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
      emptyMessage={`No images found for ${performerName}`}
      className="mt-6"
    />
  );
};

export default PerformerDetail;
