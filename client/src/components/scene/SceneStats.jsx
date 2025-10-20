import { formatFileSize } from '../../utils/format.js';
import OCounterButton from '../ui/OCounterButton.jsx';
import Tooltip from '../ui/Tooltip.jsx';

/**
 * Scene stats: rating, o counter, play count, organized, resolution, file size
 */
const SceneStats = ({
  scene,
  watchHistory,
  className = ""
}) => {
  // Calculate color based on rating (gradient from red to yellow to green)
  const getRatingColor = (rating) => {
    if (!rating) return 'var(--text-muted)';

    if (rating >= 80) {
      // Green range (80-100)
      return '#22c55e'; // green-500
    } else if (rating >= 60) {
      // Yellow-green range (60-79)
      return '#84cc16'; // lime-500
    } else if (rating >= 40) {
      // Yellow range (40-59)
      return '#eab308'; // yellow-500
    } else if (rating >= 20) {
      // Orange range (20-39)
      return '#f97316'; // orange-500
    } else {
      // Red range (0-19)
      return '#ef4444'; // red-500
    }
  };

  return (
    <div className={`flex flex-wrap items-center gap-2 md:gap-4 text-xs ${className}`} style={{ color: 'var(--text-muted)' }}>
      <span style={{ color: getRatingColor(scene.rating100), fontWeight: scene.rating100 ? '600' : '400' }}>
        {scene.rating100 ? `${scene.rating100}/100` : '—'}
      </span>
      <OCounterButton
        sceneId={scene.id}
        initialCount={watchHistory?.oCount ?? scene.o_counter ?? 0}
        className="text-xs"
      />
      <span>
        <span style={{ color: 'rgb(34, 197, 94)' }}>▶</span> {watchHistory?.playCount ?? scene.play_count ?? 0}
      </span>
      {scene.organized && (
        <Tooltip content="Organized">
          <span className="text-green-500">✓</span>
        </Tooltip>
      )}
      {scene.files?.[0]?.width && scene.files?.[0]?.height && (
        <span>{scene.files[0].width}×{scene.files[0].height}</span>
      )}
      {scene.files?.[0]?.size && (
        <span>{formatFileSize(scene.files[0].size)}</span>
      )}
    </div>
  );
};

export default SceneStats;
