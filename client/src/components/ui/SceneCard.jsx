import { forwardRef } from "react";
import { Link } from "react-router-dom";
import {
  getSceneTitle,
  getSceneDescription,
  formatFileSize,
} from "../../utils/format.js";
import { formatRelativeTime } from "../../utils/date.js";
import Tooltip from "../ui/Tooltip.jsx";

/**
 * Enhanced scene card component with keyboard navigation support
 */
const SceneCard = forwardRef(
  ({ scene, onClick, onFocus, tabIndex = -1, className = "" }, ref) => {
    const title = getSceneTitle(scene);
    const description = getSceneDescription(scene);

    // Prepare tooltip content for performers
    const performersContent =
      scene.performers && scene.performers.length > 0 ? (
        <div>
          <div className="font-semibold mb-1">Performers:</div>
          {scene.performers.map((p) => p.name).join(", ")}
        </div>
      ) : null;

    // Prepare tooltip content for tags
    const tagsContent =
      scene.tags && scene.tags.length > 0 ? (
        <div>
          <div className="font-semibold mb-1">Tags:</div>
          {scene.tags.map((t) => t.name).join(", ")}
        </div>
      ) : null;

    const handleClick = (e) => {
      e.preventDefault();
      onClick?.(scene);
    };

    const handleKeyDown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onClick?.(scene);
      }
    };

    return (
      <div
        ref={ref}
        className={`
        relative bg-card rounded-lg border border-border overflow-hidden
        transition-all duration-200 cursor-pointer
        hover:shadow-lg hover:scale-105
        focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
        keyboard-focused:ring-2 keyboard-focused:ring-yellow-400 keyboard-focused:ring-offset-2
        ${className}
      `}
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        tabIndex={tabIndex}
        role="button"
        aria-label={`Scene: ${title}`}
      >
        {/* Thumbnail */}
        <div className="relative aspect-video bg-gray-800 overflow-hidden">
          {scene.paths?.screenshot ? (
            <img
              src={scene.paths.screenshot}
              alt={title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <svg
                className="w-12 h-12 text-gray-400"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          )}

          {/* Overlay with duration only */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent">
            <div className="absolute bottom-2 right-2">
              {scene.files?.[0]?.duration && (
                <span className="px-2 py-1 bg-black/70 text-white text-xs rounded">
                  {Math.floor(scene.files[0].duration / 60)}m
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Title - 2 lines max */}
          <Tooltip content={title} disabled={title.length <= 50}>
            <h3
              className="font-semibold mb-2 leading-tight"
              style={{
                color: "var(--text-primary)",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                minHeight: "2.5rem", // Ensure consistent height for 2 lines
                maxHeight: "2.5rem",
              }}
              title={title}
            >
              {title}
            </h3>
          </Tooltip>

          {/* Rating, O-Count, Play Count - Fixed height container */}
          <div
            className="flex items-center space-x-3 mb-3 text-xs"
            style={{ color: "var(--text-muted)", minHeight: "1.125rem" }}
          >
            {scene.rating100 ? (
              <span className="flex items-center">
                ⭐ {Math.round(scene.rating100 / 20)}/5
              </span>
            ) : (
              <span className="flex items-center italic">⭐ No rating</span>
            )}

            {scene.o_counter > 0 ? (
              <span className="flex items-center">💦 {scene.o_counter}</span>
            ) : (
              <span className="flex items-center italic">💦 0</span>
            )}

            {scene.play_count > 0 ? (
              <span className="flex items-center">▶ {scene.play_count}</span>
            ) : (
              <span className="flex items-center italic">▶ 0</span>
            )}
          </div>

          {/* Description - Always takes space for consistent card height */}
          <div className="mb-3" style={{ minHeight: "3.75rem" }}>
            <Tooltip
              content={description || "No scene description available"}
              disabled={!description || description.length <= 100}
            >
              <p
                className="text-sm leading-relaxed"
                style={{
                  color: description
                    ? "var(--text-muted)"
                    : "var(--text-muted)",
                  fontStyle: description ? "normal" : "italic",
                  display: "-webkit-box",
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: "vertical",
                  overflow: "hidden",
                  minHeight: "3.75rem",
                  maxHeight: "3.75rem",
                }}
              >
                {description || "No scene description"}
              </p>
            </Tooltip>
          </div>

          {/* Performers and Tags - Fixed height container */}
          <div className="mb-3" style={{ minHeight: "2.5rem" }}>
            {/* Performers Row */}
            <div className="mb-1" style={{ minHeight: "1.125rem" }}>
              {scene.performers && scene.performers.length > 0 ? (
                <Tooltip content={performersContent}>
                  <div
                    className="flex items-center text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <svg
                      className="w-3 h-3 mr-1 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <div className="truncate flex flex-wrap gap-1">
                      {scene.performers.slice(0, 2).map((performer, index) => (
                        <span key={performer.id}>
                          <Link
                            to={`/performer/${performer.id}`}
                            className="hover:text-blue-400 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {performer.name}
                          </Link>
                          {index < Math.min(scene.performers.length, 2) - 1 &&
                            ", "}
                        </span>
                      ))}
                      {scene.performers.length > 2 &&
                        ` +${scene.performers.length - 2}`}
                    </div>
                  </div>
                </Tooltip>
              ) : (
                <div
                  className="flex items-center text-xs"
                  style={{ color: "var(--text-muted)", fontStyle: "italic" }}
                >
                  <svg
                    className="w-3 h-3 mr-1 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>No performers</span>
                </div>
              )}
            </div>

            {/* Tags Row */}
            <div style={{ minHeight: "1.125rem" }}>
              {scene.tags && scene.tags.length > 0 ? (
                <Tooltip content={tagsContent}>
                  <div
                    className="flex items-center text-xs"
                    style={{ color: "var(--text-muted)" }}
                  >
                    <svg
                      className="w-3 h-3 mr-1 flex-shrink-0"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <div className="truncate flex flex-wrap gap-1">
                      {scene.tags.slice(0, 3).map((tag, index) => (
                        <span key={tag.id}>
                          <Link
                            to={`/tag/${tag.id}`}
                            className="hover:text-blue-400 hover:underline"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {tag.name}
                          </Link>
                          {index < Math.min(scene.tags.length, 3) - 1 && ", "}
                        </span>
                      ))}
                      {scene.tags.length > 3 && ` +${scene.tags.length - 3}`}
                    </div>
                  </div>
                </Tooltip>
              ) : (
                <div
                  className="flex items-center text-xs"
                  style={{ color: "var(--text-muted)", fontStyle: "italic" }}
                >
                  <svg
                    className="w-3 h-3 mr-1 flex-shrink-0"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M17.707 9.293a1 1 0 010 1.414l-7 7a1 1 0 01-1.414 0l-7-7A.997.997 0 012 10V5a3 3 0 013-3h5c.256 0 .512.098.707.293l7 7zM5 6a1 1 0 100-2 1 1 0 000 2z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>No tags</span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom Metadata - Fixed height container */}
          <div className="mb-2" style={{ minHeight: "1rem" }}>
            <div
              className="flex items-center justify-between text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              <div className="flex items-center space-x-2">
                {scene.studio?.name ? (
                  <Link
                    to={`/studio/${scene.studio.id}`}
                    className="truncate max-w-24 hover:text-blue-400 hover:underline"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {scene.studio.name}
                  </Link>
                ) : (
                  <span className="italic">No studio</span>
                )}
                {scene.date ? (
                  <span>{formatRelativeTime(scene.date)}</span>
                ) : (
                  <span className="italic">No date</span>
                )}
              </div>

              {scene.files?.[0]?.size && (
                <span>{formatFileSize(scene.files[0].size)}</span>
              )}
            </div>
          </div>

          {/* Organization indicator - Fixed height */}
          <div className="flex justify-end" style={{ minHeight: "1rem" }}>
            {scene.organized && (
              <div className="text-green-500 text-xs">✓ Organized</div>
            )}
          </div>
        </div>
      </div>
    );
  }
);

SceneCard.displayName = "SceneCard";

export default SceneCard;
