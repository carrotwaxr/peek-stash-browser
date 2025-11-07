import { useScenePlayer } from "../../contexts/ScenePlayerContext.jsx";
import AddToPlaylistButton from "../ui/AddToPlaylistButton.jsx";
import OCounterButton from "../ui/OCounterButton.jsx";
import RatingControls from "../ui/RatingControls.jsx";

const PlaybackControls = () => {
  const { scene, sceneLoading, videoLoading, quality, oCounter, dispatch } =
    useScenePlayer();

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

          {/* Row 2 on mobile (centered), Center column on desktop: Rating Controls + O Counter */}
          <div
            className="flex items-center justify-center gap-4 md:flex-1"
            style={{ opacity: isLoading ? 0.6 : 1 }}
          >
            <RatingControls
              entityType="scene"
              entityId={scene?.id}
              initialRating={scene?.rating}
              initialFavorite={scene?.favorite || false}
              size={20}
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
    </section>
  );
};

export default PlaybackControls;
