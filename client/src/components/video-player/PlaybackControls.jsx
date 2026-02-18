import { useEffect, useState } from "react";
import { useScenePlayer } from "../../contexts/ScenePlayerContext.jsx";
import { useCardDisplaySettings } from "../../contexts/CardDisplaySettingsContext.jsx";
import { useRatingHotkeys } from "../../hooks/useRatingHotkeys.js";
import { apiPost, getMyPermissions, libraryApi } from "../../services/api.js";
import { showError, showSuccess } from "../../utils/toast.jsx";
import { ThemedIcon } from "../icons/index.js";
import {
  AddToPlaylistButton,
  Button,
  FavoriteButton,
  OCounterButton,
  RatingSlider,
} from "../ui/index.js";

const PlaybackControls = () => {
  const { scene, sceneLoading, videoLoading, oCounter, dispatch } =
    useScenePlayer();
  const { getSettings } = useCardDisplaySettings();
  const sceneSettings = getSettings("scene");

  // Rating and favorite state
  const [rating, setRating] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);

  // Download state
  const [downloading, setDownloading] = useState(false);
  const [permissions, setPermissions] = useState(null);

  // Sync state when scene changes
  const sceneId = scene?.id;
  const sceneRating = scene?.rating;
  const sceneFavorite = scene?.favorite;
  useEffect(() => {
    if (sceneId != null) {
      setRating(sceneRating ?? null);
      setIsFavorite(sceneFavorite || false);
    }
  }, [sceneId, sceneRating, sceneFavorite]);

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

  // Handle rating change
  const handleRatingChange = async (newRating) => {
    if (!scene?.id) return;

    const previousRating = rating;
    setRating(newRating);

    try {
      await libraryApi.updateRating("scene", scene.id, newRating, scene.instanceId);
    } catch (error) {
      console.error("Failed to update scene rating:", error);
      setRating(previousRating);
    }
  };

  // Handle favorite change
  const handleFavoriteChange = async (newFavorite) => {
    if (!scene?.id) return;

    const previousFavorite = isFavorite;
    setIsFavorite(newFavorite);

    try {
      await libraryApi.updateFavorite("scene", scene.id, newFavorite, scene.instanceId);
    } catch (error) {
      console.error("Failed to update scene favorite:", error);
      setIsFavorite(previousFavorite);
    }
  };

  // Rating and favorite hotkeys (r + 1-5 for ratings, r + 0 to clear, r + f to toggle favorite)
  useRatingHotkeys({
    enabled: !sceneLoading && !!scene,
    setRating: handleRatingChange,
    toggleFavorite: () => handleFavoriteChange(!isFavorite),
  });

  // Handle scene download
  const handleDownload = async () => {
    try {
      setDownloading(true);
      const response = await apiPost(`/downloads/scene/${scene.id}`);
      const download = response.download;

      // For scenes, download is immediate - redirect to file endpoint
      // Server sets Content-Disposition: attachment to force download
      if (download.status === "COMPLETED") {
        window.location.href = `/api/downloads/${download.id}/file`;
      }
      showSuccess("Download started");
    } catch (error) {
      const message = error.data?.error || error.message || "Download failed";
      showError(message);
    } finally {
      setDownloading(false);
    }
  };

  // Don't render if no scene data yet
  if (!scene) {
    return null;
  }

  const isLoading = sceneLoading || videoLoading;
  return (
    <section>
      <div
        className="p-4 rounded-lg"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-color)",
        }}
      >
        {/* Responsive Layout:
            - XL+: Single row (Rating >> O Counter >> Favorite >> Add to Playlist)
            - SM to XL: Two rows (Row 1: Rating (50%) + O Counter + Favorite, Row 2: Add to Playlist)
            - < SM: Three rows (Row 1: O Counter + Favorite centered, Row 2: Rating (full), Row 3: Add to Playlist)
        */}

        {/* XL+ Layout: Single row */}
        <div className="hidden xl:flex xl:items-center xl:gap-4">
          {sceneSettings.showRating && (
            <div
              className="flex-1 max-w-md"
              style={{ opacity: isLoading ? 0.6 : 1 }}
            >
              <RatingSlider
                rating={rating}
                onChange={handleRatingChange}
                label="Rating"
                showClearButton={true}
              />
            </div>
          )}

          <div
            className="flex items-center gap-4 ml-auto"
            style={{ opacity: isLoading ? 0.6 : 1 }}
          >
            {sceneSettings.showOCounter && (
              <OCounterButton
                sceneId={scene?.id}
                initialCount={oCounter}
                onChange={(newCount) =>
                  dispatch({ type: "SET_O_COUNTER", payload: newCount })
                }
                disabled={isLoading}
              />
            )}
            {sceneSettings.showFavorite && (
              <FavoriteButton
                isFavorite={isFavorite}
                onChange={handleFavoriteChange}
                size="medium"
              />
            )}
            <AddToPlaylistButton sceneId={scene?.id} disabled={isLoading} compact />
            {permissions?.canDownloadFiles && (
              <Button
                variant="secondary"
                onClick={handleDownload}
                disabled={downloading || isLoading}
                title={downloading ? "Starting download..." : "Download"}
              >
                <ThemedIcon name="download" size={16} />
              </Button>
            )}
          </div>
        </div>

        {/* SM to XL Layout: Two rows */}
        <div className="hidden sm:flex sm:flex-col xl:hidden gap-4">
          {/* Row 1: Rating (50%) + space + O Counter + Favorite */}
          <div className="flex items-center justify-between gap-4">
            {sceneSettings.showRating && (
              <div
                className="flex-1 max-w-md"
                style={{ opacity: isLoading ? 0.6 : 1 }}
              >
                <RatingSlider
                  rating={rating}
                  onChange={handleRatingChange}
                  label="Rating"
                  showClearButton={true}
                />
              </div>
            )}

            <div
              className="flex items-center gap-4"
              style={{ opacity: isLoading ? 0.6 : 1 }}
            >
              {sceneSettings.showOCounter && (
                <OCounterButton
                  sceneId={scene?.id}
                  initialCount={oCounter}
                  onChange={(newCount) =>
                    dispatch({ type: "SET_O_COUNTER", payload: newCount })
                  }
                  disabled={isLoading}
                />
              )}
              {sceneSettings.showFavorite && (
                <FavoriteButton
                  isFavorite={isFavorite}
                  onChange={handleFavoriteChange}
                  size="medium"
                />
              )}
            </div>
          </div>

          {/* Row 2: Add to Playlist + Download */}
          <div className="flex items-center justify-end gap-4">
            <AddToPlaylistButton sceneId={scene?.id} disabled={isLoading} compact />
            {permissions?.canDownloadFiles && (
              <Button
                variant="secondary"
                onClick={handleDownload}
                disabled={downloading || isLoading}
                title={downloading ? "Starting download..." : "Download"}
              >
                <ThemedIcon name="download" size={16} />
              </Button>
            )}
          </div>
        </div>

        {/* < SM Layout: Two rows */}
        <div className="flex sm:hidden flex-col gap-4">
          {/* Row 1: All buttons (centered) */}
          <div
            className="flex items-center justify-center gap-4"
            style={{ opacity: isLoading ? 0.6 : 1 }}
          >
            {sceneSettings.showOCounter && (
              <OCounterButton
                sceneId={scene?.id}
                initialCount={oCounter}
                onChange={(newCount) =>
                  dispatch({ type: "SET_O_COUNTER", payload: newCount })
                }
                disabled={isLoading}
              />
            )}
            {sceneSettings.showFavorite && (
              <FavoriteButton
                isFavorite={isFavorite}
                onChange={handleFavoriteChange}
                size="medium"
              />
            )}
            <AddToPlaylistButton sceneId={scene?.id} disabled={isLoading} compact />
            {permissions?.canDownloadFiles && (
              <Button
                variant="secondary"
                onClick={handleDownload}
                disabled={downloading || isLoading}
                title={downloading ? "Starting download..." : "Download"}
              >
                <ThemedIcon name="download" size={16} />
              </Button>
            )}
          </div>

          {/* Row 2: Rating (full width) */}
          {sceneSettings.showRating && (
            <div style={{ opacity: isLoading ? 0.6 : 1 }}>
              <RatingSlider
                rating={rating}
                onChange={handleRatingChange}
                label="Rating"
                showClearButton={true}
              />
            </div>
          )}
        </div>
      </div>
    </section>
  );
};

export default PlaybackControls;
