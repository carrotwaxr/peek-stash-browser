import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { NormalizedScene } from "@peek/shared-types";
import { useConfig } from "../../contexts/ConfigContext";
import { getEntityPath } from "../../utils/entityLinks";
import { buildPlaybackQueue } from "../../utils/playbackQueue";
import EntityListPage from "../list/EntityListPage";
import type {
  CardHandlers,
  ListPageConfig,
  ListPageData,
  ListPageExtras,
} from "../list/listPageConfigs";
import { LIST_SOURCES } from "../list/listSources";
import { viewModeOptions } from "../list/listViewModes";
import { SceneCard } from "../ui/index";
import SceneGrid from "./SceneGrid";

type SceneCardScene = React.ComponentProps<typeof SceneCard>["scene"];

/**
 * The scene list's own part: a card or wall tile opens the scene with the
 * page's scenes as its playback queue. One handler for every card, the same
 * across refetches, so memoised cards stay put.
 */
function useSceneListPage({
  items,
  title,
  fromPageTitle,
}: ListPageData): ListPageExtras {
  const navigate = useNavigate();
  const { hasMultipleInstances } = useConfig();
  // The handler reads the page's current scenes without changing identity
  const itemsRef = useRef(items);
  useLayoutEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const handleSceneClick = useCallback(
    (scene: Record<string, unknown>) => {
      // Navigate to video player page with scene data and virtual playlist context
      const currentScenes = itemsRef.current;
      const currentIndex = currentScenes.findIndex(
        (s: Record<string, unknown>) =>
          s.id === scene.id && s.instanceId === scene.instanceId
      );

      // Build navigation state
      const navigationState: Record<string, unknown> = {
        scene,
        playlist: buildPlaybackQueue({
          id: "virtual-grid",
          name: title || "Scene Grid",
          scenes: currentScenes as unknown as NormalizedScene[],
          currentIndex: currentIndex >= 0 ? currentIndex : 0,
        }),
      };

      // Only capture fromPageTitle if provided
      if (fromPageTitle) {
        navigationState.fromPageTitle = fromPageTitle;
      }

      void navigate(getEntityPath("scene", scene, hasMultipleInstances), {
        state: navigationState,
      });
    },
    [navigate, hasMultipleInstances, title, fromPageTitle]
  );

  const cardHandlers = useMemo<CardHandlers>(
    () => ({ onItemClick: handleSceneClick }),
    [handleSceneClick]
  );
  return { cardHandlers };
}

/** The scene list: Scenes, and the Scenes tab of every detail page */
const SCENE_LIST: ListPageConfig = {
  entityType: "scene",
  title: "Scenes",
  subtitle: "Browse your complete scene library",
  defaultSort: "o_counter",
  viewModes: viewModeOptions("scene"),
  source: LIST_SOURCES.scene,
  renderCard: (item, { onHideSuccess, fromPageTitle }) => (
    <SceneCard
      scene={item as unknown as SceneCardScene}
      onHideSuccess={onHideSuccess}
      fromPageTitle={fromPageTitle}
      tabIndex={0}
    />
  ),
  // The grid with selection and bulk actions; every card gets the page's
  // one click handler, not a closure per card
  renderGrid: ({
    items,
    loading,
    gridDensity,
    ctx,
    emptyMessage,
    selectionScope,
  }) => (
    <SceneGrid
      scenes={items as unknown as NormalizedScene[]}
      density={gridDensity}
      loading={loading}
      onSceneClick={
        ctx.onItemClick as ((scene: NormalizedScene) => void) | undefined
      }
      onHideSuccess={ctx.onHideSuccess}
      fromPageTitle={ctx.fromPageTitle}
      emptyMessage={emptyMessage}
      emptyDescription="Try adjusting your search filters"
      selectionScope={selectionScope}
    />
  ),
  skeleton: { aspect: "landscape", heightRem: 5 },
  wallPlaybackSetting: true,
  folder: {
    countField: "scene_count",
    label: { one: "scene", many: "scenes" },
  },
  emptyMessage: "No scenes found",
  usePage: useSceneListPage,
};

interface SceneSearchProps {
  /** The preset context (scene, scene_performer, scene_tag, ...) */
  context?: string;
  initialSort?: string;
  /** The page's own filters (a performer page's performer) */
  permanentFilters?: Record<string, Record<string, unknown>>;
  /** Names for the page's own filters' chips */
  permanentFiltersMetadata?: Record<string, unknown>;
  subtitle?: string;
  title?: string;
  fromPageTitle?: string;
  /**
   * The folder view is offered (true unless set false: a tag page's Scenes
   * tab with Include sub-tags on, where a folder cannot join the page's
   * tag at depth 0)
   */
  folderView?: boolean;
}

/**
 * The scene list with its search, sort, filters and paging, its state in
 * the URL: the Scenes page, and a detail page's Scenes tab, which fixes its
 * own entity (`permanentFilters`) and preset context. The page sets the
 * document title.
 */
const SceneSearch = ({
  context,
  initialSort,
  permanentFilters,
  permanentFiltersMetadata,
  subtitle,
  title,
  fromPageTitle,
  folderView = true,
}: SceneSearchProps) => (
  <EntityListPage
    config={SCENE_LIST}
    embed={{
      context,
      defaultSort: initialSort,
      permanentFilters,
      permanentFiltersMetadata,
      title,
      subtitle,
      fromPageTitle,
      folderView,
    }}
  />
);

export default SceneSearch;
