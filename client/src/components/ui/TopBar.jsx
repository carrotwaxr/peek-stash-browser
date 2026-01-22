import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getOrderedNavItems } from "../../constants/navigation.js";
import useKeyboardShortcuts from "../../hooks/useKeyboardShortcuts.js";
import { useScrollDirection } from "../../hooks/useScrollDirection.js";
import { PeekLogo } from "../branding/PeekLogo.jsx";
import { ThemedIcon } from "../icons/index.js";
import Button from "./Button.jsx";
import HelpModal from "./HelpModal.jsx";
import UserMenu from "./UserMenu.jsx";

/**
 * TopBar Component
 *
 * Simplified top navigation bar for sidebar layout:
 * - Logo on left
 * - Help, Settings (admin), User menu on right
 * - Mobile: Includes hamburger menu for navigation
 * - Desktop: Navigation is in sidebar
 * - Auto-hides on scroll down
 */
const TopBar = ({ navPreferences = [] }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const location = useLocation();
  const scrollDirection = useScrollDirection(100);

  // Help dialog hotkey (? or Shift+/)
  useKeyboardShortcuts(
    {
      "shift+?": () => setIsHelpModalOpen(true),
    },
    {
      enabled: true,
      context: "help-dialog",
    }
  );

  // Get ordered and filtered nav items based on user preferences
  const navItems = getOrderedNavItems(navPreferences);

  // Get current page from React Router location
  const getCurrentPage = () => {
    const path = location.pathname;
    if (path === "/") return "Home";
    if (path.startsWith("/scenes")) return "Scenes";
    if (path.startsWith("/recommended")) return "Recommended";
    if (path.startsWith("/performers")) return "Performers";
    if (path.startsWith("/studios")) return "Studios";
    if (path.startsWith("/tags")) return "Tags";
    if (path.startsWith("/collections") || path.startsWith("/collection/"))
      return "Collections";
    if (path.startsWith("/galleries") || path.startsWith("/gallery/"))
      return "Galleries";
    if (path.startsWith("/images")) return "Images";
    if (path.startsWith("/playlists") || path.startsWith("/playlist/"))
      return "Playlists";
    if (path.startsWith("/clips")) return "Clips";
    if (path.startsWith("/watch-history")) return "Watch History";
    return null;
  };

  const currentPage = getCurrentPage();

  // Determine if topbar should be visible
  const isVisible = scrollDirection === "top" || scrollDirection === "up";

  return (
    <>
      <nav
        className="lg:hidden fixed top-0 left-0 right-0 z-50 py-2 px-4 transition-transform duration-300 ease-in-out"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderBottom: "1px solid var(--border-color)",
          transform: isVisible ? "translateY(0)" : "translateY(-100%)",
        }}
      >
        <div className="flex items-center justify-between">
          {/* Logo */}
          <PeekLogo variant="auto" size="default" />

          {/* Right side - Help, User Menu, Hamburger */}
          <div className="flex items-center gap-2">
            {/* Help button */}
            <button
              onClick={() => setIsHelpModalOpen(true)}
              className="p-2 rounded-lg hover:bg-opacity-80 transition-colors duration-200"
              style={{
                backgroundColor: "transparent",
                color: "var(--text-primary)",
                border: "1px solid transparent",
              }}
              aria-label="Help"
            >
              <ThemedIcon name="questionCircle" size={20} />
            </button>

            {/* User Menu */}
            <UserMenu />

            {/* Mobile menu button */}
            <Button
              className="p-2"
              variant="secondary"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle mobile menu"
              icon={
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  {isMobileMenuOpen ? (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  ) : (
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 6h16M4 12h16M4 18h16"
                    />
                  )}
                </svg>
              }
            />
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="mt-4 pb-4">
            {/* Main navigation items */}
            <ul className="flex flex-col space-y-2">
              {navItems.map((item) => (
                <li key={item.name}>
                  <Link
                    to={item.path}
                    className={`nav-link block text-base font-medium transition-colors duration-200 px-3 py-2 rounded ${
                      currentPage === item.name ? "nav-link-active" : ""
                    }`}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    <div className="flex items-center gap-2">
                      <ThemedIcon name={item.icon} size={18} />
                      {item.name}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>

            {/* Settings (all users) - with divider */}
            <div
              className="my-2 border-t"
              style={{ borderColor: "var(--border-color)" }}
            />
            <ul className="flex flex-col space-y-2">
              <li>
                <Link
                  to="/settings"
                  className="nav-link block text-base font-medium transition-colors duration-200 px-3 py-2 rounded"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <div className="flex items-center gap-2">
                    <ThemedIcon name="settings" size={18} />
                    Settings
                  </div>
                </Link>
              </li>
            </ul>
          </div>
        )}
      </nav>

      {/* Help Modal */}
      {isHelpModalOpen && (
        <HelpModal onClose={() => setIsHelpModalOpen(false)} />
      )}
    </>
  );
};

export default TopBar;
