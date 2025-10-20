import { forwardRef } from "react";
import { Link } from "react-router-dom";
import { useTVMode } from "../../hooks/useTVMode.js";
import SceneContextMenu from "../ui/SceneContextMenu.jsx";
import SceneCardPreview from "../ui/SceneCardPreview.jsx";
import {
  SceneTitle,
  SceneStats,
  SceneDescription,
  SceneMetadata,
} from "../scene/index.js";

/**
 * Enhanced scene card component with keyboard navigation support
 */
const SceneCard = forwardRef(
  (
    {
      scene,
      onClick,
      onFocus,
      tabIndex = -1,
      className = "",
      isMultiselectMode = false,
      isSelected = false,
      onToggleSelect,
    },
    ref
  ) => {
    const { isTVMode } = useTVMode();

    const handleClick = (e) => {
      // Don't interfere with clicks on interactive elements
      const target = e.target;
      const isInteractive =
        target.closest('button') ||
        target.closest('a') ||
        target.closest('[role="button"]');

      if (isInteractive) {
        return; // Let the interactive element handle the click
      }

      e.preventDefault();
      if (isMultiselectMode) {
        onToggleSelect?.(scene);
      } else {
        onClick?.(scene);
      }
    };

    const handleKeyDown = (e) => {
      // Prevent card navigation when typing in input fields
      const target = e.target;
      const isInputField =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      if (isInputField) {
        return; // Don't handle keyboard events from input fields
      }

      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        if (isMultiselectMode) {
          onToggleSelect?.(scene);
        } else {
          onClick?.(scene);
        }
      } else if (e.key === " " && isMultiselectMode) {
        e.preventDefault();
        e.stopPropagation();
        onToggleSelect?.(scene);
      } else if (e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onClick?.(scene);
      }
    };

    const handleCheckboxClick = (e) => {
      e.stopPropagation();
      onToggleSelect?.(scene);
    };

    return (
      <div
        ref={ref}
        className={`
        relative bg-card rounded-lg border overflow-hidden
        transition-all duration-300 cursor-pointer
        hover:shadow-2xl hover:scale-[1.03] hover:z-10
        hover:border-opacity-80
        ${isTVMode ? "focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2" : ""}
        ${!isTVMode ? "hover:ring-2 hover:ring-blue-500 hover:ring-offset-2" : ""}
        ${isSelected ? "ring-4 ring-blue-500 ring-offset-2" : ""}
        ${className}
      `}
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: isSelected ? "rgb(59, 130, 246)" : "var(--border-color)",
          borderWidth: isSelected ? "2px" : "1px",
        }}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        onFocus={onFocus}
        tabIndex={isTVMode ? tabIndex : -1}
        role="button"
        aria-label={`Scene ${scene.id}`}
      >
        {/* Thumbnail */}
        <div className="relative aspect-video bg-gray-800 overflow-hidden">
          {/* Context Menu */}
          {!isMultiselectMode && <SceneContextMenu sceneId={scene.id} />}

          {/* Multiselect Checkbox Overlay */}
          {isMultiselectMode && (
            <div className="absolute top-2 left-2 z-20">
              <button
                onClick={handleCheckboxClick}
                className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
                  isSelected
                    ? "bg-blue-500 border-blue-500"
                    : "bg-black/50 border-white/70 hover:border-white"
                }`}
                aria-label={isSelected ? "Deselect scene" : "Select scene"}
              >
                {isSelected && (
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M5 13l4 4L19 7"
                    />
                  </svg>
                )}
              </button>
            </div>
          )}

          {scene.paths?.screenshot ? (
            <SceneCardPreview scene={scene} cycleInterval={600} spriteCount={10} />
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

          {/* Overlay with duration and studio */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent pointer-events-none">
            {/* Studio in top-right */}
            {scene.studio && (
              <div className="absolute top-2 right-2 pointer-events-auto">
                <Link
                  to={`/studio/${scene.studio.id}`}
                  className="px-2 py-1 bg-black/70 text-white text-xs rounded inline-block hover:bg-black/90 transition-colors"
                >
                  {scene.studio.name}
                </Link>
              </div>
            )}

            {/* Duration in bottom-right */}
            <div className="absolute bottom-2 right-2 pointer-events-auto">
              {scene.files?.[0]?.duration && (
                <span className="px-2 py-1 bg-black/70 text-white text-xs rounded">
                  {Math.floor(scene.files[0].duration / 60)}m
                </span>
              )}
            </div>
          </div>

          {/* Watch Progress Bar */}
          {scene.resumeTime && scene.files?.[0]?.duration && (
            <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/50">
              <div
                className="h-full bg-green-500 transition-all"
                style={{
                  width: `${Math.min(100, (scene.resumeTime / scene.files[0].duration) * 100)}%`
                }}
                title={`Resume from ${Math.floor(scene.resumeTime / 60)}:${String(Math.floor(scene.resumeTime % 60)).padStart(2, '0')}`}
              />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          {/* Title and Date */}
          <div className="mb-3">
            <SceneTitle
              scene={scene}
              titleClassName="font-semibold mb-1 leading-tight"
              dateClassName="text-xs mt-1"
            />
          </div>

          {/* Stats */}
          <SceneStats
            scene={scene}
            className="mb-3"
          />

          {/* Description */}
          <SceneDescription
            scene={scene}
            lineClamp={3}
            className="mb-3"
          />

          {/* Performers, Tags, Organized */}
          <SceneMetadata
            scene={scene}
            className="mb-2"
          />

        </div>
      </div>
    );
  }
);

SceneCard.displayName = "SceneCard";

export default SceneCard;
