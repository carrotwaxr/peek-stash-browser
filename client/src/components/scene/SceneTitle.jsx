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
  dateClassName = ""
}) => {
  const title = getSceneTitle(scene);

  return (
    <div>
      <Link
        to={`/scene/${scene.id}`}
        state={linkState}
        className={`font-semibold hover:underline block ${titleClassName}`}
        style={{ color: 'var(--text-primary)' }}
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
