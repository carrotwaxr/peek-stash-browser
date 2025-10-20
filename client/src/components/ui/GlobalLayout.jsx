import Navigation from "./Navigation.jsx";

/**
 * GlobalLayout - Top-level layout with navigation
 * Wraps the entire application to provide consistent navigation structure
 */
const GlobalLayout = ({ children }) => {
  return (
    <div className="layout-container">
      <Navigation />
      <main className="w-full">{children}</main>
    </div>
  );
};

export default GlobalLayout;
