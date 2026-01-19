/**
 * PageLayout component - Provides consistent page wrapper with minimal padding
 * Follows Plex/Jellyfin pattern: minimal edge spacing, let content flow naturally
 */
const PageLayout = ({ children, className = "", fullHeight = false }) => {
  return (
    <div
      className={`w-full py-3 sm:py-8 px-3 sm:px-4 ${fullHeight ? "min-h-screen" : ""} ${className}`}
    >
      {children}
    </div>
  );
};

export default PageLayout;
