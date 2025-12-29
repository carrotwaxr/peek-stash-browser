import { Link } from "react-router-dom";

/**
 * Renders a list of tag chips, sorted alphabetically
 */
const TagChips = ({ tags }) => {
  if (!tags || tags.length === 0) return null;

  // Filter out invalid tags and sort alphabetically by name (case-insensitive)
  const sortedTags = [...tags]
    .filter((tag) => tag && tag.name)
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
    );

  if (sortedTags.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {sortedTags.map((tag) => {
        const hue = (parseInt(tag.id, 10) * 137.5) % 360;
        return (
          <Link
            key={tag.id}
            to={`/tag/${tag.id}`}
            className="px-3 py-1 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              backgroundColor: `hsl(${hue}, 70%, 45%)`,
              color: "white",
            }}
          >
            {tag.name}
          </Link>
        );
      })}
    </div>
  );
};

export default TagChips;
