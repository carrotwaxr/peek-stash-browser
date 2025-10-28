import { formatFileSize } from "../../utils/format.js";
import OCounterButton from "../ui/OCounterButton.jsx";
import Tooltip from "../ui/Tooltip.jsx";

/**
 * Scene stats: o counter, play count, organized, resolution, file size
 */
const SceneStats = ({
  scene,
  watchHistory,
  className = "",
  noWrap = false, // Prevent wrapping for fixed-height card layouts
  hideFileInfo = false, // Hide resolution and filesize (for when they're shown elsewhere)
  centered = false, // Center the stats
}) => {
  return (
    <div
      className={`flex ${noWrap ? "flex-nowrap" : "flex-wrap"} items-center ${
        centered ? "justify-center" : ""
      } gap-2 md:gap-4 text-xs ${className}`}
      style={{ color: "var(--text-muted)" }}
    >
      <OCounterButton
        sceneId={scene.id}
        initialCount={scene.o_counter ?? 0}
        className="text-xs"
      />
      <span>
        <span style={{ color: "var(--status-success)" }}>▶</span>{" "}
        {watchHistory?.playCount ?? scene.play_count ?? 0}
      </span>
      {!hideFileInfo && scene.files?.[0]?.width && scene.files?.[0]?.height && (
        <span>
          {scene.files[0].width}×{scene.files[0].height}
        </span>
      )}
      {!hideFileInfo && scene.files?.[0]?.size && (
        <span>{formatFileSize(scene.files[0].size)}</span>
      )}
    </div>
  );
};

export default SceneStats;
