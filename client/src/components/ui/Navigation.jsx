import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { PeekLogo } from "../branding/PeekLogo.jsx";
import UserMenu from "./UserMenu.jsx";
import { ThemedIcon } from "../icons/index.js";

const Navigation = () => {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const location = useLocation();

  // Get current page from React Router location
  const getCurrentPage = () => {
    const path = location.pathname;
    switch (path) {
      case "/scenes":
        return "Scenes";
      case "/performers":
        return "Performers";
      case "/studios":
        return "Studios";
      case "/tags":
        return "Tags";
      case "/playlists":
        return "Playlists";
      case "/":
        return null; // Home page - no nav item should be highlighted
      default:
        return null; // Unknown pages - no nav item should be highlighted
    }
  };

  const currentPage = getCurrentPage();

  const navItems = [
    { name: "Scenes", path: "/scenes", icon: "clapperboard" },
    { name: "Performers", path: "/performers", icon: "user-star" },
    { name: "Studios", path: "/studios", icon: "spotlight" },
    { name: "Tags", path: "/tags", icon: "tags" },
    { name: "Playlists", path: "/playlists", icon: "list" },
  ];

  return (
    <nav
      className="w-full py-2 px-2"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-color)",
      }}
    >
      <div className="w-full max-w-none">
        <div className="flex items-center justify-between">
          {/* Logo/Brand */}
          <PeekLogo variant="auto" size="default" />

          {/* Desktop Navigation Links */}
          <ul className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <li key={item.name}>
                <Link
                  to={item.path}
                  className={`nav-link text-base font-medium transition-colors duration-200 px-3 py-2 rounded ${
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
            {/* Settings button */}
            <Link
              to="/settings"
              className="p-2 rounded-lg hover:bg-opacity-80 transition-colors duration-200"
              style={{
                backgroundColor: "transparent",
                color: "var(--text-primary)",
                border: "1px solid transparent",
              }}
              aria-label="Settings"
            >
              <ThemedIcon name="settings" size={20} />
            </Link>

            {/* User Menu - visible on all screen sizes */}
            <UserMenu />

            {/* Mobile menu button */}
            <button
              className="md:hidden p-2 rounded-lg"
              style={{
                backgroundColor: "var(--bg-card)",
                color: "var(--text-primary)",
              }}
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              aria-label="Toggle mobile menu"
            >
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
            </button>
          </div>
        </div>

        {/* Mobile Navigation Menu */}
        {isMobileMenuOpen && (
          <div className="md:hidden mt-4 pb-4">
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
