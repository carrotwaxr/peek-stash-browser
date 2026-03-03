/* eslint-disable react-refresh/only-export-components */
import { forwardRef, useCallback, useEffect, useRef, useState, type ReactNode, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { useHiddenEntities } from "../../hooks/useHiddenEntities";
import { libraryApi } from "../../api";
import { CardCountIndicators } from "./CardCountIndicators";
import EntityMenu from "./EntityMenu";
import FavoriteButton from "./FavoriteButton";
import HideConfirmationDialog from "./HideConfirmationDialog";
import OCounterButton from "./OCounterButton";
import RatingBadge from "./RatingBadge";
import RatingSliderDialog from "./RatingSliderDialog";
import { ExpandableDescription } from "./ExpandableDescription";
import MarqueeText from "./MarqueeText";

/**
 * Shared card components for visual consistency across GridCard and SceneCard
 */

interface CardContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
  entityType?: string;
  onClick?: (event: React.MouseEvent<HTMLDivElement>) => void;
  style?: CSSProperties;
}

/**
 * Card container - base wrapper for all cards
 */
export const CardContainer = forwardRef<HTMLDivElement, CardContainerProps>(
  (
    {
      children,
      className = "",
      entityType = "card",
      onClick,
      style = {},
      ...others
    },
    ref
  ) => {
    const entityDisplayType =
      entityType.charAt(0).toUpperCase() + entityType.slice(1);

    return (
      <div
        aria-label={`${entityDisplayType}`}
        className={`flex flex-col items-center justify-between rounded-lg border p-2 hover:shadow-lg hover:scale-[1.02] transition-all focus:outline-none ${className}`}
        ref={ref}
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
          ...style,
        }}
        onClick={onClick}
        {...others}
      >
        {children}
      </div>
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
 * @param {string} [props.linkTo] - Navigation link URL
  * @param {string} [props.fromPageTitle] - Page title for back navigation context
 * @param {Function} [props.onClickOverride] - Intercepts clicks on Link before navigation (call e.preventDefault() to block)
 */
interface CardImageProps {
  src?: string | null;
  alt?: string;
  aspectRatio?: string;
  entityType?: string;
  objectFit?: "cover" | "contain";
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: (event: React.MouseEvent) => void;
  linkTo?: string;
  fromPageTitle?: string;
  linkState?: Record<string, unknown>;
  onClickOverride?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

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
  linkTo,
  fromPageTitle,
  linkState = {},
  onClickOverride,
}: CardImageProps) => {
  const [lazyRef, isVisible] = useLazyLoad();
  const ref = lazyRef as React.RefObject<HTMLAnchorElement & HTMLDivElement | null>;
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isVideo, setIsVideo] = useState(false);

  // Reset state when src changes
  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
    setIsVideo(false);
  }, [src]);

  const showPlaceholder = !src || hasError;

  // Handle image error - check if it's actually a video file
  const handleImageError = useCallback(async () => {
    if (!src) {
      setHasError(true);
      return;
    }

    // Check Content-Type via HEAD request to determine if it's actually a video
    // This handles cases where tag images are video files (.mp4, .webm)
    try {
      const res = await fetch(src, { method: "HEAD" });
      const contentType = res.headers.get("Content-Type");

      if (contentType?.startsWith("video/")) {
        setIsVideo(true);
        return;
      }
    } catch {
      // Network error or CORS issue - fall through to error state
    }

    setHasError(true);
  }, [src]);

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
    return icons[entityType as keyof typeof icons] || icons.default;
  };

  const imageContent = (
    <>
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
          {/* Actual media - only render when visible for lazy loading */}
          {isVisible && (
            isVideo ? (
              <video
                src={src}
                autoPlay
                loop
                muted
                playsInline
                aria-hidden="true"
                className={`absolute inset-0 w-full h-full transition-opacity duration-200 ${
                  isLoaded ? "opacity-100" : "opacity-0"
                }`}
                style={{ objectFit }}
                onLoadedData={() => setIsLoaded(true)}
                onError={() => setHasError(true)}
              />
            ) : (
              <img
                src={src}
                alt={alt}
                className={`absolute inset-0 w-full h-full transition-opacity duration-200 ${
                  isLoaded ? "opacity-100" : "opacity-0"
                }`}
                style={{ objectFit }}
                onLoad={() => setIsLoaded(true)}
                onError={handleImageError}
              />
            )
          )}
        </>
      )}
    </>
  );

  const containerClasses = `w-full mb-3 overflow-hidden rounded-lg relative ${linkTo ? 'cursor-pointer' : ''} ${className}`;
  const containerStyle = {
    aspectRatio,
    backgroundColor: "var(--bg-secondary)",
    ...style,
  };

  // If linkTo provided, wrap in Link; otherwise use div with onClick
  if (linkTo) {
    const stateToPass = { fromPageTitle, ...linkState };
    return (
      <Link
        ref={ref}
        to={linkTo}
        state={stateToPass}
        className={containerClasses}
        style={containerStyle}
        onClick={onClickOverride}
      >
        {imageContent}
        {/* Children rendered as overlay */}
        {children}
      </Link>
    );
  }

  return (
    <div
      ref={ref}
      className={containerClasses}
      style={containerStyle}
      onClick={onClick}
    >
      {imageContent}
      {/* Children rendered as overlay */}
      {children}
    </div>
  );
};

/**
 * Hook for true lazy loading via IntersectionObserver
 * Returns [ref, shouldLoad] - attach ref to container, use shouldLoad to conditionally set src
 */
export const useLazyLoad = (rootMargin = "200px"): [React.RefObject<HTMLElement | null>, boolean] => {
  const ref = useRef<HTMLElement | null>(null);
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (!ref.current || shouldLoad) return;

    // Check for IntersectionObserver support (for SSR or old browsers)
    if (typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }

    let observer: IntersectionObserver;
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
interface LazyImageProps {
  src?: string | null;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  onClick?: (event: React.MouseEvent) => void;
}

export const LazyImage = ({ src, alt, className, style, onClick }: LazyImageProps) => {
  const [ref, shouldLoad] = useLazyLoad() as [React.RefObject<HTMLDivElement | null>, boolean];

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
interface CardDefaultImageProps {
  src?: string | null;
  alt?: string;
  entityType?: string;
}

export const CardDefaultImage = ({ src, alt, entityType }: CardDefaultImageProps) => {
  const [ref, shouldLoad] = useLazyLoad() as [React.RefObject<HTMLDivElement | null>, boolean];

  return (
    <div
      ref={ref}
      className="w-full h-full flex items-center justify-center"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      <img
        className="w-full h-full object-contain"
        src={shouldLoad ? (src ?? undefined) : undefined}
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
interface CardOverlayProps {
  position?: "top-left" | "top-right" | "bottom-left" | "bottom-right" | "full";
  children: ReactNode;
  className?: string;
}

export const CardOverlay = ({ position = "bottom-left", children, className = "" }: CardOverlayProps) => {
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
 * Card title section with auto-scrolling marquee for overflowing text
 * Single line titles that scroll horizontally when text overflows.
 * Replaces tooltip hover behavior with animated reveal.
 *
 * @param {string|ReactNode} title - Title content (if ReactNode, marquee won't apply)
 * @param {string} subtitle - Optional subtitle
 * @param {boolean} hideSubtitle - Whether to hide subtitle (default: false)
 * @param {string} [linkTo] - Navigation link URL
 * @param {string} [fromPageTitle] - Page title for back navigation context
 * @param {Function} [onClickOverride] - Intercepts clicks on Link before navigation (call e.preventDefault() to block)
 */
interface CardTitleProps {
  title: string | ReactNode;
  subtitle?: string | null;
  hideSubtitle?: boolean;
  linkTo?: string;
  fromPageTitle?: string;
  linkState?: Record<string, unknown>;
  onClickOverride?: (event: React.MouseEvent<HTMLAnchorElement>) => void;
}

export const CardTitle = ({
  title,
  subtitle,
  hideSubtitle = false,
  linkTo,
  fromPageTitle,
  linkState = {},
  onClickOverride,
}: CardTitleProps) => {
  const titleIsString = typeof title === "string";

  // String titles use MarqueeText for auto-scroll on overflow
  const titleElement = titleIsString ? (
    <MarqueeText
      className="card-title font-semibold leading-tight"
      style={{ color: "var(--text-primary)" }}
    >
      {title}
    </MarqueeText>
  ) : (
    // ReactNode titles (like PerformerCard with gender icon) render as-is
    <div
      className="card-title font-semibold leading-tight text-center overflow-hidden whitespace-nowrap text-ellipsis"
      style={{ color: "var(--text-primary)" }}
    >
      {title}
    </div>
  );

  // Wrap in Link if linkTo provided
  const titleContent = linkTo ? (
    <Link
      to={linkTo}
      state={{ fromPageTitle, ...linkState }}
      className="block hover:underline cursor-pointer"
      onClick={onClickOverride}
    >
      {titleElement}
    </Link>
  ) : (
    titleElement
  );

  // Only render subtitle when it has content and isn't hidden
  const shouldShowSubtitle = !hideSubtitle && subtitle;

  // Subtitle also uses MarqueeText for consistency
  const subtitleElement = shouldShowSubtitle ? (
    <MarqueeText
      className="card-subtitle leading-tight"
      style={{ color: "var(--text-muted)" }}
    >
      {subtitle}
    </MarqueeText>
  ) : null;

  const subtitleContent = linkTo && subtitleElement ? (
    <Link
      to={linkTo}
      state={{ fromPageTitle, ...linkState }}
      className="block cursor-pointer"
      onClick={onClickOverride}
    >
      {subtitleElement}
    </Link>
  ) : (
    subtitleElement
  );

  return (
    <div className="w-full text-center mb-2">
      {titleContent}
      {subtitleContent}
    </div>
  );
};

/**
 * Card description section with expandable "more" link when truncated
 * @param {string} description - Description text
 * @param {number} maxLines - Maximum lines to display (default: 3)
 */
interface CardDescriptionProps {
  description: string | null | undefined;
  maxLines?: number;
}

export const CardDescription = ({ description, maxLines = 3 }: CardDescriptionProps) => {
  return (
    <ExpandableDescription description={description} maxLines={maxLines} />
  );
};

/**
 * Card indicators section - renders indicators with optional menu on the right
 * @param {Array} indicators - Array of indicator objects
 * @param {React.ReactNode} menuComponent - Optional menu component to render on the right
 */
interface IndicatorItem {
  type: string;
  count?: number;
  tooltipContent?: ReactNode;
  onClick?: (e: React.MouseEvent) => void;
}

interface CardIndicatorsProps {
  indicators?: IndicatorItem[];
  menuComponent?: ReactNode;
}

export const CardIndicators = ({ indicators, menuComponent }: CardIndicatorsProps) => {
  const hasIndicators = indicators && indicators.length > 0;

  // Don't render anything if no indicators and no menu
  if (!hasIndicators && !menuComponent) {
    return null;
  }

  return (
    <div className="my-2 w-full flex items-center">
      <div className="flex-1">
        {hasIndicators && <CardCountIndicators indicators={indicators as Parameters<typeof CardCountIndicators>[0]['indicators']} />}
      </div>
      {menuComponent && (
        <div className="flex-shrink-0 ml-2">
          {menuComponent}
        </div>
      )}
    </div>
  );
};

/**
 * Standalone menu row - used when menu should appear without rating controls
 * Renders just the ellipsis menu on its own row
 */
interface CardMenuRowProps {
  entityType: string;
  entityId: string;
  entityTitle?: string;
  onHideSuccess?: (entityId: string, entityType: string) => void;
}

interface HideInfo {
  entityType: string;
  entityId: string;
  entityName: string;
  skipConfirmation?: boolean;
}

export const CardMenuRow = ({ entityType, entityId, entityTitle, onHideSuccess }: CardMenuRowProps) => {
  const [hideDialogOpen, setHideDialogOpen] = useState(false);
  const [pendingHide, setPendingHide] = useState<HideInfo | null>(null);
  const { hideEntity, hideConfirmationDisabled } = useHiddenEntities();

  const handleHideClick = async (hideInfo: HideInfo) => {
    if (hideConfirmationDisabled) {
      const success = await hideEntity({
        ...hideInfo,
        skipConfirmation: true,
      });
      if (success) {
        onHideSuccess?.(entityId, entityType);
      }
    } else {
      setPendingHide(hideInfo);
      setHideDialogOpen(true);
    }
  };

  const handleHideConfirm = async (dontAskAgain: boolean) => {
    if (!pendingHide) return;
    const success = await hideEntity({
      ...pendingHide,
      skipConfirmation: dontAskAgain,
    });
    setHideDialogOpen(false);
    setPendingHide(null);
    if (success) {
      onHideSuccess?.(entityId, entityType);
    }
  };

  return (
    <>
      <div
        className="flex justify-end items-center w-full my-1"
        style={{ height: "1.5rem" }}
      >
        <EntityMenu
          entityType={entityType}
          entityId={entityId}
          entityName={entityTitle || ""}
          onHide={handleHideClick}
        />
      </div>
      <HideConfirmationDialog
        isOpen={hideDialogOpen}
        onClose={() => {
          setHideDialogOpen(false);
          setPendingHide(null);
        }}
        onConfirm={handleHideConfirm}
        entityType={pendingHide?.entityType ?? ""}
        entityName={pendingHide?.entityName ?? ""}
      />
    </>
  );
};

/**
 * Card rating and favorite row - uses compact height when only menu is visible
 * Shows rating badge (left), O counter (center-right), and favorite button (right)
 * O Counter is interactive for scenes and images, display-only for other entities
 * @param {string} entityType - Type of entity (scene, performer, etc.)
 * @param {string} entityId - Entity ID
 * @param {string|null} instanceId - Stash instance ID for multi-instance support
 * @param {Function} onHideSuccess - Callback when entity is successfully hidden (for parent to update state)
 * @param {Function} onOCounterChange - Callback when O counter changes (for parent to update state)
 * @param {Function} onRatingChange - Callback when rating changes (for parent to update state)
 * @param {Function} onFavoriteChange - Callback when favorite changes (for parent to update state)
 * @param {boolean} showRating - Whether to show the rating badge (default: true)
 * @param {boolean} showFavorite - Whether to show the favorite button (default: true)
 * @param {boolean} showOCounter - Whether to show the O counter (default: true)
 * @param {boolean} showMenu - Whether to show the menu in this row (default: true)
 */
interface CardRatingRowProps {
  entityType: string;
  entityId: string;
  instanceId?: string | null;
  initialRating: number | null | undefined;
  initialFavorite: boolean;
  initialOCounter: number | null | undefined;
  entityTitle?: string;
  onHideSuccess?: (entityId: string, entityType: string) => void;
  onOCounterChange?: (entityId: string, count: number) => void;
  onRatingChange?: (entityId: string, rating: number | null) => void;
  onFavoriteChange?: (entityId: string, isFavorite: boolean) => void;
  showRating?: boolean;
  showFavorite?: boolean;
  showOCounter?: boolean;
  showMenu?: boolean;
}

export const CardRatingRow = ({
  entityType,
  entityId,
  instanceId = null,
  initialRating,
  initialFavorite,
  initialOCounter,
  entityTitle,
  onHideSuccess,
  onOCounterChange,
  onRatingChange,
  onFavoriteChange,
  showRating = true,
  showFavorite = true,
  showOCounter = true,
  showMenu = true,
}: CardRatingRowProps) => {
  const [rating, setRating] = useState(initialRating);
  const [isFavorite, setIsFavorite] = useState(initialFavorite);
  const [oCounter, setOCounter] = useState(initialOCounter);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [hideDialogOpen, setHideDialogOpen] = useState(false);
  const [pendingHide, setPendingHide] = useState<HideInfo | null>(null);
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

  const handleRatingSave = async (newRating: number | null) => {
    setRating(newRating);
    try {
      await libraryApi.updateRating(entityType, entityId, newRating, instanceId);
      // Notify parent of the change
      onRatingChange?.(entityId, newRating);
    } catch (error) {
      console.error("Failed to update rating:", error);
      setRating(initialRating); // Revert on error
    }
  };

  const handleFavoriteChange = async (newValue: boolean) => {
    setIsFavorite(newValue);
    try {
      await libraryApi.updateFavorite(entityType, entityId, newValue, instanceId);
      // Notify parent of the change
      onFavoriteChange?.(entityId, newValue);
    } catch (error) {
      console.error("Failed to update favorite:", error);
      setIsFavorite(initialFavorite); // Revert on error
    }
  };

  const handleOCounterChange = (newCount: number) => {
    setOCounter(newCount);
    // Notify parent of the change
    onOCounterChange?.(entityId, newCount);
  };

  const handleHideClick = async (hideInfo: HideInfo) => {
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

  const handleHideConfirm = async (dontAskAgain: boolean) => {
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

  // Check if this is a scene or image (both allow interactive O counter)
  const isSceneOrImage = entityType === "scene" || entityType === "image";

  // Check if any controls (besides menu) are visible
  const hasVisibleControls = showRating || showFavorite || showOCounter;

  // Don't render the row at all if nothing is visible
  if (!hasVisibleControls && !showMenu) {
    return (
      <>
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
          entityType={pendingHide?.entityType ?? ""}
          entityName={pendingHide?.entityName ?? ""}
        />
      </>
    );
  }

  return (
    <>
      <div
        className="card-rating-row flex justify-between items-center w-full my-1"
        style={{ height: hasVisibleControls ? "2rem" : "1.5rem" }}
      >
        {/* Left side: Rating badge */}
        <div ref={badgeRef}>
          {showRating && (
            <RatingBadge
              rating={rating}
              onClick={() => setDialogOpen(true)}
              size="small"
            />
          )}
        </div>

        {/* Right side: O Counter + Favorite + EntityMenu */}
        <div className="flex items-center card-rating-icons">
          {showOCounter && (
            <OCounterButton
              sceneId={entityType === "scene" ? entityId : undefined}
              imageId={entityType === "image" ? entityId : undefined}
              initialCount={oCounter ?? 0}
              onChange={handleOCounterChange}
              size="small"
              variant="card"
              interactive={isSceneOrImage}
            />
          )}
          {showFavorite && (
            <FavoriteButton
              isFavorite={isFavorite}
              onChange={handleFavoriteChange}
              size="small"
              variant="card"
            />
          )}
          {showMenu && (
            <EntityMenu
              entityType={entityType}
              entityId={entityId}
              entityName={entityTitle || ""}
              onHide={handleHideClick}
            />
          )}
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
        entityType={pendingHide?.entityType ?? ""}
        entityName={pendingHide?.entityName ?? ""}
      />
    </>
  );
};
