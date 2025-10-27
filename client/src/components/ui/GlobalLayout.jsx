import Navigation from "./Navigation.jsx";

/**
 * GlobalLayout - Top-level layout with navigation
 * Wraps the entire application to provide consistent navigation structure
 */
const GlobalLayout = ({ children }) => {
  return (
    <div className="layout-container">
      <Navigation />
      {/* Spacer to prevent content from going under fixed navbar */}
      <div style={{ height: '60px' }} />
      <main className="w-full">{children}</main>
    </div>
  );
};

export default GlobalLayout;
