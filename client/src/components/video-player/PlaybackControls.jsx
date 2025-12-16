import { useEffect, useState } from "react";
import { useScenePlayer } from "../../contexts/ScenePlayerContext.jsx";
import useRatingHotkeys from "../../hooks/useRatingHotkeys.js";
import { libraryApi } from "../../services/api.js";
import {
  AddToPlaylistButton,
  FavoriteButton,
  OCounterButton,
  RatingSlider,
} from "../ui/index.js";

const PlaybackControls = () => {
  const { scene, sceneLoading, videoLoading, oCounter, dispatch } =
    useScenePlayer();

  // Rating and favorite state
  const [rating, setRating] = useState(null);
  const [isFavorite, setIsFavorite] = useState(false);

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

  // Rating and favorite hotkeys (r + 1-5 for ratings, r + 0 to clear, r + f to toggle favorite)
  useRatingHotkeys({
    enabled: !sceneLoading && !!scene,
    setRating: handleRatingChange,
    toggleFavorite: () => handleFavoriteChange(!isFavorite),
  });

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

          <div
            className="flex items-center gap-4 ml-auto"
            style={{ opacity: isLoading ? 0.6 : 1 }}
          >
            <OCounterButton
              sceneId={scene?.id}
              initialCount={oCounter}
              onChange={(newCount) =>
                dispatch({ type: "SET_O_COUNTER", payload: newCount })
              }
              disabled={isLoading}
            />
            <FavoriteButton
              isFavorite={isFavorite}
              onChange={handleFavoriteChange}
              size="medium"
            />
            <AddToPlaylistButton sceneId={scene?.id} disabled={isLoading} />
          </div>
        </div>

        {/* SM to XL Layout: Two rows */}
        <div className="hidden sm:flex sm:flex-col xl:hidden gap-4">
          {/* Row 1: Rating (50%) + space + O Counter + Favorite */}
          <div className="flex items-center justify-between gap-4">
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

            <div
              className="flex items-center gap-4"
              style={{ opacity: isLoading ? 0.6 : 1 }}
            >
              <OCounterButton
                sceneId={scene?.id}
                initialCount={oCounter}
                onChange={(newCount) =>
                  dispatch({ type: "SET_O_COUNTER", payload: newCount })
                }
                disabled={isLoading}
              />
              <FavoriteButton
                isFavorite={isFavorite}
                onChange={handleFavoriteChange}
                size="medium"
              />
            </div>
          </div>

          {/* Row 2: Add to Playlist */}
          <div className="flex items-center justify-end">
            <AddToPlaylistButton sceneId={scene?.id} disabled={isLoading} />
          </div>
        </div>

        {/* < SM Layout: Three rows */}
        <div className="flex sm:hidden flex-col gap-4">
          {/* Row 1: O Counter + Favorite (centered) */}
          <div
            className="flex items-center justify-center gap-4"
            style={{ opacity: isLoading ? 0.6 : 1 }}
          >
            <OCounterButton
              sceneId={scene?.id}
              initialCount={oCounter}
              onChange={(newCount) =>
                dispatch({ type: "SET_O_COUNTER", payload: newCount })
              }
              disabled={isLoading}
            />
            <FavoriteButton
              isFavorite={isFavorite}
              onChange={handleFavoriteChange}
              size="medium"
            />
          </div>

          {/* Row 2: Rating (full width) */}
          <div style={{ opacity: isLoading ? 0.6 : 1 }}>
            <RatingSlider
              rating={rating}
              onChange={handleRatingChange}
              label="Rating"
              showClearButton={true}
            />
          </div>

          {/* Row 3: Add to Playlist */}
          <div className="flex items-center justify-center">
            <AddToPlaylistButton sceneId={scene?.id} disabled={isLoading} />
          </div>
        </div>
      </div>
    </section>
  );
};

export default PlaybackControls;
