import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type ReactNode } from "react";
import {
  useAddScenesToPlaylist,
  useCreatePlaylist,
  usePlaylists,
  useSharedPlaylists,
} from "../../api/hooks";
import { makeCompositeKey } from "../../utils/compositeKey";
import { showError, showSuccess, showWarning } from "../../utils/toast";
import { ThemedIcon } from "../icons/index";
import Button from "./Button";
import Modal from "./Modal";

interface Props {
  /** The scenes to add, each with its instance: a bare id names no scene */
  scenes: ReadonlyArray<{ id: string; instanceId: string }>;
  compact?: boolean;
  buttonText?: string;
  icon?: ReactNode;
  dropdownPosition?: "below" | "above";
  onSuccess?: () => void;
  /** Playlists left out of the menu; a playlist's id is a number, compared as text */
  excludePlaylistIds?: ReadonlyArray<number | string>;
  variant?: "primary" | "secondary" | "tertiary" | "destructive";
  disabled?: boolean;
}

/** One row of the menu: the playlist's own fields, from either list */
interface MenuEntry {
  id: number;
  name: string;
  isShared: boolean;
  videoCount: number;
  /** One scene and the playlist already holds it */
  holdsScene: boolean;
}

/** What an add did, in words: a success only when nothing was left out */
function reportAdd(
  result: { added: number; alreadyInPlaylist: number; unavailable: number },
  isMultiple: boolean
) {
  const { added, alreadyInPlaylist, unavailable } = result;
  const skipped: string[] = [];
  if (alreadyInPlaylist > 0)
    skipped.push(`${alreadyInPlaylist} already in playlist`);
  if (unavailable > 0) skipped.push(`${unavailable} unavailable`);

  if (skipped.length === 0) {
    showSuccess(
      isMultiple ? `Added ${added} scenes to playlist!` : "Added to playlist!"
    );
  } else if (added > 0) {
    showWarning(`Added ${added} scenes, ${skipped.join(", ")}`);
  } else if (unavailable === 0) {
    showWarning(
      isMultiple
        ? "All scenes already in playlist"
        : "Scene already in playlist"
    );
  } else {
    showWarning(`No scenes added: ${skipped.join(", ")}`);
  }
}

const AddToPlaylistButton = ({
  scenes,
  compact = false,
  buttonText,
  icon,
  dropdownPosition: dropdownPositionProp,
  onSuccess,
  excludePlaylistIds = [],
  variant = "primary",
  disabled = false,
}: Props) => {
  const [showMenu, setShowMenu] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistDescription, setNewPlaylistDescription] = useState("");
  const [computedPosition, setComputedPosition] = useState("below");
  const menuRef = useRef<HTMLDivElement>(null);

  const isMultiple = scenes.length > 1;
  const onlyScene = scenes.length === 1 ? scenes[0] : undefined;

  // The lists are read only while the menu is open; one scene also asks each
  // playlist whether it holds that scene
  const ownQuery = usePlaylists(
    {
      containsScene: onlyScene
        ? makeCompositeKey(onlyScene.id, onlyScene.instanceId)
        : undefined,
    },
    { enabled: showMenu }
  );
  const sharedQuery = useSharedPlaylists({ enabled: showMenu });
  const addScenes = useAddScenesToPlaylist();
  const createPlaylist = useCreatePlaylist();
  const creating = createPlaylist.isPending;
  const loading = ownQuery.isLoading || sharedQuery.isLoading;

  const excluded = new Set(excludePlaylistIds.map(String));
  const entries: MenuEntry[] = [
    ...(ownQuery.data?.playlists ?? []).map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      isShared: false,
      videoCount: playlist._count.items,
      holdsScene: playlist.containsScene === true,
    })),
    ...(sharedQuery.data?.playlists ?? []).map((playlist) => ({
      id: playlist.id,
      name: playlist.name,
      isShared: true,
      videoCount: playlist.sceneCount,
      holdsScene: false,
    })),
  ].filter((entry) => !excluded.has(String(entry.id)));

  // Auto-detect menu position when opening
  const dropdownPosition = dropdownPositionProp || computedPosition;

  useLayoutEffect(() => {
    if (showMenu && !dropdownPositionProp && menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const menuHeight = 280; // approximate menu height
      const spaceAbove = rect.top;
      const spaceBelow = window.innerHeight - rect.bottom;
      setComputedPosition(
        spaceAbove < menuHeight && spaceBelow > spaceAbove ? "below" : "above"
      );
    }
  }, [showMenu, dropdownPositionProp]);

  // Click outside to close,
  // in the capture phase: a Modal stops the press bubbling past its backdrop
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside, true);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside, true);
    }
    return undefined;
  }, [showMenu]);

  /** One request for every scene; the server counts what it left out */
  const sendScenes = (playlistId: number) =>
    addScenes.mutateAsync({
      playlistId,
      scenes: scenes.map((scene) => ({
        sceneId: scene.id,
        instanceId: scene.instanceId,
      })),
    });

  const addToPlaylist = async (playlistId: number) => {
    try {
      const result = await sendScenes(playlistId);
      reportAdd(result, isMultiple);
      setShowMenu(false);
      if (onSuccess && result.added > 0) onSuccess();
    } catch {
      showError("Failed to add to playlist");
    }
  };

  const chooseEntry = (entry: MenuEntry) => {
    if (entry.holdsScene) {
      showWarning("Scene already in playlist");
      setShowMenu(false);
      return;
    }
    void addToPlaylist(entry.id);
  };

  const createPlaylistAndAdd = async (e: React.SubmitEvent) => {
    e.preventDefault();
    if (!newPlaylistName.trim()) return;

    let playlistId: number;
    try {
      const data = await createPlaylist.mutateAsync({
        name: newPlaylistName.trim(),
        description: newPlaylistDescription.trim() || undefined,
      });
      playlistId = data.playlist.id;
    } catch {
      showError("Failed to create playlist");
      return;
    }

    setNewPlaylistName("");
    setNewPlaylistDescription("");
    setShowCreateModal(false);
    setShowMenu(false);

    try {
      const { added } = await sendScenes(playlistId);
      showSuccess(
        `Playlist created and ${added} ${added === 1 ? "scene" : "scenes"} added!`
      );
      if (onSuccess && added > 0) onSuccess();
    } catch {
      showError("Playlist created, but adding to it failed");
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
        disabled={disabled}
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
                ? `Add ${scenes.length} Scenes to Playlist`
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
                    (e.target as HTMLElement).style.backgroundColor =
                      "var(--bg-secondary)";
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.backgroundColor =
                      "transparent";
                  }}
                >
                  + Create New Playlist
                </Button>

                {/* Existing Playlists */}
                {ownQuery.isError ? (
                  <div className="p-4 text-center">
                    <p
                      className="text-sm"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Could not load playlists
                    </p>
                  </div>
                ) : entries.length === 0 ? (
                  <div className="p-4 text-center">
                    <p
                      className="text-sm"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      No playlists yet
                    </p>
                  </div>
                ) : (
                  entries.map((entry) => (
                    <Button
                      key={`${entry.id}-${entry.isShared ? "shared" : "own"}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        chooseEntry(entry);
                      }}
                      variant="tertiary"
                      fullWidth
                      className="text-left px-4 py-2 text-sm"
                      style={{
                        color: "var(--text-primary)",
                      }}
                      onMouseEnter={(e) => {
                        (e.target as HTMLElement).style.backgroundColor =
                          "var(--bg-secondary)";
                      }}
                      onMouseLeave={(e) => {
                        (e.target as HTMLElement).style.backgroundColor =
                          "transparent";
                      }}
                    >
                      <div className="flex items-center gap-1.5">
                        {entry.name}
                        {entry.isShared && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{
                              backgroundColor: "var(--accent-color)",
                              color: "var(--bg-primary)",
                              opacity: 0.8,
                            }}
                          >
                            shared
                          </span>
                        )}
                        {entry.holdsScene && (
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded-full"
                            style={{
                              backgroundColor: "var(--bg-tertiary)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            already added
                          </span>
                        )}
                      </div>
                      <div
                        className="text-xs"
                        style={{ color: "var(--text-muted)" }}
                      >
                        {entry.videoCount} videos
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
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        size="sm"
        title="Create New Playlist"
        initialFocusRef={nameInputRef}
      >
        <form onSubmit={(e) => void createPlaylistAndAdd(e)}>
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
                Create & Add
              </Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
};

export default AddToPlaylistButton;
