import { Link } from 'react-router-dom';
import Tooltip from '../ui/Tooltip.jsx';

/**
 * Scene metadata: performers and tags with image-rich tooltips
 */
const SceneMetadata = ({
  scene,
  className = ""
}) => {
  // Performer tooltip content with images in a grid
  const performersContent = scene.performers && scene.performers.length > 0 && (
    <div>
      <div className="font-semibold mb-3 text-base">Performers</div>
      <div className="grid grid-cols-2 gap-3 max-w-md">
        {scene.performers.slice(0, 8).map((performer) => (
          <Link
            key={performer.id}
            to={`/performer/${performer.id}`}
            className="flex items-center gap-2 p-2 rounded hover:bg-white/10 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {performer.image_path ? (
              <img
                src={performer.image_path}
                alt={performer.name}
                className="w-10 h-10 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center flex-shrink-0">
                <span className="text-lg">👤</span>
              </div>
            )}
            <span className="text-sm truncate flex-1">{performer.name}</span>
          </Link>
        ))}
      </div>
      {scene.performers.length > 8 && (
        <div className="text-xs text-gray-400 mt-2">
          +{scene.performers.length - 8} more
        </div>
      )}
    </div>
  );

  // Tag tooltip content with images in a grid
  const tagsContent = scene.tags && scene.tags.length > 0 && (
    <div>
      <div className="font-semibold mb-3 text-base">Tags</div>
      <div className="grid grid-cols-2 gap-3 max-w-md">
        {scene.tags.slice(0, 8).map((tag) => (
          <Link
            key={tag.id}
            to={`/tag/${tag.id}`}
            className="flex items-center gap-2 p-2 rounded hover:bg-white/10 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {tag.image_path ? (
              <img
                src={tag.image_path}
                alt={tag.name}
                className="w-10 h-10 rounded object-cover flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded bg-gray-700 flex items-center justify-center flex-shrink-0">
                <span className="text-lg">🏷️</span>
              </div>
            )}
            <span className="text-sm truncate flex-1">{tag.name}</span>
          </Link>
        ))}
      </div>
      {scene.tags.length > 8 && (
        <div className="text-xs text-gray-400 mt-2">
          +{scene.tags.length - 8} more
        </div>
      )}
    </div>
  );

  return (
    <div className={`flex flex-wrap items-center justify-center gap-3 md:gap-4 ${className}`}>
      {scene.performers && scene.performers.length > 0 && (
        <Tooltip
          content={performersContent}
          clickable={true}
          position="bottom"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer transition-colors"
            style={{
              backgroundColor: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.3)',
            }}
          >
            <span className="text-base">👥</span>
            <span className="text-sm font-medium" style={{ color: 'rgb(59, 130, 246)' }}>
              {scene.performers.length}
            </span>
          </div>
        </Tooltip>
      )}
      {scene.tags && scene.tags.length > 0 && (
        <Tooltip
          content={tagsContent}
          clickable={true}
          position="bottom"
        >
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full cursor-pointer transition-colors"
            style={{
              backgroundColor: 'rgba(168, 85, 247, 0.1)',
              border: '1px solid rgba(168, 85, 247, 0.3)',
            }}
          >
            <span className="text-base">🏷️</span>
            <span className="text-sm font-medium" style={{ color: 'rgb(168, 85, 247)' }}>
              {scene.tags.length}
            </span>
          </div>
        </Tooltip>
      )}
    </div>
  );
};

export default SceneMetadata;
