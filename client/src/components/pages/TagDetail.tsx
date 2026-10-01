import type { ComponentType } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  GALLERY_FIELDS,
  GROUP_FIELDS,
  IMAGE_FIELDS,
  PERFORMER_FIELDS,
  SCENE_FIELDS,
  STUDIO_FIELDS,
} from "@peek/shared-types";
import { Tag as TagIcon } from "lucide-react";
import { useRelationCounts } from "../../api/hooks";
import { useEntityDetail } from "../../api/hooks/useEntityDetail";
import { useConfig } from "../../contexts/ConfigContext";
import { getFilteredListPath } from "../../utils/entityLinks";
import DetailCard from "../detail/DetailCard";
import DetailImagesTab from "../detail/DetailImagesTab";
import DetailStats from "../detail/DetailStats";
import EntityChipList from "../detail/EntityChipList";
import EntityDetailLayout from "../detail/EntityDetailLayout";
import EntityDetailPage, {
  type FoundEntityDetail,
} from "../detail/EntityDetailPage";
import EntityHeroImage from "../detail/EntityHeroImage";
import type { DetailTabSpec } from "../detail/detailTabState";
import {
  GalleryGrid,
  GroupGrid,
  PerformerGrid,
  StudioGrid,
} from "../grids/index";
import SceneSearch from "../scene-search/SceneSearch";

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

/** The tabs an entity grid lists: each grid's filter key */
const GRID_TABS = {
  galleries: {
    label: "Galleries",
    filterKey: "gallery_filter",
    Grid: GalleryGrid,
  },
  performers: {
    label: "Performers",
    filterKey: "performer_filter",
    Grid: PerformerGrid,
  },
  studios: { label: "Studios", filterKey: "studio_filter", Grid: StudioGrid },
  groups: { label: "Collections", filterKey: "group_filter", Grid: GroupGrid },
} satisfies Record<
  string,
  { label: string; filterKey: string; Grid: ComponentType<GridProps> }
>;

/** What a tab passes its grid (a type, so it meets the grids' index signature) */
type GridProps = {
  lockedFilters: Record<string, unknown>;
  hideLockedFilters: boolean;
  emptyMessage: string;
};

const TagPage = ({ detail }: { detail: FoundEntityDetail<"tag"> }) => {
  const { entity: tag, instanceId, ref } = detail;
  const [searchParams] = useSearchParams();
  const { hasMultipleInstances } = useConfig();
  const includeSubTags = searchParams.get("includeSubTags") === "true";
  const name = tag.name || `Tag ${tag.id}`;

  // Each tab's count is the total of its list, as the viewer sees it
  const counts = useRelationCounts("tag", tag.id, instanceId, {
    includeSubTags,
  });
  const totals = counts.data?.counts;

  // Every tab lists by this tag, with its sub-tags under the toggle
  const lock = {
    value: [ref],
    modifier: "INCLUDES",
    ...(includeSubTags && { depth: -1 }),
  };
  const gridTab = (id: keyof typeof GRID_TABS): DetailTabSpec => {
    const { label, filterKey, Grid } = GRID_TABS[id];
    return {
      id,
      label,
      count: totals?.[id],
      render: () => (
        <Grid
          key={String(includeSubTags)}
          lockedFilters={{ [filterKey]: { tags: lock } }}
          hideLockedFilters
          emptyMessage={`No ${label.toLowerCase()} found with tag "${tag.name}"`}
        />
      ),
    };
  };

  const tabs: DetailTabSpec[] = [
    {
      id: "scenes",
      label: "Scenes",
      count: totals?.scenes,
      render: () => (
        <SceneSearch
          key={`scenes-${includeSubTags}`}
          context="scene_tag"
          permanentFilters={{ tags: lock }}
          permanentFiltersMetadata={{ tags: [{ id: ref, name: tag.name }] }}
          title={`Scenes tagged with ${tag.name || "this tag"}${includeSubTags ? " (and sub-tags)" : ""}`}
          fromPageTitle={name}
          // A folder joins this tag at depth 0: none with sub-tags
          folderView={!includeSubTags}
        />
      ),
    },
    gridTab("galleries"),
    {
      id: "images",
      label: "Images",
      count: totals?.images,
      render: () => (
        <DetailImagesTab
          field="tags"
          entityRef={ref}
          {...(includeSubTags && { depth: -1 as const })}
          emptyMessage={`No images found with tag "${tag.name}"`}
          fromPageTitle={name}
        />
      ),
    },
    gridTab("performers"),
    gridTab("studios"),
    gridTab("groups"),
  ].map((tab) => ({
    ...tab,
    takesSubToggle: TAB_TAKES_SUB_TAGS[tab.id] === true,
  }));

  // The Markers count is the Clips page's own list for this tag (generated
  // clips on scenes the viewer can see), so the statistic opens that list
  const clipsPath = getFilteredListPath(
    "/clips",
    "tags",
    { id: tag.id, instanceId },
    hasMultipleInstances
  );
  const stats = [
    { label: "Scenes:", value: totals?.scenes, tab: "scenes" },
    { label: "Markers:", value: totals?.clips, to: clipsPath },
    { label: "Images:", value: totals?.images, tab: "images" },
    { label: "Galleries:", value: totals?.galleries, tab: "galleries" },
    { label: "Performers:", value: totals?.performers, tab: "performers" },
    { label: "Studios:", value: totals?.studios, tab: "studios" },
    { label: "Collections:", value: totals?.groups, tab: "groups" },
  ];

  // A parent names its server once the server has loaded its ref; a bare
  // parent id is on the tag's own
  const parents = tag.parents.map((parent) => ({
    id: parent.id,
    name: parent.name ?? "",
    instanceId: parent.instanceId ?? instanceId,
  }));
  const children = tag.children ?? [];

  return (
    <EntityDetailLayout
      type="tag"
      detail={detail}
      title={name}
      subtitle={
        tag.aliases.length > 0
          ? `Also known as: ${tag.aliases.join(", ")}`
          : null
      }
      hero={
        <EntityHeroImage
          src={tag.image_path}
          alt={tag.name}
          aspect="16/9"
          fit="cover"
          fallbackIcon={TagIcon}
          media
        />
      }
      heroWidth="twoFifths"
      description={tag.description}
      sections={
        <>
          <DetailStats stats={stats} />
          {parents.length > 0 && (
            <DetailCard title="Parent Tags">
              <EntityChipList type="tag" refs={parents} tagHue />
            </DetailCard>
          )}
          {children.length > 0 && (
            <DetailCard title="Child Tags">
              <EntityChipList type="tag" refs={children} tagHue />
            </DetailCard>
          )}
        </>
      }
      {...(children.length > 0 && {
        subToggle: {
          param: "includeSubTags",
          label: "Include sub-tags",
          count: children.length,
        },
      })}
      tabs={tabs}
      counts={counts}
      fallbackTab="scenes"
      emptyText="This tag has no content in Peek"
    />
  );
};

const TagDetail = () => {
  const { tagId } = useParams<{ tagId: string }>();
  const [searchParams] = useSearchParams();
  const detail = useEntityDetail("tag", tagId, searchParams.get("instance"));
  return (
    <EntityDetailPage type="tag" detail={detail}>
      {(found) => <TagPage detail={found} />}
    </EntityDetailPage>
  );
};

export default TagDetail;
