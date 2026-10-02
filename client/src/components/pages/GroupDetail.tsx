import { useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import type { NormalizedGroup } from "@peek/shared-types";
import { useRelationCounts } from "../../api/hooks";
import { useEntityDetail } from "../../api/hooks/useEntityDetail";
import { useConfig } from "../../contexts/ConfigContext";
import { getEntityPath } from "../../utils/entityLinks";
import { formatDuration } from "../../utils/format";
import DetailCard from "../detail/DetailCard";
import DetailStats from "../detail/DetailStats";
import EntityChipList from "../detail/EntityChipList";
import EntityDetailLayout from "../detail/EntityDetailLayout";
import EntityDetailPage, {
  type FoundEntityDetail,
} from "../detail/EntityDetailPage";
import type { DetailTabSpec } from "../detail/detailTabState";
import { PerformerGrid } from "../grids/index";
import SceneSearch from "../scene-search/SceneSearch";
import { TagChips } from "../ui/index";

const GroupPage = ({ detail }: { detail: FoundEntityDetail<"group"> }) => {
  const { entity: group, instanceId, ref } = detail;
  const { hasMultipleInstances } = useConfig();
  const name = group.name || `Collection ${group.id}`;

  // Each tab's count is the total of its list, as the viewer sees it
  const counts = useRelationCounts("group", group.id, instanceId);
  const totals = counts.data?.counts;

  const tabs: DetailTabSpec[] = [
    {
      id: "scenes",
      label: "Scenes",
      count: totals?.scenes,
      render: () => (
        <SceneSearch
          context="scene_group"
          initialSort="scene_index"
          permanentFilters={{ groups: { value: [ref], modifier: "INCLUDES" } }}
          permanentFiltersMetadata={{
            groups: [{ id: ref, name: group.name || "Unknown Collection" }],
          }}
          title={`Scenes in ${group.name || "this collection"}`}
          fromPageTitle={name}
        />
      ),
    },
    {
      id: "performers",
      label: "Performers",
      count: totals?.performers,
      render: () => (
        <PerformerGrid
          lockedFilters={{
            performer_filter: {
              groups: { value: [ref], modifier: "INCLUDES" },
            },
          }}
          hideLockedFilters
          emptyMessage={`No performers found in "${group.name}"`}
        />
      ),
    },
  ];

  const stats = [
    { label: "Scenes:", value: totals?.scenes, tab: "scenes" },
    { label: "Performers:", value: totals?.performers, tab: "performers" },
    {
      label: "Duration:",
      value: group.duration ? formatDuration(group.duration) : null,
    },
    { label: "Date:", value: group.date },
  ];

  // Each link's group carries its own server, so a link keeps it
  const partOf = (group.containing_groups ?? []).map((link) => ({
    ...link.group,
    description: link.description,
  }));
  const subCollections = (group.sub_groups ?? []).map((link) => ({
    ...link.group,
    description: link.description,
  }));
  const studio = group.studio;
  const urls = group.urls;

  return (
    <EntityDetailLayout
      type="group"
      detail={detail}
      title={name}
      subtitle={group.aliases ? `Also known as: ${group.aliases}` : null}
      hero={<GroupImageFlipper group={group} />}
      description={group.synopsis}
      sections={
        <>
          <DetailStats stats={stats} />
          {studio && (
            <DetailCard title="Studio">
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
            </DetailCard>
          )}
          {!!group.director && (
            <DetailCard title="Director">
              <p style={{ color: "var(--text-primary)" }}>{group.director}</p>
            </DetailCard>
          )}
          {partOf.length > 0 && (
            <DetailCard title="Part Of">
              <EntityChipList type="group" refs={partOf} />
            </DetailCard>
          )}
          {subCollections.length > 0 && (
            <DetailCard title="Sub-Collections">
              <EntityChipList type="group" refs={subCollections} />
            </DetailCard>
          )}
          {group.tags.length > 0 && (
            <DetailCard title="Tags">
              <TagChips tags={group.tags} />
            </DetailCard>
          )}
          {urls.length > 0 && (
            <DetailCard title="Links">
              <div className="space-y-2">
                {urls.map((url) => (
                  <a
                    key={url}
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
            </DetailCard>
          )}
        </>
      }
      tabs={tabs}
      counts={counts}
      fallbackTab="scenes"
      emptyText="This collection has no content in Peek"
    />
  );
};

const GroupDetail = () => {
  const { groupId } = useParams<{ groupId: string }>();
  const [searchParams] = useSearchParams();
  const detail = useEntityDetail(
    "group",
    groupId,
    searchParams.get("instance")
  );
  return (
    <EntityDetailPage type="group" detail={detail}>
      {(found) => <GroupPage detail={found} />}
    </EntityDetailPage>
  );
};

// Group Image Flipper Component with Front/Back Toggle
interface GroupImageFlipperProps {
  group: Pick<NormalizedGroup, "name" | "front_image_path" | "back_image_path">;
}

const GroupImageFlipper = ({ group }: GroupImageFlipperProps) => {
  const [showFront, setShowFront] = useState(true);

  const hasBothImages = !!group.front_image_path && !!group.back_image_path;

  const currentImage = showFront
    ? group.front_image_path
    : group.back_image_path;
  const fallbackImage = showFront
    ? group.back_image_path
    : group.front_image_path;
  const displayImage = currentImage || fallbackImage;

  const groupName = group.name;

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

export default GroupDetail;
