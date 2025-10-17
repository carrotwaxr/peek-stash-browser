import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";
import {
  getSceneTitle,
  getSceneDescription,
  formatFileSize,
} from "../../utils/format.js";
import { formatRelativeTime } from "../../utils/date.js";
import Tooltip from "../ui/Tooltip.jsx";
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
            {!isEditing && (
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
            )}
            {scenes.length > 0 && (
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
            {scenes.map((item) => {
              const scene = item.scene;
              const title = scene ? getSceneTitle(scene) : null;
              const description = scene ? getSceneDescription(scene) : null;

              return (
                <div
                  key={item.sceneId}
                  className="rounded-lg border transition-all hover:shadow-lg"
                  style={{
                    backgroundColor: "var(--bg-card)",
                    border: "1px solid var(--border-color)",
                    opacity: item.exists ? 1 : 0.6,
                  }}
                >
                  <div className="p-4">
                    <div className="flex gap-4">
                      {/* Thumbnail */}
                      <div className="flex-shrink-0 relative">
                        {item.exists && scene?.paths?.screenshot ? (
                          <div className="relative w-64 h-36 rounded overflow-hidden">
                            <img
                              src={scene.paths.screenshot}
                              alt={title || "Scene"}
                              className="w-full h-full object-cover"
                            />
                            {/* Overlay with duration and studio */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent">
                              {scene.studio && (
                                <div className="absolute top-2 right-2">
                                  <span className="px-2 py-1 bg-black/70 text-white text-xs rounded">
                                    {scene.studio.name}
                                  </span>
                                </div>
                              )}
                              {scene.files?.[0]?.duration && (
                                <div className="absolute bottom-2 right-2">
                                  <span className="px-2 py-1 bg-black/70 text-white text-xs rounded">
                                    {Math.floor(scene.files[0].duration / 60)}m
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div
                            className="w-64 h-36 rounded flex items-center justify-center"
                            style={{
                              backgroundColor: item.exists ? "var(--bg-secondary)" : "rgba(239, 68, 68, 0.1)",
                              border: item.exists ? "none" : "2px dashed rgba(239, 68, 68, 0.5)",
                            }}
                          >
                            <span
                              className="text-3xl"
                              style={{ color: item.exists ? "var(--text-muted)" : "rgb(239, 68, 68)" }}
                            >
                              {item.exists ? "📹" : "⚠️"}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1 min-w-0 pr-4">
                            {item.exists && scene ? (
                              <>
                                {/* Title */}
                                <Link
                                  to={`/scene/${item.sceneId}`}
                                  state={{
                                    scene: scene,
                                    playlist: {
                                      id: playlistId,
                                      name: playlist.name,
                                      scenes: scenes.filter(s => s.exists && s.scene).map((s, idx) => ({
                                        sceneId: s.sceneId,
                                        scene: s.scene,
                                        position: idx
                                      })),
                                      currentIndex: scenes.filter(s => s.exists && s.scene).findIndex(s => s.sceneId === item.sceneId)
                                    }
                                  }}
                                  className="font-semibold text-lg hover:underline block mb-1"
                                  style={{ color: "var(--text-primary)" }}
                                >
                                  {title}
                                </Link>

                                {/* Date */}
                                <div className="text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                                  {scene.date ? formatRelativeTime(scene.date) : "No date"}
                                </div>

                                {/* Stats Row */}
                                <div className="flex items-center gap-4 text-xs mb-2" style={{ color: "var(--text-muted)" }}>
                                  <span>⭐ {scene.rating100 ? `${Math.round(scene.rating100 / 20)}/5` : "No rating"}</span>
                                  <span>💦 {scene.o_counter || 0}</span>
                                  <span>▶ {scene.play_count || 0}</span>
                                  {scene.files?.[0]?.width && scene.files?.[0]?.height && (
                                    <span>{scene.files[0].width}×{scene.files[0].height}</span>
                                  )}
                                  {scene.files?.[0]?.size && (
                                    <span>{formatFileSize(scene.files[0].size)}</span>
                                  )}
                                </div>

                                {/* Description */}
                                {description && (
                                  <Tooltip content={description} disabled={description.length <= 150}>
                                    <p
                                      className="text-sm mb-2 leading-relaxed"
                                      style={{
                                        color: "var(--text-secondary)",
                                        display: "-webkit-box",
                                        WebkitLineClamp: 2,
                                        WebkitBoxOrient: "vertical",
                                        overflow: "hidden",
                                      }}
                                    >
                                      {description}
                                    </p>
                                  </Tooltip>
                                )}

                                {/* Performers & Tags */}
                                <div className="flex items-center gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
                                  {scene.performers && scene.performers.length > 0 && (
                                    <Tooltip content={
                                      <div>
                                        <div className="font-semibold mb-1">Performers:</div>
                                        {scene.performers.map((p) => p.name).join(", ")}
                                      </div>
                                    }>
                                      <span className="flex items-center gap-1">
                                        👥 {scene.performers.length}
                                      </span>
                                    </Tooltip>
                                  )}
                                  {scene.tags && scene.tags.length > 0 && (
                                    <Tooltip content={
                                      <div>
                                        <div className="font-semibold mb-1">Tags:</div>
                                        {scene.tags.map((t) => t.name).join(", ")}
                                      </div>
                                    }>
                                      <span className="flex items-center gap-1">
                                        🏷️ {scene.tags.length}
                                      </span>
                                    </Tooltip>
                                  )}
                                  {scene.organized && (
                                    <span className="text-green-500">✓ Organized</span>
                                  )}
                                </div>
                              </>
                            ) : (
                              <>
                                <h3
                                  className="text-lg font-semibold mb-2"
                                  style={{ color: "rgb(239, 68, 68)" }}
                                >
                                  ⚠️ Scene Deleted or Not Found
                                </h3>
                                <p className="text-sm mb-2" style={{ color: "var(--text-muted)" }}>
                                  Scene ID: {item.sceneId} • This scene was removed from Stash
                                </p>
                                <p className="text-xs px-2 py-1 rounded inline-block" style={{
                                  backgroundColor: "rgba(239, 68, 68, 0.1)",
                                  color: "rgb(239, 68, 68)",
                                }}>
                                  Click "Remove" to clean up this playlist
                                </p>
                              </>
                            )}
                          </div>

                          {/* Remove Button */}
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
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
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
