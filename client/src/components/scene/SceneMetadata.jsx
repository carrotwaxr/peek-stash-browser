import { Link } from "react-router-dom";
import { CardCountIndicators } from "../ui/index.js";

/**
 * Combine direct tags with inherited tags from server
 */
const getAllTags = (scene) => {
  const tagMap = new Map();
  // Direct scene tags
  if (scene.tags) {
    scene.tags.forEach((tag) => tagMap.set(tag.id, tag));
  }
  // Inherited tags (pre-computed on server)
  if (scene.inheritedTags) {
    scene.inheritedTags.forEach((tag) => tagMap.set(tag.id, tag));
  }
  return Array.from(tagMap.values());
};

/**
 * Scene metadata: performers and tags with image-rich tooltips
 */
const SceneMetadata = ({ scene }) => {
  // Get merged and deduped tags
  const allTags = getAllTags(scene);
  // Performer tooltip content with images in a grid
  const performersContent = scene.performers && scene.performers.length > 0 && (
    <div>
      <div className="font-semibold mb-3 text-base">Performers</div>
      <div className="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto pr-2">
        {scene.performers.map((performer) => (
          <Link
            key={performer.id}
            to={`/performer/${performer.id}`}
            className="flex items-center gap-3 p-2 rounded hover:bg-white/10 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {performer.image_path ? (
              <img
                src={performer.image_path}
                alt={performer.name}
                className="w-16 h-16 rounded-full object-cover flex-shrink-0"
              />
            ) : (
              <div
                className="w-16 h-16 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <span className="text-2xl">👤</span>
              </div>
            )}
            <span className="text-sm truncate flex-1">{performer.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );

  // Tag tooltip content with images in a grid
  const tagsContent = allTags && allTags.length > 0 && (
    <div>
      <div className="font-semibold mb-3 text-base">Tags</div>
      <div className="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto pr-2">
        {allTags.map((tag) => (
          <Link
            key={tag.id}
            to={`/tag/${tag.id}`}
            className="flex items-center gap-3 p-2 rounded hover:bg-white/10 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {tag.image_path ? (
              <img
                src={tag.image_path}
                alt={tag.name}
                className="w-16 h-16 rounded object-cover flex-shrink-0"
              />
            ) : (
              <div
                className="w-16 h-16 rounded flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <span className="text-2xl">🏷️</span>
              </div>
            )}
            <span className="text-sm truncate flex-1">{tag.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );

  // Groups tooltip content with images in a grid
  const groupsContent = scene.groups && scene.groups.length > 0 && (
    <div>
      <div className="font-semibold mb-3 text-base">Collections</div>
      <div className="grid grid-cols-1 gap-3 max-h-[60vh] overflow-y-auto pr-2">
        {scene.groups.map((group) => (
          <Link
            key={group.id}
            to={`/collection/${group.id}`}
            className="flex items-center gap-3 p-2 rounded hover:bg-white/10 transition-colors"
            onClick={(e) => e.stopPropagation()}
          >
            {group.front_image_path || group.back_image_path ? (
              <img
                src={group.front_image_path || group.back_image_path}
                alt={group.name}
                className="w-16 h-16 rounded object-cover flex-shrink-0"
              />
            ) : (
              <div
                className="w-16 h-16 rounded flex items-center justify-center flex-shrink-0"
                style={{ backgroundColor: "var(--bg-secondary)" }}
              >
                <span className="text-2xl">🎬</span>
              </div>
            )}
            <span className="text-sm truncate flex-1">{group.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );

  return (
    <CardCountIndicators
      indicators={[
        { type: "PLAY_COUNT", count: scene.play_count },
        {
          type: "PERFORMERS",
          count: scene.performers?.length,
          tooltipContent: performersContent,
        },
        {
          type: "GROUPS",
          count: scene.groups?.length,
          tooltipContent: groupsContent,
        },
        { type: "TAGS", count: allTags?.length, tooltipContent: tagsContent },
      ]}
    />
  );
};

export default SceneMetadata;
