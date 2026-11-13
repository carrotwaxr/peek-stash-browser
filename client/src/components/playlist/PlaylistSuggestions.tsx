import { useMemo } from "react";
import { type NormalizedScene, RECOMMENDED_LIMIT } from "@peek/shared-types";
import { LucidePlus } from "lucide-react";
import { useAddScenesToPlaylist } from "../../api/hooks/usePlaylists";
import { useListFilters } from "../../hooks/useListFilters";
import { useFilterOptions } from "../../hooks/useListOptions";
import { PLAYLIST_SUGGESTION_SORT_OPTIONS } from "../../utils/filterConfig";
import { treeCounts } from "../../utils/filterFields";
import { sortOffered } from "../../utils/listQuery";
import { showError, showSuccess, showWarning } from "../../utils/toast";
import EntityListPage from "../list/EntityListPage";
import type {
  GridContext,
  ListPageConfig,
  ListPageData,
  ListPageExtras,
} from "../list/listPageConfigs";
import { playlistSuggestionsSource } from "../list/listSources";
import SceneGrid from "../scene-search/SceneGrid";
import { SCENE_LIST, useSceneListPage } from "../scene-search/sceneList";
import Button from "../ui/Button";

interface Props {
  playlistId: number;
  /** The playlist holds no scenes: there is nothing to suggest from */
  playlistEmpty: boolean;
}

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/** The suggestion rank first, then the scene sorts the filters allow */
const suggestionSortOptions = (filters: Record<string, unknown>) =>
  PLAYLIST_SUGGESTION_SORT_OPTIONS.filter(
    (option) => sortOffered("scene", option.value, filters) === option.value
  );

/**
 * The grid of suggestions, its bulk bar adding the selection to the
 * playlist. The write refetches the suggestions, so the added scenes leave
 * the list.
 */
const SuggestionGrid = ({
  playlistId,
  grid,
}: {
  playlistId: number;
  grid: GridContext;
}) => {
  const addScenes = useAddScenesToPlaylist();
  const { items, loading, gridDensity, ctx, selectionScope } = grid;

  const addSelected = async (
    selected: NormalizedScene[],
    clear: () => void
  ) => {
    try {
      const { added, alreadyInPlaylist, unavailable } =
        await addScenes.mutateAsync({
          playlistId,
          scenes: selected.map((scene) => ({
            sceneId: scene.id,
            instanceId: scene.instanceId,
          })),
        });
      const skipped = [
        alreadyInPlaylist > 0 && `${alreadyInPlaylist} already in playlist`,
        unavailable > 0 && `${unavailable} unavailable`,
      ].filter(Boolean);
      if (skipped.length === 0) {
        showSuccess(`Added ${plural(added, "scene", "scenes")} to playlist!`);
      } else if (added > 0) {
        showWarning(
          `Added ${plural(added, "scene", "scenes")}, ${skipped.join(", ")}`
        );
      } else {
        showWarning(`No scenes added: ${skipped.join(", ")}`);
      }
      clear();
    } catch {
      showError("Failed to add scenes to playlist");
    }
  };

  return (
    <SceneGrid
      scenes={items as unknown as NormalizedScene[]}
      density={gridDensity}
      loading={loading}
      onSceneClick={
        ctx.onItemClick as ((scene: NormalizedScene) => void) | undefined
      }
      onHideSuccess={ctx.onHideSuccess}
      fromPageTitle={ctx.fromPageTitle}
      emptyMessage={grid.emptyMessage}
      emptyDescription={grid.emptyDescription ?? ""}
      selectionScope={selectionScope}
      extraBulkActions={(selected, clear) => (
        <Button
          onClick={() => void addSelected(selected, clear)}
          variant="primary"
          size="sm"
          disabled={addScenes.isPending}
          className="flex items-center gap-1.5"
        >
          <LucidePlus className="w-4 h-4" />
          <span>Add {selected.length} to this playlist</span>
        </Button>
      )}
    />
  );
};

/**
 * The tab's part over the scene list's (a card opens the scene with the
 * page's scenes as its queue): while a search or a filter narrows the list,
 * a notice that it narrows the suggestions only; with none, what an empty
 * list means for this playlist.
 */
function useSuggestionListPage(
  data: ListPageData,
  playlistEmpty: boolean
): ListPageExtras {
  const sceneExtras = useSceneListPage(data);
  const { listState } = data;
  const filterOptions = useFilterOptions("scene");
  const listFilters = useListFilters("scene", listState, filterOptions);
  const filtering = listState.q !== "" || treeCounts(listFilters.tree).rows > 0;

  return {
    ...sceneExtras,
    ...(filtering
      ? {
          notice: (
            <p
              role="status"
              className="text-sm mb-3"
              style={{ color: "var(--text-muted)" }}
            >
              {`Filtering within this playlist's top ${RECOMMENDED_LIMIT} suggestions`}
            </p>
          ),
        }
      : {
          empty: {
            message: playlistEmpty
              ? "No suggestions yet: add a few scenes first"
              : "Nothing else matches this playlist's performers, tags and studios",
          },
        }),
  };
}

// The scene list without its folder and timeline views: suggestions are a
// ranked set, not a library to browse by tag or date
const { folder: _sceneFolder, ...SCENE_LIST_BASE } = SCENE_LIST;

/**
 * The Suggestions tab of a playlist: the scene list (Grid, Wall and Table,
 * search, filters, sort, page size and Views) within the scenes that share
 * the playlist's performers, tags and studios, best first by default. Its
 * state is the page's URL, as a detail page's tab; a selection in the grid
 * is added to the playlist from the bulk bar.
 */
const PlaylistSuggestions = ({ playlistId, playlistEmpty }: Props) => {
  const source = useMemo(
    () => playlistSuggestionsSource(playlistId),
    [playlistId]
  );
  const config = useMemo<ListPageConfig>(
    () => ({
      ...SCENE_LIST_BASE,
      title: "Playlist suggestions",
      subtitle: "",
      context: "scene_playlist_suggestions",
      defaultSort: "recommended",
      viewModes: SCENE_LIST.viewModes.filter(
        (mode) => mode.id !== "timeline" && mode.id !== "folder"
      ),
      sortOptions: suggestionSortOptions,
      source,
      renderGrid: (grid) => (
        <SuggestionGrid playlistId={playlistId} grid={grid} />
      ),
      emptyMessage: "No suggestions match these filters",
      usePage: (data) => useSuggestionListPage(data, playlistEmpty),
    }),
    [playlistId, playlistEmpty, source]
  );

  return (
    <EntityListPage
      config={config}
      embed={{
        context: "scene_playlist_suggestions",
        fromPageTitle: "Playlist suggestions",
        folderView: false,
      }}
    />
  );
};

export default PlaylistSuggestions;
