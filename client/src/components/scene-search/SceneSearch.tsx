import EntityListPage from "../list/EntityListPage";
import { SCENE_LIST } from "./sceneList";

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
