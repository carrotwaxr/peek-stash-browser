import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useConfig } from "../../contexts/ConfigContext";
import { getScenePathWithTime } from "../../utils/entityLinks";
import ClipCard, { type Clip } from "../cards/ClipCard";
import EntityListPage from "../list/EntityListPage";
import type {
  CardHandlers,
  ListPageConfig,
  ListPageData,
  ListPageExtras,
} from "../list/listPageConfigs";
import { LIST_SOURCES, type ListRow } from "../list/listSources";
import { viewModeOptions } from "../list/listViewModes";
import ClipGrid from "./ClipGrid";

/** The clip list's own part: a card or wall tile plays its scene from the clip's start */
function useClipListPage({ fromPageTitle }: ListPageData): ListPageExtras {
  const navigate = useNavigate();
  const { hasMultipleInstances } = useConfig();

  const handleClipClick = useCallback(
    (clip: ListRow) => {
      void navigate(
        getScenePathWithTime(
          {
            id: clip.sceneId as string,
            instanceId: clip.instanceId as string | undefined,
          } as Record<string, unknown>,
          clip.seconds as number,
          hasMultipleInstances
        ),
        {
          state: { fromPageTitle, shouldAutoplay: true },
        }
      );
    },
    [navigate, hasMultipleInstances, fromPageTitle]
  );

  const cardHandlers = useMemo<CardHandlers>(
    () => ({ onItemClick: handleClipClick }),
    [handleClipClick]
  );
  return { cardHandlers };
}

/** The clip list; a scene's own clips fix its scene (`permanentFilters.scenes`) */
const CLIP_LIST: ListPageConfig = {
  entityType: "clip",
  title: "Clips",
  subtitle: "Browse your clip library",
  defaultSort: "stashCreatedAt",
  viewModes: viewModeOptions("clip"),
  source: LIST_SOURCES.clip,
  renderCard: (item, ctx) => (
    <ClipCard
      clip={item as unknown as Clip}
      onClick={ctx.onItemClick as ((clip: Clip) => void) | undefined}
      fromPageTitle={ctx.fromPageTitle}
      tabIndex={0}
    />
  ),
  renderGrid: ({ items, loading, gridDensity, ctx, emptyMessage }) => (
    <ClipGrid
      clips={items}
      density={gridDensity}
      loading={loading}
      onClipClick={
        ctx.onItemClick as React.ComponentProps<typeof ClipGrid>["onClipClick"]
      }
      fromPageTitle={ctx.fromPageTitle}
      emptyMessage={emptyMessage}
      emptyDescription="Try adjusting your search filters"
    />
  ),
  skeleton: { aspect: "landscape", heightRem: 5 },
  wallPlaybackSetting: true,
  emptyMessage: "No clips found",
  usePage: useClipListPage,
};

interface ClipSearchProps {
  /** The preset context; "clip" by default */
  context?: string;
  initialSort?: string;
  /** The page's own filters: `scenes` (`{ value: ["id:instanceId"] }`) lists one scene's clips */
  permanentFilters?: Record<string, unknown>;
  permanentFiltersMetadata?: Record<string, unknown>;
  subtitle?: string;
  title?: string;
  fromPageTitle?: string;
}

/**
 * The clip list with its search, sort, filters and paging, its state in the
 * URL. The page sets the document title.
 */
const ClipSearch = ({
  context = "clip",
  initialSort,
  permanentFilters,
  permanentFiltersMetadata,
  subtitle,
  title,
  fromPageTitle,
}: ClipSearchProps) => (
  <EntityListPage
    config={CLIP_LIST}
    embed={{
      context,
      defaultSort: initialSort,
      permanentFilters,
      permanentFiltersMetadata,
      title,
      subtitle,
      fromPageTitle,
    }}
  />
);

export default ClipSearch;
