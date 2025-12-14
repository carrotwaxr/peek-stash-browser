/* eslint-disable react-refresh/only-export-components */
import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useHiddenEntities } from "../../hooks/useHiddenEntities.js";
import { libraryApi } from "../../services/api";
import { CardCountIndicators } from "./CardCountIndicators";
import EntityMenu from "./EntityMenu.jsx";
import FavoriteButton from "./FavoriteButton";
import HideConfirmationDialog from "./HideConfirmationDialog.jsx";
import OCounterButton from "./OCounterButton";
import RatingBadge from "./RatingBadge";
import RatingSliderDialog from "./RatingSliderDialog";
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
 * CardImage - Image container with aspect ratio and built-in lazy loading
 * @param {Object} props
 * @param {string} [props.src] - Image source URL
 * @param {string} [props.alt] - Alt text for image
 * @param {string} [props.aspectRatio] - CSS aspect ratio (e.g., "16/9", "2/3")
 * @param {string} [props.entityType] - Entity type for placeholder icon
 * @param {'cover'|'contain'} [props.objectFit] - How image should fit container (default: 'contain')
 * @param {React.ReactNode} [props.children] - Overlay content
 * @param {string} [props.className] - Additional CSS classes
 * @param {Object} [props.style] - Additional inline styles
 * @param {Function} [props.onClick] - Click handler
 */
export const CardImage = ({
  src,
  alt = "",
  aspectRatio = "16/9",
  entityType,
  objectFit = "contain",
  children,
  className = "",
  style = {},
  onClick,
}) => {
  const [ref, isVisible] = useLazyLoad();
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const showPlaceholder = !src || hasError;

  const getPlaceholderIcon = () => {
    const icons = {
      performer: (
        <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
        </svg>
      ),
      scene: (
        <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm3 2h6v4H7V5zm8 8v2h1v-2h-1zm-2-2H7v4h6v-4zm2 0h1V9h-1v2zm1-4V5h-1v2h1zM5 5v2H4V5h1zm0 4H4v2h1V9zm-1 4h1v2H4v-2z" clipRule="evenodd" />
        </svg>
      ),
      gallery: (
        <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
        </svg>
      ),
      default: (
        <svg className="w-16 h-16" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
        </svg>
      ),
    };
    return icons[entityType] || icons.default;
  };

  return (
    <div
      ref={ref}
      className={`w-full mb-3 overflow-hidden rounded-lg relative ${className}`}
      style={{
        aspectRatio,
        backgroundColor: "var(--bg-secondary)",
        ...style,
      }}
      onClick={onClick}
    >
      {showPlaceholder ? (
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ color: "var(--text-muted)" }}
        >
          {getPlaceholderIcon()}
        </div>
      ) : (
        <>
          {/* Placeholder shown while loading */}
          {!isLoaded && (
            <div
              className="absolute inset-0 animate-pulse"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            />
          )}
          {/* Actual image - only render when visible for lazy loading */}
          {isVisible && (
            <img
              src={src}
              alt={alt}
              className={`absolute inset-0 w-full h-full transition-opacity duration-200 ${
                isLoaded ? "opacity-100" : "opacity-0"
              }`}
              style={{ objectFit }}
              onLoad={() => setIsLoaded(true)}
              onError={() => setHasError(true)}
            />
          )}
        </>
      )}
      {/* Children rendered as overlay */}
      {children}
    </div>
  );
};

/**
 * Hook for true lazy loading via IntersectionObserver
 * Returns [ref, shouldLoad] - attach ref to container, use shouldLoad to conditionally set src
 */
export const useLazyLoad = (rootMargin = "200px") => {
  const ref = useRef(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (!ref.current || shouldLoad) return;

    // Check for IntersectionObserver support (for SSR or old browsers)
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    let observer;
    try {
      observer = new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting) {
            setShouldLoad(true);
            observer.disconnect();
          }
        },
        { rootMargin, threshold: 0 }
      );
      observer.observe(ref.current);
    } catch {
      // Fallback: load immediately if observer fails
      setShouldLoad(true);
      return;
    }

    return () => observer?.disconnect();
  }, [shouldLoad, rootMargin]);

  return [ref, shouldLoad];
};

/**
 * Lazy-loaded image component
 * Uses IntersectionObserver to only load images when they enter the viewport
 * This prevents overwhelming the proxy with 24+ simultaneous requests
 */
export const LazyImage = ({ src, alt, className, style, onClick }) => {
  const [ref, shouldLoad] = useLazyLoad();

  return (
    <div ref={ref} className={className} style={style} onClick={onClick}>
      {shouldLoad && src ? (
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <div
          className="w-full h-full"
          style={{ backgroundColor: "var(--bg-secondary)" }}
        />
      )}
    </div>
  );
};

/**
 * Default card image component with true lazy loading
 * Uses IntersectionObserver to only load images when they enter the viewport
 * This prevents overwhelming the proxy with 24+ simultaneous requests
 */
export const CardDefaultImage = ({ src, alt, entityType }) => {
  const [ref, shouldLoad] = useLazyLoad();

  return (
    <div
      ref={ref}
      className="w-full h-full flex items-center justify-center"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      <img
        className="w-full h-full object-contain"
        src={shouldLoad ? src : undefined}
        alt={alt || `${entityType} image`}
      />
    </div>
  );
};

/**
 * CardOverlay - Positioned overlay container for progress bars, selection checkboxes, etc.
 * @param {Object} props
 * @param {'top-left'|'top-right'|'bottom-left'|'bottom-right'|'full'} props.position - Position of overlay
 * @param {React.ReactNode} props.children - Content to render in overlay
 * @param {string} [props.className] - Additional CSS classes
 */
export const CardOverlay = ({ position = "bottom-left", children, className = "" }) => {
  const positionClasses = {
    "top-left": "absolute top-0 left-0",
    "top-right": "absolute top-0 right-0",
    "bottom-left": "absolute bottom-0 left-0",
    "bottom-right": "absolute bottom-0 right-0",
    "full": "absolute inset-0",
  };

  return (
    <div className={`${positionClasses[position]} ${className}`}>
      {children}
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
 * Card rating and favorite row (always fixed height for consistency)
 * Shows rating badge (left), O counter (center-right), and favorite button (right)
 * O Counter is interactive for scenes, display-only for other entities
 * @param {Function} onHideSuccess - Callback when entity is successfully hidden (for parent to update state)
 */
export const CardRatingRow = ({
  entityType,
  entityId,
  initialRating,
  initialFavorite,
  initialOCounter,
  entityTitle,
  onHideSuccess,
}) => {
  const [rating, setRating] = useState(initialRating);
  const [isFavorite, setIsFavorite] = useState(initialFavorite);
  const [oCounter, setOCounter] = useState(initialOCounter);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [hideDialogOpen, setHideDialogOpen] = useState(false);
  const [pendingHide, setPendingHide] = useState(null);
  const badgeRef = useRef(null);
  const { hideEntity, hideConfirmationDisabled } = useHiddenEntities();

  // Sync state when initial values change (e.g., on data refresh)
  useEffect(() => {
    setRating(initialRating);
  }, [initialRating]);

  useEffect(() => {
    setIsFavorite(initialFavorite);
  }, [initialFavorite]);

  useEffect(() => {
    setOCounter(initialOCounter);
  }, [initialOCounter]);

  const handleRatingSave = async (newRating) => {
    setRating(newRating);
    try {
      await libraryApi.updateRating(entityType, entityId, newRating);
    } catch (error) {
      console.error("Failed to update rating:", error);
      setRating(initialRating); // Revert on error
    }
  };

  const handleFavoriteChange = async (newValue) => {
    setIsFavorite(newValue);
    try {
      await libraryApi.updateFavorite(entityType, entityId, newValue);
    } catch (error) {
      console.error("Failed to update favorite:", error);
      setIsFavorite(initialFavorite); // Revert on error
    }
  };

  const handleOCounterChange = (newCount) => {
    setOCounter(newCount);
  };

  const handleHideClick = async (hideInfo) => {
    // If confirmation is disabled, hide immediately without dialog
    if (hideConfirmationDisabled) {
      const success = await hideEntity({
        ...hideInfo,
        skipConfirmation: true,
      });

      if (success) {
        // Notify parent to update state (remove item from grid)
        onHideSuccess?.(entityId, entityType);
      }
    } else {
      // Show confirmation dialog
      setPendingHide(hideInfo);
      setHideDialogOpen(true);
    }
  };

  const handleHideConfirm = async (dontAskAgain) => {
    if (!pendingHide) return;

    const success = await hideEntity({
      ...pendingHide,
      skipConfirmation: dontAskAgain,
    });

    setHideDialogOpen(false);
    setPendingHide(null);

    if (success) {
      // Notify parent to update state (remove item from grid)
      onHideSuccess?.(entityId, entityType);
    }
  };

  const handleHideCancel = () => {
    setHideDialogOpen(false);
    setPendingHide(null);
  };

  // Check if this is a scene (only scenes allow interactive O counter)
  const isScene = entityType === "scene";

  return (
    <>
      <div
        className="flex justify-between items-center w-full my-1"
        style={{ height: "2rem" }}
      >
        {/* Left side: Rating badge */}
        <div ref={badgeRef}>
          <RatingBadge
            rating={rating}
            onClick={() => setDialogOpen(true)}
            size="small"
          />
        </div>

        {/* Right side: O Counter + Favorite + EntityMenu */}
        <div className="flex items-center gap-2">
          <OCounterButton
            sceneId={isScene ? entityId : null}
            initialCount={oCounter ?? 0}
            onChange={handleOCounterChange}
            size="small"
            variant="card"
            interactive={isScene}
          />
          <FavoriteButton
            isFavorite={isFavorite}
            onChange={handleFavoriteChange}
            size="small"
            variant="card"
          />
          <EntityMenu
            entityType={entityType}
            entityId={entityId}
            entityName={entityTitle}
            onHide={handleHideClick}
          />
        </div>
      </div>

      <RatingSliderDialog
        isOpen={dialogOpen}
        onClose={() => setDialogOpen(false)}
        initialRating={rating}
        onSave={handleRatingSave}
        entityType={entityType}
        entityTitle={entityTitle}
        anchorEl={badgeRef.current}
      />

      <HideConfirmationDialog
        isOpen={hideDialogOpen}
        onClose={handleHideCancel}
        onConfirm={handleHideConfirm}
        entityType={pendingHide?.entityType}
        entityName={pendingHide?.entityName}
      />
    </>
  );
};
