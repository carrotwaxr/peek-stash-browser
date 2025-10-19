import { useState, useEffect, useRef, useCallback } from 'react';
import SpritePreview from '../ui/SpritePreview.jsx';
import { fetchAndParseVTT, getSpritePositionForTime } from '../../utils/spriteSheet.js';

/**
 * Seek preview component that shows sprite sheet thumbnails when hovering over the seek bar
 *
 * @param {Object} scene - Scene object with paths.sprite and paths.vtt
 * @param {Object} playerRef - Reference to the Video.js player
 */
const SeekPreview = ({ scene, playerRef }) => {
  const [cues, setCues] = useState([]);
  const [spritePosition, setSpritePosition] = useState(null);
  const [previewTime, setPreviewTime] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [tooltipStyle, setTooltipStyle] = useState({});
  const seekBarRef = useRef(null);

  // Load and parse VTT file
  useEffect(() => {
    if (!scene?.paths?.vtt) {
      setCues([]);
      return;
    }

    fetchAndParseVTT(scene.paths.vtt)
      .then(parsedCues => {
        setCues(parsedCues);
      })
      .catch(err => {
        console.error('[SeekPreview] Failed to load VTT file:', err);
        setCues([]);
      });
  }, [scene?.paths?.vtt]);

  // Handle mouse move over seek bar
  const handleMouseMove = useCallback((event) => {
    if (!playerRef.current || cues.length === 0) {
      return;
    }

    const player = playerRef.current;
    const seekBar = seekBarRef.current;
    if (!seekBar) {
      return;
    }

    const seekBarRect = seekBar.getBoundingClientRect();
    const mouseX = event.clientX - seekBarRect.left;
    const percentage = Math.max(0, Math.min(1, mouseX / seekBarRect.width));

    // Calculate time based on mouse position
    const duration = player.duration();
    if (!duration || isNaN(duration)) return;

    const time = duration * percentage;
    setPreviewTime(time);

    // Get sprite position for this time
    const position = getSpritePositionForTime(cues, time);
    if (position) {
      setSpritePosition(position);
    }

    // Calculate tooltip position relative to video player container
    const playerRect = player.el().getBoundingClientRect();
    const tooltipWidth = 160; // Match displayWidth in SpritePreview
    const tooltipHeight = 120; // Approximate height (thumbnail + timestamp)

    // Position relative to player container
    let left = seekBarRect.left - playerRect.left + mouseX - tooltipWidth / 2;
    const top = seekBarRect.top - playerRect.top - tooltipHeight - 10; // 10px gap

    // Keep tooltip within bounds horizontally
    if (left < 0) left = 0;
    if (left + tooltipWidth > playerRect.width) {
      left = playerRect.width - tooltipWidth;
    }

    setTooltipStyle({
      left: `${left}px`,
      top: `${top}px`,
    });
    setIsVisible(true);
  }, [playerRef, cues]);

  const handleMouseLeave = useCallback(() => {
    setIsVisible(false);
  }, []);

  // Find the Video.js seek bar element and attach listeners
  useEffect(() => {
    if (!playerRef.current) return;

    const player = playerRef.current;

    // Video.js creates a seek bar with class "vjs-progress-control"
    const progressControl = player.el()?.querySelector('.vjs-progress-control');

    if (progressControl) {
      seekBarRef.current = progressControl;
      progressControl.addEventListener('mousemove', handleMouseMove);
      progressControl.addEventListener('mouseleave', handleMouseLeave);

      return () => {
        progressControl.removeEventListener('mousemove', handleMouseMove);
        progressControl.removeEventListener('mouseleave', handleMouseLeave);
      };
    }
  }, [playerRef, handleMouseMove, handleMouseLeave]);

  // Don't render if no sprite data available
  if (!scene?.paths?.sprite || !scene?.paths?.vtt || cues.length === 0) {
    return null;
  }

  // Format time for display
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div
      className={`seek-preview-tooltip ${isVisible ? 'visible' : 'hidden'}`}
      style={{
        position: 'absolute',
        ...tooltipStyle,
        pointerEvents: 'none',
        zIndex: 1000,
        transition: 'opacity 0.1s ease',
        opacity: isVisible ? 1 : 0,
      }}
    >
      <div
        className="bg-black/90 rounded-lg overflow-hidden shadow-2xl border border-gray-700"
        style={{
          backdropFilter: 'blur(10px)',
        }}
      >
        {spritePosition && (
          <SpritePreview
            spriteUrl={scene.paths.sprite}
            position={spritePosition}
            displayWidth={160}
          />
        )}
        <div className="text-center text-white text-sm py-2 px-3 bg-black/80">
          {formatTime(previewTime)}
        </div>
      </div>
    </div>
  );
};

export default SeekPreview;
