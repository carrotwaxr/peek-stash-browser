/**
 * PageLayout component - Provides consistent page wrapper with responsive padding
 * Use this for all pages to ensure consistent spacing and layout
 */
const PageLayout = ({ children, className = "", fullHeight = false }) => {
  return (
    <div
      className={`w-full py-8 px-4 lg:px-6 xl:px-8 ${fullHeight ? 'min-h-screen' : ''} ${className}`}
    >
      {children}
    </div>
  );
};

export default PageLayout;
