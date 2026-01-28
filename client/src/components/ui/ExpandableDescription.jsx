import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTruncationDetection } from "../../hooks/useTruncationDetection";

/**
 * Description text with inline "...more" link when truncated
 * Clicking "more" opens a popover with full description
 *
 * Uses a float-based technique to position "more" inline with the last line of text:
 * - A floated spacer element reserves space in the bottom-right corner
 * - The "more" button is positioned absolutely over that reserved space
 * - This ensures "more" appears at the end of the text regardless of line count
 */
export const ExpandableDescription = ({ description, maxLines = 3 }) => {
  const [ref] = useTruncationDetection();
  const [isExpanded, setIsExpanded] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });

  const descriptionHeight = useMemo(() => {
    return `${maxLines * 1.5}rem`;
  }, [maxLines]);

  if (!description) {
    return (
      <div
        className="card-description my-1 w-full"
        style={{ height: descriptionHeight }}
      />
    );
  }

  const handleMoreClick = (e) => {
    e.stopPropagation();
    e.preventDefault();

    const rect = e.currentTarget.getBoundingClientRect();
    setPopoverPosition({
      top: rect.bottom + 8,
      left: Math.max(16, rect.left - 100),
    });
    setIsExpanded(true);
  };

  const handleClose = () => {
    setIsExpanded(false);
  };

  // Handle click outside - stop propagation to prevent card navigation
  const handleBackdropClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    handleClose();
  };

  return (
    <>
      <div
        className="relative w-full my-1 overflow-hidden"
        style={{ height: descriptionHeight }}
      >
        {/*
          Float-based inline "more" technique:
          1. Floated spacer creates empty space at bottom-right
          2. Text flows around it naturally
          3. "more" button positioned over the spacer
        */}
        <p
          ref={ref}
          className="card-description leading-relaxed m-0"
          onClick={handleMoreClick}
          style={{
            color: "var(--text-muted)",
            display: "-webkit-box",
            WebkitLineClamp: maxLines,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {description}
        </p>
      </div>

      {isExpanded &&
        createPortal(
          <div className="fixed inset-0 z-[9998]" onClick={handleBackdropClick}>
            <div
              className="fixed z-[9999] px-4 py-3 text-sm rounded-lg shadow-xl max-w-[80%] lg:max-w-[60%] max-h-[60vh] overflow-y-auto"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                color: "var(--text-primary)",
                border: "1px solid var(--border-color)",
                top: `${popoverPosition.top}px`,
                left: `${popoverPosition.left}px`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="whitespace-pre-wrap">{description}</p>
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
