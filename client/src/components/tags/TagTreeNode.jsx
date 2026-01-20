import { forwardRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  ChevronRight,
  Heart,
  ExternalLink,
  Droplets,
} from "lucide-react";
import { ENTITY_ICONS } from "../../constants/entityIcons.js";

// Color utilities matching CardCountIndicators
const hueify = (color, direction = "lighter", amount = 12) => {
  return `lch(from ${color} calc(l ${
    direction === "lighter" ? "+" : "-"
  } ${Math.abs(amount)}) c h)`;
};

// Rating badge gradient matching RatingBadge component
const getRatingStyle = (rating100) => {
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
const TagTreeNode = forwardRef(
  (
    {
      tag,
      depth = 0,
      isExpanded = false,
      expandedIds, // Set of expanded node IDs (passed down for children)
      onToggle,
      isAncestorOnly = false,
      focusedId,
      onFocus,
    },
    ref
  ) => {
    const navigate = useNavigate();
    const hasChildren = tag.children && tag.children.length > 0;
    const isFocused = focusedId === tag.id;

    const handleClick = useCallback(
      (e) => {
        e.stopPropagation();
        if (hasChildren) {
          onToggle(tag.id);
        }
        onFocus?.(tag.id);
      },
      [hasChildren, onToggle, onFocus, tag.id]
    );

    const handleDoubleClick = useCallback(
      (e) => {
        e.stopPropagation();
        navigate(`/tag/${tag.id}`, { state: { fromPageTitle: "Tags" } });
      },
      [navigate, tag.id]
    );

    const handleNavigateClick = useCallback(
      (e) => {
        e.stopPropagation();
        navigate(`/tag/${tag.id}`, { state: { fromPageTitle: "Tags" } });
      },
      [navigate, tag.id]
    );

    const handleKeyDown = useCallback(
      (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          navigate(`/tag/${tag.id}`, { state: { fromPageTitle: "Tags" } });
        }
      },
      [navigate, tag.id]
    );

    // Subtitle: child count or nothing
    const subtitle =
      tag.children?.length > 0
        ? `${tag.children.length} subtag${tag.children.length !== 1 ? "s" : ""}`
        : null;

    // Generate placeholder color from tag id
    const placeholderHue = (parseInt(tag.id, 10) * 137.5) % 360;

    return (
      <div>
        {/* Node row */}
        <div
          ref={ref}
          role="treeitem"
          aria-expanded={hasChildren ? isExpanded : undefined}
          aria-selected={isFocused}
          tabIndex={isFocused ? 0 : -1}
          className={`
            flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer
            transition-colors group
            ${isAncestorOnly ? "opacity-50" : ""}
          `}
          style={{
            marginLeft: `${depth * 24}px`,
            backgroundColor: isFocused
              ? "var(--bg-tertiary)"
              : "transparent",
          }}
          onClick={handleClick}
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
            {tag.scene_count > 0 && (
              <div
                className="flex items-center gap-1"
                title={`${tag.scene_count} scene${tag.scene_count !== 1 ? "s" : ""}`}
              >
                <ENTITY_ICONS.scene
                  size={16}
                  style={{ color: hueify("var(--accent-secondary)", "lighter") }}
                />
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {tag.scene_count}
                </span>
              </div>
            )}

            {/* Image count - images icon */}
            {tag.image_count > 0 && (
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
            {tag.performer_count > 0 && (
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
            {tag.rating100 > 0 && (() => {
              const ratingStyle = getRatingStyle(tag.rating100);
              return (
                <span
                  className="text-xs px-2 py-0.5 rounded font-bold"
                  style={{
                    background: ratingStyle.background,
                    color: ratingStyle.color,
                  }}
                  title={`Rating: ${(tag.rating100 / 10).toFixed(1)}`}
                >
                  {(tag.rating100 / 10).toFixed(1)}
                </span>
              );
            })()}

            {/* O-Counter - droplets icon with info color */}
            {tag.o_counter > 0 && (
              <div
                className="flex items-center gap-1"
                title={`O-Counter: ${tag.o_counter}`}
              >
                <Droplets
                  size={16}
                  style={{ color: "var(--status-info)" }}
                />
                <span className="text-sm" style={{ color: "var(--text-muted)" }}>
                  {tag.o_counter}
                </span>
              </div>
            )}

            {/* Favorite heart */}
            {tag.favorite && (
              <Heart
                size={16}
                fill="var(--accent-primary)"
                style={{ color: "var(--accent-primary)" }}
                title="Favorite"
              />
            )}

            {/* Navigate button - visible on hover */}
            <button
              type="button"
              onClick={handleNavigateClick}
              className="p-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
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
            {tag.children.map((child) => (
              <TagTreeNode
                key={`${tag.id}-${child.id}`}
                tag={child}
                depth={depth + 1}
                isExpanded={expandedIds?.has(child.id) || false}
                expandedIds={expandedIds}
                onToggle={onToggle}
                isAncestorOnly={child.isAncestorOnly || false}
                focusedId={focusedId}
                onFocus={onFocus}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
);

TagTreeNode.displayName = "TagTreeNode";

export default TagTreeNode;
