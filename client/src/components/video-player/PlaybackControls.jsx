import { useState, useEffect, useRef } from "react";
import { useScenePlayer } from "../../contexts/ScenePlayerContext.jsx";
import AddToPlaylistButton from "../ui/AddToPlaylistButton.jsx";
import OCounterButton from "../ui/OCounterButton.jsx";
import RatingBadge from "../ui/RatingBadge.jsx";
import RatingSliderDialog from "../ui/RatingSliderDialog.jsx";
import FavoriteButton from "../ui/FavoriteButton.jsx";
import { libraryApi } from "../../services/api.js";

const PlaybackControls = () => {
  const { scene, sceneLoading, videoLoading, quality, oCounter, dispatch } =
    useScenePlayer();

  // Rating and favorite state
  const [rating, setRating] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);

  // Rating popover state
  const [isRatingPopoverOpen, setIsRatingPopoverOpen] = useState(false);
  const ratingBadgeRef = useRef(null);

  // Sync state when scene changes
  useEffect(() => {
    if (scene) {
      setRating(scene.rating ?? null);
      setIsFavorite(scene.favorite || false);
    }
  }, [scene?.id, scene?.rating, scene?.favorite]);

  // Handle rating change
  const handleRatingChange = async (newRating) => {
    if (!scene?.id) return;

    const previousRating = rating;
    setRating(newRating);

    try {
      await libraryApi.updateRating("scene", scene.id, newRating);
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
      await libraryApi.updateFavorite("scene", scene.id, newFavorite);
    } catch (error) {
      console.error("Failed to update scene favorite:", error);
      setIsFavorite(previousFavorite);
    }
  };

  // Don't render if no scene data yet
  if (!scene) {
    return null;
  }

  const isLoading = sceneLoading || videoLoading;
  return (
    <section className="py-4 mt-6">
      <div
        className="p-4 rounded-lg"
        style={{
          backgroundColor: "var(--bg-card)",
          border: "1px solid var(--border-color)",
        }}
      >
        {/* Desktop: Three-column layout (left: quality, center: rating/counter, right: add to playlist) */}
        {/* Mobile: Two rows (row 1: quality + add button, row 2: rating/counter centered) */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          {/* Row 1 on mobile, Left column on desktop: Quality Selector */}
          <div className="flex items-center justify-between md:justify-start gap-4 md:flex-1">
            <select
              value={quality}
              onChange={(e) =>
                dispatch({ type: "SET_QUALITY", payload: e.target.value })
              }
              disabled={isLoading}
              className="btn text-sm"
              style={{
                backgroundColor: "var(--bg-card)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
                padding: "8px 12px",
                opacity: isLoading ? 0.6 : 1,
                cursor: isLoading ? "not-allowed" : "pointer",
              }}
            >
              <option value="direct">Direct Play</option>
              <option value="1080p">1080p</option>
              <option value="720p">720p</option>
              <option value="480p">480p</option>
              <option value="360p">360p</option>
            </select>

            {/* Add to Playlist Button - shows on mobile in row 1, hidden on desktop */}
            <div className="md:hidden">
              <AddToPlaylistButton sceneId={scene?.id} disabled={isLoading} />
            </div>
          </div>

          {/* Row 2 on mobile (centered), Center column on desktop: Rating Badge + Favorite + O Counter */}
          <div
            className="flex items-center justify-center gap-4 md:flex-1"
            style={{ opacity: isLoading ? 0.6 : 1 }}
          >
            <div ref={ratingBadgeRef}>
              <RatingBadge
                rating={rating}
                onClick={() => setIsRatingPopoverOpen(true)}
                size="medium"
              />
            </div>
            <FavoriteButton
              isFavorite={isFavorite}
              onChange={handleFavoriteChange}
              size="medium"
            />
            <OCounterButton
              sceneId={scene?.id}
              initialCount={oCounter}
              onIncrement={(newCount) =>
                dispatch({ type: "SET_O_COUNTER", payload: newCount })
              }
              disabled={isLoading}
            />
          </div>

          {/* Right column on desktop: Add to Playlist Button - hidden on mobile */}
          <div className="hidden md:flex md:justify-end md:flex-1">
            <AddToPlaylistButton sceneId={scene?.id} disabled={isLoading} />
          </div>
        </div>
      </div>

      {/* Rating Popover */}
      <RatingSliderDialog
        isOpen={isRatingPopoverOpen}
        onClose={() => setIsRatingPopoverOpen(false)}
        initialRating={rating}
        onSave={handleRatingChange}
        entityType="scene"
        entityTitle={scene?.title || "Scene"}
        anchorEl={ratingBadgeRef.current}
      />
    </section>
  );
};

export default PlaybackControls;
