/**
 * Skeleton loading card that matches SceneCard structure
 * Used in carousels and grids while data is loading
 */
const SkeletonSceneCard = () => {
  return (
    <div
      className="relative rounded-lg border overflow-hidden"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
        borderWidth: "1px",
      }}
    >
      {/* Thumbnail skeleton */}
      <div
        className="relative aspect-video animate-pulse"
        style={{ backgroundColor: "var(--bg-tertiary)" }}
      >
        {/* Checkbox placeholder */}
        <div
          className="absolute top-2 left-2 w-6 h-6 rounded border-2 animate-pulse"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.3)",
            borderColor: "rgba(255, 255, 255, 0.3)",
          }}
        />

        {/* Play duration badge placeholder */}
        <div
          className="absolute bottom-2 right-2 px-2 py-1 rounded animate-pulse"
          style={{
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            width: "4rem",
            height: "1.5rem",
          }}
        />
      </div>

      {/* Card content */}
      <div className="p-3 space-y-3">
        {/* Title skeleton */}
        <div
          className="h-5 rounded animate-pulse"
          style={{
            backgroundColor: "var(--bg-tertiary)",
            width: "85%",
          }}
        />

        {/* Stats row skeleton */}
        <div className="flex items-center gap-3">
          {/* Rating skeleton */}
          <div
            className="h-4 rounded animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              width: "3rem",
            }}
          />

          {/* Dot separator */}
          <div
            className="w-1 h-1 rounded-full"
            style={{ backgroundColor: "var(--text-muted)" }}
          />

          {/* Duration skeleton */}
          <div
            className="h-4 rounded animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              width: "4rem",
            }}
          />

          {/* Dot separator */}
          <div
            className="w-1 h-1 rounded-full"
            style={{ backgroundColor: "var(--text-muted)" }}
          />

          {/* Date skeleton */}
          <div
            className="h-4 rounded animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              width: "5rem",
            }}
          />
        </div>

        {/* Metadata rows skeleton (performers, studio, tags) */}
        <div className="space-y-2">
          {/* Performers */}
          <div className="flex gap-2">
            <div
              className="h-3 rounded animate-pulse"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                width: "4rem",
              }}
            />
            <div
              className="h-3 rounded animate-pulse"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                width: "5rem",
              }}
            />
          </div>

          {/* Studio */}
          <div
            className="h-3 rounded animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              width: "6rem",
            }}
          />

          {/* Tags */}
          <div className="flex gap-2">
            <div
              className="h-3 rounded animate-pulse"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                width: "3rem",
              }}
            />
            <div
              className="h-3 rounded animate-pulse"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                width: "4rem",
              }}
            />
            <div
              className="h-3 rounded animate-pulse"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                width: "3.5rem",
              }}
            />
          </div>
        </div>

        {/* Quality badges skeleton */}
        <div className="flex gap-2 pt-1">
          <div
            className="h-5 rounded animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              width: "3rem",
            }}
          />
          <div
            className="h-5 rounded animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              width: "2.5rem",
            }}
          />
        </div>

        {/* Rating controls row skeleton (Rating Badge + O Counter + Favorite) */}
        <div
          className="flex justify-between items-center w-full my-1"
          style={{ height: "2rem" }}
        >
          {/* Rating badge placeholder (left) */}
          <div
            className="h-7 rounded-full px-3 animate-pulse"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              width: "4rem",
            }}
          />

          {/* Right side: O Counter + Favorite */}
          <div className="flex items-center gap-2">
            {/* O Counter button placeholder */}
            <div
              className="h-7 w-7 rounded-full animate-pulse"
              style={{
                backgroundColor: "var(--bg-tertiary)",
              }}
            />

            {/* Favorite heart placeholder */}
            <div
              className="h-7 w-7 rounded-full animate-pulse"
              style={{
                backgroundColor: "var(--bg-tertiary)",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default SkeletonSceneCard;
