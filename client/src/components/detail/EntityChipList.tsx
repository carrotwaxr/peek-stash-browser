import { Link } from "react-router-dom";
import { useConfig } from "../../contexts/ConfigContext";
import { getEntityPath } from "../../utils/entityLinks";

/** An entity a detail page links to */
export interface EntityChipRef {
  id: string;
  name: string;
  instanceId: string;
  /** A line under the name (a collection's place in its parent) */
  description?: string | null;
}

interface Props {
  type: "performer" | "studio" | "tag" | "group" | "gallery";
  refs: readonly EntityChipRef[];
  /**
   * Chips coloured by id, as tags show; otherwise a list of links with
   * their descriptions
   */
  tagHue?: boolean;
}

/** A tag chip's colour: the same for an id every time */
const hueOf = (id: string) => (parseInt(id, 10) * 137.5) % 360;

/**
 * Links to related entities (a tag's parents and children, a collection's
 * parents and sub-collections), each naming its server when there are
 * several.
 */
const EntityChipList = ({ type, refs, tagHue = false }: Props) => {
  const { hasMultipleInstances } = useConfig();
  if (refs.length === 0) return null;

  if (tagHue) {
    return (
      <div className="flex flex-wrap gap-2">
        {refs.map((ref) => (
          <Link
            key={`${ref.id}:${ref.instanceId}`}
            to={getEntityPath(type, ref, hasMultipleInstances)}
            className="px-3 py-1 rounded-full text-sm font-medium transition-opacity hover:opacity-80"
            style={{
              backgroundColor: `hsl(${hueOf(ref.id)}, 70%, 45%)`,
              color: "white",
            }}
          >
            {ref.name}
          </Link>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {refs.map((ref) => (
        <Link
          key={`${ref.id}:${ref.instanceId}`}
          to={getEntityPath(type, ref, hasMultipleInstances)}
          className="block p-2 rounded transition-opacity hover:opacity-80"
        >
          <span
            className="font-medium"
            style={{ color: "var(--accent-primary)" }}
          >
            {ref.name}
          </span>
          {ref.description && (
            <p
              className="text-sm mt-1"
              style={{ color: "var(--text-secondary)" }}
            >
              {ref.description}
            </p>
          )}
        </Link>
      ))}
    </div>
  );
};

export default EntityChipList;
