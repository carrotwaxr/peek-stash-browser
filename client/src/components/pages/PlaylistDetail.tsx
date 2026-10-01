import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  type NormalizedScene,
  PLAYLIST_ITEM_SORTS,
  type PlaylistItemWithScene,
} from "@peek/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpDown,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Edit2,
  MoreVertical,
  Play,
  Plus,
  Repeat,
  Repeat1,
  Save,
  Share2,
  Shuffle,
  Trash2,
  X,
} from "lucide-react";
import {
  apiDelete,
  apiPost,
  apiPut,
  duplicatePlaylist,
  getMyPermissions,
} from "../../api";
import {
  usePlaylist,
  usePlaylistQueue,
  useRemovePlaylistItems,
  useUpdatePlaylist,
} from "../../api/hooks/usePlaylists";
import type { PlaylistQueueParams } from "../../api/playlists";
import { queryKeys } from "../../api/queryKeys";
import { useConfig } from "../../contexts/ConfigContext";
import { useNavigationState } from "../../hooks/useNavigationState";
import { usePageTitle } from "../../hooks/usePageTitle";
import { makeCompositeKey } from "../../utils/compositeKey";
import { getEntityPath } from "../../utils/entityLinks";
import { getSceneTitle } from "../../utils/format";
import { freshSeed, parseSortValue, sortValue } from "../../utils/listQuery";
import type { PlaybackQueue } from "../../utils/playbackQueue";
import { showError, showSuccess } from "../../utils/toast";
import { ThemedIcon } from "../icons/index";
import PlaylistSortControl from "../playlists/PlaylistSortControl";
import SharePlaylistModal from "../playlists/SharePlaylistModal";
import {
  AddToPlaylistButton,
  BulkActionBar,
  Button,
  ConfirmDialog,
  PageHeader,
  PageLayout,
  Pagination,
  Paper,
  SceneListItem,
} from "../ui/index";

type Direction = "ASC" | "DESC";
type Repeat = PlaybackQueue["repeat"];

const PER_PAGE_DEFAULT = 50;
/** The route answers at most 100 items a page */
const PER_PAGE_CHOICES = [25, 50, 100];
const SORTABLE = new Set<string>(PLAYLIST_ITEM_SORTS);

/** How the page is read: the URL's sort and page, else the defaults */
interface PlaylistView {
  field: string;
  /** A random order's seed (null until the URL names one) */
  seed: number | null;
  direction: Direction;
  page: number;
  perPage: number;
}

/** The server's direction when none is named */
const defaultDirection = (field: string): Direction =>
  field === "position" || field === "added_at" ? "ASC" : "DESC";

function readView(params: URLSearchParams): PlaylistView {
  const parsed = parseSortValue(params.get("sort") ?? "position");
  const field = SORTABLE.has(parsed.field) ? parsed.field : "position";
  const named = params.get("direction");
  const page = Number(params.get("page"));
  const perPage = Number(params.get("per_page"));
  return {
    field,
    seed: field === "random" ? parsed.seed : null,
    direction:
      named === "ASC" || named === "DESC" ? named : defaultDirection(field),
    page: Number.isInteger(page) && page >= 1 ? page : 1,
    perPage: PER_PAGE_CHOICES.includes(perPage) ? perPage : PER_PAGE_DEFAULT,
  };
}

/** The order a request names: none for the playlist's own order */
function orderOf(view: PlaylistView): PlaylistQueueParams {
  if (view.field === "position" && view.direction === "ASC") return {};
  return { sort: sortValue(view.field, view.seed), direction: view.direction };
}

/** The view as URL parameters; the defaults stay out of the URL */
function writeView(params: URLSearchParams, view: PlaylistView) {
  const next = new URLSearchParams(params);
  const { sort, direction } = orderOf(view);
  if (sort && direction) {
    next.set("sort", sort);
    next.set("direction", direction);
  } else {
    next.delete("sort");
    next.delete("direction");
  }
  if (view.page > 1) next.set("page", String(view.page));
  else next.delete("page");
  if (view.perPage !== PER_PAGE_DEFAULT) {
    next.set("per_page", String(view.perPage));
  } else next.delete("per_page");
  return next;
}

const asRepeat = (value: string): Repeat =>
  value === "one" || value === "all" ? value : "none";

const isSameScene = (a: NormalizedScene, b: NormalizedScene) =>
  a.id === b.id && a.instanceId === b.instanceId;

const isItemOf = (item: PlaylistItemWithScene, scene: NormalizedScene) =>
  item.sceneId === scene.id && item.instanceId === scene.instanceId;

const itemKey = (item: { sceneId: string; instanceId: string }) =>
  makeCompositeKey(item.sceneId, item.instanceId);

interface ApiError {
  data?: { error?: string; totalSizeMB?: number; maxSizeMB?: number };
  message?: string;
}

/**
 * A playlist's page: the route's id and the view the URL names. A random
 * order read without a seed gets one in the URL first, so paging and the
 * play queue read the same order.
 */
const PlaylistDetail = () => {
  const { playlistId } = useParams<{ playlistId: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const view = readView(searchParams);
  const needsSeed = view.field === "random" && view.seed === null;

  useEffect(() => {
    if (!needsSeed) return;
    setSearchParams(
      (params) => writeView(params, { ...readView(params), seed: freshSeed() }),
      { replace: true }
    );
  }, [needsSeed, setSearchParams]);

  const changeView = useCallback(
    (patch: Partial<PlaylistView>, history: "push" | "replace") =>
      setSearchParams(
        (params) => writeView(params, { ...readView(params), ...patch }),
        { replace: history === "replace" }
      ),
    [setSearchParams]
  );

  if (needsSeed) return <PageSpinner />;
  return (
    <PlaylistDetailView
      playlistId={Number(playlistId)}
      view={view}
      changeView={changeView}
    />
  );
};

const PageSpinner = () => (
  <PageLayout>
    <div className="flex items-center justify-center">
      <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
    </div>
  </PageLayout>
);

interface ViewProps {
  playlistId: number;
  view: PlaylistView;
  changeView: (
    patch: Partial<PlaylistView>,
    history: "push" | "replace"
  ) => void;
}

const PlaylistDetailView = ({ playlistId, view, changeView }: ViewProps) => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { hasMultipleInstances } = useConfig();

  const { sort, direction } = orderOf(view);
  const order = useMemo<PlaylistQueueParams>(
    () => ({
      ...(sort !== undefined && { sort }),
      ...(direction !== undefined && { direction }),
    }),
    [sort, direction]
  );
  const { data, isPending } = usePlaylist(playlistId, {
    page: view.page,
    perPage: view.perPage,
    ...order,
  });
  const { data: queueData } = usePlaylistQueue(playlistId, order);
  const updatePlaylistMutation = useUpdatePlaylist();
  const removeItemsMutation = useRemovePlaylistItems();

  const playlist = data?.playlist;
  const items = playlist?.items;
  const totalItems = data?.totalItems ?? 0;
  const isOwner = data?.isOwner ?? false;

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [itemToRemove, setItemToRemove] =
    useState<PlaylistItemWithScene | null>(null);
  // The items in the order being edited, while Reorder is on
  const [reorderItems, setReorderItems] = useState<
    PlaylistItemWithScene[] | null
  >(null);
  const reorderMode = reorderItems !== null;
  // A change the owner just saved, shown until the playlist is read again
  const [shuffleChoice, setShuffleChoice] = useState<boolean | null>(null);
  const [repeatChoice, setRepeatChoice] = useState<Repeat | null>(null);
  const shuffle = shuffleChoice ?? playlist?.shuffle ?? false;
  const repeat = repeatChoice ?? asRepeat(playlist?.repeat ?? "none");
  const [downloading, setDownloading] = useState(false);
  const [permissions, setPermissions] = useState<Record<
    string,
    unknown
  > | null>(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  // Selection state for multi-select (view mode only)
  const [selectedScenes, setSelectedScenes] = useState<NormalizedScene[]>([]);
  const [bulkRemoveConfirmOpen, setBulkRemoveConfirmOpen] = useState(false);

  // One queue for the page (PM-08): every row's link shares its entries and
  // differs only in its index
  const entries = queueData?.entries;
  const playlistName = playlist?.name ?? "";
  const queue = useMemo<PlaybackQueue | null>(
    () =>
      entries
        ? {
            id: String(playlistId),
            name: playlistName,
            shuffle,
            repeat,
            scenes: entries,
            currentIndex: 0,
          }
        : null,
    [entries, playlistId, playlistName, shuffle, repeat]
  );
  const linkStates = useMemo(() => {
    const queueIndex = new Map(
      (entries ?? []).map((entry, index) => [itemKey(entry), index])
    );
    return new Map(
      (items ?? []).map((item) => {
        const currentIndex = queueIndex.get(itemKey(item));
        // While the queue loads, a row links to its scene alone
        const state =
          queue && currentIndex !== undefined
            ? { scene: item.scene, playlist: { ...queue, currentIndex } }
            : { scene: item.scene };
        return [itemKey(item), state];
      })
    );
  }, [entries, items, queue]);

  const handleToggleSelect = useCallback((scene: NormalizedScene) => {
    setSelectedScenes((prev) => {
      const isSelected = prev.some((s) => isSameScene(s, scene));
      return isSelected
        ? prev.filter((s) => !isSameScene(s, scene))
        : [...prev, scene];
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedScenes((items ?? []).map((item) => item.scene));
  }, [items]);

  const handleDeselectAll = useCallback(() => {
    setSelectedScenes([]);
  }, []);

  // Navigation state for back button
  const { goBack, backButtonText } = useNavigationState();

  // Set page title to playlist name
  usePageTitle(playlistName || "Playlist");

  // Fetch user permissions on mount
  useEffect(() => {
    const fetchPermissions = async () => {
      try {
        const result = await getMyPermissions();
        setPermissions(result.permissions);
      } catch (error) {
        // Silently fail - permissions will remain null and download button won't show
        console.error("Failed to fetch permissions:", error);
      }
    };
    void fetchPermissions();
  }, []);

  /** Every page, queue and list of playlists is read again */
  const refreshPlaylists = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.playlists.all() });

  const updatePlaylist = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const description = editDescription.trim();
    try {
      await updatePlaylistMutation.mutateAsync({
        playlistId,
        name: editName.trim(),
        ...(description && { description }),
      });
      showSuccess("Playlist updated successfully!");
      setIsEditing(false);
    } catch {
      showError("Failed to update playlist");
    }
  };

  const handleRemoveClick = (item: PlaylistItemWithScene) => {
    setItemToRemove(item);
    setRemoveConfirmOpen(true);
  };

  const confirmRemove = async () => {
    if (!itemToRemove) return;

    try {
      await removeItemsMutation.mutateAsync({
        playlistId,
        itemIds: [itemToRemove.id],
      });
      setSelectedScenes((prev) =>
        prev.filter((scene) => !isItemOf(itemToRemove, scene))
      );
      showSuccess("Scene removed from playlist");
    } catch {
      showError("Failed to remove scene from playlist");
    } finally {
      setRemoveConfirmOpen(false);
      setItemToRemove(null);
    }
  };

  // Reorder works on the whole playlist, so only while every item the
  // owner sees is on this page in the playlist's own order
  const canReorder =
    isOwner &&
    view.field === "position" &&
    view.direction === "ASC" &&
    totalItems > 1 &&
    items?.length === totalItems;

  // Position control handlers for reordering
  const moveItem = useCallback((fromIndex: number, toIndex: number) => {
    setReorderItems((prev) => {
      if (!prev) return prev;
      if (toIndex < 0 || toIndex >= prev.length) return prev;
      if (fromIndex === toIndex) return prev;
      const next = [...prev];
      const [item] = next.splice(fromIndex, 1);
      if (!item) return prev;
      next.splice(toIndex, 0, item);
      return next;
    });
  }, []);

  const reorderCount = reorderItems?.length ?? 0;

  const handleSetPosition = useCallback(
    (fromIndex: number, newPosition: number) => {
      // 1-indexed input, clamped to the list
      const targetIndex = Math.min(
        Math.max(newPosition - 1, 0),
        reorderCount - 1
      );
      moveItem(fromIndex, targetIndex);
    },
    [moveItem, reorderCount]
  );

  const saveReorder = async () => {
    if (!reorderItems) return;
    try {
      await apiPut(`/playlists/${playlistId}/reorder`, {
        items: reorderItems.map((item, index) => ({
          sceneId: item.sceneId,
          instanceId: item.instanceId,
          position: index,
        })),
      });
      showSuccess("Playlist order saved");
    } catch {
      showError("Failed to save playlist order");
    } finally {
      setReorderItems(null);
      void refreshPlaylists();
    }
  };

  const toggleShuffle = async () => {
    const newShuffle = !shuffle;
    try {
      await updatePlaylistMutation.mutateAsync({
        playlistId,
        shuffle: newShuffle,
      });
      setShuffleChoice(newShuffle);
      showSuccess(newShuffle ? "Shuffle enabled" : "Shuffle disabled");
    } catch {
      showError("Failed to update shuffle mode");
    }
  };

  const cycleRepeat = async () => {
    const repeatModes = ["none", "all", "one"] as const;
    const newRepeat =
      repeatModes[(repeatModes.indexOf(repeat) + 1) % repeatModes.length];
    if (!newRepeat) return;
    try {
      await updatePlaylistMutation.mutateAsync({
        playlistId,
        repeat: newRepeat,
      });
      setRepeatChoice(newRepeat);
      const messages: Record<Repeat, string> = {
        none: "Repeat disabled",
        all: "Repeat all enabled",
        one: "Repeat one enabled",
      };
      showSuccess(messages[newRepeat]);
    } catch {
      showError("Failed to update repeat mode");
    }
  };

  // Play starts the queue the page shows: its first entry, or a random one
  // with shuffle on
  const playPlaylist = () => {
    if (!queue || queue.scenes.length === 0) return;
    const startIndex = shuffle
      ? Math.floor(Math.random() * queue.scenes.length)
      : 0;
    const start = queue.scenes[startIndex];
    if (!start) return;
    void navigate(
      getEntityPath(
        "scene",
        { id: start.sceneId, instanceId: start.instanceId },
        hasMultipleInstances
      ),
      {
        state: {
          shouldAutoplay: true, // Start playing immediately when entering from playlist
          playlist: {
            ...queue,
            currentIndex: startIndex,
            autoplayNext: true,
            shuffleHistory: [],
          },
        },
      }
    );
  };

  // Handle playlist download
  const handleDownload = async () => {
    try {
      setDownloading(true);
      await apiPost(`/downloads/playlist/${playlistId}`);
      showSuccess("Download started - check Downloads page for progress");
    } catch (err) {
      const error = err as ApiError;
      const message = error.data?.error || error.message || "Download failed";
      if (error.data?.totalSizeMB) {
        showError(
          `${message} (${error.data.totalSizeMB}MB exceeds ${error.data.maxSizeMB}MB limit)`
        );
      } else {
        showError(message);
      }
    } finally {
      setDownloading(false);
    }
  };

  const handleDuplicate = async () => {
    try {
      setDuplicating(true);
      const result = await duplicatePlaylist(playlistId);
      showSuccess("Playlist duplicated!");
      void navigate(`/playlist/${String(result.playlist.id)}`);
    } catch {
      showError("Failed to duplicate playlist");
    } finally {
      setDuplicating(false);
    }
  };

  const handleBulkRemoveClick = () => {
    setBulkRemoveConfirmOpen(true);
  };

  const confirmBulkRemove = async () => {
    setBulkRemoveConfirmOpen(false);

    let failCount = 0;
    let successCount = 0;

    for (const scene of selectedScenes) {
      try {
        await apiDelete(
          `/playlists/${playlistId}/items/${encodeURIComponent(scene.id)}?instanceId=${encodeURIComponent(scene.instanceId)}`
        );
        successCount++;
      } catch {
        failCount++;
      }
    }

    setSelectedScenes([]);
    void refreshPlaylists();

    if (failCount === 0) {
      showSuccess(
        `Removed ${successCount} scene${successCount !== 1 ? "s" : ""} from playlist`
      );
    } else {
      showError(`Removed ${successCount}, ${failCount} failed`);
    }
  };

  if (isPending) return <PageSpinner />;

  if (!data || !playlist || !items) {
    return (
      <PageLayout>
        <div className="text-center">
          <h2
            className="text-2xl mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            Playlist not found
          </h2>
          <Link to="/playlists" className="text-blue-500 hover:underline">
            Back to Playlists
          </Link>
        </div>
      </PageLayout>
    );
  }

  const rows = reorderItems ?? items;
  const totalPages = Math.ceil(totalItems / view.perPage);

  return (
    <>
      <PageLayout>
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-4">
            {/* Back button */}
            <Button
              onClick={goBack}
              variant="secondary"
              icon={<ArrowLeft size={16} className="sm:w-4 sm:h-4" />}
              title={backButtonText}
            >
              <span className="hidden sm:inline">{backButtonText}</span>
            </Button>

            {!isEditing && !reorderMode && (
              <>
                {/* Edit button - owner only */}
                {isOwner && (
                  <Button
                    onClick={() => {
                      setSelectedScenes([]);
                      setEditName(playlist.name);
                      setEditDescription(playlist.description ?? "");
                      setIsEditing(true);
                    }}
                    variant="primary"
                    icon={<Edit2 size={16} className="sm:w-4 sm:h-4" />}
                    title="Edit Playlist"
                  >
                    <span className="hidden sm:inline">Edit</span>
                  </Button>
                )}

                {/* Reorder button - owner only */}
                {canReorder && (
                  <Button
                    onClick={() => {
                      setSelectedScenes([]);
                      setReorderItems(items);
                    }}
                    variant="secondary"
                    icon={<ArrowUpDown size={16} className="sm:w-4 sm:h-4" />}
                    title="Reorder Scenes"
                  >
                    <span className="hidden sm:inline">Reorder</span>
                  </Button>
                )}

                {/* Download button: owner or shared viewer with the permission */}
                {!!permissions?.canDownloadPlaylists && totalItems > 0 && (
                  <Button
                    onClick={() => void handleDownload()}
                    variant="secondary"
                    disabled={downloading}
                    icon={<ThemedIcon name="download" size={16} />}
                    title="Download Playlist"
                  >
                    <span className="hidden sm:inline">
                      {downloading ? "Starting..." : "Download"}
                    </span>
                  </Button>
                )}

                {/* Share button - owner only with share permission */}
                {isOwner && !!permissions?.canShare && (
                  <Button
                    onClick={() => setShareModalOpen(true)}
                    variant="secondary"
                    icon={<Share2 size={16} />}
                    title="Share Playlist"
                  >
                    <span className="hidden sm:inline">Share</span>
                  </Button>
                )}

                {/* Duplicate button - non-owners only */}
                {!isOwner && (
                  <Button
                    onClick={() => void handleDuplicate()}
                    variant="secondary"
                    disabled={duplicating}
                    icon={<Copy size={16} />}
                    title="Duplicate to My Playlists"
                  >
                    <span className="hidden sm:inline">
                      {duplicating ? "Duplicating..." : "Duplicate"}
                    </span>
                  </Button>
                )}
              </>
            )}

            {reorderMode && (
              <>
                {/* Save Order button */}
                <Button
                  onClick={() => void saveReorder()}
                  variant="primary"
                  icon={<Save size={16} className="sm:w-4 sm:h-4" />}
                  title="Save Order"
                >
                  <span className="hidden sm:inline">Save Order</span>
                </Button>

                {/* Cancel button */}
                <Button
                  onClick={() => setReorderItems(null)}
                  variant="destructive"
                  icon={<X size={16} className="sm:w-4 sm:h-4" />}
                  title="Cancel"
                >
                  <span className="hidden sm:inline">Cancel</span>
                </Button>
              </>
            )}

            {totalItems > 0 && !reorderMode && !isEditing && (
              <>
                {/* Shuffle button */}
                <Button
                  onClick={() => void toggleShuffle()}
                  variant="secondary"
                  className="p-1.5 sm:p-2"
                  {...(shuffle && {
                    style: {
                      border: "2px solid var(--status-info)",
                      color: "var(--status-info)",
                    },
                  })}
                  icon={<Shuffle size={16} className="sm:w-5 sm:h-5" />}
                  title={shuffle ? "Shuffle enabled" : "Shuffle disabled"}
                />

                {/* Repeat button */}
                <Button
                  onClick={() => void cycleRepeat()}
                  variant="secondary"
                  className="p-1.5 sm:p-2"
                  {...(repeat !== "none" && {
                    style: {
                      border: "2px solid var(--status-info)",
                      color: "var(--status-info)",
                    },
                  })}
                  icon={
                    repeat === "one" ? (
                      <Repeat1 size={16} className="sm:w-5 sm:h-5" />
                    ) : (
                      <Repeat size={16} className="sm:w-5 sm:h-5" />
                    )
                  }
                  title={
                    repeat === "all"
                      ? "Repeat all"
                      : repeat === "one"
                        ? "Repeat one"
                        : "Repeat off"
                  }
                />

                {/* Play button */}
                <Button
                  onClick={playPlaylist}
                  variant="primary"
                  className="p-1.5 sm:px-3 sm:py-2 sm:ml-auto"
                  icon={
                    <Play size={16} className="sm:w-4 sm:h-4" fill="white" />
                  }
                  title="Play Playlist"
                >
                  <span className="hidden sm:inline">Play</span>
                </Button>
              </>
            )}
          </div>

          {isEditing ? (
            <form onSubmit={(e) => void updatePlaylist(e)}>
              <Paper className="max-w-2xl">
                <Paper.Body className="space-y-4">
                  <div>
                    <label
                      className="block text-sm font-medium mb-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Playlist Name
                    </label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg"
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                        color: "var(--text-primary)",
                      }}
                      required
                    />
                  </div>
                  <div>
                    <label
                      className="block text-sm font-medium mb-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Description
                    </label>
                    <textarea
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      className="w-full px-4 py-2 rounded-lg"
                      style={{
                        backgroundColor: "var(--bg-secondary)",
                        border: "1px solid var(--border-color)",
                        color: "var(--text-primary)",
                      }}
                      rows={3}
                    />
                  </div>
                  <div className="flex gap-2 sm:gap-3">
                    <Button
                      type="submit"
                      variant="primary"
                      icon={<Save size={16} className="sm:w-4 sm:h-4" />}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      onClick={() => {
                        setIsEditing(false);
                      }}
                      variant="secondary"
                      icon={<X size={16} className="sm:w-4 sm:h-4" />}
                    >
                      Cancel
                    </Button>
                  </div>
                </Paper.Body>
              </Paper>
            </form>
          ) : (
            <>
              <PageHeader
                title={playlist.name}
                subtitle={playlist.description ?? undefined}
              />
              {!isOwner && (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Shared by {data.owner.username}
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 mt-2">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {totalItems} {totalItems === 1 ? "video" : "videos"}
                </p>
                {totalItems > 0 && !reorderMode && (
                  <PlaylistSortControl
                    field={view.field}
                    direction={view.direction}
                    perPage={view.perPage}
                    onFieldChange={(field) =>
                      changeView(
                        {
                          field,
                          seed: field === "random" ? freshSeed() : null,
                          page: 1,
                        },
                        "push"
                      )
                    }
                    onDirectionChange={(next) =>
                      changeView({ direction: next, page: 1 }, "push")
                    }
                    onPerPageChange={(perPage) =>
                      changeView({ perPage, page: 1 }, "replace")
                    }
                  />
                )}
              </div>
            </>
          )}
        </div>

        {/* Scenes List */}
        {totalItems === 0 ? (
          <div className="text-center py-16">
            <div
              className="text-6xl mb-4"
              style={{ color: "var(--text-muted)" }}
            >
              🎬
            </div>
            <h3
              className="text-xl font-medium mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              No scenes in this playlist yet
            </h3>
            <p style={{ color: "var(--text-secondary)" }}>
              Browse scenes and add them to this playlist
            </p>
            <Link
              to="/scenes"
              className="inline-block mt-4 px-4 py-1.5 sm:px-6 sm:py-2 rounded-lg text-sm sm:text-base font-medium"
              style={{
                backgroundColor: "var(--accent-color)",
                color: "white",
              }}
            >
              Browse Scenes
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {reorderMode && (
              <div
                className="p-4 rounded-lg mb-4"
                style={{
                  backgroundColor: "rgba(59, 130, 246, 0.1)",
                  border: "1px solid rgba(59, 130, 246, 0.3)",
                  color: "rgb(59, 130, 246)",
                }}
              >
                Use the position controls to reorder scenes. Click &quot;Save
                Order&quot; when done.
              </div>
            )}
            {selectedScenes.length > 0 && !isEditing && !reorderMode && (
              <div className="flex items-center justify-end gap-3">
                <Button
                  onClick={handleSelectAll}
                  variant="primary"
                  size="sm"
                  className="font-medium"
                >
                  Select All ({items.length})
                </Button>
                <Button
                  onClick={handleDeselectAll}
                  variant="secondary"
                  size="sm"
                  className="font-medium"
                >
                  Deselect All
                </Button>
              </div>
            )}
            {rows.length === 0 && (
              <p
                className="text-center py-8"
                style={{ color: "var(--text-muted)" }}
              >
                Nothing on this page
              </p>
            )}
            {rows.map((item, index) => (
              <SceneListItem
                key={itemKey(item)}
                scene={item.scene}
                isSelected={
                  !isEditing &&
                  !reorderMode &&
                  selectedScenes.some((s) => isItemOf(item, s))
                }
                onToggleSelect={
                  !isEditing && !reorderMode ? handleToggleSelect : undefined
                }
                selectionMode={
                  !isEditing && !reorderMode && selectedScenes.length > 0
                }
                linkState={linkStates.get(itemKey(item))}
                dragHandle={
                  reorderMode && (
                    <div className="flex-shrink-0 flex items-center gap-1">
                      {/* Position input */}
                      <input
                        type="number"
                        min={1}
                        max={rows.length}
                        value={index + 1}
                        onChange={(e) => {
                          const newPos = parseInt(e.target.value, 10);
                          if (!isNaN(newPos)) {
                            handleSetPosition(index, newPos);
                          }
                        }}
                        className="w-12 px-1 py-1 text-center text-sm rounded"
                        style={{
                          backgroundColor: "var(--bg-secondary)",
                          border: "1px solid var(--border-color)",
                          color: "var(--text-primary)",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {/* Move buttons */}
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveItem(index, 0);
                          }}
                          disabled={index === 0}
                          className="p-1 rounded hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{ color: "var(--text-secondary)" }}
                          title="Move to top"
                        >
                          <ChevronsUp size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveItem(index, index - 1);
                          }}
                          disabled={index === 0}
                          className="p-1 rounded hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{ color: "var(--text-secondary)" }}
                          title="Move up"
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveItem(index, index + 1);
                          }}
                          disabled={index === rows.length - 1}
                          className="p-1 rounded hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{ color: "var(--text-secondary)" }}
                          title="Move down"
                        >
                          <ChevronDown size={16} />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            moveItem(index, rows.length - 1);
                          }}
                          disabled={index === rows.length - 1}
                          className="p-1 rounded hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{ color: "var(--text-secondary)" }}
                          title="Move to bottom"
                        >
                          <ChevronsDown size={16} />
                        </button>
                      </div>
                    </div>
                  )
                }
                actionButtons={
                  <div className="flex items-center gap-2">
                    {isOwner && (
                      <Button
                        onClick={() => handleRemoveClick(item)}
                        variant="destructive"
                        size="sm"
                        className="px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm flex-shrink-0"
                      >
                        Remove
                      </Button>
                    )}
                    <AddToPlaylistButton
                      scenes={[
                        { id: item.sceneId, instanceId: item.instanceId },
                      ]}
                      compact
                      buttonText=""
                      icon={<MoreVertical size={16} />}
                      variant="secondary"
                      excludePlaylistIds={[String(playlistId)]}
                    />
                  </div>
                }
              />
            ))}
            {!reorderMode && (
              <Pagination
                currentPage={view.page}
                totalPages={totalPages}
                onPageChange={(page) => changeView({ page }, "push")}
                perPage={view.perPage}
                totalCount={totalItems}
              />
            )}
          </div>
        )}

        {selectedScenes.length > 0 && !isEditing && !reorderMode && (
          <BulkActionBar
            selectedScenes={selectedScenes}
            onClearSelection={handleDeselectAll}
            actions={
              <>
                <AddToPlaylistButton
                  scenes={selectedScenes}
                  buttonText={
                    (
                      <span>
                        <span className="hidden sm:inline">
                          Add {selectedScenes.length} to Playlist
                        </span>
                        <span className="sm:hidden">Add to Playlist</span>
                      </span>
                    ) as unknown as string
                  }
                  icon={<Plus className="w-4 h-4" />}
                  dropdownPosition="above"
                  excludePlaylistIds={[String(playlistId)]}
                  onSuccess={handleDeselectAll}
                />
                {isOwner && (
                  <Button
                    onClick={handleBulkRemoveClick}
                    variant="destructive"
                    size="sm"
                    className="flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Remove</span>
                  </Button>
                )}
              </>
            }
          />
        )}
      </PageLayout>

      {/* Remove Scene Confirmation Dialog */}
      <ConfirmDialog
        isOpen={removeConfirmOpen}
        onClose={() => {
          setRemoveConfirmOpen(false);
          setItemToRemove(null);
        }}
        onConfirm={() => void confirmRemove()}
        title="Remove Scene"
        message={`Remove "${
          itemToRemove ? getSceneTitle(itemToRemove.scene) : "this scene"
        }" from the playlist?`}
        confirmText="Remove"
        cancelText="Cancel"
        confirmStyle="danger"
      />

      {/* Bulk Remove Confirmation Dialog */}
      <ConfirmDialog
        isOpen={bulkRemoveConfirmOpen}
        onClose={() => setBulkRemoveConfirmOpen(false)}
        onConfirm={() => void confirmBulkRemove()}
        title="Remove Scenes"
        message={`Remove ${selectedScenes.length} scene${selectedScenes.length !== 1 ? "s" : ""} from this playlist?`}
        confirmText="Remove"
        cancelText="Cancel"
        confirmStyle="danger"
      />

      <SharePlaylistModal
        playlistId={playlistId}
        playlistName={playlist.name}
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
      />
    </>
  );
};

export default PlaylistDetail;
