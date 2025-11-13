import { forwardRef, useMemo } from "react";
import { Link } from "react-router-dom";
import RatingControls from "./RatingControls";
import { CardCountIndicators } from "./CardCountIndicators";

export const GridCard = forwardRef(
  (
    {
      className,
      description,
      entityType = "card", // not a real entity type but a reasonable default text
      hideDescription = false,
      hideSubtitle = false,
      imagePath,
      indicators,
      linkTo,
      ratingControlsProps,
      referrerUrl,
      title,
      subtitle,
      ...others
    },
    ref
  ) => {
    const entityDisplayType =
      entityType.charAt(0).toUpperCase() + entityType.slice(1);

    const aspectRatio = useMemo(() => {
      if (["performer", "gallery", "collection"].includes(entityType)) {
        return "2/3"; // Portrait (e.g., 2:3 aspect ratio)
      }
      return "16/9"; // Landscape (e.g., 16:9 aspect ratio)
    }, [entityType]);

    return (
      <Link
        aria-label={`${entityDisplayType}: ${title}`}
        className={`flex flex-col items-center justify-between rounded-lg border p-2 hover:shadow-lg hover:scale-[1.02] transition-all cursor-pointer focus:outline-none ${className}`}
        ref={ref}
        role="button"
        state={{ referrerUrl }}
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
          minHeight: "20rem", // 320px
          maxHeight: "36rem", // 576px
        }}
        to={linkTo}
        {...others}
      >
        <div
          className="w-full mb-3 overflow-hidden rounded-lg"
          style={{ height: "30%" }}
        >
          <img
            className="w-full h-full object-cover rounded-lg"
            src={imagePath}
            alt={`${entityDisplayType}: ${title}`}
          />
        </div>
        <div className="w-full text-center mb-2">
          <h3
            className="font-semibold"
            style={{ color: "var(--text-primary)", height: "1.25rem" }}
            title={title}
          >
            {title}
          </h3>
          {!hideSubtitle && (
            <h4
              className="text-sm"
              style={{ color: "var(--text-muted)", height: "1.25rem" }}
              title={subtitle}
            >
              {subtitle}
            </h4>
          )}
        </div>
        {!hideDescription && (
          <p
            className="text-sm my-1 w-full flex-grow"
            style={{
              color: "var(--text-muted)",
              minHeight: "3rem",
            }}
          >
            {description}
          </p>
        )}
        <div className="my-2 w-full" style={{ height: "3.5rem" }}>
          <CardCountIndicators indicators={indicators} />
        </div>
        {ratingControlsProps && (
          <div className="my-1" style={{ height: "1.25rem" }}>
            <RatingControls entityType={entityType} {...ratingControlsProps} />
          </div>
        )}
      </Link>
    );
  }
);
