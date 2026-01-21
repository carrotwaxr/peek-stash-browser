import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { showError, showSuccess, showWarning } from "../../utils/toast.jsx";
import { ThemedIcon } from "../icons/index.js";
import Button from "./Button.jsx";
import Paper from "./Paper.jsx";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const AddToPlaylistButton = ({
  sceneId,
  sceneIds,
  compact = false,
  buttonText,
  icon,
  dropdownPosition = "below", // "below" or "above"
  onSuccess, // Optional callback called after successful add
  excludePlaylistIds = [], // Playlist IDs to exclude from the list
  variant = "primary", // Button variant
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDescription, setNewPlaylistDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const menuRef = useRef(null);

  // Support both single sceneId and multiple sceneIds
  const scenesToAdd = sceneIds || (sceneId ? [sceneId] : []);
  const isMultiple = scenesToAdd.length > 1;

  useEffect(() => {
    if (showMenu && playlists.length === 0) {
      loadPlaylists();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMenu]); // Only load when menu opens, not when playlists.length changes

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [showMenu]);

  const loadPlaylists = async () => {
    try {
      setLoading(true);
      const response = await api.get("/playlists");
      setPlaylists(response.data.playlists || []);
    } catch {
      // Error loading playlists - will show in UI
    } finally {
      setLoading(false);
    }
  };

  const addToPlaylist = async (playlistId, skipToast = false) => {
    try {
      // Add scenes one by one (could be optimized with a batch endpoint later)
      let addedCount = 0;
      let skippedCount = 0;

      for (const sceneId of scenesToAdd) {
        try {
          await api.post(`/playlists/${playlistId}/items`, { sceneId });
          addedCount++;
        } catch (err) {
          if (err.response?.status === 400) {
            skippedCount++; // Already in playlist
          } else {
            throw err; // Re-throw for outer catch
          }
        }
      }

      // Show appropriate message (unless skipToast is true)
      if (!skipToast) {
        if (addedCount > 0 && skippedCount === 0) {
          showSuccess(
            isMultiple
              ? `Added ${addedCount} scenes to playlist!`
              : "Added to playlist!"
          );
        } else if (addedCount > 0 && skippedCount > 0) {
          showWarning(
            `Added ${addedCount} scenes, ${skippedCount} already in playlist`
          );
        } else if (skippedCount > 0) {
          showWarning(
            isMultiple
              ? "All scenes already in playlist"
              : "Scene already in playlist"
          );
        }
      }

      setShowMenu(false);

      // Call onSuccess callback if provided
      if (onSuccess && addedCount > 0) {
        onSuccess();
      }

      return { addedCount, skippedCount };
    } catch (err) {
      showError("Failed to add to playlist");
      throw err;
    }
  };

  const createPlaylistAndAdd = async (e) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    try {
      setCreating(true);
      const response = await api.post("/playlists", {
        name: newPlaylistName.trim(),
        description: newPlaylistDescription.trim() || undefined,
      });

      const newPlaylistId = response.data.playlist.id;

      // Add scenes to the newly created playlist (skip the toast, we'll show our own)
      const { addedCount } = await addToPlaylist(newPlaylistId, true);

      showSuccess(
        `Playlist created and ${addedCount} ${addedCount === 1 ? "scene" : "scenes"} added!`
      );
      setNewPlaylistName("");
      setNewPlaylistDescription("");
      setShowCreateModal(false);
      setShowMenu(false);

      // Reload playlists for next time
      loadPlaylists();
    } catch {
      showError("Failed to create playlist");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <Button
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        variant={compact ? "secondary" : variant}
        icon={icon || null}
        title="Add to playlist"
      >
        {compact ? (
          <ThemedIcon name="list-plus" size={16} />
        ) : (
          buttonText || "+ Playlist"
        )}
      </Button>

      {showMenu && (
        <div
          className={`absolute right-0 w-64 rounded-lg shadow-lg z-50 ${
            dropdownPosition === "above" ? "bottom-full mb-2" : "mt-2"
          }`}
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-color)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="p-2 border-b"
            style={{ borderColor: "var(--border-color)" }}
          >
            <h3
              className="font-semibold text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              {isMultiple
                ? `Add ${scenesToAdd.length} Scenes to Playlist`
                : "Add to Playlist"}
            </h3>
          </div>

          <div className="max-h-64 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center">
                <div className="animate-spin w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
              </div>
            ) : (
              <div className="py-1">
                {/* Create New Playlist Option */}
                <Button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowCreateModal(true);
                  }}
                  variant="tertiary"
                  fullWidth
                  className="text-left px-4 py-2 text-sm font-medium border-b"
                  style={{
                    color: "var(--accent-color)",
                    borderColor: "var(--border-color)",
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.backgroundColor = "var(--bg-secondary)";
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.backgroundColor = "transparent";
                  }}
                >
                  + Create New Playlist
                </Button>

                {/* Existing Playlists */}
                {playlists.length === 0 ? (
                  <div className="p-4 text-center">
                    <p
                      className="text-sm"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      No playlists yet
                    </p>
                  </div>
                ) : (
                  playlists
                    .filter((playlist) => !excludePlaylistIds.includes(playlist.id))
                    .map((playlist) => (
                      <Button
                        key={playlist.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          addToPlaylist(playlist.id);
                        }}
                        variant="tertiary"
                        fullWidth
                        className="text-left px-4 py-2 text-sm"
                        style={{
                          color: "var(--text-primary)",
                        }}
                        onMouseEnter={(e) => {
                          e.target.style.backgroundColor = "var(--bg-secondary)";
                        }}
                        onMouseLeave={(e) => {
                          e.target.style.backgroundColor = "transparent";
                        }}
                      >
                        <div>{playlist.name}</div>
                        <div
                          className="text-xs"
                          style={{ color: "var(--text-muted)" }}
                        >
                          {playlist._count?.items || 0} videos
                        </div>
                      </Button>
                    ))
                )}
              </div>
            )}
          </div>
        </div>
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
            <form onSubmit={createPlaylistAndAdd}>
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
                      Create & Add
                    </Button>
                  </div>
                </div>
              </Paper.Body>
            </form>
          </Paper>
        </div>
      )}
    </div>
  );
};

export default AddToPlaylistButton;
