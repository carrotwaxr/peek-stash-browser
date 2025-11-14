import { useEffect, useState } from "react";
import { useScenePlayer } from "../../contexts/ScenePlayerContext.jsx";
import { libraryApi } from "../../services/api.js";
import {
  AddToPlaylistButton,
  FavoriteButton,
  OCounterButton,
  RatingSlider,
} from "../ui/index.js";

const PlaybackControls = () => {
  const { scene, sceneLoading, videoLoading, quality, oCounter, dispatch } =
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
            - XL+: Single row (Quality >> Rating >> O Counter >> Favorite >> Add to Playlist)
            - SM to XL: Two rows (Row 1: Rating (50%) + O Counter + Favorite, Row 2: Quality + Add to Playlist)
            - < SM: Three rows (Row 1: O Counter + Favorite centered, Row 2: Rating (full), Row 3: Quality + Add to Playlist)
        */}

        {/* XL+ Layout: Single row */}
        <div className="hidden xl:flex xl:items-center xl:gap-4">
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

          <div className="flex-1 max-w-md" style={{ opacity: isLoading ? 0.6 : 1 }}>
            <RatingSlider
              rating={rating}
              onChange={handleRatingChange}
              label="Rating"
              showClearButton={true}
            />
          </div>

          <div className="flex items-center gap-4 ml-auto" style={{ opacity: isLoading ? 0.6 : 1 }}>
            <OCounterButton
              sceneId={scene?.id}
              initialCount={oCounter}
              onIncrement={(newCount) =>
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
            <div className="flex-1 max-w-md" style={{ opacity: isLoading ? 0.6 : 1 }}>
              <RatingSlider
                rating={rating}
                onChange={handleRatingChange}
                label="Rating"
                showClearButton={true}
              />
            </div>

            <div className="flex items-center gap-4" style={{ opacity: isLoading ? 0.6 : 1 }}>
              <OCounterButton
                sceneId={scene?.id}
                initialCount={oCounter}
                onIncrement={(newCount) =>
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

          {/* Row 2: Quality + Add to Playlist */}
          <div className="flex items-center justify-between gap-4">
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
              onIncrement={(newCount) =>
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

          {/* Row 3: Quality + Add to Playlist */}
          <div className="flex items-center justify-between gap-4">
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

            <AddToPlaylistButton sceneId={scene?.id} disabled={isLoading} />
          </div>
        </div>
      </div>
    </section>
  );
};

export default PlaybackControls;
