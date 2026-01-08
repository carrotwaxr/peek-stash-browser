import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTruncationDetection } from "../../hooks/useTruncationDetection";

/**
 * Description text with inline "...more" link when truncated
 * Clicking "more" opens a popover with full description
 */
export const ExpandableDescription = ({ description, maxLines = 3 }) => {
  const [ref, isTruncated] = useTruncationDetection();
  const [isExpanded, setIsExpanded] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });

  const descriptionHeight = useMemo(() => {
    return `${maxLines * 1.5}rem`;
  }, [maxLines]);

  if (!description) {
    return (
      <div
        className="text-sm my-1 w-full"
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

  // Handle click outside
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  return (
    <>
      <div className="relative w-full my-1" style={{ height: descriptionHeight }}>
        <p
          ref={ref}
          className="text-sm leading-relaxed"
          style={{
            color: "var(--text-muted)",
            height: descriptionHeight,
            display: "-webkit-box",
            WebkitLineClamp: maxLines,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {description}
        </p>
        {isTruncated && (
          <button
            onClick={handleMoreClick}
            className="absolute bottom-0 right-0 text-sm px-1 hover:underline"
            style={{
              color: "var(--accent-primary)",
              backgroundColor: "var(--bg-card)",
            }}
          >
            ...more
          </button>
        )}
      </div>

      {isExpanded &&
        createPortal(
          <div
            className="fixed inset-0 z-[9998]"
            onClick={handleBackdropClick}
          >
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
