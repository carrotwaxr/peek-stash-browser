import { useNavigate } from 'react-router-dom';
import { formatRelativeTime } from '../../utils/date.js';
import {
  SceneThumbnail,
  SceneTitle,
  SceneStats,
  SceneMetadata,
  SceneDescription
} from '../scene/index.js';

/**
 * Shared row-based scene list item component
 * Used by both Playlists and Watch History
 *
 * @param {Object} scene - Scene object
 * @param {Object} watchHistory - Optional watch history data {resumeTime, playCount, playDuration, lastPlayedAt, oCount}
 * @param {React.ReactNode} actionButtons - Optional action buttons (e.g., Remove button)
 * @param {React.ReactNode} dragHandle - Optional drag handle for reorder mode
 * @param {Object} linkState - Optional state to pass to Link component
 * @param {boolean} exists - Whether the scene exists (for deleted scenes)
 * @param {string} sceneId - Scene ID (for when scene is deleted)
 */
const SceneListItem = ({
  scene,
  watchHistory,
  actionButtons,
  dragHandle,
  linkState,
  exists = true,
  sceneId,
  draggable = false,
  onDragStart,
  onDragOver,
  onDragEnd,
  showSessionOIndicator = false, // Show if O was clicked in the last session
}) => {
  const navigate = useNavigate();

  // Check if an O was clicked during the last viewing session
  const hadOInLastSession = () => {
    if (!watchHistory?.oHistory || !watchHistory?.lastPlayedAt) return false;

    try {
      const oHistory = Array.isArray(watchHistory.oHistory)
        ? watchHistory.oHistory
        : JSON.parse(watchHistory.oHistory);

      if (oHistory.length === 0) return false;

      // Get the most recent O timestamp
      const lastOTimestamp = new Date(oHistory[oHistory.length - 1]);
      const lastPlayedAt = new Date(watchHistory.lastPlayedAt);

      // Check if the last O was within 5 minutes of the last play session
      const timeDiff = Math.abs(lastOTimestamp - lastPlayedAt);
      const fiveMinutes = 5 * 60 * 1000;

      return timeDiff < fiveMinutes;
    } catch (error) {
      console.error('Error checking O history:', error);
      return false;
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds || seconds < 1) return '0m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const formatResumeTime = (seconds) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const handleClick = (e) => {
    // Don't navigate if clicking on interactive elements
    const target = e.target;
    const isInteractive =
      target.closest('button') ||
      target.closest('a') ||
      target.closest('[role="button"]');

    if (!isInteractive && exists && scene) {
      // Check if there's a video player currently playing
      // If navigating within a playlist while video is playing, autoplay the next one
      const videoElements = document.querySelectorAll('video');
      let isPlaying = false;

      videoElements.forEach(video => {
        if (!video.paused && !video.ended && video.readyState > 2) {
          isPlaying = true;
        }
      });

      if (isPlaying && linkState?.playlist) {
        sessionStorage.setItem('videoPlayerAutoplay', 'true');

        // Also check if video is fullscreen
        const isFullscreen = document.fullscreenElement ||
                            document.webkitFullscreenElement ||
                            document.mozFullScreenElement ||
                            document.msFullscreenElement;
        if (isFullscreen) {
          sessionStorage.setItem('videoPlayerFullscreen', 'true');
        }
      }

      navigate(`/scene/${scene.id}`, { state: linkState });
    }
  };

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onClick={handleClick}
      className="rounded-lg border transition-all hover:shadow-lg"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        opacity: exists ? 1 : 0.6,
        cursor: draggable ? 'move' : exists ? 'pointer' : 'default',
      }}
    >
      <div className="pt-2 px-2 pb-1 md:pt-4 md:px-4 md:pb-2">
        <div className="flex flex-col md:flex-row gap-3 md:gap-4">
          {/* Optional Drag Handle */}
          {dragHandle}

          {/* Thumbnail */}
          <div className="flex-shrink-0 relative">
            {exists ? (
              <SceneThumbnail
                scene={scene}
                watchHistory={watchHistory}
                className="w-full md:w-64 aspect-video md:aspect-auto md:h-36"
              />
            ) : (
              <div
                className="w-full md:w-64 aspect-video md:aspect-auto md:h-36 rounded flex items-center justify-center"
                style={{
                  backgroundColor: 'var(--status-error-bg)',
                  border: '2px dashed var(--status-error-border)',
                }}
              >
                <span className="text-3xl" style={{ color: 'var(--status-error-text)' }}>
                  ⚠️
                </span>
              </div>
            )}
          </div>

          {/* Details */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1 min-w-0 pr-4">
                {exists && scene ? (
                  <>
                    {/* Title and Date */}
                    <div className="mb-2">
                      <SceneTitle
                        scene={scene}
                        linkState={linkState}
                        titleClassName="text-lg"
                        dateClassName="mt-1"
                      />
                    </div>

                    {/* Watch History Stats (if provided) */}
                    {watchHistory && (
                      <div className="flex flex-wrap items-center gap-2 md:gap-4 text-xs mb-2 p-2 rounded" style={{
                        backgroundColor: 'var(--status-info-bg)',
                        color: 'var(--text-muted)',
                        border: '1px solid var(--status-info-bg)'
                      }}>
                        {watchHistory.lastPlayedAt && (
                          <span>
                            🕐 Last watched: {formatRelativeTime(watchHistory.lastPlayedAt)}
                          </span>
                        )}
                        {watchHistory.resumeTime > 0 && scene.files?.[0]?.duration && (
                          <span>
                            ⏸️ Resume at: {formatResumeTime(watchHistory.resumeTime)}
                            {' '}({Math.round((watchHistory.resumeTime / scene.files[0].duration) * 100)}%)
                          </span>
                        )}
                        {watchHistory.playDuration > 0 && (
                          <span>
                            ⏱️ Watched: {formatDuration(watchHistory.playDuration)}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Stats Row */}
                    <div className="flex items-center gap-2 mb-2">
                      <SceneStats
                        scene={scene}
                        watchHistory={watchHistory}
                      />
                      {showSessionOIndicator && hadOInLastSession() && (
                        <span
                          className="text-xs px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: 'rgba(34, 197, 94, 0.1)',
                            color: 'rgb(34, 197, 94)',
                            border: '1px solid rgba(34, 197, 94, 0.3)',
                          }}
                          title="O clicked during this session"
                        >
                          💦
                        </span>
                      )}
                    </div>

                    {/* Description */}
                    <SceneDescription
                      scene={scene}
                      className="mb-2"
                    />

                    {/* Performers & Tags */}
                    <SceneMetadata scene={scene} />
                  </>
                ) : (
                  <>
                    <h3
                      className="text-lg font-semibold mb-2"
                      style={{ color: 'var(--status-error-text)' }}
                    >
                      ⚠️ Scene Deleted or Not Found
                    </h3>
                    <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
                      Scene ID: {sceneId} • This scene was removed from Stash
                    </p>
                    <p
                      className="text-xs px-2 py-1 rounded inline-block"
                      style={{
                        backgroundColor: 'var(--status-error-bg)',
                        color: 'var(--status-error-text)',
                      }}
                    >
                      Click "Remove" to clean up this playlist
                    </p>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              {actionButtons}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SceneListItem;
