import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { getEffectiveImageMetadata, getImageTitle } from "../../utils/imageGalleryInheritance.js";
import { useConfig } from "../../contexts/ConfigContext.jsx";
import { getEntityPath } from "../../utils/entityLinks.js";
import FavoriteButton from "./FavoriteButton.jsx";
import OCounterButton from "./OCounterButton.jsx";
import RatingBadge from "./RatingBadge.jsx";
import RatingSliderDialog from "./RatingSliderDialog.jsx";
import SectionLink from "./SectionLink.jsx";
import TagChips from "./TagChips.jsx";

/**
 * Adaptive metadata drawer that opens on the longer viewport axis:
 * - Landscape (wider): opens from the right as a side panel
 * - Portrait (taller): opens from the bottom as a sheet
 */
const MetadataDrawer = ({
  open,
  onClose,
  image,
  rating,
  isFavorite,
  oCounter,
  onRatingChange,
  onFavoriteChange,
  onOCounterChange,
}) => {
  const [isRatingPopoverOpen, setIsRatingPopoverOpen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(
    () => window.innerWidth > window.innerHeight
  );
  const ratingBadgeRef = useRef(null);
  const { hasMultipleInstances } = useConfig();

  // Track viewport orientation via matchMedia (fires only on actual orientation change,
  // consistent with hover detection pattern in Lightbox.jsx)
  useEffect(() => {
    const mq = window.matchMedia("(orientation: landscape)");
    setIsLandscape(mq.matches);
    const handler = (e) => setIsLandscape(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (!open || !image) return null;

  // Get effective metadata (inherits from galleries if image doesn't have its own)
  const {
    effectivePerformers,
    effectiveTags,
    effectiveStudio,
    effectiveDate,
    effectiveDetails,
    effectivePhotographer,
    effectiveUrls,
  } = getEffectiveImageMetadata(image);

  const date = effectiveDate
    ? new Date(effectiveDate).toLocaleDateString()
    : null;
  const resolution =
    image.width && image.height ? `${image.width}×${image.height}` : null;

  // Build subtitle parts
  const photographerText = effectivePhotographer ? `by ${effectivePhotographer}` : null;
  const subtitleParts = [effectiveStudio?.name, date, photographerText, resolution].filter(Boolean);
  const subtitle = subtitleParts.join(" • ");

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer - right side on landscape, bottom on portrait */}
      <div
        className={
          isLandscape
            ? "fixed top-0 right-0 bottom-0 z-50 rounded-l-lg overflow-hidden"
            : "fixed bottom-0 left-0 right-0 z-50 rounded-t-lg overflow-hidden"
        }
        style={{
          backgroundColor: "var(--bg-card)",
          ...(isLandscape
            ? { width: "min(400px, 40vw)" }
            : { maxHeight: "60vh" }),
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle - horizontal bar for bottom, vertical bar for side */}
        <div
          className={
            isLandscape
              ? "flex items-center justify-center px-1.5 absolute left-0 top-0 bottom-0"
              : "flex justify-center py-3"
          }
        >
          <div
            className={isLandscape ? "h-10 w-1 rounded-full" : "w-10 h-1 rounded-full"}
            style={{ backgroundColor: "var(--text-muted)" }}
          />
        </div>

        {/* Scrollable content */}
        <div
          className={`overflow-y-auto px-4 pb-6 ${isLandscape ? "pt-4" : ""}`}
          style={
            isLandscape
              ? { maxHeight: "100dvh", paddingLeft: "16px" }
              : { maxHeight: "calc(60vh - 40px)" }
          }
        >
          {/* Header row: Title + controls */}
          <div className="flex items-start justify-between gap-4 mb-2">
            <h2
              className="text-lg font-semibold line-clamp-2 flex-1"
              style={{ color: "var(--text-primary)" }}
            >
              {getImageTitle(image)}
            </h2>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div ref={ratingBadgeRef}>
                <RatingBadge
                  rating={rating}
                  onClick={() => setIsRatingPopoverOpen(true)}
                  size="medium"
                />
              </div>
              <OCounterButton
                imageId={image.id}
                initialCount={oCounter}
                onChange={onOCounterChange}
                size="medium"
                variant="card"
                interactive={true}
              />
              <FavoriteButton
                isFavorite={isFavorite}
                onChange={onFavoriteChange}
                size="medium"
                variant="card"
              />
            </div>
          </div>

          {/* Subtitle: Studio • Date • Resolution */}
          {subtitle && (
            <p
              className="text-sm mb-4"
              style={{ color: "var(--text-secondary)" }}
            >
              {effectiveStudio ? (
                <Link
                  to={getEntityPath('studio', effectiveStudio, hasMultipleInstances)}
                  className="hover:underline hover:text-blue-400"
                  onClick={onClose}
                >
                  {effectiveStudio.name}
                </Link>
              ) : null}
              {effectiveStudio && (date || resolution) ? " • " : null}
              {date}
              {date && resolution ? " • " : null}
              {resolution}
            </p>
          )}

          {/* Performers section */}
          {effectivePerformers.length > 0 && (
            <div className="mb-4">
              <h3
                className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
                style={{
                  color: "var(--text-primary)",
                  borderBottom: "2px solid var(--accent-primary)",
                }}
              >
                Performers
              </h3>
              <div
                className="flex gap-4 overflow-x-auto pb-2 scroll-smooth"
                style={{ scrollbarWidth: "thin" }}
              >
                {effectivePerformers.map((performer) => (
                  <Link
                    key={performer.id}
                    to={getEntityPath('performer', performer, hasMultipleInstances)}
                    className="flex flex-col items-center flex-shrink-0 group w-[120px]"
                    onClick={onClose}
                  >
                    <div
                      className="aspect-[2/3] rounded-lg overflow-hidden mb-2 w-full border-2 border-transparent group-hover:border-[var(--accent-primary)] transition-all"
                      style={{ backgroundColor: "var(--border-color)" }}
                    >
                      {performer.image_path ? (
                        <img
                          src={performer.image_path}
                          alt={performer.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <span
                            className="text-4xl"
                            style={{ color: "var(--text-secondary)" }}
                          >
                            {performer.gender === "MALE" ? "♂" : "♀"}
                          </span>
                        </div>
                      )}
                    </div>
                    <span
                      className="text-xs font-medium text-center w-full line-clamp-2 group-hover:underline"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {performer.name}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Tags section */}
          {effectiveTags.length > 0 && (
            <div className="mb-4">
              <h3
                className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
                style={{
                  color: "var(--text-primary)",
                  borderBottom: "2px solid var(--accent-primary)",
                }}
              >
                Tags
              </h3>
              <TagChips tags={effectiveTags} />
            </div>
          )}

          {/* Details section (if description exists) */}
          {effectiveDetails && (
            <div className="mb-4">
              <h3
                className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
                style={{
                  color: "var(--text-primary)",
                  borderBottom: "2px solid var(--accent-primary)",
                }}
              >
                Details
              </h3>
              <p
                className="text-sm leading-relaxed"
                style={{ color: "var(--text-primary)" }}
              >
                {effectiveDetails}
              </p>
            </div>
          )}

          {/* URLs section */}
          {effectiveUrls.length > 0 && (
            <div>
              <h3
                className="text-sm font-semibold uppercase tracking-wide mb-3 pb-2"
                style={{
                  color: "var(--text-primary)",
                  borderBottom: "2px solid var(--accent-primary)",
                }}
              >
                Links
              </h3>
              <div className="flex flex-wrap gap-2">
                {effectiveUrls.map((url, index) => (
                  <SectionLink key={index} url={url} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Rating Popover */}
      <RatingSliderDialog
        isOpen={isRatingPopoverOpen}
        onClose={() => setIsRatingPopoverOpen(false)}
        initialRating={rating}
        onSave={onRatingChange}
        entityType="image"
        entityTitle={getImageTitle(image)}
        anchorEl={ratingBadgeRef.current}
      />
    </>
  );
};

export default MetadataDrawer;
