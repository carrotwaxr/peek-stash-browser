/**
 * Skeleton loading card that matches BaseCard structure
 * Used in carousels and grids while data is loading
 */
const SkeletonSceneCard = ({ entityType = "scene" }) => {
  // Match aspect ratio logic from useEntityImageAspectRatio
  const aspectRatio = ["performer", "gallery", "group"].includes(entityType)
    ? "2/3"
    : "16/9";

  return (
    <div
      className="relative rounded-lg border overflow-hidden"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
        borderWidth: "1px",
      }}
    >
      {/* Image skeleton */}
      <div
        className="relative animate-pulse"
        style={{
          aspectRatio,
          backgroundColor: "var(--bg-tertiary)",
        }}
      />

      {/* Card content */}
      <div className="p-3 space-y-2">
        {/* Title skeleton */}
        <div
          className="h-5 rounded animate-pulse"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            width: "85%",
          }}
        />

        {/* Subtitle skeleton */}
        <div
          className="h-4 rounded animate-pulse"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            width: "60%",
          }}
        />

        {/* Description skeleton (2 lines) */}
        <div className="space-y-1">
          <div
            className="h-3 rounded animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              width: "100%",
            }}
          />
          <div
            className="h-3 rounded animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              width: "75%",
            }}
          />
        </div>

        {/* Indicators skeleton - matches CardIndicators height */}
        <div
          className="flex items-center gap-2"
          style={{ height: "3.5rem" }}
        >
          <div
            className="h-6 rounded-full animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              width: "3rem",
            }}
          />
          <div
            className="h-6 rounded-full animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              width: "3rem",
            }}
          />
          <div
            className="h-6 rounded-full animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              width: "3rem",
            }}
          />
        </div>

        {/* Rating controls row skeleton - matches CardRatingRow height */}
        <div
          className="flex justify-between items-center w-full"
          style={{ height: "2rem" }}
        >
          {/* Rating badge placeholder */}
          <div
            className="h-6 rounded-full animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              width: "3.5rem",
            }}
          />

          {/* Right side: O Counter + Favorite + Menu */}
          <div className="flex items-center gap-2">
            <div
              className="h-6 w-6 rounded-full animate-pulse"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            />
            <div
              className="h-6 w-6 rounded-full animate-pulse"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            />
            <div
              className="h-6 w-6 rounded-full animate-pulse"
              style={{ backgroundColor: "var(--bg-tertiary)" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkeletonSceneCard;
