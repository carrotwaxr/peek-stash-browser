import { forwardRef, useMemo } from "react";
import { Link } from "react-router-dom";
import RatingControls from "./RatingControls";
import { CardCountIndicators } from "./CardCountIndicators";
import Tooltip from "./Tooltip";

/**
 * Shared card components for visual consistency across GridCard and SceneCard
 */

/**
 * Card container - base wrapper for all cards
 */
export const CardContainer = forwardRef(
  (
    {
      children,
      className = "",
      entityType = "card",
      linkTo,
      onClick,
      referrerUrl,
      style = {},
      ...others
    },
    ref
  ) => {
    const WrapperElement = linkTo ? Link : "div";
    const entityDisplayType =
      entityType.charAt(0).toUpperCase() + entityType.slice(1);

    const wrapperProps = linkTo
      ? {
          to: linkTo,
          state: { referrerUrl },
        }
      : {
          onClick,
        };

    return (
      <WrapperElement
        aria-label={`${entityDisplayType}`}
        className={`flex flex-col items-center justify-between rounded-lg border p-2 hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer focus:outline-none ${className}`}
        ref={ref}
        role="button"
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
          minHeight: "20rem", // 320px
          maxHeight: "36rem", // 576px
          ...style,
        }}
        {...wrapperProps}
        {...others}
      >
        {children}
      </WrapperElement>
    );
  }
);

CardContainer.displayName = "CardContainer";

/**
 * Card image container with aspect ratio
 */
export const CardImage = ({ aspectRatio, children, className = "" }) => {
  return (
    <div
      className={`w-full mb-3 overflow-hidden rounded-lg ${className}`}
      style={{ aspectRatio }}
    >
      {children}
    </div>
  );
};

/**
 * Default card image component
 * Uses object-contain to show full image without cropping
 * Letterboxing uses theme background color for consistency
 */
export const CardDefaultImage = ({ src, alt, entityType }) => {
  return (
    <div
      className="w-full h-full flex items-center justify-center"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      <img
        className="w-full h-full object-contain"
        src={src}
        alt={alt || `${entityType} image`}
      />
    </div>
  );
};

/**
 * Card title section with configurable line clamping and tooltips
 * @param {string|ReactNode} title - Title content (if ReactNode, tooltip won't be added)
 * @param {string} subtitle - Optional subtitle
 * @param {boolean} hideSubtitle - Whether to hide subtitle (default: false)
 * @param {number} maxTitleLines - Maximum lines for title (default: 1)
 */
export const CardTitle = ({
  title,
  subtitle,
  hideSubtitle = false,
  maxTitleLines = 1,
}) => {
  // Calculate fixed height based on line count
  // Each line is approximately 1.25rem (20px) with leading-tight
  const titleHeight = useMemo(() => {
    return `${maxTitleLines * 1.25}rem`;
  }, [maxTitleLines]);

  const titleIsString = typeof title === "string";

  const titleElement = (
    <h3
      className="font-semibold leading-tight text-center"
      style={{
        color: "var(--text-primary)",
        height: titleHeight,
        display: "-webkit-box",
        WebkitLineClamp: maxTitleLines,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
        textOverflow: "ellipsis",
      }}
    >
      {title}
    </h3>
  );

  return (
    <div className="w-full text-center mb-2">
      {titleIsString ? (
        <Tooltip content={title} disabled={!title || title.length < 30}>
          {titleElement}
        </Tooltip>
      ) : (
        titleElement
      )}
      {!hideSubtitle && (
        <h4
          className="text-sm leading-tight text-center"
          style={{
            color: "var(--text-muted)",
            height: "1.25rem", // Always reserve space for subtitle
            display: "-webkit-box",
            WebkitLineClamp: 1,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={subtitle}
        >
          {subtitle}
        </h4>
      )}
    </div>
  );
};

/**
 * Card description section with configurable line clamping and tooltips
 * @param {string} description - Description text
 * @param {number} maxLines - Maximum lines to display (default: 3)
 */
export const CardDescription = ({ description, maxLines = 3 }) => {
  const descriptionHeight = useMemo(() => {
    return `${maxLines * 1.5}rem`; // ~1.5rem per line for text-sm with leading-relaxed
  }, [maxLines]);

  if (!description) {
    // Return empty div with fixed height to preserve layout consistency
    return (
      <div
        className="text-sm my-1 w-full"
        style={{
          height: descriptionHeight,
        }}
      />
    );
  }

  return (
    <Tooltip content={description} disabled={description.length < 100}>
      <p
        className="text-sm my-1 w-full leading-relaxed"
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
    </Tooltip>
  );
};

/**
 * Card indicators section (always fixed height for consistency)
 */
export const CardIndicators = ({ indicators }) => {
  return (
    <div className="my-2 w-full" style={{ height: "3.5rem" }}>
      {indicators && <CardCountIndicators indicators={indicators} />}
    </div>
  );
};

/**
 * Card rating controls section (always fixed height for consistency)
 */
export const CardRating = ({
  entityType,
  entityId,
  initialRating,
  initialFavorite,
}) => {
  return (
    <div className="my-1" style={{ height: "1.25rem" }}>
      <RatingControls
        entityType={entityType}
        entityId={entityId}
        initialRating={initialRating}
        initialFavorite={initialFavorite}
      />
    </div>
  );
};
