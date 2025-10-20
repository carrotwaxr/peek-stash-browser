import { Link } from 'react-router-dom';
import { getSceneTitle, getSceneDescription, formatFileSize } from '../../utils/format.js';
import { formatRelativeTime } from '../../utils/date.js';
import Tooltip from './Tooltip.jsx';
import OCounterButton from './OCounterButton.jsx';

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
}) => {
  const title = scene ? getSceneTitle(scene) : null;
  const description = scene ? getSceneDescription(scene) : null;

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

  return (
    <div
      draggable={draggable}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      className="rounded-lg border transition-all hover:shadow-lg"
      style={{
        backgroundColor: 'var(--bg-card)',
        border: '1px solid var(--border-color)',
        opacity: exists ? 1 : 0.6,
        cursor: draggable ? 'move' : 'default',
      }}
    >
      <div className="p-4">
        <div className="flex gap-4">
          {/* Optional Drag Handle */}
          {dragHandle}

          {/* Thumbnail */}
          <div className="flex-shrink-0 relative">
            {exists && scene?.paths?.screenshot ? (
              <div className="relative w-64 h-36 rounded overflow-hidden">
                <img
                  src={scene.paths.screenshot}
                  alt={title || 'Scene'}
                  className="w-full h-full object-cover"
                />
                {/* Overlay with duration and studio */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent">
                  {scene.studio && (
                    <div className="absolute top-2 right-2">
                      <span className="px-2 py-1 bg-black/70 text-white text-xs rounded">
                        {scene.studio.name}
                      </span>
                    </div>
                  )}
                  {scene.files?.[0]?.duration && (
                    <div className="absolute bottom-2 right-2">
                      <span className="px-2 py-1 bg-black/70 text-white text-xs rounded">
                        {Math.floor(scene.files[0].duration / 60)}m
                      </span>
                    </div>
                  )}
                </div>

                {/* Watch Progress Bar */}
                {watchHistory?.resumeTime && scene.files?.[0]?.duration && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
                    <div
                      className="h-full bg-green-500 transition-all"
                      style={{
                        width: `${Math.min(100, (watchHistory.resumeTime / scene.files[0].duration) * 100)}%`,
                      }}
                      title={`Resume from ${formatResumeTime(watchHistory.resumeTime)}`}
                    />
                  </div>
                )}
              </div>
            ) : (
              <div
                className="w-64 h-36 rounded flex items-center justify-center"
                style={{
                  backgroundColor: exists ? 'var(--bg-secondary)' : 'rgba(239, 68, 68, 0.1)',
                  border: exists ? 'none' : '2px dashed rgba(239, 68, 68, 0.5)',
                }}
              >
                <span
                  className="text-3xl"
                  style={{ color: exists ? 'var(--text-muted)' : 'rgb(239, 68, 68)' }}
                >
                  {exists ? '📹' : '⚠️'}
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
                    {/* Title */}
                    <Link
                      to={`/scene/${scene.id}`}
                      state={linkState}
                      className="font-semibold text-lg hover:underline block mb-1"
                      style={{ color: 'var(--text-primary)' }}
                    >
                      {title}
                    </Link>

                    {/* Date */}
                    <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                      {scene.date ? formatRelativeTime(scene.date) : 'No date'}
                    </div>

                    {/* Watch History Stats (if provided) */}
                    {watchHistory && (
                      <div className="flex items-center gap-4 text-xs mb-2 p-2 rounded" style={{
                        backgroundColor: 'rgba(59, 130, 246, 0.05)',
                        color: 'var(--text-muted)',
                        border: '1px solid rgba(59, 130, 246, 0.1)'
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
                    <div className="flex items-center gap-4 text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
                      <span>⭐ {scene.rating100 || '—'}</span>
                      <OCounterButton
                        sceneId={scene.id}
                        initialCount={watchHistory?.oCount ?? scene.o_counter ?? 0}
                        className="text-xs"
                      />
                      <span>▶ {watchHistory?.playCount ?? scene.play_count ?? 0}</span>
                      {scene.files?.[0]?.width && scene.files?.[0]?.height && (
                        <span>{scene.files[0].width}×{scene.files[0].height}</span>
                      )}
                      {scene.files?.[0]?.size && (
                        <span>{formatFileSize(scene.files[0].size)}</span>
                      )}
                    </div>

                    {/* Description */}
                    {description && (
                      <Tooltip content={description} disabled={description.length <= 150}>
                        <p
                          className="text-sm mb-2 leading-relaxed"
                          style={{
                            color: 'var(--text-secondary)',
                            display: '-webkit-box',
                            WebkitLineClamp: 2,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {description}
                        </p>
                      </Tooltip>
                    )}

                    {/* Performers & Tags */}
                    <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {scene.performers && scene.performers.length > 0 && (
                        <Tooltip
                          content={
                            <div>
                              <div className="font-semibold mb-1">Performers:</div>
                              {scene.performers.map((p) => p.name).join(', ')}
                            </div>
                          }
                        >
                          <span className="flex items-center gap-1">
                            👥 {scene.performers.length}
                          </span>
                        </Tooltip>
                      )}
                      {scene.tags && scene.tags.length > 0 && (
                        <Tooltip
                          content={
                            <div>
                              <div className="font-semibold mb-1">Tags:</div>
                              {scene.tags.map((t) => t.name).join(', ')}
                            </div>
                          }
                        >
                          <span className="flex items-center gap-1">
                            🏷️ {scene.tags.length}
                          </span>
                        </Tooltip>
                      )}
                      {scene.organized && (
                        <span className="text-green-500">✓ Organized</span>
                      )}
                    </div>
                  </>
                ) : (
                  <>
                    <h3
                      className="text-lg font-semibold mb-2"
                      style={{ color: 'rgb(239, 68, 68)' }}
                    >
                      ⚠️ Scene Deleted or Not Found
                    </h3>
                    <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>
                      Scene ID: {sceneId} • This scene was removed from Stash
                    </p>
                    <p
                      className="text-xs px-2 py-1 rounded inline-block"
                      style={{
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        color: 'rgb(239, 68, 68)',
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
