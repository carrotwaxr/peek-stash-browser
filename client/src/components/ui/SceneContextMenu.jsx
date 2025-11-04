import { useState, useRef, useEffect } from "react";
import axios from "axios";
import { showSuccess, showWarning, showError } from "../../utils/toast.jsx";
import Button from "./Button.jsx";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const SceneContextMenu = ({ sceneId }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const menuRef = useRef(null);

  // Close menu when clicking outside
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

  // Load playlists when menu opens
  useEffect(() => {
    if (showMenu && playlists.length === 0) {
      loadPlaylists();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showMenu]); // Only load when menu opens, not when playlists.length changes

  const loadPlaylists = async () => {
    try {
      setLoadingPlaylists(true);
      const response = await api.get("/playlists");
      setPlaylists(response.data.playlists || []);
    } catch {
      // Error loading playlists - will show in UI
    } finally {
      setLoadingPlaylists(false);
    }
  };

  const addToPlaylist = async (playlistId) => {
    try {
      await api.post(`/playlists/${playlistId}/items`, { sceneId });
      showSuccess("Added to playlist!");
      setShowMenu(false);
    } catch (err) {
      if (err.response?.status === 400) {
        showWarning("Scene already in playlist");
      } else {
        showError("Failed to add to playlist");
      }
    }
  };

  return (
    <div className="absolute top-2 left-2 z-20" ref={menuRef}>
      {/* Three-dot button */}
      <Button
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        variant="tertiary"
        className="p-1.5 rounded-full !border-0"
        style={{
          backgroundColor: "rgba(0, 0, 0, 0.7)",
        }}
        title="More options"
        icon={
          <svg
            className="w-4 h-4 text-white"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path d="M10 6a2 2 0 110-4 2 2 0 010 4zM10 12a2 2 0 110-4 2 2 0 010 4zM10 18a2 2 0 110-4 2 2 0 010 4z" />
          </svg>
        }
      />

      {/* Dropdown menu */}
      {showMenu && (
        <div
          className="absolute left-0 mt-2 w-56 rounded-lg shadow-lg"
          style={{
            backgroundColor: "var(--bg-card)",
            border: "1px solid var(--border-color)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className="p-2 border-b text-sm font-semibold"
            style={{
              borderColor: "var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            Add to Playlist
          </div>

          <div className="max-h-64 overflow-y-auto">
            {loadingPlaylists ? (
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
                      backgroundColor: "transparent",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor = "transparent";
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
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SceneContextMenu;
