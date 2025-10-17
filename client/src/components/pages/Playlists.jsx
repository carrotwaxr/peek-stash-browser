import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import axios from "axios";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { showSuccess, showError } from "../../utils/toast.jsx";
import ConfirmDialog from "../ui/ConfirmDialog.jsx";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const Playlists = () => {
  usePageTitle("Playlists");
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDescription, setNewPlaylistDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [playlistToDelete, setPlaylistToDelete] = useState(null);

  useEffect(() => {
    loadPlaylists();
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
      setPlaylistToDelete(null);
    }
  };

  if (loading) {
    return (
      <div className="w-full py-8 px-4 lg:px-6 xl:px-8">
        <div className="flex items-center justify-center">
          <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full"></div>
        </div>
      </div>
    );
  }

  return (
    <>

      <div className="w-full py-8 px-4 lg:px-6 xl:px-8">
        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1
              className="text-3xl font-bold mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              My Playlists
            </h1>
            <p style={{ color: "var(--text-secondary)" }}>
              Create and manage your video playlists
            </p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 rounded-lg font-medium"
            style={{
              backgroundColor: "var(--accent-color)",
              color: "white",
            }}
          >
            + New Playlist
          </button>
        </div>

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

        {/* Playlists Grid */}
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {playlists.map((playlist) => (
              <div
                key={playlist.id}
                className="card"
                style={{
                  backgroundColor: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                }}
              >
                <div className="card-body">
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
                      {playlist._count.items}{" "}
                      {playlist._count.items === 1 ? "video" : "videos"}
                    </span>
                    <button
                      onClick={() => handleDeleteClick(playlist)}
                      className="px-3 py-1 rounded hover:bg-red-500 hover:text-white transition-colors"
                      style={{
                        backgroundColor: "rgba(239, 68, 68, 0.1)",
                        color: "rgb(239, 68, 68)",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Playlist Modal */}
      {showCreateModal && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
          onClick={() => setShowCreateModal(false)}
        >
          <div
            className="card max-w-md w-full m-4"
            style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-color)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="card-header">
              <h2
                className="text-xl font-semibold"
                style={{ color: "var(--text-primary)" }}
              >
                Create New Playlist
              </h2>
            </div>
            <form onSubmit={createPlaylist} className="card-body">
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
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-4 py-2 rounded-lg"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !newPlaylistName.trim()}
                    className="px-4 py-2 rounded-lg"
                    style={{
                      backgroundColor: "var(--accent-color)",
                      color: "white",
                      opacity: creating || !newPlaylistName.trim() ? 0.6 : 1,
                    }}
                  >
                    {creating ? "Creating..." : "Create"}
                  </button>
                </div>
              </div>
            </form>
          </div>
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
    </>
  );
};

export default Playlists;
