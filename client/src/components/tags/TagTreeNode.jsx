import { forwardRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { LucideChevronRight, LucideStar, LucideExternalLink } from "lucide-react";

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
              <LucideChevronRight
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

          {/* Right side: counts, favorite, navigate */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Scene count badge */}
            {tag.scene_count > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  color: "var(--text-muted)",
                }}
              >
                {tag.scene_count} scenes
              </span>
            )}

            {/* Performer count badge */}
            {tag.performer_count > 0 && (
              <span
                className="text-xs px-2 py-0.5 rounded"
                style={{
                  backgroundColor: "var(--bg-tertiary)",
                  color: "var(--text-muted)",
                }}
              >
                {tag.performer_count} performers
              </span>
            )}

            {/* Favorite star */}
            {tag.favorite && (
              <LucideStar
                size={16}
                fill="var(--accent-primary)"
                style={{ color: "var(--accent-primary)" }}
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
              <LucideExternalLink
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
                isExpanded={false}
                onToggle={onToggle}
                isAncestorOnly={isAncestorOnly}
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
