import { Fragment, type ReactNode, useRef, useState } from "react";
import { Link } from "react-router-dom";
/**
 * Adaptive metadata drawer that opens on the longer viewport axis:
 * - Landscape (wider): opens from the right as a side panel
 * - Portrait (taller): opens from the bottom as a sheet
 */
import type { ImageListItem } from "@peek/shared-types";
import { useDecrementImageOCounter } from "../../api/hooks";
import { useConfig } from "../../contexts/ConfigContext";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { formatDate } from "../../utils/date";
import { getEntityPath } from "../../utils/entityLinks";
import { getImageTitle } from "../../utils/imageTitle";
import EntityMenu from "./EntityMenu";
import FavoriteButton from "./FavoriteButton";
import OCounterButton from "./OCounterButton";
import RatingBadge from "./RatingBadge";
import RatingSliderDialog from "./RatingSliderDialog";
import SectionLink from "./SectionLink";
import TagChips from "./TagChips";

interface Props {
  open: boolean;
  onClose: () => void;
  image: ImageListItem | null;
  rating: number | null;
  isFavorite: boolean;
  oCounter: number;
  onRatingChange: (rating: number | null) => void;
  onFavoriteChange: (isFavorite: boolean) => void;
  onOCounterChange: (count: number) => void;
}

interface RemoveLastOMenuProps {
  image: ImageListItem;
  oCount: number;
  onRemoved: (count: number) => void;
}

/** The menu beside the O counter, holding only Remove last O (none at 0 Os) */
const RemoveLastOMenu = ({
  image,
  oCount,
  onRemoved,
}: RemoveLastOMenuProps) => {
  const decrement = useDecrementImageOCounter();

  const handleRemoveLastO = async () => {
    try {
      const response = await decrement.mutateAsync({
        imageId: image.id,
        instanceId: image.instanceId,
      });
      onRemoved(response.oCount);
    } catch (error) {
      console.error("Failed to remove the last O:", error);
    }
  };

  return (
    <EntityMenu
      entityType="image"
      entityId={image.id}
      entityName={image.title ?? ""}
      instanceId={image.instanceId}
      oCount={oCount}
      onRemoveLastO={() => void handleRemoveLastO()}
    />
  );
};

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
}: Props) => {
  const [isRatingPopoverOpen, setIsRatingPopoverOpen] = useState(false);
  const isLandscape = useMediaQuery("(orientation: landscape)");
  const ratingBadgeRef = useRef(null);
  const { hasMultipleInstances } = useConfig();

  if (!open || !image) return null;

  const date = image.date ? formatDate(image.date) : null;
  const resolution =
    image.width && image.height ? `${image.width}×${image.height}` : null;

  // Subtitle parts in order: studio (a link), date, photographer, resolution
  const subtitleParts: ReactNode[] = [];
  if (image.studio?.name) {
    subtitleParts.push(
      <Link
        key="studio"
        to={getEntityPath("studio", image.studio, hasMultipleInstances)}
        className="hover:underline hover:text-blue-400"
        onClick={onClose}
      >
        {image.studio.name}
      </Link>
    );
  }
  if (date) subtitleParts.push(date);
  if (image.photographer) subtitleParts.push(`by ${image.photographer}`);
  if (resolution) subtitleParts.push(resolution);

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
            className={
              isLandscape ? "h-10 w-1 rounded-full" : "w-10 h-1 rounded-full"
            }
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
              <div className="flex items-center">
                <OCounterButton
                  imageId={image.id}
                  instanceId={image.instanceId}
                  initialCount={oCounter}
                  onChange={onOCounterChange}
                  size="medium"
                  variant="card"
                  interactive={true}
                />
                <RemoveLastOMenu
                  image={image}
                  oCount={oCounter}
                  onRemoved={onOCounterChange}
                />
              </div>
              <FavoriteButton
                isFavorite={isFavorite}
                onChange={onFavoriteChange}
                size="medium"
                variant="card"
              />
            </div>
          </div>

          {/* Subtitle: Studio • Date • Photographer • Resolution */}
          {subtitleParts.length > 0 && (
            <p
              className="text-sm mb-4"
              style={{ color: "var(--text-secondary)" }}
            >
              {subtitleParts.map((part, index) => (
                <Fragment key={index}>
                  {index > 0 ? " • " : null}
                  {part}
                </Fragment>
              ))}
            </p>
          )}

          {/* Performers section */}
          {image.performers.length > 0 && (
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
                {image.performers.map((performer) => (
                  <Link
                    key={performer.id}
                    to={getEntityPath(
                      "performer",
                      performer,
                      hasMultipleInstances
                    )}
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
          {image.tags.length > 0 && (
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
              <TagChips
                tags={image.tags as Parameters<typeof TagChips>[0]["tags"]}
              />
            </div>
          )}

          {/* Details section (if description exists) */}
          {image.details && (
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
                {image.details}
              </p>
            </div>
          )}

          {/* URLs section */}
          {image.urls.length > 0 && (
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
                {image.urls.map((url, index) => (
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
        entityTitle={getImageTitle(image) ?? undefined}
        anchorEl={ratingBadgeRef.current}
      />
    </>
  );
};

export default MetadataDrawer;
