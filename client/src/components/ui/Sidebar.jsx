import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getOrderedNavItems } from "../../constants/navigation.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useTVMode } from "../../hooks/useTVMode.js";
import { PeekLogo } from "../branding/PeekLogo.jsx";
import { ThemedIcon } from "../icons/index.js";
import HelpModal from "./HelpModal.jsx";
import Tooltip from "./Tooltip.jsx";
import UserMenu from "./UserMenu.jsx";

/**
 * Sidebar Navigation Component
 *
 * Responsive sidebar navigation with automatic sizing:
 * - < lg: Hidden (hamburger menu in TopBar)
 * - lg - xl: Collapsed (64px wide, icons only with tooltips)
 * - xl+: Expanded (240px wide, icons + text labels)
 *
 * TV Mode Navigation:
 * - Listens for custom 'tvZoneChange' events from page components
 * - When mainNav zone is active: Up/Down navigate through items, Enter selects
 */
const Sidebar = ({ navPreferences = [] }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isTVMode } = useTVMode();
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isMainNavActive, setIsMainNavActive] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const itemRefs = useRef([]);

  // Get ordered and filtered nav items based on user preferences
  const navItems = getOrderedNavItems(navPreferences);

  // Build complete list of all navigable items (nav items + bottom items)
  const allNavItems = useMemo(() => {
    const bottomItems = [
      { name: "Help", path: null, isButton: true, icon: "questionCircle" },
    ];

    if (user && user.role === "ADMIN") {
      bottomItems.push({ name: "Server Settings", path: "/server-settings", icon: "wrench" });
    }

    bottomItems.push(
      { name: "My Settings", path: "/my-settings", icon: "settings" },
      { name: "Watch History", path: "/watch-history", icon: "history" }
    );

    return [...navItems, ...bottomItems];
  }, [navItems, user]);

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
    if (path.startsWith("/playlists") || path.startsWith("/playlist/"))
      return "Playlists";
    if (path.startsWith("/watch-history")) return "Watch History";
    return null;
  };

  const currentPage = getCurrentPage();

  // Listen for zone change events from page components
  useEffect(() => {
    const handleZoneChange = (e) => {
      setIsMainNavActive(e.detail.zone === "mainNav");
    };

    window.addEventListener("tvZoneChange", handleZoneChange);
    return () => window.removeEventListener("tvZoneChange", handleZoneChange);
  }, []);

  // Keyboard navigation when mainNav is active
  useEffect(() => {
    if (!isTVMode || !isMainNavActive) return;

    const handleKeyDown = (e) => {
      switch (e.key) {
        case "ArrowUp": {
          e.preventDefault();
          let newIndex = focusedIndex - 1;
          // Skip over the current page
          while (newIndex >= 0 && allNavItems[newIndex]?.name === currentPage) {
            newIndex--;
          }
          if (newIndex >= 0) {
            setFocusedIndex(newIndex);
            console.log(`🔼 Sidebar: Focused item ${newIndex} (${allNavItems[newIndex]?.name})`);
          }
          break;
        }

        case "ArrowDown": {
          e.preventDefault();
          let newIndex = focusedIndex + 1;
          // Skip over the current page
          while (newIndex < allNavItems.length && allNavItems[newIndex]?.name === currentPage) {
            newIndex++;
          }
          if (newIndex < allNavItems.length) {
            setFocusedIndex(newIndex);
            console.log(`🔽 Sidebar: Focused item ${newIndex} (${allNavItems[newIndex]?.name})`);
          }
          break;
        }

        case "Enter":
        case " ":
          e.preventDefault();
          const item = allNavItems[focusedIndex];
          if (item) {
            if (item.name === "Help") {
              setIsHelpModalOpen(true);
              console.log("✅ Sidebar: Opened Help modal");
            } else if (item.path) {
              navigate(item.path);
              console.log(`✅ Sidebar: Navigated to ${item.path}`);
            }
          }
          break;
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isTVMode, isMainNavActive, focusedIndex, allNavItems, navigate, currentPage]);

  // Scroll focused item into view
  useEffect(() => {
    if (isTVMode && isMainNavActive && itemRefs.current[focusedIndex]) {
      itemRefs.current[focusedIndex]?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  }, [focusedIndex, isTVMode, isMainNavActive]);

  return (
    <>
      <aside
        className="hidden lg:block fixed left-0 top-0 h-full z-40 transition-all duration-300 lg:w-16 xl:w-60"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderRight: "1px solid var(--border-color)",
        }}
      >
        <div className="h-full flex flex-col">
          {/* Logo at top - only in expanded view */}
          <div
            className="hidden xl:block p-4 border-b"
            style={{ borderColor: "var(--border-color)" }}
          >
            <PeekLogo variant="auto" size="small" />
          </div>

          {/* Navigation items */}
          <nav className="flex-1 overflow-y-auto py-4">
            <ul className="flex flex-col gap-1 px-2">
              {navItems.map((item, index) => {
                const isActive = currentPage === item.name;
                const isFocused = isTVMode && isMainNavActive && focusedIndex === index;

                return (
                  <li key={item.name}>
                    {/* Collapsed view (lg-xl): Icon only with tooltip */}
                    <div className="xl:hidden">
                      <Tooltip content={item.name} position="right">
                        <Link
                          ref={(el) => (itemRefs.current[index] = el)}
                          to={item.path}
                          className={`flex items-center justify-center h-12 w-12 rounded-lg transition-colors duration-200 ${
                            isActive ? "nav-link-active" : isFocused ? "keyboard-focus" : "nav-link"
                          }`}
                          aria-label={item.name}
                          tabIndex={isFocused ? 0 : -1}
                        >
                          <ThemedIcon name={item.icon} size={20} />
                        </Link>
                      </Tooltip>
                    </div>

                    {/* Expanded view (xl+): Icon + text */}
                    <Link
                      ref={(el) => (itemRefs.current[index] = el)}
                      to={item.path}
                      className={`hidden xl:flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
                        isActive ? "nav-link-active" : isFocused ? "keyboard-focus" : "nav-link"
                      }`}
                      tabIndex={isFocused ? 0 : -1}
                    >
                      <ThemedIcon name={item.icon} size={20} />
                      <span className="text-sm font-medium">{item.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          {/* Bottom section - Help, Settings, My Settings, Watch History */}
          <div
            className="border-t p-2"
            style={{ borderColor: "var(--border-color)" }}
          >
            <div className="flex flex-col gap-1">
              {/* Help button */}
              {(() => {
                const itemIndex = navItems.length; // First bottom item
                const isFocused = isTVMode && isMainNavActive && focusedIndex === itemIndex;
                return (
                  <>
                    <div className="xl:hidden">
                      <Tooltip content="Help" position="right">
                        <button
                          ref={(el) => (itemRefs.current[itemIndex] = el)}
                          onClick={() => setIsHelpModalOpen(true)}
                          className={`flex items-center justify-center h-12 w-12 rounded-lg transition-colors duration-200 ${isFocused ? "keyboard-focus" : "nav-link"}`}
                          aria-label="Help"
                          tabIndex={isFocused ? 0 : -1}
                        >
                          <ThemedIcon name="questionCircle" size={20} />
                        </button>
                      </Tooltip>
                    </div>
                    <button
                      ref={(el) => (itemRefs.current[itemIndex] = el)}
                      onClick={() => setIsHelpModalOpen(true)}
                      className={`hidden xl:flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${isFocused ? "keyboard-focus" : "nav-link"}`}
                      tabIndex={isFocused ? 0 : -1}
                    >
                      <ThemedIcon name="questionCircle" size={20} />
                      <span className="text-sm font-medium">Help</span>
                    </button>
                  </>
                );
              })()}

              {/* Server Settings (admin only) */}
              {user && user.role === "ADMIN" && (() => {
                const itemIndex = navItems.length + 1;
                const isFocused = isTVMode && isMainNavActive && focusedIndex === itemIndex;
                return (
                  <>
                    <div className="xl:hidden">
                      <Tooltip content="Server Settings" position="right">
                        <Link
                          ref={(el) => (itemRefs.current[itemIndex] = el)}
                          to="/server-settings"
                          className={`flex items-center justify-center h-12 w-12 rounded-lg transition-colors duration-200 ${isFocused ? "keyboard-focus" : "nav-link"}`}
                          aria-label="Server Settings"
                          tabIndex={isFocused ? 0 : -1}
                        >
                          <ThemedIcon name="wrench" size={20} />
                        </Link>
                      </Tooltip>
                    </div>
                    <Link
                      ref={(el) => (itemRefs.current[itemIndex] = el)}
                      to="/server-settings"
                      className={`hidden xl:flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${isFocused ? "keyboard-focus" : "nav-link"}`}
                      tabIndex={isFocused ? 0 : -1}
                    >
                      <ThemedIcon name="wrench" size={20} />
                      <span className="text-sm font-medium">Server Settings</span>
                    </Link>
                  </>
                );
              })()}

              {/* My Settings */}
              {(() => {
                const itemIndex = navItems.length + (user && user.role === "ADMIN" ? 2 : 1);
                const isFocused = isTVMode && isMainNavActive && focusedIndex === itemIndex;
                return (
                  <>
                    <div className="xl:hidden">
                      <Tooltip content="My Settings" position="right">
                        <Link
                          ref={(el) => (itemRefs.current[itemIndex] = el)}
                          to="/my-settings"
                          className={`flex items-center justify-center h-12 w-12 rounded-lg transition-colors duration-200 ${isFocused ? "keyboard-focus" : "nav-link"}`}
                          aria-label="My Settings"
                          tabIndex={isFocused ? 0 : -1}
                        >
                          <ThemedIcon name="settings" size={20} />
                        </Link>
                      </Tooltip>
                    </div>
                    <Link
                      ref={(el) => (itemRefs.current[itemIndex] = el)}
                      to="/my-settings"
                      className={`hidden xl:flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${isFocused ? "keyboard-focus" : "nav-link"}`}
                      tabIndex={isFocused ? 0 : -1}
                    >
                      <ThemedIcon name="settings" size={20} />
                      <span className="text-sm font-medium">My Settings</span>
                    </Link>
                  </>
                );
              })()}

              {/* Watch History */}
              {(() => {
                const itemIndex = navItems.length + (user && user.role === "ADMIN" ? 3 : 2);
                const isFocused = isTVMode && isMainNavActive && focusedIndex === itemIndex;
                return (
                  <>
                    <div className="xl:hidden">
                      <Tooltip content="Watch History" position="right">
                        <Link
                          ref={(el) => (itemRefs.current[itemIndex] = el)}
                          to="/watch-history"
                          className={`flex items-center justify-center h-12 w-12 rounded-lg transition-colors duration-200 ${isFocused ? "keyboard-focus" : "nav-link"}`}
                          aria-label="Watch History"
                          tabIndex={isFocused ? 0 : -1}
                        >
                          <ThemedIcon name="history" size={20} />
                        </Link>
                      </Tooltip>
                    </div>
                    <Link
                      ref={(el) => (itemRefs.current[itemIndex] = el)}
                      to="/watch-history"
                      className={`hidden xl:flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${isFocused ? "keyboard-focus" : "nav-link"}`}
                      tabIndex={isFocused ? 0 : -1}
                    >
                      <ThemedIcon name="history" size={20} />
                      <span className="text-sm font-medium">Watch History</span>
                    </Link>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      </aside>

      {/* Help Modal */}
      {isHelpModalOpen && (
        <HelpModal onClose={() => setIsHelpModalOpen(false)} />
      )}
    </>
  );
};

export default Sidebar;
