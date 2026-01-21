import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { showError, showSuccess } from "../../utils/toast.jsx";
import { getSharedPlaylists } from "../../services/api.js";
import {
  Button,
  ConfirmDialog,
  PageLayout,
  Paper,
  TabNavigation,
  TAB_COUNT_LOADING,
} from "../ui/index.js";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

/**
 * Reusable 2x2 thumbnail grid for playlist preview
 */
const PlaylistThumbnailGrid = ({ items, totalCount }) => {
  if (!items || items.length === 0) return null;

  return (
    <div className="flex-shrink-0 w-32 h-32">
      <div className="grid grid-cols-2 gap-1 w-full h-full rounded-lg overflow-hidden">
        {items.slice(0, 4).map((item, idx) => (
          <div
            key={item.scene?.id || idx}
            className="aspect-square overflow-hidden"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          >
            {item.scene?.paths?.screenshot ? (
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

const Playlists = () => {
  usePageTitle("Playlists");
  const [searchParams] = useSearchParams();
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDescription, setNewPlaylistDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [playlistToDelete, setPlaylistToDelete] = useState(null);
  const [sharedPlaylists, setSharedPlaylists] = useState([]);
  const [loadingShared, setLoadingShared] = useState(false);
  const [sharedLoaded, setSharedLoaded] = useState(false);

  // Get active tab from URL or default to "mine"
  const activeTab = searchParams.get("tab") || "mine";

  useEffect(() => {
    // Load both playlist types on mount
    loadPlaylists();
    loadSharedPlaylists();
  }, []);

  const loadPlaylists = async () => {
    try {
      setLoading(true);
      const response = await api.get("/playlists");
      setPlaylists(response.data.playlists);
    } catch {
      setError("Failed to load playlists");
    } finally {
      setLoading(false);
    }
  };

  const loadSharedPlaylists = async () => {
    try {
      setLoadingShared(true);
      const response = await getSharedPlaylists();
      setSharedPlaylists(response.playlists);
      setSharedLoaded(true);
    } catch {
      // Silently fail for shared - not critical
    } finally {
      setLoadingShared(false);
    }
  };

  const createPlaylist = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    try {
      setCreating(true);
      await api.post("/playlists", {
        name: newPlaylistName.trim(),
        description: newPlaylistDescription.trim() || undefined,
      });

      showSuccess("Playlist created successfully!");
      setNewPlaylistName("");
      setNewPlaylistDescription("");
      setShowCreateModal(false);
      loadPlaylists();
    } catch {
      showError("Failed to create playlist");
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteClick = (playlist) => {
    setPlaylistToDelete(playlist);
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!playlistToDelete) return;

    try {
      await api.delete(`/playlists/${playlistToDelete.id}`);
      showSuccess("Playlist deleted");
      loadPlaylists();
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
    { id: "shared", label: "Shared with Me", count: sharedLoaded ? sharedPlaylists.length : TAB_COUNT_LOADING },
  ];

  return (
    <PageLayout>
      {/* Header with New Playlist button */}
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-4">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
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
            <div
              className="mb-6 p-4 rounded-lg"
              style={{
                backgroundColor: "rgba(239, 68, 68, 0.1)",
                border: "1px solid rgba(239, 68, 68, 0.3)",
                color: "rgb(239, 68, 68)",
              }}
            >
              {error}
            </div>
          )}

          {/* My Playlists Grid */}
          {playlists.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-6xl mb-4" style={{ color: "var(--text-muted)" }}>
                📝
              </div>
              <h3
                className="text-xl font-medium mb-2"
                style={{ color: "var(--text-primary)" }}
              >
                No playlists yet
              </h3>
              <p style={{ color: "var(--text-secondary)" }}>
                Create your first playlist to get started
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
              {playlists.map((playlist) => (
                <Paper key={playlist.id}>
                  <Paper.Body>
                    <div className="flex gap-4">
                      <PlaylistThumbnailGrid
                        items={playlist.items}
                        totalCount={playlist._count?.items || 0}
                      />
                      <div className="flex-1 min-w-0">
                        <Link to={`/playlist/${playlist.id}`}>
                          <h3
                            className="text-lg font-semibold mb-2 hover:underline"
                            style={{ color: "var(--text-primary)" }}
                          >
                            {playlist.name}
                          </h3>
                        </Link>
                        {playlist.description && (
                          <p
                            className="text-sm mb-4 line-clamp-2"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {playlist.description}
                          </p>
                        )}
                        <div
                          className="flex items-center justify-between text-sm"
                          style={{ color: "var(--text-muted)" }}
                        >
                          <span>
                            {playlist._count?.items || 0}{" "}
                            {(playlist._count?.items || 0) === 1 ? "video" : "videos"}
                          </span>
                          <Button
                            onClick={() => handleDeleteClick(playlist)}
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
              ))}
            </div>
          )}
        </>
      ) : (
        // Shared playlists view
        loadingShared ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
          </div>
        ) : sharedPlaylists.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4" style={{ color: "var(--text-muted)" }}>
              📤
            </div>
            <h3 className="text-xl font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              No shared playlists
            </h3>
            <p style={{ color: "var(--text-secondary)" }}>
              Playlists shared with your groups will appear here
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-6">
            {sharedPlaylists.map((playlist) => (
              <Paper key={playlist.id}>
                <Paper.Body>
                  <div className="flex gap-4">
                    <PlaylistThumbnailGrid
                      items={playlist.items}
                      totalCount={playlist.sceneCount || 0}
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
                      {playlist.description && (
                        <p
                          className="text-sm mb-4 line-clamp-2"
                          style={{ color: "var(--text-secondary)" }}
                        >
                          {playlist.description}
                        </p>
                      )}
                      <div
                        className="flex items-center justify-between text-sm"
                        style={{ color: "var(--text-muted)" }}
                      >
                        <span>
                          {playlist.sceneCount} {playlist.sceneCount === 1 ? "video" : "videos"}
                        </span>
                        <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: "var(--bg-tertiary)" }}>
                          via {playlist.sharedViaGroups.join(", ")}
                        </span>
                      </div>
                    </div>
                  </div>
                </Paper.Body>
              </Paper>
            ))}
          </div>
        )
      )}

      {/* Create Playlist Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowCreateModal(false)}
        >
          <Paper
            className="max-w-md w-full m-4"
            onClick={(e) => e.stopPropagation()}
          >
            <Paper.Header title="Create New Playlist" />
            <form onSubmit={createPlaylist}>
              <Paper.Body>
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
                      autoFocus
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
                      onChange={(e) =>
                        setNewPlaylistDescription(e.target.value)
                      }
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
              </Paper.Body>
            </form>
          </Paper>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={deleteConfirmOpen}
        onClose={() => {
          setDeleteConfirmOpen(false);
          setPlaylistToDelete(null);
        }}
        onConfirm={confirmDelete}
        title="Delete Playlist"
        message={`Are you sure you want to delete "${playlistToDelete?.name}"? This action cannot be undone.`}
        confirmText="Delete"
        cancelText="Cancel"
        confirmStyle="danger"
      />
    </PageLayout>
  );
};

export default Playlists;
