import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, Droplets, ExternalLink, Heart } from "lucide-react";
import { ENTITY_ICONS } from "../../constants/entityIcons";
import { useConfig } from "../../contexts/ConfigContext";
import { useHoverCapable } from "../../hooks/useHoverCapable";
import { tagTreeKey, tagTreeRowKey } from "../../utils/buildTagTree";
import { getEntityPath } from "../../utils/entityLinks";

interface TagNodeData {
  id: string;
  name: string;
  children?: TagNodeData[];
  image_path?: string | null;
  scene_count?: number;
  image_count?: number;
  performer_count?: number;
  rating100?: number | null;
  o_counter?: number;
  favorite?: boolean;
  isAncestorOnly?: boolean;
  instanceId?: string;
}

/**
 * Expansion goes by the tag's `tagTreeKey` ("id:instanceId"); focus goes by
 * the row's `tagTreeRowKey` (its path from the root), since a tag under two
 * parents is two rows.
 */
interface TagTreeNodeProps {
  tag: TagNodeData;
  depth?: number;
  isExpanded?: boolean;
  expandedIds?: Set<string>;
  onToggle: (key: string) => void;
  isAncestorOnly?: boolean;
  /** The row key of the row this one sits under; null at the root */
  parentRowKey?: string | null;
  /** The row key of the tree's focused (tabbable) row */
  focusedId?: string | null;
  /** A row took focus (clicked, or moved to by the keys or TV focus) */
  onFocus?: (rowKey: string) => void;
  /** Each row's element by row key, so the tree's keys can focus it */
  registerRow?: (rowKey: string, el: HTMLDivElement | null) => void;
}

// Color utilities matching CardCountIndicators
const hueify = (color: string, direction = "lighter", amount = 12) => {
  return `lch(from ${color} calc(l ${
    direction === "lighter" ? "+" : "-"
  } ${Math.abs(amount)}) c h)`;
};

// Rating badge gradient matching RatingBadge component
const getRatingStyle = (rating100: number | null | undefined) => {
  if (rating100 === null || rating100 === undefined) return null;
  const value = rating100 / 10; // 0-10 scale

  if (value < 3.5) {
    // Bronze
    return {
      background:
        "linear-gradient(135deg, #C77B30 0%, #965A1E 30%, #C77B30 50%, #8B4513 70%, #965A1E 100%)",
      color: "#FFF",
    };
  } else if (value < 7.0) {
    // Silver
    return {
      background:
        "linear-gradient(135deg, #E8E8E8 0%, #A8A8A8 30%, #D0D0D0 50%, #909090 70%, #C0C0C0 100%)",
      color: "#333",
    };
  } else {
    // Gold
    return {
      background:
        "linear-gradient(135deg, #FFE87C 0%, #D4AF37 30%, #FFD700 50%, #B8860B 70%, #DAA520 100%)",
      color: "#333",
    };
  }
};

/**
 * Individual tree node for tag hierarchy view.
 * Displays a compact "mini-card" with expand/collapse, thumbnail, and counts.
 */
const TagTreeNode = ({
  tag,
  depth = 0,
  isExpanded = false,
  expandedIds, // Set of expanded node IDs (passed down for children)
  onToggle,
  isAncestorOnly = false,
  parentRowKey = null,
  focusedId,
  onFocus,
  registerRow,
}: TagTreeNodeProps) => {
  const navigate = useNavigate();
  const { hasMultipleInstances } = useConfig();
  const hoverCapable = useHoverCapable();
  const children = tag.children ?? [];
  const hasChildren = children.length > 0;
  const key = tagTreeKey(tag);
  const rowKey = tagTreeRowKey(parentRowKey, tag);
  const isFocused = focusedId === rowKey;

  const rowRef = useCallback(
    (el: HTMLDivElement | null) => registerRow?.(rowKey, el),
    [registerRow, rowKey]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      if (hasChildren) {
        onToggle(key);
      }
      onFocus?.(rowKey);
    },
    [hasChildren, onToggle, onFocus, key, rowKey]
  );

  // Focus reaching the row itself by any path (keys, TV focus, a click)
  // makes it the tree's focused row
  const handleFocus = useCallback(
    (e: React.FocusEvent) => {
      if (e.target === e.currentTarget) onFocus?.(rowKey);
    },
    [onFocus, rowKey]
  );

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      void navigate(getEntityPath("tag", tag, hasMultipleInstances), {
        state: { fromPageTitle: "Tags" },
      });
    },
    [navigate, tag, hasMultipleInstances]
  );

  const handleNavigateClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      void navigate(getEntityPath("tag", tag, hasMultipleInstances), {
        state: { fromPageTitle: "Tags" },
      });
    },
    [navigate, tag, hasMultipleInstances]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        void navigate(getEntityPath("tag", tag, hasMultipleInstances), {
          state: { fromPageTitle: "Tags" },
        });
      }
    },
    [navigate, tag, hasMultipleInstances]
  );

  // Subtitle: child count or nothing
  const subtitle = hasChildren
    ? `${children.length} subtag${children.length !== 1 ? "s" : ""}`
    : null;

  // Generate placeholder color from tag id
  const placeholderHue = (parseInt(tag.id, 10) * 137.5) % 360;

  return (
    <div>
      {/* Node row */}
      <div
        ref={rowRef}
        role="treeitem"
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-selected={isFocused}
        tabIndex={isFocused ? 0 : -1}
        // A TV item: TV focus lands on rows, not their Go to buttons
        data-tv-item=""
        className={`
            relative flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer
            transition-colors group
            ${isAncestorOnly ? "opacity-50" : ""}
          `}
        style={{
          marginLeft: `${depth * 24}px`,
          backgroundColor: isFocused ? "var(--bg-tertiary)" : "transparent",
        }}
        onClick={handleClick}
        onFocus={handleFocus}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
      >
        {/* Expand/collapse chevron */}
        <div className="w-5 flex-shrink-0">
          {hasChildren && (
            <ChevronRight
              size={18}
              className={`transition-transform ${isExpanded ? "rotate-90" : ""}`}
              style={{ color: "var(--text-muted)" }}
            />
          )}
        </div>

        {/* Thumbnail */}
        <div
          className="w-10 h-10 rounded flex-shrink-0 overflow-hidden"
          style={{
            backgroundColor: tag.image_path
              ? "var(--bg-tertiary)"
              : `hsl(${placeholderHue}, 40%, 30%)`,
          }}
        >
          {tag.image_path && (
            <img
              src={tag.image_path}
              alt=""
              className="w-full h-full object-cover"
              loading="lazy"
            />
          )}
        </div>

        {/* Name and subtitle */}
        <div className="flex-1 min-w-0">
          <div
            className="font-medium truncate"
            style={{ color: "var(--text-primary)" }}
          >
            {tag.name}
          </div>
          {subtitle && (
            <div
              className="text-xs truncate"
              style={{ color: "var(--text-muted)" }}
            >
              {subtitle}
            </div>
          )}
        </div>

        {/* Right side: counts, rating, o-counter, favorite, navigate */}
        <div className="flex items-center gap-3 flex-shrink-0">
          {/* Scene count - clapperboard icon */}
          {(tag.scene_count ?? 0) > 0 && (
            <div
              className="flex items-center gap-1"
              title={`${tag.scene_count} scene${tag.scene_count !== 1 ? "s" : ""}`}
            >
              <ENTITY_ICONS.scene
                size={16}
                style={{
                  color: hueify("var(--accent-secondary)", "lighter"),
                }}
              />
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                {tag.scene_count}
              </span>
            </div>
          )}

          {/* Image count - images icon */}
          {(tag.image_count ?? 0) > 0 && (
            <div
              className="flex items-center gap-1"
              title={`${tag.image_count} image${tag.image_count !== 1 ? "s" : ""}`}
            >
              <ENTITY_ICONS.images
                size={16}
                style={{ color: hueify("var(--status-success)", "lighter") }}
              />
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                {tag.image_count}
              </span>
            </div>
          )}

          {/* Performer count - user icon */}
          {(tag.performer_count ?? 0) > 0 && (
            <div
              className="flex items-center gap-1"
              title={`${tag.performer_count} performer${tag.performer_count !== 1 ? "s" : ""}`}
            >
              <ENTITY_ICONS.performer
                size={16}
                style={{ color: "var(--accent-primary)" }}
              />
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                {tag.performer_count}
              </span>
            </div>
          )}

          {/* Rating badge - metallic medal style */}
          {(tag.rating100 ?? 0) > 0 &&
            (() => {
              const rating100 = tag.rating100;
              const ratingStyle = getRatingStyle(rating100);
              if (!ratingStyle || rating100 == null) return null;
              return (
                <span
                  className="text-xs px-2 py-0.5 rounded font-bold"
                  style={{
                    background: ratingStyle.background,
                    color: ratingStyle.color,
                  }}
                  title={`Rating: ${(rating100 / 10).toFixed(1)}`}
                >
                  {(rating100 / 10).toFixed(1)}
                </span>
              );
            })()}

          {/* O-Counter - droplets icon with info color */}
          {(tag.o_counter ?? 0) > 0 && (
            <div
              className="flex items-center gap-1"
              title={`O-Counter: ${tag.o_counter}`}
            >
              <Droplets size={16} style={{ color: "var(--status-info)" }} />
              <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                {tag.o_counter}
              </span>
            </div>
          )}

          {/* Favorite heart */}
          {tag.favorite && (
            <span title="Favorite">
              <Heart
                size={16}
                fill="var(--accent-primary)"
                style={{ color: "var(--accent-primary)" }}
              />
            </span>
          )}

          {/* Navigate button - visible on hover; always on a touch screen */}
          <button
            type="button"
            // The row is the Tab stop and Enter on it navigates
            tabIndex={-1}
            onClick={handleNavigateClick}
            className={`p-1 rounded transition-opacity ${
              hoverCapable ? "opacity-0 group-hover:opacity-100" : ""
            }`}
            style={{ backgroundColor: "var(--bg-tertiary)" }}
            title="Go to tag"
            aria-label={`Go to ${tag.name}`}
          >
            <ExternalLink
              size={14}
              style={{ color: "var(--text-secondary)" }}
            />
          </button>
        </div>
      </div>

      {/* Children (recursive) */}
      {hasChildren && isExpanded && (
        <div role="group">
          {children.map((child) => (
            <TagTreeNode
              key={tagTreeKey(child)}
              tag={child}
              depth={depth + 1}
              isExpanded={expandedIds?.has(tagTreeKey(child)) || false}
              expandedIds={expandedIds}
              onToggle={onToggle}
              isAncestorOnly={child.isAncestorOnly || false}
              parentRowKey={rowKey}
              focusedId={focusedId}
              onFocus={onFocus}
              registerRow={registerRow}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default TagTreeNode;
