import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  ArrowLeft,
  ArrowUpDown,
  Edit2,
  Play,
  Repeat,
  Repeat1,
  Save,
  Shuffle,
  X,
} from "lucide-react";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { getSceneTitle } from "../../utils/format.js";
import { showError, showSuccess } from "../../utils/toast.jsx";
import {
  Button,
  ConfirmDialog,
  PageHeader,
  PageLayout,
  Paper,
  SceneListItem,
} from "../ui/index.js";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const PlaylistDetail = () => {
  const { playlistId } = useParams();
  const navigate = useNavigate();
  const [playlist, setPlaylist] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [sceneToRemove, setSceneToRemove] = useState(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [touchStartY, setTouchStartY] = useState(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState("none"); // "none", "all", "one"

  // Set page title to playlist name
  usePageTitle(playlist?.name || "Playlist");

  useEffect(() => {
    loadPlaylist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId]); // loadPlaylist is stable and doesn't need to be in dependencies

  const loadPlaylist = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/playlists/${playlistId}`);
      const playlistData = response.data.playlist;
      setPlaylist(playlistData);
      setEditName(playlistData.name);
      setEditDescription(playlistData.description || "");
      setShuffle(playlistData.shuffle || false);
      setRepeat(playlistData.repeat || "none");

      // Backend now returns items with scene data attached
      if (playlistData.items && playlistData.items.length > 0) {
        const scenesWithDetails = playlistData.items.map((item) => ({
          ...item,
          exists: item.scene !== null && item.scene !== undefined,
        }));
        setScenes(scenesWithDetails);
      } else {
        setScenes([]);
      }
    } catch {
      setError("Failed to load playlist");
    } finally {
      setLoading(false);
    }
  };

  const updatePlaylist = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/playlists/${playlistId}`, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      showSuccess("Playlist updated successfully!");
      setIsEditing(false);
      loadPlaylist();
    } catch {
      showError("Failed to update playlist");
    }
  };

  const handleRemoveClick = (scene) => {
    setSceneToRemove(scene);
    setRemoveConfirmOpen(true);
  };

  const confirmRemove = async () => {
    if (!sceneToRemove) return;

    try {
      await api.delete(
        `/playlists/${playlistId}/items/${sceneToRemove.sceneId}`
      );
      // Optimistically update local state instead of refetching
      setScenes((prev) =>
        prev.filter((item) => item.sceneId !== sceneToRemove.sceneId)
      );
      showSuccess("Scene removed from playlist");
    } catch {
      showError("Failed to remove scene from playlist");
    } finally {
      setRemoveConfirmOpen(false);
      setSceneToRemove(null);
    }
  };

  // Drag and drop handlers
  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;

    // Reorder the scenes array
    const newScenes = [...scenes];
    const draggedItem = newScenes[draggedIndex];
    newScenes.splice(draggedIndex, 1);
    newScenes.splice(index, 0, draggedItem);

    setScenes(newScenes);
    setDraggedIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // Touch event handlers for mobile support
  const handleTouchStart = (e, index) => {
    e.preventDefault(); // Prevent scrolling during drag
    setDraggedIndex(index);
    setTouchStartY(e.touches[0].clientY);
  };

  const handleTouchMove = (e, index) => {
    e.preventDefault(); // Prevent scrolling - must be first

    if (draggedIndex === null || touchStartY === null) {
      return;
    }

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartY;

    // Minimum threshold to trigger reorder
    if (Math.abs(deltaY) < 50) {
      return;
    }

    const targetIndex = deltaY < 0 ? draggedIndex - 1 : draggedIndex + 1;

    // Ensure target index is within bounds
    if (targetIndex < 0 || targetIndex >= scenes.length) {
      return;
    }

    if (targetIndex === index) {
      return; // Already at target position
    }

    // Reorder the scenes array
    const newScenes = [...scenes];
    const draggedItem = newScenes[draggedIndex];
    newScenes.splice(draggedIndex, 1);
    newScenes.splice(targetIndex, 0, draggedItem);

    setScenes(newScenes);
    setDraggedIndex(targetIndex);
    setTouchStartY(currentY);
  };

  const handleTouchEnd = () => {
    setDraggedIndex(null);
    setTouchStartY(null);
  };

  const saveReorder = async () => {
    try {
      // Prepare items array with new positions
      const items = scenes.map((scene, index) => ({
        sceneId: scene.sceneId,
        position: index,
      }));

      await api.put(`/playlists/${playlistId}/reorder`, { items });
      showSuccess("Playlist order saved");
      setReorderMode(false);
    } catch {
      showError("Failed to save playlist order");
      // Reload to reset order
      loadPlaylist();
    }
  };

  const cancelReorder = () => {
    setReorderMode(false);
    loadPlaylist(); // Reset to original order
  };

  const toggleShuffle = async () => {
    const newShuffle = !shuffle;
    try {
      await api.put(`/playlists/${playlistId}`, { shuffle: newShuffle });
      setShuffle(newShuffle);
      showSuccess(newShuffle ? "Shuffle enabled" : "Shuffle disabled");
    } catch {
      showError("Failed to update shuffle mode");
    }
  };

  const cycleRepeat = async () => {
    const repeatModes = ["none", "all", "one"];
    const currentIndex = repeatModes.indexOf(repeat);
    const newRepeat = repeatModes[(currentIndex + 1) % repeatModes.length];
    try {
      await api.put(`/playlists/${playlistId}`, { repeat: newRepeat });
      setRepeat(newRepeat);
      const messages = {
        none: "Repeat disabled",
        all: "Repeat all enabled",
        one: "Repeat one enabled",
      };
      showSuccess(messages[newRepeat]);
    } catch {
      showError("Failed to update repeat mode");
    }
  };

  const playPlaylist = () => {
    // Play first scene in playlist with playlist context
    if (scenes.length > 0 && scenes[0].exists && scenes[0].scene) {
      const validScenes = scenes.filter((s) => s.exists && s.scene);

      // If shuffle is enabled, pick a random scene to start with
      const startIndex = shuffle ? Math.floor(Math.random() * validScenes.length) : 0;
      const startScene = validScenes[startIndex];

      navigate(`/scene/${startScene.sceneId}`, {
        state: {
          scene: startScene.scene,
          shouldAutoplay: true, // Start playing immediately when entering from playlist
          playlist: {
            id: playlistId,
            name: playlist.name,
            autoplayNext: true, // Default to autoplay enabled
            shuffle,
            repeat,
            shuffleHistory: [], // Initialize empty history
            scenes: validScenes.map((s, idx) => ({
              sceneId: s.sceneId,
              scene: s.scene,
              position: idx,
            })),
            currentIndex: startIndex,
          },
        },
      });
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

  if (error || !playlist) {
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

  return (
    <>
      <PageLayout>
        {/* Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-1 sm:gap-2 mb-4">
            {/* Back button */}
            <Button
              onClick={() => navigate("/playlists")}
              variant="secondary"
              icon={<ArrowLeft size={16} className="sm:w-4 sm:h-4" />}
              title="Back to Playlists"
            >
              <span className="hidden sm:inline">Back to Playlists</span>
            </Button>

            {!isEditing && !reorderMode && (
              <>
                {/* Edit button */}
                <Button
                  onClick={() => setIsEditing(true)}
                  variant="primary"
                  icon={<Edit2 size={16} className="sm:w-4 sm:h-4" />}
                  title="Edit Playlist"
                >
                  <span className="hidden sm:inline">Edit</span>
                </Button>

                {/* Reorder button */}
                {scenes.length > 1 && (
                  <Button
                    onClick={() => setReorderMode(true)}
                    variant="secondary"
                    icon={<ArrowUpDown size={16} className="sm:w-4 sm:h-4" />}
                    title="Reorder Scenes"
                  >
                    <span className="hidden sm:inline">Reorder</span>
                  </Button>
                )}
              </>
            )}

            {reorderMode && (
              <>
                {/* Save Order button */}
                <Button
                  onClick={saveReorder}
                  variant="primary"
                  icon={<Save size={16} className="sm:w-4 sm:h-4" />}
                  title="Save Order"
                >
                  <span className="hidden sm:inline">Save Order</span>
                </Button>

                {/* Cancel button */}
                <Button
                  onClick={cancelReorder}
                  variant="destructive"
                  icon={<X size={16} className="sm:w-4 sm:h-4" />}
                  title="Cancel"
                >
                  <span className="hidden sm:inline">Cancel</span>
                </Button>
              </>
            )}

            {scenes.length > 0 && !reorderMode && !isEditing && (
              <>
                {/* Shuffle button */}
                <Button
                  onClick={toggleShuffle}
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
                  onClick={cycleRepeat}
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
            <form onSubmit={updatePlaylist}>
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
                        setEditName(playlist.name);
                        setEditDescription(playlist.description || "");
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
                subtitle={playlist.description}
              />
              <p
                className="text-sm mt-2"
                style={{ color: "var(--text-muted)" }}
              >
                {scenes.length} {scenes.length === 1 ? "video" : "videos"}
              </p>
            </>
          )}
        </div>

        {/* Scenes List */}
        {scenes.length === 0 ? (
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
                Drag and drop scenes to reorder them. Click "Save Order" when
                done.
              </div>
            )}
            {scenes.map((item, index) => (
              <SceneListItem
                key={item.sceneId}
                scene={item.scene}
                exists={item.exists}
                sceneId={item.sceneId}
                draggable={reorderMode}
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                onTouchStart={(e) => handleTouchStart(e, index)}
                onTouchMove={(e) => handleTouchMove(e, index)}
                onTouchEnd={handleTouchEnd}
                linkState={{
                  scene: item.scene,
                  playlist: {
                    id: playlistId,
                    name: playlist.name,
                    shuffle,
                    repeat,
                    scenes: scenes
                      .filter((s) => s.exists && s.scene)
                      .map((s, idx) => ({
                        sceneId: s.sceneId,
                        scene: s.scene,
                        position: idx,
                      })),
                    currentIndex: scenes
                      .filter((s) => s.exists && s.scene)
                      .findIndex((s) => s.sceneId === item.sceneId),
                  },
                }}
                dragHandle={
                  reorderMode && (
                    <div
                      className="flex-shrink-0 flex flex-col items-center justify-center"
                      style={{
                        width: "24px",
                        color: "var(--text-muted)",
                        cursor: "move",
                      }}
                    >
                      <div className="text-xs font-mono">⋮⋮</div>
                      <div className="text-xs mt-1">{index + 1}</div>
                    </div>
                  )
                }
                actionButtons={
                  <Button
                    onClick={() => handleRemoveClick(item)}
                    variant="destructive"
                    size="sm"
                    className="px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm flex-shrink-0"
                  >
                    Remove
                  </Button>
                }
              />
            ))}
          </div>
        )}
      </PageLayout>

      {/* Remove Scene Confirmation Dialog */}
      <ConfirmDialog
        isOpen={removeConfirmOpen}
        onClose={() => {
          setRemoveConfirmOpen(false);
          setSceneToRemove(null);
        }}
        onConfirm={confirmRemove}
        title="Remove Scene"
        message={`Remove "${
          sceneToRemove?.scene
            ? getSceneTitle(sceneToRemove.scene)
            : "this scene"
        }" from the playlist?`}
        confirmText="Remove"
        cancelText="Cancel"
        confirmStyle="danger"
      />
    </>
  );
};

export default PlaylistDetail;
