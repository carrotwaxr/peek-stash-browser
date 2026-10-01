import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  type NormalizedScene,
  PER_PAGE_MAX,
  PLAYLIST_ITEM_SORTS,
  type PlaylistItemWithScene,
  type PlaylistQueueEntry,
} from "@peek/shared-types";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowUpDown,
  Check,
  ChevronDown,
  ChevronUp,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Edit2,
  ListOrdered,
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
import { ApiError, apiPost, getErrorMessage } from "../../api";
import { useMyPermissions } from "../../api/hooks/useMyPermissions";
import {
  useDuplicatePlaylist,
  useMovePlaylistItem,
  usePlaylist,
  usePlaylistQueue,
  useRemovePlaylistItems,
  useRemoveUnavailableItems,
  useSortPlaylist,
  useUpdatePlaylist,
} from "../../api/hooks/usePlaylists";
import {
  type PlaylistQueueParams,
  getPlaylistQueue,
} from "../../api/playlists";
import { queryKeys } from "../../api/queryKeys";
import { useConfig } from "../../contexts/ConfigContext";
import { useAuth } from "../../hooks/useAuth";
import { useNavigationState } from "../../hooks/useNavigationState";
import { usePageTitle } from "../../hooks/usePageTitle";
import { newClientToken } from "../../utils/clientToken";
import { makeCompositeKey } from "../../utils/compositeKey";
import { getEntityPath } from "../../utils/entityLinks";
import { getSceneTitle } from "../../utils/format";
import { freshSeed, parseSortValue, sortValue } from "../../utils/listQuery";
import type { PlaybackQueue } from "../../utils/playbackQueue";
import {
  showError,
  showInfo,
  showSuccess,
  showWarning,
} from "../../utils/toast";
import { ThemedIcon } from "../icons/index";
import PlaylistSortControl from "../playlists/PlaylistSortControl";
import SharePlaylistModal from "../playlists/SharePlaylistModal";
import AddToPlaylistButton from "../ui/AddToPlaylistButton";
import BulkActionBar from "../ui/BulkActionBar";
import Button from "../ui/Button";
import ConfirmDialog from "../ui/ConfirmDialog";
import PageHeader from "../ui/PageHeader";
import PageLayout from "../ui/PageLayout";
import Pagination from "../ui/Pagination";
import Paper from "../ui/Paper";
import SceneListItem from "../ui/SceneListItem";

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

const isItemOf = (item: PlaylistItemWithScene, scene: NormalizedScene) =>
  item.sceneId === scene.id && item.instanceId === scene.instanceId;

const itemKey = (item: { sceneId: string; instanceId: string }) =>
  makeCompositeKey(item.sceneId, item.instanceId);

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

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
  const { user } = useAuth();
  const userId = user?.id;

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
  const moveItemMutation = useMovePlaylistItem();
  const sortPlaylistMutation = useSortPlaylist();
  const removeUnavailableMutation = useRemoveUnavailableItems();
  // Through the cache, so the Playlists page lists the copy at once
  const duplicateMutation = useDuplicatePlaylist();

  const playlist = data?.playlist;
  const items = playlist?.items;
  const totalItems = data?.totalItems ?? 0;
  const isOwner = data?.isOwner ?? false;
  // Only the owner is told about the items they cannot see (owner answer 1)
  const unavailableItems = isOwner ? (data?.unavailableItems ?? 0) : 0;

  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [itemToRemove, setItemToRemove] =
    useState<PlaylistItemWithScene | null>(null);
  const [reorderOn, setReorderOn] = useState(false);
  const [saveOrderConfirmOpen, setSaveOrderConfirmOpen] = useState(false);
  const [removeUnavailableConfirmOpen, setRemoveUnavailableConfirmOpen] =
    useState(false);
  // The owner's change just saved, shown until the playlist is read again;
  // a recipient's own choice, never saved
  const [shuffleChoice, setShuffleChoice] = useState<boolean | null>(null);
  const [repeatChoice, setRepeatChoice] = useState<Repeat | null>(null);
  const shuffle = shuffleChoice ?? playlist?.shuffle ?? false;
  const repeat = repeatChoice ?? asRepeat(playlist?.repeat ?? "none");
  const [downloading, setDownloading] = useState(false);
  const { data: permissions } = useMyPermissions();
  const [shareModalOpen, setShareModalOpen] = useState(false);

  // Selection for the bulk bar (not while editing or reordering), by item
  const [selectedItems, setSelectedItems] = useState<PlaylistItemWithScene[]>(
    []
  );
  const selectedScenes = useMemo(
    () => selectedItems.map((item) => item.scene),
    [selectedItems]
  );
  const [bulkRemoveConfirmOpen, setBulkRemoveConfirmOpen] = useState(false);

  // One queue for the page (PM-08): every row's link shares its entries and
  // differs only in its index
  const entries = queueData?.entries;
  const playlistName = playlist?.name ?? "";
  const queue = useMemo<PlaybackQueue | null>(
    () =>
      entries
        ? {
            // New with each read of the queue: a row's link starts this one
            key: newClientToken(),
            userId,
            id: String(playlistId),
            name: playlistName,
            shuffle,
            repeat,
            scenes: entries,
            currentIndex: 0,
          }
        : null,
    [entries, playlistId, playlistName, shuffle, repeat, userId]
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
            ? { playlist: { ...queue, currentIndex } }
            : undefined;
        return [itemKey(item), state];
      })
    );
  }, [entries, items, queue]);

  const handleToggleSelect = useCallback(
    (scene: NormalizedScene) => {
      setSelectedItems((prev) => {
        if (prev.some((item) => isItemOf(item, scene))) {
          return prev.filter((item) => !isItemOf(item, scene));
        }
        const row = items?.find((item) => isItemOf(item, scene));
        return row ? [...prev, row] : prev;
      });
    },
    [items]
  );

  const handleSelectAll = useCallback(() => {
    setSelectedItems(items ?? []);
  }, [items]);

  const handleDeselectAll = useCallback(() => {
    setSelectedItems([]);
  }, []);

  // Navigation state for back button
  const { goBack, backButtonText } = useNavigationState();

  // Set page title to playlist name
  usePageTitle(playlistName || "Playlist");

  const updatePlaylist = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    try {
      await updatePlaylistMutation.mutateAsync({
        playlistId,
        name: editName.trim(),
        // An emptied description is cleared, not left as it was
        description: editDescription.trim() || null,
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
      setSelectedItems((prev) =>
        prev.filter((item) => item.id !== itemToRemove.id)
      );
      showSuccess("Scene removed from playlist");
    } catch {
      showError("Failed to remove scene from playlist");
    } finally {
      setRemoveConfirmOpen(false);
      setItemToRemove(null);
    }
  };

  // A move names an index among every item the owner sees, so it works on
  // any page, but only in the playlist's own order
  const canReorder =
    isOwner &&
    view.field === "position" &&
    view.direction === "ASC" &&
    totalItems > 1;
  const reorderMode = reorderOn && canReorder;
  /** The index of the page's first row among the items the owner sees */
  const offset = (view.page - 1) * view.perPage;

  /** Each move saves at once; the page and the queue are read again */
  const moveTo = async (item: PlaylistItemWithScene, index: number) => {
    try {
      await moveItemMutation.mutateAsync({
        playlistId,
        itemId: item.id,
        index: Math.min(Math.max(index, 0), totalItems - 1),
      });
    } catch {
      showError("Failed to move scene");
    }
  };

  // Saving the order shown names the sort and direction the page read
  const canSaveOrder =
    isOwner && sort !== undefined && direction !== undefined && totalItems > 1;

  const saveAsPlaylistOrder = async () => {
    setSaveOrderConfirmOpen(false);
    if (sort === undefined || direction === undefined) return;
    try {
      await sortPlaylistMutation.mutateAsync({ playlistId, sort, direction });
      showSuccess("Saved as the playlist's order");
      // The order shown is now the playlist's own
      changeView(
        { field: "position", seed: null, direction: "ASC", page: 1 },
        "push"
      );
    } catch {
      showError("Failed to save the playlist's order");
    }
  };

  const removeUnavailable = async () => {
    setRemoveUnavailableConfirmOpen(false);
    try {
      const { removed } = await removeUnavailableMutation.mutateAsync({
        playlistId,
      });
      if (removed > 0) {
        showSuccess(
          `Removed ${plural(removed, "deleted scene", "deleted scenes")}`
        );
      } else {
        showInfo(
          "No deleted scenes to remove: the unavailable items are hidden, restricted or on servers you don't use"
        );
      }
    } catch {
      showError("Failed to remove unavailable items");
    }
  };

  const toggleShuffle = async () => {
    const newShuffle = !shuffle;
    // A recipient's shuffle is theirs: the playlist is the owner's to change
    if (!isOwner) {
      setShuffleChoice(newShuffle);
      return;
    }
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
    if (!isOwner) {
      setRepeatChoice(newRepeat);
      return;
    }
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

  /**
   * Play starts the queue in the order the page shows: its first entry, or a
   * random one with shuffle on. The queue is read when it is not loaded yet.
   */
  const playPlaylist = async () => {
    let scenes: PlaylistQueueEntry[];
    try {
      scenes =
        entries ??
        (
          await queryClient.fetchQuery({
            queryKey: queryKeys.playlists.queue(playlistId, sort, direction),
            queryFn: ({ signal }) =>
              getPlaylistQueue(playlistId, order, signal),
          })
        ).entries;
    } catch {
      showError("Failed to load the playlist");
      return;
    }
    if (scenes.length === 0) {
      showWarning("Nothing in this playlist is available to you");
      return;
    }
    const startIndex = shuffle ? Math.floor(Math.random() * scenes.length) : 0;
    const start = scenes[startIndex];
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
            key: newClientToken(),
            userId,
            id: String(playlistId),
            name: playlistName,
            shuffle,
            repeat,
            scenes,
            currentIndex: startIndex,
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
      void queryClient.invalidateQueries({
        queryKey: queryKeys.downloads.all(),
      });
      showSuccess("Download started - check Downloads page for progress");
    } catch (err) {
      const message = getErrorMessage(err, "Download failed");
      // A playlist past the size cap names the zip's size and the cap, in MiB
      // (`PlaylistTooLargeResponse`)
      const { totalSizeMB, maxSizeMB } =
        err instanceof ApiError ? err.data : {};
      showError(
        typeof totalSizeMB === "number" && typeof maxSizeMB === "number"
          ? `${message} (${totalSizeMB}MB exceeds ${maxSizeMB}MB limit)`
          : message
      );
    } finally {
      setDownloading(false);
    }
  };

  const handleDuplicate = async () => {
    try {
      const result = await duplicateMutation.mutateAsync({ playlistId });
      showSuccess("Playlist duplicated!");
      void navigate(`/playlist/${String(result.playlist.id)}`);
    } catch {
      showError("Failed to duplicate playlist");
    }
  };

  const handleBulkRemoveClick = () => {
    setBulkRemoveConfirmOpen(true);
  };

  /** One request per PER_PAGE_MAX items (one for any page's selection) */
  const confirmBulkRemove = async () => {
    setBulkRemoveConfirmOpen(false);
    const itemIds = selectedItems.map((item) => item.id);
    let removed = 0;
    try {
      for (let from = 0; from < itemIds.length; from += PER_PAGE_MAX) {
        const answer = await removeItemsMutation.mutateAsync({
          playlistId,
          itemIds: itemIds.slice(from, from + PER_PAGE_MAX),
        });
        removed += answer.removed;
      }
      showSuccess(
        `Removed ${plural(removed, "scene", "scenes")} from playlist`
      );
    } catch {
      showError(
        removed > 0
          ? `Removed ${plural(removed, "scene", "scenes")}; the rest failed`
          : "Failed to remove scenes from playlist"
      );
    } finally {
      setSelectedItems([]);
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

  const rows = items;
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
                      setSelectedItems([]);
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
                      setSelectedItems([]);
                      setReorderOn(true);
                    }}
                    variant="secondary"
                    icon={<ArrowUpDown size={16} className="sm:w-4 sm:h-4" />}
                    title="Reorder Scenes"
                  >
                    <span className="hidden sm:inline">Reorder</span>
                  </Button>
                )}

                {/* Save the view's sort as the playlist's order - owner only */}
                {canSaveOrder && (
                  <Button
                    onClick={() => setSaveOrderConfirmOpen(true)}
                    variant="secondary"
                    icon={<ListOrdered size={16} className="sm:w-4 sm:h-4" />}
                    title="Save as playlist order"
                    aria-label="Save as playlist order"
                  >
                    <span className="hidden sm:inline">Save as order</span>
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
                    disabled={duplicateMutation.isPending}
                    icon={<Copy size={16} />}
                    title="Duplicate to My Playlists"
                  >
                    <span className="hidden sm:inline">
                      {duplicateMutation.isPending
                        ? "Duplicating..."
                        : "Duplicate"}
                    </span>
                  </Button>
                )}
              </>
            )}

            {reorderMode && (
              // Each move is saved as it is made: Done only leaves the mode
              <Button
                onClick={() => setReorderOn(false)}
                variant="primary"
                icon={<Check size={16} className="sm:w-4 sm:h-4" />}
              >
                Done
              </Button>
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
                  onClick={() => void playPlaylist()}
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
                      htmlFor="playlist-edit-name"
                      className="block text-sm font-medium mb-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Playlist Name
                    </label>
                    <input
                      id="playlist-edit-name"
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
                      htmlFor="playlist-edit-description"
                      className="block text-sm font-medium mb-2"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Description
                    </label>
                    <textarea
                      id="playlist-edit-description"
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
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    {totalItems} {totalItems === 1 ? "video" : "videos"}
                  </p>
                  {unavailableItems > 0 && (
                    <>
                      <span
                        className="text-sm"
                        style={{ color: "var(--status-warning)" }}
                        title="Items you can't play here: deleted from Stash, hidden, restricted or on a server you don't use"
                      >
                        {unavailableItems} unavailable
                      </span>
                      <Button
                        onClick={() => setRemoveUnavailableConfirmOpen(true)}
                        variant="secondary"
                        size="sm"
                        disabled={removeUnavailableMutation.isPending}
                      >
                        Remove unavailable
                      </Button>
                    </>
                  )}
                </div>
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
                  backgroundColor: "var(--status-info-bg)",
                  border: "1px solid var(--status-info-border)",
                  color: "var(--status-info)",
                }}
              >
                Move a scene with its arrows, or type its new position and press
                Enter. Each move is saved at once, across pages. Click Done when
                you are finished.
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
            {rows.map((item, index) => {
              const at = offset + index;
              const isFirst = at === 0;
              const isLast = at === totalItems - 1;
              const moving = moveItemMutation.isPending;
              return (
                <SceneListItem
                  key={itemKey(item)}
                  scene={item.scene}
                  isSelected={
                    !isEditing &&
                    !reorderMode &&
                    selectedItems.some((selected) => selected.id === item.id)
                  }
                  onToggleSelect={
                    !isEditing && !reorderMode ? handleToggleSelect : undefined
                  }
                  selectionMode={
                    !isEditing && !reorderMode && selectedItems.length > 0
                  }
                  linkState={linkStates.get(itemKey(item))}
                  dragHandle={
                    reorderMode && (
                      <div className="flex-shrink-0 flex items-center gap-1">
                        <PositionBox
                          key={at}
                          position={at + 1}
                          total={totalItems}
                          disabled={moving}
                          onMove={(position) => void moveTo(item, position - 1)}
                        />
                        <div className="flex items-center gap-0.5">
                          <MoveButton
                            title="Move to top"
                            disabled={moving || isFirst}
                            onClick={() => void moveTo(item, 0)}
                          >
                            <ChevronsUp size={16} />
                          </MoveButton>
                          <MoveButton
                            title="Move up"
                            disabled={moving || isFirst}
                            onClick={() => void moveTo(item, at - 1)}
                          >
                            <ChevronUp size={16} />
                          </MoveButton>
                          <MoveButton
                            title="Move down"
                            disabled={moving || isLast}
                            onClick={() => void moveTo(item, at + 1)}
                          >
                            <ChevronDown size={16} />
                          </MoveButton>
                          <MoveButton
                            title="Move to bottom"
                            disabled={moving || isLast}
                            onClick={() => void moveTo(item, totalItems - 1)}
                          >
                            <ChevronsDown size={16} />
                          </MoveButton>
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
                        excludePlaylistIds={[playlist.id]}
                      />
                    </div>
                  }
                />
              );
            })}
            <Pagination
              currentPage={view.page}
              totalPages={totalPages}
              onPageChange={(page) => changeView({ page }, "push")}
              perPage={view.perPage}
              totalCount={totalItems}
            />
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
                  excludePlaylistIds={[playlist.id]}
                  onSuccess={handleDeselectAll}
                />
                {isOwner && (
                  <Button
                    onClick={handleBulkRemoveClick}
                    variant="destructive"
                    size="sm"
                    className="flex items-center gap-1.5"
                    aria-label={`Remove ${selectedItems.length}`}
                    title={`Remove ${plural(selectedItems.length, "scene", "scenes")} from this playlist`}
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
        message={`Remove ${plural(selectedItems.length, "scene", "scenes")} from this playlist?`}
        confirmText="Remove"
        cancelText="Cancel"
        confirmStyle="danger"
      />

      <ConfirmDialog
        isOpen={saveOrderConfirmOpen}
        onClose={() => setSaveOrderConfirmOpen(false)}
        onConfirm={() => void saveAsPlaylistOrder()}
        title="Save as playlist order"
        message={
          <>
            <p>
              Make the order shown the playlist&apos;s own order? Everyone who
              opens it sees this order.
            </p>
            {unavailableItems > 0 && (
              <p className="mt-2">
                {unavailableItems === 1
                  ? "1 item you can't see keeps its order after the ones you see."
                  : `${unavailableItems} items you can't see keep their order after the ones you see.`}
              </p>
            )}
          </>
        }
        confirmText="Save order"
        cancelText="Cancel"
        confirmStyle="primary"
      />

      <ConfirmDialog
        isOpen={removeUnavailableConfirmOpen}
        onClose={() => setRemoveUnavailableConfirmOpen(false)}
        onConfirm={() => void removeUnavailable()}
        title="Remove unavailable"
        message={
          <>
            <p>
              Remove the items whose scene was deleted from Stash? They
              can&apos;t come back.
            </p>
            <p className="mt-2">
              Hidden or restricted scenes, and scenes on servers you don&apos;t
              use, stay: they may become available again.
            </p>
          </>
        }
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

/** A reorder arrow */
const MoveButton = ({
  title,
  disabled,
  onClick,
  children,
}: {
  title: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    onClick={(e) => {
      e.stopPropagation();
      onClick();
    }}
    disabled={disabled}
    className="p-1 rounded hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
    style={{ color: "var(--text-secondary)" }}
    title={title}
    aria-label={title}
  >
    {children}
  </button>
);

/**
 * A row's place in the whole playlist (1-based). Typing changes only the
 * box; Enter or leaving it moves the item, once, clamped to 1..total.
 * The parent keys it by the place, so a move resets it.
 */
const PositionBox = ({
  position,
  total,
  disabled,
  onMove,
}: {
  position: number;
  total: number;
  disabled: boolean;
  onMove: (position: number) => void;
}) => {
  const [draft, setDraft] = useState(String(position));
  const [sent, setSent] = useState<number | null>(null);

  const commit = () => {
    const wanted = parseInt(draft, 10);
    if (Number.isNaN(wanted)) {
      setDraft(String(position));
      return;
    }
    const target = Math.min(Math.max(wanted, 1), total);
    if (target === position || target === sent) return;
    setSent(target);
    onMove(target);
  };

  return (
    <input
      type="number"
      aria-label="Position"
      min={1}
      max={total}
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key !== "Enter") return;
        e.preventDefault();
        commit();
      }}
      onBlur={commit}
      onClick={(e) => e.stopPropagation()}
      className="w-14 px-1 py-1 text-center text-sm rounded"
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
        color: "var(--text-primary)",
      }}
    />
  );
};

export default PlaylistDetail;
