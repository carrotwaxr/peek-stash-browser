import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { showSuccess, showWarning, showError } from "../../utils/toast.jsx";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
});

const AddToPlaylistButton = ({ sceneId, compact = false }) => {
  const [showMenu, setShowMenu] = useState(false);
  const [playlists, setPlaylists] = useState([]);
  const [loading, setLoading] = useState(false);
  const menuRef = useRef(null);

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
    } catch (err) {
      console.error("Failed to load playlists:", err);
    } finally {
      setLoading(false);
    }
  };

  const addToPlaylist = async (playlistId) => {
    try {
      await api.post(`/playlists/${playlistId}/items`, { sceneId });
      showSuccess("Added to playlist!");
      setShowMenu(false);
    } catch (err) {
      console.error("Failed to add to playlist:", err);
      if (err.response?.status === 400) {
        showWarning("Scene already in playlist");
      } else {
        showError("Failed to add to playlist");
      }
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        className={compact ? "p-2 rounded hover:bg-opacity-80" : "px-4 py-2 rounded-lg"}
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-color)",
          color: "var(--text-primary)",
        }}
        title="Add to playlist"
      >
        {compact ? "+" : "+ Playlist"}
      </button>

      {showMenu && (
        <div
          className="absolute right-0 mt-2 w-64 rounded-lg shadow-lg z-50"
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
              Add to Playlist
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
