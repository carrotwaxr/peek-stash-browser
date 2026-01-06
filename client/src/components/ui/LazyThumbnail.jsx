import { useLazyLoad } from "./CardComponents.jsx";

/**
 * LazyThumbnail - Lazy-loaded thumbnail component
 * Uses intersection observer to only load images when they're visible
 */
const LazyThumbnail = ({ src, alt, fallback, className }) => {
  const [ref, shouldLoad] = useLazyLoad();

  return (
    <div
      ref={ref}
      className={className}
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {shouldLoad && src ? (
        <img src={src} alt={alt} className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <span className="text-2xl" style={{ color: "var(--text-muted)" }}>
            {fallback}
          </span>
        </div>
      )}
    </div>
  );
};

export default LazyThumbnail;
