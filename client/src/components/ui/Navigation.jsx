import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { PeekLogo } from "../branding/PeekLogo.jsx";
import UserMenu from "./UserMenu.jsx";
import { ThemedIcon } from "../icons/index.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useScrollDirection } from "../../hooks/useScrollDirection.js";
import { getOrderedNavItems } from "../../constants/navigation.js";
import Button from "./Button.jsx";

const Navigation = ({ navPreferences = [] }) => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();
  const { user } = useAuth();
  const scrollDirection = useScrollDirection(100);

  // Get ordered and filtered nav items based on user preferences
  const navItems = getOrderedNavItems(navPreferences);

  // Get current page from React Router location
  const getCurrentPage = () => {
    const path = location.pathname;

    // Find matching nav item by path
    const matchingItem = navItems.find(item => item.path === path);
    return matchingItem ? matchingItem.name : null;
  };

  const currentPage = getCurrentPage();

  // Determine if navbar should be visible
  const isVisible = scrollDirection === 'top' || scrollDirection === 'up';

  return (
    <nav
      className="w-full py-2 px-2 fixed top-0 left-0 right-0 z-50 transition-transform duration-300 ease-in-out"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-color)",
        transform: isVisible ? 'translateY(0)' : 'translateY(-100%)',
      }}
    >
      <div className="w-full max-w-none">
        <div className="flex items-center justify-between">
          {/* Logo/Brand */}
          <PeekLogo variant="auto" size="default" />

          {/* Desktop Navigation Links */}
          <ul className="hidden lg:flex items-center gap-6">
            {navItems.map((item) => (
              <li key={item.name}>
                <Link
                  to={item.path}
                  className={`nav-link text-base font-medium transition-colors duration-200 rounded ${
                    currentPage === item.name ? "nav-link-active" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <ThemedIcon name={item.icon} size={18} />
                    {item.name}
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {/* Right side - User menu and mobile menu button */}
          <div className="flex items-center gap-4 justify-end">
            {/* Server Settings button (admin only) */}
            {user && user.role === "ADMIN" && (
              <Link
                to="/server-settings"
                className="p-2 rounded-lg hover:bg-opacity-80 transition-colors duration-200"
                style={{
                  backgroundColor: "transparent",
                  color: "var(--text-primary)",
                  border: "1px solid transparent",
                }}
                aria-label="Server Settings"
              >
                <ThemedIcon name="wrench" size={20} />
              </Link>
            )}

            {/* User Menu - visible on all screen sizes */}
            <UserMenu />

            {/* Mobile menu button */}
            <Button
              className="lg:hidden p-2"
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
          <div className="lg:hidden mt-4 pb-4">
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
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;
