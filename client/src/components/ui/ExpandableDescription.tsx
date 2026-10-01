import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * A card's description, clamped to `maxLines`.
 *
 * Only a description the clamp actually cut off is interactive: a tap on it
 * opens a popover with the whole text. A description that fits takes no
 * click and shows no pointer, so a tap on it reaches the card's own link.
 * Truncation is measured on the rendered text (its scroll height against its
 * box) when the text mounts or changes, and again when a pointer reaches it,
 * since a card's width, and so its line count, changes with the grid. There is
 * no observer per card: a grid holds hundreds of these.
 */
interface Props {
  description: string | null | undefined;
  maxLines?: number;
}

export const ExpandableDescription = ({ description, maxLines = 3 }: Props) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [isTruncated, setIsTruncated] = useState(false);
  const [popoverPosition, setPopoverPosition] = useState({ top: 0, left: 0 });
  const textRef = useRef<HTMLParagraphElement>(null);

  const descriptionHeight = useMemo(() => {
    return `${maxLines * 1.5}rem`;
  }, [maxLines]);

  const measure = useCallback(() => {
    const text = textRef.current;
    setIsTruncated(!!text && text.scrollHeight > text.clientHeight);
  }, []);

  useLayoutEffect(measure, [measure, description, maxLines]);

  if (!description) {
    return (
      <div
        className="card-description my-1 w-full"
        style={{ height: descriptionHeight }}
      />
    );
  }

  const handleOpen = (e: React.MouseEvent<HTMLParagraphElement>) => {
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
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
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
        <p
          ref={textRef}
          className="card-description leading-relaxed m-0"
          onClick={isTruncated ? handleOpen : undefined}
          onPointerEnter={measure}
          onPointerDown={measure}
          style={{
            color: "var(--text-muted)",
            cursor: isTruncated ? "pointer" : undefined,
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
