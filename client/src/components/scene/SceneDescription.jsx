import { getSceneDescription } from '../../utils/format.js';
import Tooltip from '../ui/Tooltip.jsx';

/**
 * Scene description with truncation and tooltip
 */
const SceneDescription = ({
  scene,
  maxLength = 150,
  lineClamp = 2,
  className = ""
}) => {
  const description = getSceneDescription(scene);

  if (!description) return null;

  return (
    <Tooltip content={description} disabled={description.length <= maxLength}>
      <p
        className={`text-sm leading-relaxed ${className}`}
        style={{
          color: 'var(--text-secondary)',
          display: '-webkit-box',
          WebkitLineClamp: lineClamp,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }}
      >
        {description}
      </p>
    </Tooltip>
  );
};

export default SceneDescription;
