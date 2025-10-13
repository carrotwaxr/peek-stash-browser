import { useState, useRef, useEffect } from "react";
import { useTheme } from "../../themes/useTheme.js";
import { useAuth } from "../../hooks/useAuth.js";
import { ThemedIcon } from "../icons/index.js";

export const UserMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  const { changeTheme, availableThemes, currentTheme } = useTheme();
  const { logout, user } = useAuth();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  const handleLogout = () => {
    logout();
    setIsOpen(false);
  };

  const handleThemeChange = (themeKey) => {
    changeTheme(themeKey);
    // Don't close menu on theme change, let user try different themes
  };

  return (
    <div className="relative">
      {/* User Menu Button */}
      <button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg hover:bg-opacity-80 transition-colors duration-200"
        style={{
          backgroundColor: isOpen ? "var(--bg-card)" : "transparent",
          color: "var(--text-primary)",
          border: isOpen
            ? "1px solid var(--border-color)"
            : "1px solid transparent",
        }}
        aria-label="User menu"
      >
        <ThemedIcon name="circle-user-round" size={20} />
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <div
          ref={menuRef}
          className="absolute right-0 mt-2 w-64 rounded-lg shadow-lg border z-50"
          style={{
            backgroundColor: "var(--bg-card)",
            borderColor: "var(--border-color)",
          }}
        >
          {/* User Info */}
          <div
            className="px-4 py-3 border-b"
            style={{ borderColor: "var(--border-color)" }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
                style={{
                  backgroundColor: "var(--accent-primary)",
                  color: "white",
                }}
              >
                {user?.username?.charAt(0)?.toUpperCase() || "U"}
              </div>
              <div>
                <div
                  className="font-medium text-sm"
                  style={{ color: "var(--text-primary)" }}
                >
                  {user?.username || "User"}
                </div>
                <div className="text-xs" style={{ color: "var(--text-muted)" }}>
                  Administrator
                </div>
              </div>
            </div>
          </div>

          {/* Theme Selector */}
          <div
            className="px-4 py-3 border-b"
            style={{ borderColor: "var(--border-color)" }}
          >
            <div
              className="text-sm font-medium mb-2"
              style={{ color: "var(--text-primary)" }}
            >
              Theme
            </div>
            <div className="space-y-1">
              {availableThemes.map((theme) => (
                <button
                  key={theme.key}
                  onClick={() => handleThemeChange(theme.key)}
                  className={`w-full text-left px-3 py-2 rounded text-sm transition-colors duration-200 flex items-center justify-between`}
                  style={{
                    backgroundColor:
                      currentTheme === theme.key
                        ? "var(--accent-primary)"
                        : "transparent",
                    color:
                      currentTheme === theme.key
                        ? "white"
                        : "var(--text-secondary)",
                  }}
                  onMouseEnter={(e) => {
                    if (currentTheme !== theme.key) {
                      e.target.style.backgroundColor = "var(--bg-secondary)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (currentTheme !== theme.key) {
                      e.target.style.backgroundColor = "transparent";
                    }
                  }}
                >
                  <span>{theme.name}</span>
                  {currentTheme === theme.key && (
                    <ThemedIcon name="check" size={14} color="white" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Logout */}
          <div className="px-4 py-3">
            <button
              onClick={handleLogout}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors duration-200 hover:bg-red-50 text-red-600 hover:text-red-700"
            >
              <ThemedIcon name="logout" size={16} color="currentColor" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
