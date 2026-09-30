import React, { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type {
  GroupRelationRef,
  RelationCountsByType,
  TagRef,
} from "@peek/shared-types";
import { ArrowLeft } from "lucide-react";
import { libraryApi } from "../../api";
import { useRelationCounts } from "../../api/hooks";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext";
import { useConfig } from "../../contexts/ConfigContext";
import { useEntityLookup } from "../../hooks/useEntityLookup";
import { useNavigationState } from "../../hooks/useNavigationState";
import { usePageTitle } from "../../hooks/usePageTitle";
import { useRatingHotkeys } from "../../hooks/useRatingHotkeys";
import { makeCompositeKey } from "../../utils/compositeKey";
import { getEntityPath } from "../../utils/entityLinks";
import { formatDuration } from "../../utils/format";
import { PerformerGrid } from "../grids/index";
import SceneSearch from "../scene-search/SceneSearch";
import RelationCountsError from "../ui/RelationCountsError";
import { TAB_COUNT_LOADING } from "../ui/TabNavigation";
import ViewInStashButton from "../ui/ViewInStashButton";
import {
  Button,
  EntityNotFound,
  FavoriteButton,
  LibraryInitializingBanner,
  LoadingSpinner,
  PageHeader,
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

const GroupDetail = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const [searchParams] = useSearchParams();
  const [rating, setRating] = useState<number | null>(null);
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

  const lookup = useEntityLookup(libraryApi.findGroupById, groupId, instanceId);
  const group = lookup.entity ?? null;
  const isLoading = lookup.status === "loading";

  // Reads, tab filters and counts use the loaded collection's own server:
  // a bare-id link names none
  const groupInstanceId = group?.instanceId as string | undefined;
  const groupRef = makeCompositeKey(groupId ?? "", groupInstanceId);

  // Each tab's count is the total of its list, as the viewer sees it; the
  // tabs show no badge and none opens until the counts answer
  const {
    data: countsData,
    error: countsError,
    refetch: refetchCounts,
  } = useRelationCounts("group", groupId, groupInstanceId);
  const counts = countsData?.counts;
  const contentTabs = [
    { id: "scenes", label: "Scenes", count: counts?.scenes },
    { id: "performers", label: "Performers", count: counts?.performers },
  ].map((t) => ({ ...t, count: t.count ?? TAB_COUNT_LOADING }));
  // The first tab with content, once the counts are in
  const effectiveDefaultTab = counts
    ? (contentTabs.find((t) => t.count > 0)?.id ?? "scenes")
    : "";

  // Get active tab from URL or default to first tab with content
  const activeTab = searchParams.get("tab") || effectiveDefaultTab;

  // Set page title to group name
  usePageTitle((group?.name as string) || "Collection");

  // The rating and favorite controls start from each loaded collection's,
  // set while rendering so they never show the previous one's
  const [controlsFor, setControlsFor] = useState(group);
  if (controlsFor !== group) {
    setControlsFor(group);
    setRating((group?.rating as number | null | undefined) ?? null);
    setIsFavorite(group?.favorite === true);
  }

  const handleRatingChange = async (newRating: number | null) => {
    // Write on the loaded group's own server: a bare-id link names none
    const entityInstanceId = group?.instanceId as string | undefined;
    if (!entityInstanceId) return;
    setRating(newRating);
    try {
      await libraryApi.updateRating(
        "group",
        groupId!,
        newRating,
        entityInstanceId
      );
    } catch (error) {
      console.error("Failed to update rating:", error);
      setRating((group as Record<string, unknown>)?.rating as number | null);
    }
  };

  const handleFavoriteChange = async (newValue: boolean) => {
    // Write on the loaded group's own server: a bare-id link names none
    const entityInstanceId = group?.instanceId as string | undefined;
    if (!entityInstanceId) return;
    setIsFavorite(newValue);
    try {
      await libraryApi.updateFavorite(
        "group",
        groupId!,
        newValue,
        entityInstanceId
      );
    } catch (error) {
      console.error("Failed to update favorite:", error);
      setIsFavorite((group?.favorite as boolean) || false);
    }
  };

  const toggleFavorite = () => {
    void handleFavoriteChange(!isFavorite);
  };

  // Rating and favorite hotkeys (r + 1-5 for ratings, r + 0 to clear, r + f to toggle favorite)
  useRatingHotkeys({
    enabled: !isLoading && !!group,
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
        entityType="group"
        status={lookup.status}
        matches={lookup.matches}
        error={lookup.error}
        onRetry={lookup.retry}
      />
    );
  }

  const groupName = typeof group?.name === "string" ? group.name : "";

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
              (
                <div className="flex gap-4 items-center">
                  <span>
                    {(group?.name as string) || `Collection ${groupId}`}
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
                    stashUrl={group?.stashUrl as string}
                    size={24}
                  />
                </div>
              ) as unknown as string
            }
            subtitle={
              (group?.aliases as string[] | undefined)?.length
                ? `Also known as: ${(group!.aliases as string[]).join(", ")}`
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
          {/* Left Column: Group Image with Front/Back Flipper (2:3 DVD cover) */}
          <div className="w-full lg:w-1/3 flex-shrink-0">
            <GroupImageFlipper group={group} />
          </div>

          {/* Right Column: Details (scrollable, matches image height) */}
          {!!settings.showDescriptionOnDetail && !!group?.synopsis && (
            <div className="flex-1 lg:overflow-y-auto lg:max-h-[80vh]">
              <Card title="Details">
                <p
                  className="text-sm whitespace-pre-wrap"
                  style={{ color: "var(--text-primary)" }}
                >
                  {group.synopsis as React.ReactNode}
                </p>
              </Card>
            </div>
          )}
        </div>

        {/* Full Width Sections - Statistics, Studio, Tags, Parent/Sub Collections */}
        <div className="space-y-6 mb-8">
          <GroupStats
            group={group}
            counts={counts}
            activeTab={activeTab}
            defaultTab={effectiveDefaultTab}
          />
          <GroupDetails
            group={group}
            hasMultipleInstances={hasMultipleInstances}
          />
        </div>

        {/* Tabbed Content Section */}
        <div className="mt-8">
          {counts && contentTabs.every((t) => t.count === 0) ? (
            <div
              className="py-16 text-center"
              style={{ color: "var(--text-muted)" }}
            >
              This collection has no content in Peek
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
                  context="scene_group"
                  initialSort="scene_index"
                  permanentFilters={{
                    groups: {
                      value: [groupRef],
                      modifier: "INCLUDES",
                    },
                  }}
                  permanentFiltersMetadata={{
                    groups: [
                      {
                        id: groupRef,
                        name: (group?.name as string) || "Unknown Collection",
                      },
                    ],
                  }}
                  title={`Scenes in ${(group?.name as string) || "this collection"}`}
                  fromPageTitle={(group?.name as string) || "Collection"}
                />
              )}

              {activeTab === "performers" && (
                <PerformerGrid
                  lockedFilters={{
                    performer_filter: {
                      groups: {
                        value: [groupRef],
                        modifier: "INCLUDES",
                      },
                    },
                  }}
                  hideLockedFilters
                  emptyMessage={`No performers found in "${groupName}"`}
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

// Group Image Flipper Component with Front/Back Toggle
interface GroupImageFlipperProps {
  group: Record<string, unknown> | null;
}

const GroupImageFlipper = ({ group }: GroupImageFlipperProps) => {
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
  const displayImage = (currentImage || fallbackImage) as string | undefined;

  const groupName = typeof group?.name === "string" ? group.name : "";

  return (
    <div className="relative w-full" style={{ maxHeight: "50vh" }}>
      <div
        className="rounded-xl overflow-hidden shadow-lg flex items-center justify-center"
        style={{
          backgroundColor: "var(--bg-card)",
          aspectRatio: "2/3",
          width: "100%",
          maxHeight: "50vh",
        }}
      >
        {displayImage ? (
          <img
            src={displayImage}
            alt={`${groupName} - ${showFront ? "Front" : "Back"} Cover`}
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
      {!!hasBothImages && (
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
interface GroupStatsProps {
  group: Record<string, unknown> | null;
  /** The tabs' counts; undefined while they load */
  counts: RelationCountsByType["group"] | undefined;
  activeTab: string;
  defaultTab: string;
}

const GroupStats = ({
  group,
  counts,
  activeTab,
  defaultTab,
}: GroupStatsProps) => {
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
      <div className="grid grid-cols-2 gap-4">
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
          label="Duration:"
          value={
            group?.duration ? formatDuration(group.duration as number) : null
          }
          valueColor="var(--accent-primary)"
        />
        <StatField
          label="Date:"
          value={group?.date as string | undefined}
          valueColor="var(--accent-primary)"
        />
      </div>
    </Card>
  );
};

// Group Details Component (Studio, Tags, Parent/Sub Collections)
interface GroupDetailsProps {
  group: Record<string, unknown> | null;
  hasMultipleInstances: boolean;
}

const GroupDetails = ({ group, hasMultipleInstances }: GroupDetailsProps) => {
  const studio = group?.studio as EntityRef | undefined;
  // Each link's group carries its instance, so the links keep it
  const containingGroups = group?.containing_groups as
    | GroupRelationRef[]
    | undefined;
  const subGroups = group?.sub_groups as GroupRelationRef[] | undefined;
  const tags = group?.tags as TagRef[] | undefined;
  const urls = group?.urls as string[] | undefined;

  return (
    <>
      {studio && (
        <Card title="Studio">
          <Link
            to={getEntityPath("studio", studio, hasMultipleInstances)}
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
          >
            {studio.image_path && (
              <img
                src={studio.image_path}
                alt={studio.name}
                className="w-12 h-12 object-cover rounded"
              />
            )}
            <span
              className="font-medium"
              style={{ color: "var(--accent-primary)" }}
            >
              {studio.name}
            </span>
          </Link>
        </Card>
      )}

      {!!group?.director && (
        <Card title="Director">
          <p style={{ color: "var(--text-primary)" }}>
            {group.director as React.ReactNode}
          </p>
        </Card>
      )}

      {containingGroups && containingGroups.length > 0 && (
        <Card title="Part Of">
          <div className="space-y-2">
            {containingGroups.map((cg) => (
              <Link
                key={cg.group.id}
                to={getEntityPath("group", cg.group, hasMultipleInstances)}
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

      {subGroups && subGroups.length > 0 && (
        <Card title="Sub-Collections">
          <div className="space-y-2">
            {subGroups.map((sg) => (
              <Link
                key={sg.group.id}
                to={getEntityPath("group", sg.group, hasMultipleInstances)}
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

      {tags && tags.length > 0 && (
        <Card title="Tags">
          <TagChips tags={tags} />
        </Card>
      )}

      {urls && urls.length > 0 && (
        <Card title="Links">
          <div className="space-y-2">
            {urls.map((url: string, index: number) => (
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
