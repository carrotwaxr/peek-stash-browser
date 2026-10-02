import type { ComponentType, ReactNode } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import type { NormalizedPerformer } from "@peek/shared-types";
import { User } from "lucide-react";
import { useRelationCounts } from "../../api/hooks";
import { useEntityDetail } from "../../api/hooks/useEntityDetail";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext";
import { useUnitPreference } from "../../contexts/UnitPreferenceContext";
import { formatDate } from "../../utils/date";
import {
  formatHeight,
  formatLength,
  formatWeight,
} from "../../utils/unitConversions";
import DetailCard from "../detail/DetailCard";
import DetailImagesTab from "../detail/DetailImagesTab";
import DetailStats from "../detail/DetailStats";
import EntityDetailLayout from "../detail/EntityDetailLayout";
import EntityDetailPage, {
  type FoundEntityDetail,
} from "../detail/EntityDetailPage";
import EntityHeroImage from "../detail/EntityHeroImage";
import StashIdLinks from "../detail/StashIdLinks";
import type { DetailTabSpec } from "../detail/detailTabState";
import { GalleryGrid, GroupGrid } from "../grids/index";
import SceneSearch from "../scene-search/SceneSearch";
import { calculateAge } from "../table/formatters";
import { GenderIcon, SectionLink, TagChips } from "../ui/index";

/** The tabs an entity grid lists: each grid's filter key */
const GRID_TABS = {
  galleries: {
    label: "Galleries",
    filterKey: "gallery_filter",
    Grid: GalleryGrid,
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

/** A label and its value; nothing without a value */
const DetailField = ({ label, value }: { label: string; value: ReactNode }) => {
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

/** A group of fields in the Details card, under its heading */
const FieldGroup = ({
  title,
  columns = 2,
  children,
}: {
  title: string;
  columns?: 1 | 2;
  children: ReactNode;
}) => (
  <div className="mb-6 last:mb-0">
    <h4
      className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
      style={{
        color: "var(--text-primary)",
        borderBottom: "2px solid var(--accent-primary)",
      }}
    >
      {title}
    </h4>
    <dl
      className={`grid grid-cols-1 ${columns === 2 ? "md:grid-cols-2" : ""} gap-4`}
    >
      {children}
    </dl>
  </div>
);

/** The performer's attributes: personal, physical, body and other */
const PerformerDetails = ({
  performer,
}: {
  performer: NormalizedPerformer;
}) => {
  const { unitPreference, isLoading: isLoadingUnits } = useUnitPreference();
  // Lengths and weights in the viewer's units, once they are known
  const measure = (
    value: number | null | undefined,
    format: (value: number, unit: string) => string | null
  ) => {
    if (isLoadingUnits) return "...";
    return value ? format(value, unitPreference) : null;
  };
  const years = calculateAge(performer.birthdate);
  const age = typeof years === "number" ? years : null;

  return (
    <DetailCard title="Details">
      <FieldGroup title="Personal Information">
        <DetailField
          label="Born"
          value={
            performer.birthdate
              ? formatDate(performer.birthdate) +
                (age ? ` (${age} years old)` : "")
              : null
          }
        />
        <DetailField
          label="Died"
          value={performer.death_date ? formatDate(performer.death_date) : null}
        />
        <DetailField label="Career" value={performer.career_length} />
        <DetailField label="Country" value={performer.country} />
        <DetailField label="Ethnicity" value={performer.ethnicity} />
      </FieldGroup>

      <FieldGroup title="Physical Attributes">
        <DetailField label="Eye Color" value={performer.eye_color} />
        <DetailField label="Hair Color" value={performer.hair_color} />
        <DetailField
          label="Height"
          value={measure(performer.height_cm, formatHeight)}
        />
        <DetailField
          label="Weight"
          value={measure(performer.weight, formatWeight)}
        />
        <DetailField label="Measurements" value={performer.measurements} />
        <DetailField label="Fake Tits" value={performer.fake_tits} />
        <DetailField
          label="Penis Length"
          value={measure(performer.penis_length, formatLength)}
        />
        <DetailField label="Circumcised" value={performer.circumcised} />
      </FieldGroup>

      {(performer.tattoos || performer.piercings) && (
        <FieldGroup title="Body Modifications">
          <DetailField label="Tattoos" value={performer.tattoos} />
          <DetailField label="Piercings" value={performer.piercings} />
        </FieldGroup>
      )}

      {performer.disambiguation && (
        <FieldGroup title="Other" columns={1}>
          <DetailField
            label="Disambiguation"
            value={performer.disambiguation}
          />
        </FieldGroup>
      )}
    </DetailCard>
  );
};

/** The O-count over the performer's scenes, as a bar capped at 100% */
const OCountRate = ({ oCount, scenes }: { oCount: number; scenes: number }) => {
  const rate = ((oCount / scenes) * 100).toFixed(1);
  return (
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
          {rate}%
        </span>
      </div>
      <div
        className="w-full h-3 rounded-full overflow-hidden"
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${Math.min(parseFloat(rate), 100)}%`,
            backgroundColor: "var(--accent-primary)",
          }}
        />
      </div>
      <div className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
        {oCount} O-Counts in {scenes} scenes
      </div>
    </div>
  );
};

const PerformerPage = ({
  detail,
}: {
  detail: FoundEntityDetail<"performer">;
}) => {
  const { entity: performer, instanceId, ref } = detail;
  const { getSettings } = useCardDisplaySettings();
  const name = performer.name || `Performer ${performer.id}`;

  // Each tab's count is the total of its list, as the viewer sees it
  const counts = useRelationCounts("performer", performer.id, instanceId);
  const totals = counts.data?.counts;

  // Every tab lists by this performer
  const lock = { value: [ref], modifier: "INCLUDES" };
  const gridTab = (id: keyof typeof GRID_TABS): DetailTabSpec => {
    const { label, filterKey, Grid } = GRID_TABS[id];
    return {
      id,
      label,
      count: totals?.[id],
      render: () => (
        <Grid
          lockedFilters={{ [filterKey]: { performers: lock } }}
          hideLockedFilters
          emptyMessage={`No ${label.toLowerCase()} found for ${performer.name}`}
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
          context="scene_performer"
          permanentFilters={{ performers: lock }}
          permanentFiltersMetadata={{
            performers: [{ id: ref, name: performer.name }],
          }}
          title={`Scenes featuring ${performer.name}`}
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
          field="performers"
          entityRef={ref}
          emptyMessage={`No images found for ${performer.name}`}
          fromPageTitle={name}
        />
      ),
    },
    gridTab("groups"),
  ];

  const stats = [
    { label: "Scenes:", value: totals?.scenes, tab: "scenes" },
    { label: "O-Count:", value: performer.o_counter },
    { label: "Galleries:", value: totals?.galleries, tab: "galleries" },
    { label: "Images:", value: totals?.images, tab: "images" },
    { label: "Collections:", value: totals?.groups, tab: "groups" },
  ];
  const scenes = totals?.scenes ?? 0;
  // Every link; a row from before the re-fetch holds only the first
  const links = performer.urls.length
    ? performer.urls
    : performer.url
      ? [performer.url]
      : [];

  return (
    <EntityDetailLayout
      type="performer"
      detail={detail}
      title={name}
      titleExtras={<GenderIcon gender={performer.gender} size={32} />}
      subtitle={
        performer.alias_list.length > 0
          ? `Also known as: ${performer.alias_list.join(", ")}`
          : null
      }
      hero={
        <EntityHeroImage
          src={performer.image_path}
          alt={performer.name}
          aspect="7/10"
          fit="contain"
          fallbackIcon={User}
        />
      }
      // The attributes show while the viewer keeps descriptions on
      aside={
        getSettings("performer").showDescriptionOnDetail ? (
          <PerformerDetails performer={performer} />
        ) : undefined
      }
      description={performer.details}
      descriptionTitle="About"
      sections={
        <>
          <DetailStats stats={stats} rating={detail.rating}>
            {scenes > 0 && performer.o_counter > 0 && (
              <OCountRate oCount={performer.o_counter} scenes={scenes} />
            )}
          </DetailStats>
          {links.length > 0 && (
            <DetailCard title="Links">
              <div className="flex flex-wrap gap-2">
                {links.map((url) => (
                  <SectionLink key={url} url={url} />
                ))}
              </div>
            </DetailCard>
          )}
          {performer.tags.length > 0 && (
            <DetailCard title="Tags">
              <TagChips tags={performer.tags} />
            </DetailCard>
          )}
          <StashIdLinks boxPath="performers" stashIds={performer.stash_ids} />
        </>
      }
      tabs={tabs}
      counts={counts}
      fallbackTab="scenes"
      emptyText="This performer has no content in Peek"
    />
  );
};

const PerformerDetail = () => {
  const { performerId } = useParams<{ performerId: string }>();
  const [searchParams] = useSearchParams();
  const detail = useEntityDetail(
    "performer",
    performerId,
    searchParams.get("instance")
  );
  return (
    <EntityDetailPage type="performer" detail={detail}>
      {(found) => <PerformerPage detail={found} />}
    </EntityDetailPage>
  );
};

export default PerformerDetail;
