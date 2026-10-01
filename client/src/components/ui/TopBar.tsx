import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  getNavKeyForPath,
  getOrderedNavItems,
} from "../../constants/navigation";
import { useScrollDirection } from "../../hooks/useScrollDirection";
import { useShortcutScope } from "../../hooks/useShortcutScope";
import { PeekLogo } from "../branding/PeekLogo";
import { ThemedIcon } from "../icons/index";
import Button from "./Button";
import HelpModal from "./HelpModal";
import UserMenu from "./UserMenu";

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
interface NavPreference {
  id: string;
  enabled: boolean;
  order: number;
}

interface Props {
  navPreferences?: NavPreference[];
}

const TopBar = ({ navPreferences = [] }: Props) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const location = useLocation();
  const navRef = useRef<HTMLElement>(null);
  const scrollDirection = useScrollDirection(100);

  // Help dialog hotkey (? or Shift+/)
  useShortcutScope({
    layer: "global",
    keys: { "shift+?": () => setIsHelpModalOpen(true) },
  });

  // Get ordered and filtered nav items based on user preferences
  const navItems = getOrderedNavItems(navPreferences).filter(
    (item): item is NonNullable<typeof item> => item != null
  );

  // The nav item the current path belongs to
  const currentPage = getNavKeyForPath(location.pathname);
  const isSettingsActive = currentPage === "Settings";

  // A route change closes the mobile menu
  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [location.pathname]);

  // A press outside the bar closes it
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const handleMouseDown = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [isMobileMenuOpen]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape" && isMobileMenuOpen) {
      event.preventDefault();
      setIsMobileMenuOpen(false);
    }
  };

  // Determine if topbar should be visible
  const isVisible = scrollDirection === "top" || scrollDirection === "up";

  return (
    <>
      <nav
        ref={navRef}
        onKeyDown={handleKeyDown}
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
          <div className="mt-4 pb-4 max-h-[calc(100dvh-4rem)] overflow-y-auto">
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
                  className={`nav-link block text-base font-medium transition-colors duration-200 px-3 py-2 rounded ${
                    isSettingsActive ? "nav-link-active" : ""
                  }`}
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
