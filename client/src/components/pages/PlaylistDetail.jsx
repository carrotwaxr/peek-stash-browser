import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import { Shuffle, Repeat, Repeat1 } from "lucide-react";
import { getSceneTitle } from "../../utils/format.js";
import SceneListItem from "../ui/SceneListItem.jsx";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { showSuccess, showError } from "../../utils/toast.jsx";
import ConfirmDialog from "../ui/ConfirmDialog.jsx";

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
  const [reorderMode, setReorderMode] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState("none"); // "none", "all", "one"

  // Set page title to playlist name
  usePageTitle(playlist?.name || "Playlist");

  useEffect(() => {
    loadPlaylist();
  }, [playlistId]);

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
        const scenesWithDetails = playlistData.items.map(item => ({
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
      await api.delete(`/playlists/${playlistId}/items/${sceneToRemove.sceneId}`);
      showSuccess("Scene removed from playlist");
      loadPlaylist();
    } catch {
      showError("Failed to remove scene from playlist");
    } finally {
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
      const validScenes = scenes.filter(s => s.exists && s.scene);
      navigate(`/scene/${scenes[0].sceneId}`, {
        state: {
          scene: scenes[0].scene,
          playlist: {
            id: playlistId,
            name: playlist.name,
            shuffle,
            repeat,
            scenes: validScenes.map((s, idx) => ({
              sceneId: s.sceneId,
              scene: s.scene,
              position: idx
            })),
            currentIndex: 0
          }
        }
      });
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

  if (error || !playlist) {
    return (
      <div className="w-full py-8 px-4 lg:px-6 xl:px-8">
        <div className="text-center">
          <h2 className="text-2xl mb-4" style={{ color: "var(--text-primary)" }}>
            Playlist not found
          </h2>
          <Link to="/playlists" className="text-blue-500 hover:underline">
            Back to Playlists
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>

      <div className="w-full py-8 px-4 lg:px-6 xl:px-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={() => navigate("/playlists")}
              className="px-4 py-2 rounded-lg"
              style={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            >
              ← Back
            </button>
            {!isEditing && !reorderMode && (
              <>
                <button
                  onClick={() => setIsEditing(true)}
                  className="px-4 py-2 rounded-lg"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  Edit
                </button>
                {scenes.length > 1 && (
                  <button
                    onClick={() => setReorderMode(true)}
                    className="px-4 py-2 rounded-lg"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  >
                    Reorder
                  </button>
                )}
              </>
            )}
            {reorderMode && (
              <>
                <button
                  onClick={saveReorder}
                  className="px-4 py-2 rounded-lg"
                  style={{
                    backgroundColor: "var(--accent-color)",
                    color: "white",
                  }}
                >
                  Save Order
                </button>
                <button
                  onClick={cancelReorder}
                  className="px-4 py-2 rounded-lg"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  Cancel
                </button>
              </>
            )}
            {scenes.length > 0 && !reorderMode && !isEditing && (
              <>
                <button
                  onClick={toggleShuffle}
                  className="p-2 rounded-lg transition-colors"
                  style={{
                    backgroundColor: shuffle
                      ? "var(--accent-color)"
                      : "var(--bg-card)",
                    border: "1px solid var(--border-color)",
                    color: shuffle ? "white" : "var(--text-primary)",
                  }}
                  title={shuffle ? "Shuffle enabled" : "Shuffle disabled"}
                >
                  <Shuffle size={20} />
                </button>
                <button
                  onClick={cycleRepeat}
                  className="p-2 rounded-lg transition-colors"
                  style={{
                    backgroundColor:
                      repeat !== "none" ? "var(--accent-color)" : "var(--bg-card)",
                    border: "1px solid var(--border-color)",
                    color: repeat !== "none" ? "white" : "var(--text-primary)",
                  }}
                  title={
                    repeat === "all"
                      ? "Repeat all"
                      : repeat === "one"
                      ? "Repeat one"
                      : "Repeat off"
                  }
                >
                  {repeat === "one" ? <Repeat1 size={20} /> : <Repeat size={20} />}
                </button>
                <button
                  onClick={playPlaylist}
                  className="px-6 py-2 rounded-lg font-medium"
                  style={{
                    backgroundColor: "var(--accent-color)",
                    color: "white",
                  }}
                >
                  ▶ Play Playlist
                </button>
              </>
            )}
          </div>

          {isEditing ? (
            <form onSubmit={updatePlaylist} className="card max-w-2xl" style={{
              backgroundColor: "var(--bg-card)",
              border: "1px solid var(--border-color)",
            }}>
              <div className="card-body space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
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
                  <label className="block text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>
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
                <div className="flex gap-3">
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-lg"
                    style={{
                      backgroundColor: "var(--accent-color)",
                      color: "white",
                    }}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditName(playlist.name);
                      setEditDescription(playlist.description || "");
                    }}
                    className="px-4 py-2 rounded-lg"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      border: "1px solid var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </form>
          ) : (
            <>
              <h1 className="text-3xl font-bold mb-2" style={{ color: "var(--text-primary)" }}>
                {playlist.name}
              </h1>
              {playlist.description && (
                <p style={{ color: "var(--text-secondary)" }}>{playlist.description}</p>
              )}
              <p className="text-sm mt-2" style={{ color: "var(--text-muted)" }}>
                {scenes.length} {scenes.length === 1 ? "video" : "videos"}
              </p>
            </>
          )}
        </div>

        {/* Scenes List */}
        {scenes.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-6xl mb-4" style={{ color: "var(--text-muted)" }}>
              🎬
            </div>
            <h3 className="text-xl font-medium mb-2" style={{ color: "var(--text-primary)" }}>
              No scenes in this playlist yet
            </h3>
            <p style={{ color: "var(--text-secondary)" }}>
              Browse scenes and add them to this playlist
            </p>
            <Link
              to="/scenes"
              className="inline-block mt-4 px-6 py-2 rounded-lg"
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
                Drag and drop scenes to reorder them. Click "Save Order" when done.
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
                  <button
                    onClick={() => handleRemoveClick(item)}
                    className="px-3 py-1 rounded hover:bg-red-500 hover:text-white transition-colors flex-shrink-0"
                    style={{
                      backgroundColor: "rgba(239, 68, 68, 0.1)",
                      color: "rgb(239, 68, 68)",
                      height: "fit-content",
                    }}
                  >
                    Remove
                  </button>
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Remove Scene Confirmation Dialog */}
      <ConfirmDialog
        isOpen={removeConfirmOpen}
        onClose={() => {
          setRemoveConfirmOpen(false);
          setSceneToRemove(null);
        }}
        onConfirm={confirmRemove}
        title="Remove Scene"
        message={`Remove "${sceneToRemove?.scene ? getSceneTitle(sceneToRemove.scene) : 'this scene'}" from the playlist?`}
        confirmText="Remove"
        cancelText="Cancel"
        confirmStyle="danger"
      />
    </>
  );
};

export default PlaylistDetail;
