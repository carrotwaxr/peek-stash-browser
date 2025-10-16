import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import axios from "axios";

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

      // Fetch scene details from Stash for each item
      if (playlistData.items.length > 0) {
        await loadSceneDetails(playlistData.items);
      } else {
        setScenes([]);
      }
    } catch (err) {
      console.error("Failed to load playlist:", err);
      setError("Failed to load playlist");
    } finally {
      setLoading(false);
    }
  };

  const loadSceneDetails = async (items) => {
    try {
      // Fetch all scenes from library (we'll filter client-side)
      const response = await api.post("/library/scenes", {
        filter: {},
        page: 1,
        perPage: 1000, // Get enough to cover playlists
      });

      const allScenes = response.data.scenes || [];

      // Map playlist items to full scene objects
      const sceneMap = new Map(allScenes.map(s => [s.id, s]));
      const scenesWithDetails = items.map(item => ({
        ...item,
        scene: sceneMap.get(item.sceneId),
        exists: sceneMap.has(item.sceneId),
      }));

      setScenes(scenesWithDetails);
    } catch (err) {
      console.error("Failed to load scene details:", err);
      // Set scenes without details
      setScenes(items.map(item => ({ ...item, exists: false })));
    }
  };

  const updatePlaylist = async (e) => {
    e.preventDefault();
    try {
      await api.put(`/playlists/${playlistId}`, {
        name: editName.trim(),
        description: editDescription.trim() || undefined,
      });
      setIsEditing(false);
      loadPlaylist();
    } catch (err) {
      console.error("Failed to update playlist:", err);
      alert("Failed to update playlist");
    }
  };

  const removeScene = async (sceneId) => {
    if (!confirm("Remove this scene from the playlist?")) return;

    try {
      await api.delete(`/playlists/${playlistId}/items/${sceneId}`);
      loadPlaylist();
    } catch (err) {
      console.error("Failed to remove scene:", err);
      alert("Failed to remove scene from playlist");
    }
  };

  const playPlaylist = () => {
    // Play first scene in playlist
    if (scenes.length > 0 && scenes[0].exists && scenes[0].scene) {
      navigate(`/player/${scenes[0].sceneId}`, { state: { scene: scenes[0].scene } });
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
          <div className="space-y-4">
            {scenes.map((item, index) => (
              <div
                key={item.sceneId}
                className="card"
                style={{
                  backgroundColor: "var(--bg-card)",
                  border: "1px solid var(--border-color)",
                  opacity: item.exists ? 1 : 0.5,
                }}
              >
                <div className="card-body">
                  <div className="flex gap-4">
                    {/* Thumbnail */}
                    <div className="flex-shrink-0">
                      {item.exists && item.scene?.paths?.screenshot ? (
                        <img
                          src={item.scene.paths.screenshot}
                          alt={item.scene?.title || "Scene"}
                          className="w-40 h-24 object-cover rounded"
                        />
                      ) : (
                        <div
                          className="w-40 h-24 rounded flex items-center justify-center"
                          style={{
                            backgroundColor: item.exists ? "var(--bg-secondary)" : "rgba(239, 68, 68, 0.1)",
                            border: item.exists ? "none" : "2px dashed rgba(239, 68, 68, 0.5)",
                          }}
                        >
                          <span
                            className="text-2xl"
                            style={{ color: item.exists ? "var(--text-muted)" : "rgb(239, 68, 68)" }}
                          >
                            {item.exists ? "No Image" : "⚠️"}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Details */}
                    <div className="flex-1">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          {item.exists && item.scene ? (
                            <>
                              <Link
                                to={`/player/${item.sceneId}`}
                                state={{ scene: item.scene }}
                                className="text-lg font-semibold hover:underline"
                                style={{ color: "var(--text-primary)" }}
                              >
                                {item.scene.title}
                              </Link>
                              <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
                                Position {index + 1}
                              </p>
                            </>
                          ) : (
                            <>
                              <h3
                                className="text-lg font-semibold"
                                style={{ color: "rgb(239, 68, 68)" }}
                              >
                                ⚠️ Scene Deleted or Not Found
                              </h3>
                              <p className="text-sm mt-1" style={{ color: "var(--text-muted)" }}>
                                Scene ID: {item.sceneId} • This scene was removed from Stash
                              </p>
                              <p className="text-xs mt-1 px-2 py-1 rounded inline-block" style={{
                                backgroundColor: "rgba(239, 68, 68, 0.1)",
                                color: "rgb(239, 68, 68)",
                              }}>
                                Click "Remove" to clean up this playlist
                              </p>
                            </>
                          )}
                        </div>
                        <button
                          onClick={() => removeScene(item.sceneId)}
                          className="px-3 py-1 rounded hover:bg-red-500 hover:text-white transition-colors ml-4"
                          style={{
                            backgroundColor: "rgba(239, 68, 68, 0.1)",
                            color: "rgb(239, 68, 68)",
                          }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
};

export default PlaylistDetail;
