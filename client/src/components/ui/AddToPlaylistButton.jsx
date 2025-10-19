import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { showSuccess, showWarning, showError } from "../../utils/toast.jsx";

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
  dropdownPosition = "below" // "below" or "above"
}) => {
  const [showMenu, setShowMenu] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef(null);

  // Support both single sceneId and multiple sceneIds
  const scenesToAdd = sceneIds || (sceneId ? [sceneId] : []);
  const isMultiple = scenesToAdd.length > 1;

  useEffect(() => {
    if (showMenu && playlists.length === 0) {
      loadPlaylists();
    }
  }, [showMenu]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    };

    if (showMenu) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
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

  const addToPlaylist = async (playlistId) => {
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

      // Show appropriate message
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

      setShowMenu(false);
    } catch (err) {
      showError("Failed to add to playlist");
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        className={`flex items-center gap-2 ${compact ? "p-2 rounded hover:bg-opacity-80" : "px-4 py-2 rounded-lg"}`}
        style={{
          backgroundColor: "var(--accent-primary)",
          color: "white",
        }}
        title="Add to playlist"
      >
        {icon || null}
        {buttonText || (compact ? "+" : "+ Playlist")}
      </button>

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
            ) : playlists.length === 0 ? (
              <div className="p-4 text-center">
                <p
                  className="text-sm mb-2"
                  style={{ color: "var(--text-secondary)" }}
                >
                  No playlists yet
                </p>
                <a
                  href="/playlists"
                  className="text-sm text-blue-500 hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  Create one
                </a>
              </div>
            ) : (
              <div className="py-1">
                {playlists.map((playlist) => (
                  <button
                    key={playlist.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      addToPlaylist(playlist.id);
                    }}
                    className="w-full text-left px-4 py-2 text-sm hover:bg-opacity-80 transition-colors"
                    style={{
                      color: "var(--text-primary)",
                      backgroundColor: "transparent",
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
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AddToPlaylistButton;
