import { Link } from "react-router-dom";
import Tooltip from "../ui/Tooltip.jsx";

/**
 * Merge and deduplicate tags from scene, performers, and studio
 */
const mergeAllTags = (scene) => {
  const tagMap = new Map();

  // Add scene tags
  if (scene.tags) {
    scene.tags.forEach(tag => tagMap.set(tag.id, tag));
  }

  // Add performer tags
  if (scene.performers) {
    scene.performers.forEach(performer => {
      if (performer.tags) {
        performer.tags.forEach(tag => tagMap.set(tag.id, tag));
      }
    });
  }

  // Add studio tags
  if (scene.studio?.tags) {
    scene.studio.tags.forEach(tag => tagMap.set(tag.id, tag));
  }

  return Array.from(tagMap.values());
};

/**
 * Scene metadata: performers and tags with image-rich tooltips
 */
const SceneMetadata = ({ scene, className = "" }) => {
  // Get merged and deduped tags
  const allTags = mergeAllTags(scene);
  // Performer tooltip content with images in a grid
  const performersContent = scene.performers && scene.performers.length > 0 && (
    <div>
      <div className="font-semibold mb-3 text-base">Performers</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
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
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "var(--bg-tertiary)" }}
              >
                <span className="text-lg">👤</span>
              </div>
            )}
            <span className="text-sm truncate flex-1">{performer.name}</span>
          </Link>
        ))}
      </div>
      {scene.performers.length > 8 && (
        <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          +{scene.performers.length - 8} more
        </div>
      )}
    </div>
  );

  // Tag tooltip content with images in a grid
  const tagsContent = allTags && allTags.length > 0 && (
    <div>
      <div className="font-semibold mb-3 text-base">Tags</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
        {allTags.slice(0, 8).map((tag) => (
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
              <div
                className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "var(--bg-tertiary)" }}
              >
                <span className="text-lg">🏷️</span>
              </div>
            )}
            <span className="text-sm truncate flex-1">{tag.name}</span>
          </Link>
        ))}
      </div>
      {allTags.length > 8 && (
        <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          +{allTags.length - 8} more
        </div>
      )}
    </div>
  );

  // Groups tooltip content with images in a grid
  const groupsContent = scene.groups && scene.groups.length > 0 && (
    <div>
      <div className="font-semibold mb-3 text-base">Groups</div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-md">
        {scene.groups.slice(0, 8).map((group) => (
          <Link
            key={group.id}
            to={`/group/${group.id}`}
            className="flex items-center gap-2 p-2 rounded hover:bg-white/10 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {group.front_image_path || group.back_image_path ? (
              <img
                src={group.front_image_path || group.back_image_path}
                alt={group.name}
                className="w-10 h-10 rounded object-cover flex-shrink-0"
              />
            ) : (
              <div
                className="w-10 h-10 rounded flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "var(--bg-tertiary)" }}
              >
                <span className="text-lg">🎬</span>
              </div>
            )}
            <span className="text-sm truncate flex-1">{group.name}</span>
          </Link>
        ))}
      </div>
      {scene.groups.length > 8 && (
        <div className="text-xs mt-2" style={{ color: "var(--text-muted)" }}>
          +{scene.groups.length - 8} more
        </div>
      )}
    </div>
  );

  return (
    <div
      className={`flex items-center justify-center gap-3 md:gap-4 ${className}`}
    >
      {scene.performers && scene.performers.length > 0 && (
        <Tooltip content={performersContent} clickable={true} position="bottom">
          <SceneMetadataEntityInfoChip
            count={scene.performers.length}
            icon="👥"
            type="performer"
          />
        </Tooltip>
      )}
      {scene.groups && scene.groups.length > 0 && (
        <Tooltip content={groupsContent} clickable={true} position="bottom">
          <SceneMetadataEntityInfoChip
            count={scene.groups.length}
            icon="🎬"
            type="group"
          />
        </Tooltip>
      )}
      {allTags && allTags.length > 0 && (
        <Tooltip content={tagsContent} clickable={true} position="bottom">
          <SceneMetadataEntityInfoChip
            count={allTags.length}
            icon="🏷️"
            type="tag"
          />
        </Tooltip>
      )}
    </div>
  );
};

const SceneMetadataEntityInfoChip = ({ count, icon, type }) => {
  const color =
    type === "performer"
      ? "var(--status-info-text)"
      : type === "group"
      ? "var(--status-info)"
      : "var(--accent-secondary)";
  const fadedColor = `color-mix(in srgb, ${color} 70%, transparent)`;
  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-full cursor-pointer transition-colors"
      style={{
        backgroundColor: "var(--selection-bg)",
        border: `1px solid ${fadedColor}`,
      }}
    >
      <span className="text-xl leading-none flex items-center justify-center">
        {icon}
      </span>
      <span className="text-sm font-medium" style={{ color: fadedColor }}>
        {count}
      </span>
    </div>
  );
};

export default SceneMetadata;
