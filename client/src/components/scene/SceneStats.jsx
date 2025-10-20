import { formatFileSize } from '../../utils/format.js';
import OCounterButton from '../ui/OCounterButton.jsx';
import Tooltip from '../ui/Tooltip.jsx';

/**
 * Scene stats: rating, o counter, play count, organized, resolution, file size
 */
const SceneStats = ({
  scene,
  watchHistory,
  className = "",
  noWrap = false, // Prevent wrapping for fixed-height card layouts
  hideFileInfo = false, // Hide resolution and filesize (for when they're shown elsewhere)
  centered = false // Center the stats
}) => {
  // Calculate color based on rating (gradient from red to yellow to green)
  const getRatingColor = (rating) => {
    if (!rating) return 'var(--text-muted)';

    if (rating >= 80) {
      return 'var(--rating-excellent)';
    } else if (rating >= 60) {
      return 'var(--rating-good)';
    } else if (rating >= 40) {
      return 'var(--rating-average)';
    } else if (rating >= 20) {
      return 'var(--rating-poor)';
    } else {
      return 'var(--rating-bad)';
    }
  };

  return (
    <div className={`flex ${noWrap ? 'flex-nowrap' : 'flex-wrap'} items-center ${centered ? 'justify-center' : ''} gap-2 md:gap-4 text-xs ${className}`} style={{ color: 'var(--text-muted)' }}>
      <span style={{ color: getRatingColor(scene.rating100), fontWeight: scene.rating100 ? '600' : '400' }}>
        {scene.rating100 ? `${scene.rating100}/100` : '—'}
      </span>
      <OCounterButton
        sceneId={scene.id}
        initialCount={scene.o_counter ?? 0}
        className="text-xs"
      />
      <span>
        <span style={{ color: 'var(--icon-play-count)' }}>▶</span> {watchHistory?.playCount ?? scene.play_count ?? 0}
      </span>
      {scene.organized && (
        <Tooltip content="Organized">
          <span style={{ color: 'var(--icon-organized)' }}>✓</span>
        </Tooltip>
      )}
      {!hideFileInfo && scene.files?.[0]?.width && scene.files?.[0]?.height && (
        <span>{scene.files[0].width}×{scene.files[0].height}</span>
      )}
      {!hideFileInfo && scene.files?.[0]?.size && (
        <span>{formatFileSize(scene.files[0].size)}</span>
      )}
    </div>
  );
};

export default SceneStats;
