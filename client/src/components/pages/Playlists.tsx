import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type {
  PlaylistPreviewItem,
  PlaylistSummary,
  SharedPlaylistData,
} from "@peek/shared-types";
import {
  ListVideo,
  LucideArrowDown,
  LucideArrowUp,
  type LucideIcon,
  LucideList,
  Share2,
} from "lucide-react";
import {
  useCleanPlaylists,
  useCreatePlaylist,
  useDeletePlaylist,
  useDeletePlaylists,
  usePlaylists,
  useSharedPlaylists,
} from "../../api/hooks";
import { useCardSelection } from "../../hooks/useCardSelection";
import { usePageTitle } from "../../hooks/usePageTitle";
import { makeCompositeKey } from "../../utils/compositeKey";
import { formatDate } from "../../utils/date";
import { showError, showInfo, showSuccess } from "../../utils/toast";
import {
  DEFAULT_PLAYLIST_SORT,
  PLAYLIST_LIST_SORTS,
  type PlaylistListRow,
  type PlaylistSortDirection,
  type PlaylistSortField,
  filterPlaylists,
  sortPlaylists,
} from "../playlists/playlistListSort";
import {
  BulkActionBar,
  Button,
  ConfirmDialog,
  EmptyState,
  Modal,
  PageLayout,
  Paper,
  SearchInput,
  SortControl,
  StatusMessage,
  TAB_COUNT_LOADING,
  TabNavigation,
  ViewModeToggle,
} from "../ui/index";

/** The empty state's icon, drawn like its built-in one (thin, muted, 64 px) */
const EmptyIcon = ({ icon: Icon }: { icon: LucideIcon }) => (
  <Icon
    className="w-16 h-16 mx-auto mb-4"
    strokeWidth={1}
    style={{ color: "var(--text-muted)" }}
    aria-hidden="true"
  />
);

type PlaylistView = "grid" | "list";

const plural = (count: number, one: string, many: string) =>
  `${count} ${count === 1 ? one : many}`;

interface SelectBoxProps {
  label: string;
  checked: boolean;
  onChange: () => void;
  /** Some, not all, are selected (a header's box) */
  indeterminate?: boolean;
}

/** A playlist's or a table's selection checkbox, in the theme's accent */
const SelectBox = ({
  label,
  checked,
  onChange,
  indeterminate = false,
}: SelectBoxProps) => {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      onChange={onChange}
      className="w-5 h-5 cursor-pointer"
      style={{ accentColor: "var(--accent-primary)" }}
    />
  );
};

/** What the page tracks for the user's own playlists' selection */
interface PlaylistSelection {
  selected: ReadonlySet<number>;
  onToggle: (playlistId: number) => void;
}

const VIEW_MODES = [
  { id: "grid", label: "Grid view" },
  { id: "list", label: "List view", icon: LucideList },
];

/** A name sorts A to Z first; every other sort starts with the largest */
const startingDirection = (field: PlaylistSortField): PlaylistSortDirection =>
  field === "name" ? "ASC" : "DESC";

/** An ISO string for a time the API sent (a JSON string, typed as a Date) */
const toIso = (value: Date | string): string | null => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

interface PlaylistThumbnailGridProps {
  items: PlaylistPreviewItem[];
  totalCount: number;
  /** The box's size classes; 128 px square by default */
  sizeClass?: string;
  /** Draw an empty box for a playlist with no preview, to keep rows aligned */
  placeholder?: boolean;
}

/**
 * Reusable 2x2 thumbnail grid for playlist preview
 */
const PlaylistThumbnailGrid = ({
  items,
  totalCount,
  sizeClass = "w-32 h-32",
  placeholder = false,
}: PlaylistThumbnailGridProps) => {
  if (!items || items.length === 0) {
    return placeholder ? (
      <div
        className={`flex-shrink-0 rounded-lg ${sizeClass}`}
        style={{ backgroundColor: "var(--bg-tertiary)" }}
        aria-hidden="true"
      />
    ) : null;
  }

  return (
    <div className={`flex-shrink-0 ${sizeClass}`}>
      <div className="grid grid-cols-2 gap-1 w-full h-full rounded-lg overflow-hidden">
        {items.slice(0, 4).map((item, idx) => (
          <div
            key={makeCompositeKey(item.sceneId, item.instanceId)}
            className="aspect-square overflow-hidden"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            {item.scene.paths.screenshot ? (
              <img
                src={item.scene.paths.screenshot}
                alt=""
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-xs"
                style={{ color: "var(--text-muted)" }}
              >
                {idx < totalCount ? "?" : ""}
              </div>
            )}
          </div>
        ))}
        {/* Fill remaining slots if less than 4 items */}
        {items.length < 4 &&
          [...Array(4 - items.length)].map((_, idx) => (
            <div
              key={`empty-${idx}`}
              className="aspect-square"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            />
          ))}
      </div>
    </div>
  );
};

interface PlaylistCardProps {
  playlist: PlaylistSummary;
  onDelete: (playlist: PlaylistSummary) => void;
  selection: PlaylistSelection;
}

/** One of the user's playlists in the grid */
const PlaylistCard = ({ playlist, onDelete, selection }: PlaylistCardProps) => {
  const count = playlist._count.items;
  const isSelected = selection.selected.has(playlist.id);
  const { selectionHandlers, handleNavigationClick } = useCardSelection({
    entity: { id: playlist.id },
    // Once something is selected, a click on the name selects, not opens
    selectionMode: selection.selected.size > 0,
    onToggleSelect: () => selection.onToggle(playlist.id),
  });
  return (
    <div
      className="relative rounded-lg"
      style={
        isSelected
          ? { outline: "2px solid var(--selection-color)", outlineOffset: 2 }
          : undefined
      }
      {...selectionHandlers}
    >
      <div
        className="absolute top-2 left-2 z-10 rounded p-1"
        style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
      >
        <SelectBox
          label={`Select ${playlist.name}`}
          checked={isSelected}
          onChange={() => selection.onToggle(playlist.id)}
        />
      </div>
      <Paper>
        <Paper.Body>
          <div className="flex gap-4">
            <PlaylistThumbnailGrid
              items={playlist.items}
              totalCount={count}
              placeholder
            />
            <div className="flex-1 min-w-0">
              <Link
                to={`/playlist/${playlist.id}`}
                onClick={handleNavigationClick}
              >
                <h3
                  className="text-lg font-semibold mb-2 hover:underline"
                  style={{ color: "var(--text-primary)" }}
                >
                  {playlist.name}
                </h3>
              </Link>
              {playlist.description ? (
                <p
                  className="text-sm mb-4 line-clamp-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  {playlist.description}
                </p>
              ) : null}
              <div
                className="flex items-center justify-between text-sm"
                style={{ color: "var(--text-muted)" }}
              >
                <span>
                  {count} {count === 1 ? "video" : "videos"}
                </span>
                <Button
                  onClick={() => onDelete(playlist)}
                  variant="destructive"
                  size="sm"
                  className="px-3 py-1"
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </Paper.Body>
      </Paper>
    </div>
  );
};

/** One playlist shared with the user, in the grid */
const SharedPlaylistCard = ({ playlist }: { playlist: SharedPlaylistData }) => (
  <Paper>
    <Paper.Body>
      <div className="flex gap-4">
        <PlaylistThumbnailGrid
          items={playlist.items}
          totalCount={playlist.sceneCount}
        />
        <div className="flex-1 min-w-0">
          <Link to={`/playlist/${playlist.id}`}>
            <h3
              className="text-lg font-semibold mb-1 hover:underline"
              style={{ color: "var(--text-primary)" }}
            >
              {playlist.name}
            </h3>
          </Link>
          <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
            by {playlist.owner.username}
          </p>
          {playlist.description ? (
            <p
              className="text-sm mb-4 line-clamp-2"
              style={{ color: "var(--text-secondary)" }}
            >
              {playlist.description}
            </p>
          ) : null}
          <div
            className="flex items-center justify-between text-sm"
            style={{ color: "var(--text-muted)" }}
          >
            <span>
              {playlist.sceneCount}{" "}
              {playlist.sceneCount === 1 ? "video" : "videos"}
            </span>
            <span
              className="text-xs px-2 py-1 rounded"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            >
              via {playlist.sharedViaGroups.join(", ")}
            </span>
          </div>
        </div>
      </div>
    </Paper.Body>
  </Paper>
);

/** A playlist as the sort and the list view see it */
interface PlaylistRow extends PlaylistListRow {
  thumbnails: PlaylistPreviewItem[];
  /** Items whose scene was deleted from Stash; shared playlists have none */
  removable: number;
  /** Who shared it; absent for the user's own */
  owner?: string;
}

const headerClass = "text-left py-3 px-4 font-medium whitespace-nowrap";
const cellClass = "py-2 px-4 align-middle";

/** The list view: one row for each playlist */
const PlaylistTable = ({
  rows,
  shared,
  selection,
  onToggleAll,
}: {
  rows: PlaylistRow[];
  shared: boolean;
  /** The user's own playlists can be selected; shared ones cannot */
  selection?: PlaylistSelection;
  onToggleAll?: () => void;
}) => {
  const selectedCount = selection
    ? rows.filter((row) => selection.selected.has(row.id)).length
    : 0;
  return (
    <div
      className="rounded-lg border overflow-x-auto"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      <table className="w-full">
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border-color)" }}>
            {selection && (
              <th className={`${headerClass} w-10`}>
                <SelectBox
                  label="Select all playlists"
                  checked={rows.length > 0 && selectedCount === rows.length}
                  indeterminate={
                    selectedCount > 0 && selectedCount < rows.length
                  }
                  onChange={() => onToggleAll?.()}
                />
              </th>
            )}
            <th
              className={headerClass}
              style={{ color: "var(--text-secondary)" }}
            >
              Name
            </th>
            {shared && (
              <th
                className={headerClass}
                style={{ color: "var(--text-secondary)" }}
              >
                Shared by
              </th>
            )}
            <th
              className={headerClass}
              style={{ color: "var(--text-secondary)" }}
            >
              Videos
            </th>
            {!shared && (
              <th
                className={headerClass}
                style={{ color: "var(--text-secondary)" }}
              >
                Deleted from Stash
              </th>
            )}
            {!shared && (
              <th
                className={headerClass}
                style={{ color: "var(--text-secondary)" }}
              >
                Created
              </th>
            )}
            <th
              className={headerClass}
              style={{ color: "var(--text-secondary)" }}
            >
              Last changed
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              style={{ borderBottom: "1px solid var(--border-color)" }}
            >
              {selection && (
                <td className={cellClass}>
                  <SelectBox
                    label={`Select ${row.name}`}
                    checked={selection.selected.has(row.id)}
                    onChange={() => selection.onToggle(row.id)}
                  />
                </td>
              )}
              <td className={cellClass}>
                <div className="flex items-center gap-3">
                  <PlaylistThumbnailGrid
                    items={row.thumbnails}
                    totalCount={row.count}
                    sizeClass="w-12 h-12"
                    placeholder
                  />
                  <Link
                    to={`/playlist/${row.id}`}
                    className="font-medium hover:underline"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {row.name}
                  </Link>
                </div>
              </td>
              {shared && (
                <td
                  className={cellClass}
                  style={{ color: "var(--text-muted)" }}
                >
                  {row.owner}
                </td>
              )}
              <td
                className={cellClass}
                style={{ color: "var(--text-secondary)" }}
              >
                {row.count}
              </td>
              {!shared && (
                <td
                  className={cellClass}
                  style={{ color: "var(--text-secondary)" }}
                >
                  {row.removable > 0 ? row.removable : ""}
                </td>
              )}
              {!shared && (
                <td
                  className={cellClass}
                  style={{ color: "var(--text-secondary)" }}
                >
                  {formatDate(row.createdAt, { empty: "" })}
                </td>
              )}
              <td
                className={cellClass}
                style={{ color: "var(--text-secondary)" }}
              >
                {formatDate(row.lastChangedAt, { empty: "" })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

interface PlaylistToolbarProps {
  search: string;
  onSearch: (query: string) => void;
  sortOptions: { value: string; label: string }[];
  sortField: PlaylistSortField;
  sortDirection: PlaylistSortDirection;
  onSortField: (field: PlaylistSortField) => void;
  onToggleDirection: () => void;
  view: PlaylistView;
  onView: (view: PlaylistView) => void;
}

/** Search, sort and view, laid out like the first row of a list's controls */
const PlaylistToolbar = ({
  search,
  onSearch,
  sortOptions,
  sortField,
  sortDirection,
  onSortField,
  onToggleDirection,
  view,
  onView,
}: PlaylistToolbarProps) => (
  <div
    className="rounded-lg mb-4 p-3"
    style={{
      backgroundColor: "var(--bg-card)",
      border: "1px solid var(--border-color)",
    }}
  >
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <div className="w-full sm:w-auto sm:flex-1 sm:min-w-[180px] sm:max-w-sm">
        <SearchInput
          placeholder="Search playlists..."
          value={search}
          onSearch={onSearch}
        />
      </div>
      <div className="flex items-center gap-1">
        <SortControl
          options={sortOptions}
          value={sortField}
          onChange={(value) => onSortField(value as PlaylistSortField)}
        />
        <Button
          onClick={onToggleDirection}
          aria-label={`Sort direction: ${sortDirection === "ASC" ? "ascending" : "descending"}`}
          variant="secondary"
          size="sm"
          className="py-1"
          icon={
            sortDirection === "ASC" ? (
              <LucideArrowUp size={22} />
            ) : (
              <LucideArrowDown size={22} />
            )
          }
        />
      </div>
      <ViewModeToggle
        modes={VIEW_MODES}
        value={view}
        onChange={(mode) => onView(mode === "list" ? "list" : "grid")}
      />
    </div>
  </div>
);

const GRID_CLASS =
  "grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-6";

const Playlists = () => {
  usePageTitle("Playlists");
  const [searchParams, setSearchParams] = useSearchParams();
  const ownQuery = usePlaylists();
  const sharedQuery = useSharedPlaylists();
  const createPlaylistMutation = useCreatePlaylist();
  const deletePlaylistMutation = useDeletePlaylist();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDescription, setNewPlaylistDescription] = useState("");
  const cleanPlaylistsMutation = useCleanPlaylists();
  const deletePlaylistsMutation = useDeletePlaylists();
  const [cleanConfirmOpen, setCleanConfirmOpen] = useState(false);
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [playlistToDelete, setPlaylistToDelete] =
    useState<PlaylistSummary | null>(null);

  const playlists = useMemo(
    () => ownQuery.data?.playlists ?? [],
    [ownQuery.data]
  );
  // Shared playlists are not critical: a failed read shows none
  const sharedPlaylists = useMemo(
    () => sharedQuery.data?.playlists ?? [],
    [sharedQuery.data]
  );
  const loading = ownQuery.isPending;
  const loadingShared = sharedQuery.isPending;
  const sharedLoaded = sharedQuery.isSuccess;
  const error = ownQuery.isError ? "Failed to load playlists" : null;
  const creating = createPlaylistMutation.isPending;

  // Get active tab from URL or default to "mine"
  const activeTab = searchParams.get("tab") || "mine";
  const isShared = activeTab !== "mine";

  // List state lives in the URL beside `tab`; a default is left out of it
  const search = searchParams.get("q") ?? "";
  const view: PlaylistView =
    searchParams.get("view") === "list" ? "list" : "grid";
  // A shared playlist has no creation time of its own to sort by
  const sortOptions = isShared
    ? PLAYLIST_LIST_SORTS.filter((s) => s.value !== "created")
    : PLAYLIST_LIST_SORTS;
  const urlSort = searchParams.get("sort");
  const sortField =
    sortOptions.find((s) => s.value === urlSort)?.value ??
    DEFAULT_PLAYLIST_SORT.field;
  const sortDirection: PlaylistSortDirection =
    searchParams.get("dir") === "ASC" ? "ASC" : "DESC";

  const setListParams = (
    updates: Record<string, string | null>,
    replace: boolean
  ) => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        for (const [key, value] of Object.entries(updates)) {
          if (value === null) next.delete(key);
          else next.set(key, value);
        }
        return next;
      },
      { replace }
    );
  };

  const handleSearch = (query: string) =>
    setListParams({ q: query.trim() ? query : null }, true);
  const handleView = (mode: PlaylistView) =>
    setListParams({ view: mode === "grid" ? null : mode }, true);
  const handleSortField = (field: PlaylistSortField) =>
    setListParams(
      {
        sort: field === DEFAULT_PLAYLIST_SORT.field ? null : field,
        dir: startingDirection(field) === "DESC" ? null : "ASC",
      },
      false
    );
  const handleToggleDirection = () =>
    setListParams({ dir: sortDirection === "ASC" ? null : "ASC" }, false);

  const ownRows = useMemo(() => {
    const rows = playlists.map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      count: playlist._count.items,
      createdAt: toIso(playlist.createdAt),
      lastChangedAt: toIso(playlist.lastChangedAt),
      thumbnails: playlist.items,
      removable: playlist.removableItems,
      playlist,
    }));
    return sortPlaylists(
      filterPlaylists(rows, search),
      sortField,
      sortDirection
    );
  }, [playlists, search, sortField, sortDirection]);

  const sharedRows = useMemo(() => {
    const rows = sharedPlaylists.map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      description: playlist.description,
      count: playlist.sceneCount,
      createdAt: null,
      lastChangedAt: toIso(playlist.sharedAt),
      thumbnails: playlist.items,
      removable: 0,
      owner: playlist.owner.username,
      playlist,
    }));
    return sortPlaylists(
      filterPlaylists(rows, search),
      sortField,
      sortDirection
    );
  }, [sharedPlaylists, search, sortField, sortDirection]);

  // The selection belongs to what the page shows: a new tab, search or sort
  // starts it over (state adjusted during render, so no frame shows ids the
  // page no longer lists)
  const selectionContext = [activeTab, search, sortField, sortDirection].join(
    "\0"
  );
  const [selectionState, setSelectionState] = useState({
    context: selectionContext,
    ids: new Set<number>(),
  });
  if (selectionState.context !== selectionContext) {
    setSelectionState({ context: selectionContext, ids: new Set() });
  }
  const selectedIds = selectionState.ids;
  const selectedRows = isShared
    ? []
    : ownRows.filter((row) => selectedIds.has(row.id));
  const clearSelection = () =>
    setSelectionState({ context: selectionContext, ids: new Set() });
  const toggleSelected = (playlistId: number) => {
    const ids = new Set(selectedIds);
    if (!ids.delete(playlistId)) ids.add(playlistId);
    setSelectionState({ context: selectionContext, ids });
  };
  const selectAllShown = () =>
    setSelectionState({
      context: selectionContext,
      ids: new Set(ownRows.map((row) => row.id)),
    });
  const toggleAllShown = () =>
    selectedRows.length === ownRows.length
      ? clearSelection()
      : selectAllShown();
  const selection: PlaylistSelection = {
    selected: selectedIds,
    onToggle: toggleSelected,
  };

  const removableTotal = selectedRows.reduce(
    (sum, row) => sum + row.removable,
    0
  );
  const cleanablePlaylists = selectedRows.filter((row) => row.removable > 0);

  const confirmClean = async () => {
    try {
      const { removed, playlists: changed } =
        await cleanPlaylistsMutation.mutateAsync({
          playlistIds: selectedRows.map((row) => row.id),
        });
      if (removed > 0) {
        showSuccess(
          `Removed ${plural(removed, "item", "items")} from ${plural(changed, "playlist", "playlists")}`
        );
      } else {
        showInfo("Nothing deleted from Stash was left to remove");
      }
      clearSelection();
    } catch {
      showError("Failed to clean the playlists");
    } finally {
      setCleanConfirmOpen(false);
    }
  };

  const confirmBulkDelete = async () => {
    try {
      const { deleted } = await deletePlaylistsMutation.mutateAsync({
        playlistIds: selectedRows.map((row) => row.id),
      });
      showSuccess(`Deleted ${plural(deleted, "playlist", "playlists")}`);
      clearSelection();
    } catch {
      showError("Failed to delete the playlists");
    } finally {
      setBulkDeleteConfirmOpen(false);
    }
  };

  const createPlaylist = async (e: React.SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    try {
      await createPlaylistMutation.mutateAsync({
        name: newPlaylistName.trim(),
        description: newPlaylistDescription.trim() || undefined,
      });

      showSuccess("Playlist created successfully!");
      setNewPlaylistName("");
      setNewPlaylistDescription("");
      setShowCreateModal(false);
    } catch {
      showError("Failed to create playlist");
    }
  };

  const handleDeleteClick = (playlist: PlaylistSummary) => {
    setPlaylistToDelete(playlist);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!playlistToDelete) return;

    try {
      await deletePlaylistMutation.mutateAsync({
        playlistId: playlistToDelete.id,
      });
      showSuccess("Playlist deleted");
    } catch {
      showError("Failed to delete playlist");
    } finally {
      setDeleteConfirmOpen(false);
      setPlaylistToDelete(null);
    }
  };

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      </PageLayout>
    );
  }

  // Build tab configuration with actual counts
  const tabs = [
    { id: "mine", label: "My Playlists", count: playlists.length },
    {
      id: "shared",
      label: "Shared with Me",
      count: sharedLoaded ? sharedPlaylists.length : TAB_COUNT_LOADING,
    },
  ];

  // The toolbar shows once the tab has playlists to sort and search
  const toolbar = (
    <PlaylistToolbar
      search={search}
      onSearch={handleSearch}
      sortOptions={sortOptions}
      sortField={sortField}
      sortDirection={sortDirection}
      onSortField={handleSortField}
      onToggleDirection={handleToggleDirection}
      view={view}
      onView={handleView}
    />
  );

  const noMatches = (
    <EmptyState
      icon={<EmptyIcon icon={ListVideo} />}
      title="No playlists match"
      description="Try a different search"
    />
  );

  return (
    <PageLayout>
      {/* Header with New Playlist button */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-4">
        <h1
          className="text-2xl font-bold"
          style={{ color: "var(--text-primary)" }}
        >
          Playlists
        </h1>
        {activeTab === "mine" && (
          <Button
            onClick={() => setShowCreateModal(true)}
            variant="primary"
            className="w-full md:w-auto"
          >
            + New Playlist
          </Button>
        )}
      </div>

      {/* Tab Navigation */}
      <TabNavigation tabs={tabs} defaultTab="mine" showSingleTab showEmpty />

      {activeTab === "mine" ? (
        <>
          {error && (
            <StatusMessage
              variant="error"
              title={null}
              className="mb-6"
              message={error}
            />
          )}

          {playlists.length === 0 ? (
            <EmptyState
              icon={<EmptyIcon icon={ListVideo} />}
              title="No playlists yet"
              description="Create your first playlist to get started"
            />
          ) : (
            <>
              {toolbar}
              {ownRows.length === 0 ? (
                noMatches
              ) : view === "list" ? (
                <PlaylistTable
                  rows={ownRows}
                  shared={false}
                  selection={selection}
                  onToggleAll={toggleAllShown}
                />
              ) : (
                <div className={GRID_CLASS}>
                  {ownRows.map((row) => (
                    <PlaylistCard
                      key={row.id}
                      playlist={row.playlist}
                      onDelete={handleDeleteClick}
                      selection={selection}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </>
      ) : // Shared playlists view
      loadingShared ? (
        <div className="flex items-center justify-center py-16">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      ) : sharedPlaylists.length === 0 ? (
        <EmptyState
          icon={<EmptyIcon icon={Share2} />}
          title="No shared playlists"
          description="Playlists shared with your groups will appear here"
        />
      ) : (
        <>
          {toolbar}
          {sharedRows.length === 0 ? (
            noMatches
          ) : view === "list" ? (
            <PlaylistTable rows={sharedRows} shared />
          ) : (
            <div className={GRID_CLASS}>
              {sharedRows.map((row) => (
                <SharedPlaylistCard key={row.id} playlist={row.playlist} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Create Playlist Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        size="sm"
        title="Create New Playlist"
        initialFocusRef={nameInputRef}
      >
        <form onSubmit={(e) => void createPlaylist(e)}>
          <div className="space-y-4">
            <div>
              <label
                htmlFor="playlistName"
                className="block text-sm font-medium mb-2"
                style={{ color: "var(--text-secondary)" }}
              >
                Playlist Name *
              </label>
              <input
                ref={nameInputRef}
                type="text"
                id="playlistName"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                className="w-full px-4 py-2 rounded-lg"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                }}
                placeholder="Enter playlist name"
                required
              />
            </div>
            <div>
              <label
                htmlFor="playlistDescription"
                className="block text-sm font-medium mb-2"
                style={{ color: "var(--text-secondary)" }}
              >
                Description (Optional)
              </label>
              <textarea
                id="playlistDescription"
                value={newPlaylistDescription}
                onChange={(e) => setNewPlaylistDescription(e.target.value)}
                className="w-full px-4 py-2 rounded-lg"
                style={{
                  backgroundColor: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  color: "var(--text-primary)",
                }}
                placeholder="Enter description (optional)"
                rows={3}
              />
            </div>
            <div className="flex gap-3 justify-end">
              <Button
                type="button"
                onClick={() => setShowCreateModal(false)}
                variant="secondary"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={creating || !newPlaylistName.trim()}
                variant="primary"
                loading={creating}
              >
                Create
              </Button>
            </div>
          </div>
        </form>
      </Modal>

      {selectedRows.length > 0 && (
        <BulkActionBar
          selectedCount={selectedRows.length}
          countLabel="selected"
          onClearSelection={clearSelection}
          onSelectAll={selectAllShown}
          selectAllCount={ownRows.length}
          actions={
            <>
              <Button
                onClick={() => setCleanConfirmOpen(true)}
                variant="secondary"
                size="sm"
                disabled={removableTotal === 0}
                title={
                  removableTotal === 0
                    ? "Nothing deleted from Stash in the selection"
                    : "Remove the items deleted from Stash"
                }
              >
                Clean
              </Button>
              <Button
                onClick={() => setBulkDeleteConfirmOpen(true)}
                variant="destructive"
                size="sm"
                aria-label="Delete selected playlists"
              >
                Delete
              </Button>
            </>
          }
        />
      )}

      <ConfirmDialog
        isOpen={cleanConfirmOpen}
        onClose={() => setCleanConfirmOpen(false)}
        onConfirm={() => void confirmClean()}
        title="Clean playlists"
        message={
          <>
            <p>
              Remove {plural(removableTotal, "item", "items")} deleted from
              Stash from{" "}
              {plural(cleanablePlaylists.length, "playlist", "playlists")}?
            </p>
            <p className="mt-2">
              Hidden or restricted scenes, and scenes on servers you don&apos;t
              use, stay. Removed items can&apos;t come back.
            </p>
          </>
        }
        confirmText="Remove"
        cancelText="Cancel"
        confirmStyle="danger"
      />

      <ConfirmDialog
        isOpen={bulkDeleteConfirmOpen}
        onClose={() => setBulkDeleteConfirmOpen(false)}
        onConfirm={() => void confirmBulkDelete()}
        title="Delete playlists"
        message={`Delete ${plural(selectedRows.length, "playlist", "playlists")}? This cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmStyle="danger"
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setPlaylistToDelete(null);
        }}
        onConfirm={() => void confirmDelete()}
        title="Delete Playlist"
        message={`Are you sure you want to delete "${playlistToDelete?.name ?? ""}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmStyle="danger"
      />
    </PageLayout>
  );
};

export default Playlists;
