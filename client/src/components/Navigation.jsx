import { useState } from "react";
import { useTheme } from "../themes/useTheme.js";
import { useAuth } from "../hooks/useAuth.js";

const Navigation = () => {
  const { changeTheme, availableThemes, currentTheme } = useTheme();
  const { logout, user } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Get current page from URL
  const getCurrentPage = () => {
    const path = window.location.pathname;
    switch (path) {
      case "/":
        return "Home";
      case "/scenes":
        return "Scenes";
      case "/performers":
        return "Performers";
      case "/studios":
        return "Studios";
      case "/tags":
        return "Tags";
      default:
        return "Home";
    }
  };

  const currentPage = getCurrentPage();

  const navItems = [
    { name: "Home", path: "/" },
    { name: "Scenes", path: "/scenes" },
    { name: "Performers", path: "/performers" },
    { name: "Studios", path: "/studios" },
    { name: "Tags", path: "/tags" },
  ];

  return (
    <nav
      className="w-full py-4 px-4 lg:px-6 xl:px-8"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderBottom: "1px solid var(--border-color)",
      }}
    >
      <div className="w-full max-w-none">
        <div className="flex items-center justify-between">
          {/* Logo/Brand */}
          <div className="flex items-center gap-2">
            <div className="text-2xl">🎬</div>
            <span
              className="text-xl font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              MediaLib
            </span>
          </div>

          {/* Desktop Navigation Links */}
          <ul className="hidden md:flex items-center gap-6">
            {navItems.map((item) => (
              <li key={item.name}>
                <a
                  href={item.path}
                  className={`text-base font-medium transition-colors duration-200 px-3 py-2 rounded ${
                    currentPage === item.name ? "text-accent" : ""
                  }`}
                  style={{
                    color:
                      currentPage === item.name
                        ? "var(--accent-primary)"
                        : "var(--text-secondary)",
                    textDecoration: "none",
                    backgroundColor:
                      currentPage === item.name
                        ? "var(--bg-card)"
                        : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    e.target.style.color = "var(--accent-primary)";
                    if (currentPage !== item.name) {
                      e.target.style.backgroundColor = "var(--bg-card)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentPage !== item.name) {
                      e.target.style.color = "var(--text-secondary)";
                      e.target.style.backgroundColor = "transparent";
                    }
                  }}
                >
                  {item.name}
                </a>
              </li>
            ))}
          </ul>

          {/* Right side - User info, Theme selector and mobile menu button */}
          <div className="flex items-center gap-4">
            {/* User info and logout button - hidden on mobile */}
            <div className="hidden sm:flex items-center gap-3">
              {user && (
                <span
                  className="text-sm"
                  style={{ color: "var(--text-secondary)" }}
                >
                  Welcome, {user.username}
                </span>
              )}
              <button
                onClick={() => logout()}
                className="px-3 py-1 text-sm rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Logout
              </button>
            </div>

            {/* Theme selector - hidden on mobile */}
            <div className="hidden sm:flex items-center gap-2">
              <label
                className="text-sm font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                Theme:
              </label>
              <select
                value={currentTheme}
                onChange={(e) => changeTheme(e.target.value)}
                className="form-input text-sm"
                style={{
                  backgroundColor: "var(--bg-card)",
                  borderColor: "var(--border-color)",
                  color: "var(--text-primary)",
                  minWidth: "120px",
                }}
              >
                {availableThemes.map((theme) => (
                  <option key={theme.key} value={theme.key}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </div>

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
                  <a
                    href={item.path}
                    className={`block text-base font-medium transition-colors duration-200 px-3 py-2 rounded ${
                      currentPage === item.name ? "text-accent" : ""
                    }`}
                    style={{
                      color:
                        currentPage === item.name
                          ? "var(--accent-primary)"
                          : "var(--text-secondary)",
                      textDecoration: "none",
                      backgroundColor:
                        currentPage === item.name
                          ? "var(--bg-card)"
                          : "transparent",
                    }}
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.name}
                  </a>
                </li>
              ))}
              {/* Mobile theme selector */}
              <li
                className="pt-2 border-t"
                style={{ borderColor: "var(--border-color)" }}
              >
                <div className="px-3 py-2">
                  <label
                    className="block text-sm font-medium mb-2"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    Theme:
                  </label>
                  <select
                    value={currentTheme}
                    onChange={(e) => changeTheme(e.target.value)}
                    className="w-full form-input text-sm"
                    style={{
                      backgroundColor: "var(--bg-card)",
                      borderColor: "var(--border-color)",
                      color: "var(--text-primary)",
                    }}
                  >
                    {availableThemes.map((theme) => (
                      <option key={theme.key} value={theme.key}>
                        {theme.name}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
              {/* Mobile user info and logout */}
              <li
                className="pt-2 border-t"
                style={{ borderColor: "var(--border-color)" }}
              >
                <div className="px-3 py-2 space-y-2">
                  {user && (
                    <div
                      className="text-sm"
                      style={{ color: "var(--text-secondary)" }}
                    >
                      Logged in as: <strong>{user.username}</strong>
                    </div>
                  )}
                  <button
                    onClick={() => {
                      logout();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full px-3 py-2 text-sm rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
                  >
                    Logout
                  </button>
                </div>
              </li>
            </ul>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navigation;
