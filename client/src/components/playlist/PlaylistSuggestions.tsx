import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { NormalizedScene } from "@peek/shared-types";
import { LucidePlus } from "lucide-react";
import {
  useAddScenesToPlaylist,
  usePlaylistSuggestions,
} from "../../api/hooks/usePlaylists";
import { makeCompositeKey } from "../../utils/compositeKey";
import { showError, showSuccess, showWarning } from "../../utils/toast";
import SceneGrid from "../scene-search/SceneGrid";
import Button from "../ui/Button";
import Pagination from "../ui/Pagination";

interface Props {
  playlistId: number;
  /** The playlist holds no scenes: there is nothing to suggest from */
  playlistEmpty: boolean;
}

/** The URL's page of this tab; the Items tab owns `page` */
const PAGE_PARAM = "spage";

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

/**
 * The Suggestions tab of a playlist: one page of the scenes that share the
 * playlist's performers, tags and studios, best first, paged through the
 * URL's `spage`. A selection is added to the playlist from the bulk bar;
 * the write refetches the suggestions, so the added scenes leave the list.
 */
const PlaylistSuggestions = ({ playlistId, playlistEmpty }: Props) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const page = parseInt(searchParams.get(PAGE_PARAM) ?? "1") || 1;
  // Scenes hidden from this list since it loaded, by "id:instanceId"
  const [hiddenIds, setHiddenIds] = useState<ReadonlySet<string>>(
    () => new Set()
  );

  const { data, error, isPending, isPlaceholderData, isError } =
    usePlaylistSuggestions(playlistId, page);
  const addScenes = useAddScenesToPlaylist();

  const handlePageChange = useCallback(
    (newPage: number) => {
      const next = new URLSearchParams(searchParams);
      if (newPage === 1) next.delete(PAGE_PARAM);
      else next.set(PAGE_PARAM, String(newPage));
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const loading = isPending || isPlaceholderData;
  const totalCount = data?.count ?? 0;
  const perPage = data?.perPage ?? 24;
  const totalPages = Math.ceil(totalCount / perPage);
  // A page past the end (the last page's scenes were added, or a stale
  // `spage`) answers no scenes but a count: go to the last page that has any
  const pastTheEnd =
    !loading && !isError && totalCount > 0 && page > totalPages;

  useEffect(() => {
    if (!pastTheEnd) return;
    setSearchParams(
      (params) => {
        const next = new URLSearchParams(params);
        if (totalPages <= 1) next.delete(PAGE_PARAM);
        else next.set(PAGE_PARAM, String(totalPages));
        return next;
      },
      { replace: true }
    );
  }, [pastTheEnd, totalPages, setSearchParams]);

  const handleHideSuccess = (
    hiddenSceneId: string,
    _entityType: string,
    hiddenInstanceId?: string
  ) => {
    setHiddenIds((prev) =>
      new Set(prev).add(makeCompositeKey(hiddenSceneId, hiddenInstanceId))
    );
  };

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

  const scenes = (data?.scenes ?? []).filter(
    (s) => !hiddenIds.has(makeCompositeKey(s.id, s.instanceId))
  );

  if (isError) {
    return (
      <div className="text-center py-8" style={{ color: "var(--text-muted)" }}>
        {error instanceof Error && error.message
          ? `Failed to load suggestions: ${error.message}`
          : "Failed to load suggestions"}
      </div>
    );
  }

  if (!loading && totalCount === 0) {
    return (
      <div className="text-center py-8" style={{ color: "var(--text-muted)" }}>
        {playlistEmpty
          ? "No suggestions yet: add a few scenes first"
          : "Nothing else matches this playlist's performers, tags and studios"}
      </div>
    );
  }

  const pagination = (
    <Pagination
      currentPage={page}
      totalPages={totalPages}
      onPageChange={handlePageChange}
      perPage={perPage}
      totalCount={totalCount}
      showInfo={true}
      showPerPageSelector={false}
    />
  );

  return (
    <>
      {!loading && totalPages > 1 && <div className="mb-4">{pagination}</div>}

      <SceneGrid
        scenes={scenes}
        loading={loading || pastTheEnd}
        error={null}
        currentPage={page}
        totalPages={totalPages}
        selectionScope={`${playlistId}:${page}`}
        fromPageTitle="Playlist suggestions"
        onHideSuccess={handleHideSuccess}
        enableKeyboard={false}
        emptyMessage="No suggestions"
        emptyDescription=""
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

      {!loading && totalPages > 1 && <div className="mt-4">{pagination}</div>}
    </>
  );
};

export default PlaylistSuggestions;
