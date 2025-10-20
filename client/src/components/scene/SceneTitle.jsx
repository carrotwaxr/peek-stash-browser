import { Link } from 'react-router-dom';
import { getSceneTitle } from '../../utils/format.js';
import { formatRelativeTime } from '../../utils/date.js';

/**
 * Scene title with link and date
 */
const SceneTitle = ({
  scene,
  linkState,
  showDate = true,
  titleClassName = "",
  dateClassName = "",
  maxLines = null // Optional: limit title to specific number of lines
}) => {
  const title = getSceneTitle(scene);

  const titleStyle = maxLines ? {
    color: 'var(--text-primary)',
    display: '-webkit-box',
    WebkitLineClamp: maxLines,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    minHeight: maxLines === 2 ? '2.5rem' : undefined, // Fixed height for 2-line titles
    maxHeight: maxLines === 2 ? '2.5rem' : undefined
  } : {
    color: 'var(--text-primary)'
  };

  return (
    <div>
      <Link
        to={`/scene/${scene.id}`}
        state={linkState}
        className={`font-semibold hover:underline block ${titleClassName}`}
        style={titleStyle}
      >
        {title}
      </Link>

      {showDate && (
        <div className={`text-xs ${dateClassName}`} style={{ color: 'var(--text-muted)' }}>
          {scene.date ? formatRelativeTime(scene.date) : 'No date'}
        </div>
      )}
    </div>
  );
};

export default SceneTitle;
