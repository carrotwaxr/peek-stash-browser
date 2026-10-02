import type { ComponentType } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import {
  GALLERY_FIELDS,
  GROUP_FIELDS,
  IMAGE_FIELDS,
  PERFORMER_FIELDS,
  SCENE_FIELDS,
} from "@peek/shared-types";
import { Star } from "lucide-react";
import { useRelationCounts } from "../../api/hooks";
import { useEntityDetail } from "../../api/hooks/useEntityDetail";
import DetailCard from "../detail/DetailCard";
import DetailImagesTab from "../detail/DetailImagesTab";
import DetailStats from "../detail/DetailStats";
import EntityChipList from "../detail/EntityChipList";
import EntityDetailLayout from "../detail/EntityDetailLayout";
import EntityDetailPage, {
  type FoundEntityDetail,
} from "../detail/EntityDetailPage";
import EntityHeroImage from "../detail/EntityHeroImage";
import StashIdLinks from "../detail/StashIdLinks";
import type { DetailTabSpec } from "../detail/detailTabState";
import { GalleryGrid, GroupGrid, PerformerGrid } from "../grids/index";
import SceneSearch from "../scene-search/SceneSearch";
import { TagChips } from "../ui/index";

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

const StudioPage = ({ detail }: { detail: FoundEntityDetail<"studio"> }) => {
  const { entity: studio, instanceId, ref } = detail;
  const [searchParams] = useSearchParams();
  const includeSubStudios = searchParams.get("includeSubStudios") === "true";
  const name = studio.name || `Studio ${studio.id}`;

  // Each tab's count is the total of its list, as the viewer sees it
  const counts = useRelationCounts("studio", studio.id, instanceId, {
    includeSubStudios,
  });
  const totals = counts.data?.counts;

  // The scenes, galleries and collections list by this studio, with its
  // sub-studios under the toggle; the Performers tab takes no depth
  const lock = (withDepth: boolean) => ({
    value: [ref],
    modifier: "INCLUDES",
    ...(withDepth && includeSubStudios && { depth: -1 }),
  });
  const gridTab = (id: keyof typeof GRID_TABS): DetailTabSpec => {
    const { label, filterKey, Grid } = GRID_TABS[id];
    const withDepth = TAB_TAKES_SUB_STUDIOS[id] === true;
    return {
      id,
      label,
      count: totals?.[id],
      render: () => (
        <Grid
          key={`${id}-${withDepth && includeSubStudios}`}
          lockedFilters={{ [filterKey]: { studios: lock(withDepth) } }}
          hideLockedFilters
          emptyMessage={`No ${label.toLowerCase()} found for ${studio.name}`}
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
          key={`scenes-${includeSubStudios}`}
          context="scene_studio"
          permanentFilters={{ studios: lock(true) }}
          permanentFiltersMetadata={{
            studios: [{ id: ref, name: studio.name || "Unknown Studio" }],
          }}
          title={`Scenes from ${studio.name || "this studio"}${includeSubStudios ? " (and sub-studios)" : ""}`}
          fromPageTitle={name}
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
          field="studios"
          entityRef={ref}
          {...(includeSubStudios && { depth: -1 as const })}
          emptyMessage={`No images found for ${studio.name}`}
          fromPageTitle={name}
        />
      ),
    },
    gridTab("performers"),
    gridTab("groups"),
  ].map((tab) => ({
    ...tab,
    takesSubToggle: TAB_TAKES_SUB_STUDIOS[tab.id] === true,
  }));

  const stats = [
    { label: "Scenes:", value: totals?.scenes, tab: "scenes" },
    { label: "Performers:", value: totals?.performers, tab: "performers" },
    { label: "Images:", value: totals?.images, tab: "images" },
    { label: "Galleries:", value: totals?.galleries, tab: "galleries" },
    { label: "Collections:", value: totals?.groups, tab: "groups" },
  ];

  // A parent names its server once the server has loaded its ref; a bare
  // parent is on the studio's own
  const parent = studio.parent_studio;
  const children = studio.child_studios ?? [];

  return (
    <EntityDetailLayout
      type="studio"
      detail={detail}
      title={name}
      subtitle={
        studio.aliases.length
          ? `Also known as: ${studio.aliases.join(", ")}`
          : null
      }
      hero={
        <EntityHeroImage
          src={studio.image_path}
          alt={studio.name}
          aspect="1/1"
          fit="contain"
          fallbackIcon={Star}
        />
      }
      heroWidth="quarter"
      description={studio.details}
      sections={
        <>
          <DetailStats stats={stats} rating={detail.rating} />
          {studio.url && (
            <DetailCard title="Website">
              <a
                href={studio.url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline transition-colors"
                style={{ color: "var(--accent-primary)" }}
              >
                {studio.url}
              </a>
            </DetailCard>
          )}
          {parent?.name && (
            <DetailCard title="Parent Studio">
              <EntityChipList
                type="studio"
                refs={[
                  {
                    id: parent.id,
                    name: parent.name,
                    instanceId: parent.instanceId ?? instanceId,
                  },
                ]}
              />
            </DetailCard>
          )}
          {children.length > 0 && (
            <DetailCard title="Child Studios">
              <EntityChipList type="studio" refs={children} />
            </DetailCard>
          )}
          {studio.tags.length > 0 && (
            <DetailCard title="Tags">
              <TagChips tags={studio.tags} />
            </DetailCard>
          )}
          <StashIdLinks boxPath="studios" stashIds={studio.stash_ids} />
        </>
      }
      {...(children.length > 0 && {
        subToggle: {
          param: "includeSubStudios",
          label: "Include sub-studios",
          count: children.length,
        },
      })}
      tabs={tabs}
      counts={counts}
      fallbackTab="scenes"
      emptyText="This studio has no content in Peek"
    />
  );
};

const StudioDetail = () => {
  const { studioId } = useParams<{ studioId: string }>();
  const [searchParams] = useSearchParams();
  const detail = useEntityDetail(
    "studio",
    studioId,
    searchParams.get("instance")
  );
  return (
    <EntityDetailPage type="studio" detail={detail}>
      {(found) => <StudioPage detail={found} />}
    </EntityDetailPage>
  );
};

export default StudioDetail;
