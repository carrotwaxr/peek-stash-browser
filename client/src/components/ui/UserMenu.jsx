import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth.js";
import { useTVMode } from "../../hooks/useTVMode.js";
import { ThemedIcon } from "../icons/index.js";
import Button from "./Button.jsx";

const UserMenu = () => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

  const { logout, user } = useAuth();
  const { isTVMode, toggleTVMode } = useTVMode();

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

  return (
    <div className="relative">
      {/* User Menu Button */}
      <Button
        ref={buttonRef}
        onClick={() => setIsOpen(!isOpen)}
        variant="tertiary"
        style={{
          backgroundColor: isOpen ? "var(--bg-card)" : "transparent",
          border: isOpen
            ? "1px solid var(--border-color)"
            : "1px solid transparent",
        }}
        icon={<ThemedIcon name="circle-user-round" size={20} />}
        aria-label="User menu"
      />

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
                  {user?.role
                    ? user.role.charAt(0).toUpperCase() + user.role.slice(1)
                    : "User"}
                </div>
              </div>
            </div>
          </div>

          {/* Menu Links */}
          <div
            className="px-4 py-3 border-b"
            style={{ borderColor: "var(--border-color)" }}
          >
            <Link
              to="/watch-history"
              onClick={() => setIsOpen(false)}
              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors duration-200"
              style={{
                color: "var(--text-primary)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
              }}
            >
              <ThemedIcon name="history" size={16} />
              <span>Watch History</span>
            </Link>
          </div>

          {/* TV Mode Toggle */}
          <div
            className="px-4 py-3 border-b"
            style={{ borderColor: "var(--border-color)" }}
          >
            <Button
              onClick={() => {
                toggleTVMode();
                setIsOpen(false);
              }}
              variant="tertiary"
              fullWidth
              className="flex items-center justify-between px-3 py-2 text-sm"
              style={{
                backgroundColor: isTVMode
                  ? "var(--accent-primary)"
                  : "transparent",
                color: isTVMode ? "white" : "var(--text-primary)",
              }}
              onMouseEnter={(e) => {
                if (!isTVMode) {
                  e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isTVMode) {
                  e.currentTarget.style.backgroundColor = "transparent";
                }
              }}
            >
              <div className="flex items-center gap-3">
                <ThemedIcon
                  name="tv"
                  size={16}
                  color={isTVMode ? "white" : "currentColor"}
                />
                <span>TV Mode</span>
              </div>
              {isTVMode && <span className="text-sm">✓</span>}
            </Button>
          </div>

          {/* Logout */}
          <div className="px-4 py-3">
            <Button
              onClick={handleLogout}
              variant="tertiary"
              fullWidth
              className="flex items-center gap-3 px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50"
              icon={<ThemedIcon name="logout" size={16} color="currentColor" />}
            >
              Sign Out
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
