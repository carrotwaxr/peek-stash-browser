import { Link } from "react-router-dom";
import { getEffectiveImageMetadata } from "../../utils/imageGalleryInheritance.js";
import FavoriteButton from "./FavoriteButton.jsx";
import OCounterButton from "./OCounterButton.jsx";
import RatingBadge from "./RatingBadge.jsx";
import TagChips from "./TagChips.jsx";

/**
 * Bottom sheet drawer displaying image metadata
 */
const MetadataDrawer = ({
  open,
  onClose,
  image,
  rating,
  isFavorite,
  oCounter,
  onRatingClick,
  onFavoriteChange,
  onOCounterChange,
}) => {
  if (!open || !image) return null;

  // Get effective metadata (inherits from galleries if image doesn't have its own)
  const { effectivePerformers, effectiveTags, effectiveStudio } =
    getEffectiveImageMetadata(image);

  const date = image.date
    ? new Date(image.date).toLocaleDateString()
    : null;
  const resolution =
    image.width && image.height ? `${image.width}×${image.height}` : null;

  // Build subtitle parts
  const subtitleParts = [effectiveStudio?.name, date, resolution].filter(Boolean);
  const subtitle = subtitleParts.join(" • ");

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 rounded-t-lg overflow-hidden"
        style={{
          backgroundColor: "var(--bg-card)",
          maxHeight: "60vh",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center py-3">
          <div
            className="w-10 h-1 rounded-full"
            style={{ backgroundColor: "var(--text-muted)" }}
          />
        </div>

        {/* Scrollable content */}
        <div
          className="overflow-y-auto px-4 pb-6"
          style={{ maxHeight: "calc(60vh - 40px)" }}
        >
          {/* Header row: Title + controls */}
          <div className="flex items-start justify-between gap-4 mb-2">
            <h2
              className="text-lg font-semibold line-clamp-2 flex-1"
              style={{ color: "var(--text-primary)" }}
            >
              {image.title || "Untitled"}
            </h2>
            <div className="flex items-center gap-2 flex-shrink-0">
              <RatingBadge
                rating={rating}
                onClick={onRatingClick}
                size="medium"
              />
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
                  to={`/studio/${effectiveStudio.id}`}
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
                    to={`/performer/${performer.id}`}
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
          {image.details && (
            <div>
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
                {image.details}
              </p>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default MetadataDrawer;
