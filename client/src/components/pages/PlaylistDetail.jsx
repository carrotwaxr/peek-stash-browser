import { useEffect, useState, useCallback } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  ArrowLeft,
  ArrowUpDown,
  ChevronUp,
  ChevronDown,
  ChevronsUp,
  ChevronsDown,
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
import { useNavigationState } from "../../hooks/useNavigationState.js";
import { usePageTitle } from "../../hooks/usePageTitle.js";
import { useConfig } from "../../contexts/ConfigContext.jsx";
import { getEntityPath } from "../../utils/entityLinks.js";
import { apiPost, duplicatePlaylist, getMyPermissions } from "../../services/api.js";
import SharePlaylistModal from "../playlists/SharePlaylistModal.jsx";
import { getSceneTitle } from "../../utils/format.js";
import { showError, showSuccess } from "../../utils/toast.jsx";
import { ThemedIcon } from "../icons/index.js";
import {
  AddToPlaylistButton,
  BulkActionBar,
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
  const { hasMultipleInstances } = useConfig();
  const [playlist, setPlaylist] = useState(null);
  const [scenes, setScenes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [removeConfirmOpen, setRemoveConfirmOpen] = useState(false);
  const [sceneToRemove, setSceneToRemove] = useState(null);
  const [reorderMode, setReorderMode] = useState(false);
  const [shuffle, setShuffle] = useState(false);
  const [repeat, setRepeat] = useState("none"); // "none", "all", "one"
  const [downloading, setDownloading] = useState(false);
  const [permissions, setPermissions] = useState(null);
  const [isOwner, setIsOwner] = useState(true);
  const [ownerName, setOwnerName] = useState(null);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  // Selection state for multi-select (view mode only)
  const [selectedScenes, setSelectedScenes] = useState([]);
  const [bulkRemoveConfirmOpen, setBulkRemoveConfirmOpen] = useState(false);

  const handleToggleSelect = useCallback((scene) => {
    setSelectedScenes((prev) => {
      const isSelected = prev.some((s) => s.id === scene.id);
      return isSelected
        ? prev.filter((s) => s.id !== scene.id)
        : [...prev, scene];
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedScenes(
      scenes.filter((s) => s.exists && s.scene).map((s) => s.scene)
    );
  }, [scenes]);

  const handleDeselectAll = useCallback(() => {
    setSelectedScenes([]);
  }, []);

  // Navigation state for back button
  const { goBack, backButtonText } = useNavigationState();

  // Set page title to playlist name
  usePageTitle(playlist?.name || "Playlist");

  // Clear selection when entering edit or reorder mode
  useEffect(() => {
    if (isEditing || reorderMode) {
      setSelectedScenes([]);
    }
  }, [isEditing, reorderMode]);

  useEffect(() => {
    loadPlaylist();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playlistId]); // loadPlaylist is stable and doesn't need to be in dependencies

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
    fetchPermissions();
  }, []);

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

      // Set access info from response
      setIsOwner(response.data.isOwner !== false);
      if (!response.data.isOwner && playlistData?.user?.username) {
        setOwnerName(playlistData.user.username);
      }

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

  // Position control handlers for reordering
  const moveItem = useCallback((fromIndex, toIndex) => {
    if (toIndex < 0 || toIndex >= scenes.length) return;
    if (fromIndex === toIndex) return;

    const newScenes = [...scenes];
    const item = newScenes.splice(fromIndex, 1)[0];
    newScenes.splice(toIndex, 0, item);
    setScenes(newScenes);
  }, [scenes]);

  const handleMoveTop = useCallback((index) => {
    moveItem(index, 0);
  }, [moveItem]);

  const handleMoveUp = useCallback((index) => {
    moveItem(index, index - 1);
  }, [moveItem]);

  const handleMoveDown = useCallback((index) => {
    moveItem(index, index + 1);
  }, [moveItem]);

  const handleMoveBottom = useCallback((index) => {
    moveItem(index, scenes.length - 1);
  }, [moveItem, scenes.length]);

  const handleSetPosition = useCallback((fromIndex, newPosition) => {
    // Convert 1-indexed input to 0-indexed
    let targetIndex = newPosition - 1;

    // Clamp to valid range
    if (targetIndex < 0) targetIndex = 0;
    if (targetIndex >= scenes.length) targetIndex = scenes.length - 1;

    moveItem(fromIndex, targetIndex);
  }, [moveItem, scenes.length]);

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

      navigate(getEntityPath('scene', startScene.scene, hasMultipleInstances), {
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

  // Handle playlist download
  const handleDownload = async () => {
    try {
      setDownloading(true);
      await apiPost(`/downloads/playlist/${playlist.id}`);
      showSuccess("Download started - check Downloads page for progress");
    } catch (error) {
      const message = error.data?.error || error.message || "Download failed";
      if (error.data?.totalSizeMB) {
        showError(`${message} (${error.data.totalSizeMB}MB exceeds ${error.data.maxSizeMB}MB limit)`);
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
      navigate(`/playlist/${result.playlist.id}`);
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

    let successCount = 0;
    let failCount = 0;

    for (const scene of selectedScenes) {
      try {
        await api.delete(`/playlists/${playlistId}/items/${scene.id}`);
        successCount++;
      } catch {
        failCount++;
      }
    }

    const removedIds = new Set(selectedScenes.map((s) => s.id));
    setScenes((prev) => prev.filter((item) => !removedIds.has(item.scene?.id)));
    setSelectedScenes([]);

    if (failCount === 0) {
      showSuccess(`Removed ${successCount} scene${successCount !== 1 ? "s" : ""} from playlist`);
    } else {
      showError(`Removed ${successCount}, ${failCount} failed`);
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
                    onClick={() => setIsEditing(true)}
                    variant="primary"
                    icon={<Edit2 size={16} className="sm:w-4 sm:h-4" />}
                    title="Edit Playlist"
                  >
                    <span className="hidden sm:inline">Edit</span>
                  </Button>
                )}

                {/* Reorder button - owner only */}
                {isOwner && scenes.length > 1 && (
                  <Button
                    onClick={() => setReorderMode(true)}
                    variant="secondary"
                    icon={<ArrowUpDown size={16} className="sm:w-4 sm:h-4" />}
                    title="Reorder Scenes"
                  >
                    <span className="hidden sm:inline">Reorder</span>
                  </Button>
                )}

                {/* Download button - owner only */}
                {isOwner && permissions?.canDownloadPlaylists && scenes.length > 0 && (
                  <Button
                    onClick={handleDownload}
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
                {isOwner && permissions?.canShare && (
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
                    onClick={handleDuplicate}
                    variant="secondary"
                    disabled={duplicating}
                    icon={<Copy size={16} />}
                    title="Duplicate to My Playlists"
                  >
                    <span className="hidden sm:inline">{duplicating ? "Duplicating..." : "Duplicate"}</span>
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
              {!isOwner && ownerName && (
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                  Shared by {ownerName}
                </p>
              )}
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
                Use the position controls to reorder scenes. Click &quot;Save Order&quot; when done.
              </div>
            )}
            {selectedScenes.length > 0 && !isEditing && !reorderMode && (
              <div className="flex items-center justify-end gap-3">
                <Button onClick={handleSelectAll} variant="primary" size="sm" className="font-medium">
                  Select All ({scenes.filter(s => s.exists).length})
                </Button>
                <Button onClick={handleDeselectAll} variant="secondary" size="sm" className="font-medium">
                  Deselect All
                </Button>
              </div>
            )}
            {scenes.map((item, index) => (
              <SceneListItem
                key={item.sceneId}
                scene={item.scene}
                exists={item.exists}
                sceneId={item.sceneId}
                isSelected={!isEditing && !reorderMode && selectedScenes.some((s) => s.id === item.scene?.id)}
                onToggleSelect={!isEditing && !reorderMode ? handleToggleSelect : undefined}
                selectionMode={!isEditing && !reorderMode && selectedScenes.length > 0}
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
                    <div className="flex-shrink-0 flex items-center gap-1">
                      {/* Position input */}
                      <input
                        type="number"
                        min={1}
                        max={scenes.length}
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
                          onClick={(e) => { e.stopPropagation(); handleMoveTop(index); }}
                          disabled={index === 0}
                          className="p-1 rounded hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{ color: "var(--text-secondary)" }}
                          title="Move to top"
                        >
                          <ChevronsUp size={16} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveUp(index); }}
                          disabled={index === 0}
                          className="p-1 rounded hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{ color: "var(--text-secondary)" }}
                          title="Move up"
                        >
                          <ChevronUp size={16} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveDown(index); }}
                          disabled={index === scenes.length - 1}
                          className="p-1 rounded hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed"
                          style={{ color: "var(--text-secondary)" }}
                          title="Move down"
                        >
                          <ChevronDown size={16} />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleMoveBottom(index); }}
                          disabled={index === scenes.length - 1}
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
                    {item.exists && item.scene && (
                      <AddToPlaylistButton
                        sceneId={item.sceneId}
                        compact
                        buttonText=""
                        icon={<MoreVertical size={16} />}
                        variant="secondary"
                        excludePlaylistIds={[parseInt(playlistId, 10)]}
                      />
                    )}
                  </div>
                }
              />
            ))}
          </div>
        )}

        {selectedScenes.length > 0 && !isEditing && !reorderMode && (
          <BulkActionBar
            selectedScenes={selectedScenes}
            onClearSelection={handleDeselectAll}
            actions={
              <>
                <AddToPlaylistButton
                  sceneIds={selectedScenes.map((s) => s.id)}
                  buttonText={
                    <span>
                      <span className="hidden sm:inline">
                        Add {selectedScenes.length} to Playlist
                      </span>
                      <span className="sm:hidden">Add to Playlist</span>
                    </span>
                  }
                  icon={<Plus className="w-4 h-4" />}
                  dropdownPosition="above"
                  excludePlaylistIds={[parseInt(playlistId, 10)]}
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

      {/* Bulk Remove Confirmation Dialog */}
      <ConfirmDialog
        isOpen={bulkRemoveConfirmOpen}
        onClose={() => setBulkRemoveConfirmOpen(false)}
        onConfirm={confirmBulkRemove}
        title="Remove Scenes"
        message={`Remove ${selectedScenes.length} scene${selectedScenes.length !== 1 ? "s" : ""} from this playlist?`}
        confirmText="Remove"
        cancelText="Cancel"
        confirmStyle="danger"
      />

      <SharePlaylistModal
        playlistId={parseInt(playlistId, 10)}
        playlistName={playlist?.name || ""}
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
      />
    </>
  );
};

export default PlaylistDetail;
