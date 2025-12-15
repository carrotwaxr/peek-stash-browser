import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { getOrderedNavItems } from "../../constants/navigation.js";
import { useAuth } from "../../hooks/useAuth.js";
import { useTVMode } from "../../hooks/useTVMode.js";
import { PeekLogo } from "../branding/PeekLogo.jsx";
import { ThemedIcon } from "../icons/index.js";
import Button from "./Button.jsx";
import HelpModal from "./HelpModal.jsx";
import Tooltip from "./Tooltip.jsx";

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
  const { user, logout } = useAuth();
  const { isTVMode, toggleTVMode } = useTVMode();
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isMainNavActive, setIsMainNavActive] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [isUserMenuExpanded, setIsUserMenuExpanded] = useState(false);
  const itemRefs = useRef([]);

  // Get ordered and filtered nav items based on user preferences
  const navItems = getOrderedNavItems(navPreferences);

  // User menu sub-items (static definition)
  const userMenuSubItems = useMemo(() => [
    { name: "Watch History", path: "/watch-history", icon: "history", isSubItem: true },
    { name: "My Settings", path: "/my-settings", icon: "settings", isSubItem: true },
    { name: "TV Mode", path: null, isToggle: true, icon: "tv", isSubItem: true },
    { name: "Sign Out", path: null, isButton: true, icon: "logout", isSubItem: true },
  ], []);

  // Build complete list of all navigable items (nav items + bottom items)
  // When user menu is expanded, include sub-items in the navigation list
  const allNavItems = useMemo(() => {
    const bottomItems = [
      { name: "Help", path: null, isButton: true, icon: "questionCircle" },
    ];

    if (user && user.role === "ADMIN") {
      bottomItems.push({ name: "Server Settings", path: "/server-settings", icon: "wrench" });
    }

    // User menu parent item
    bottomItems.push({
      name: "User Menu",
      path: null,
      isUserMenu: true,
      icon: "circle-user-round",
    });

    // If user menu is expanded, add sub-items to navigation list
    if (isUserMenuExpanded) {
      bottomItems.push(...userMenuSubItems);
    }

    return [...navItems, ...bottomItems];
  }, [navItems, user, isUserMenuExpanded, userMenuSubItems]);

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
      const zone = e.detail.zone;
      // zone === null means page doesn't support TV navigation (e.g., Scene player page)
      // In this case, deactivate mainNav so keyboard events don't get intercepted
      setIsMainNavActive(zone === "mainNav");
    };

    window.addEventListener("tvZoneChange", handleZoneChange);
    return () => window.removeEventListener("tvZoneChange", handleZoneChange);
  }, []);

  // Keyboard navigation when mainNav is active
  useEffect(() => {
    if (!isTVMode || !isMainNavActive) {
      return;
    }

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
          }
          break;
        }

        case "Enter":
        case " ": {
          e.preventDefault();
          e.stopPropagation();
          const item = allNavItems[focusedIndex];
          if (item) {
            if (item.name === "Help") {
              setIsHelpModalOpen(true);
            } else if (item.isUserMenu) {
              setIsUserMenuExpanded(!isUserMenuExpanded);
            } else if (item.name === "TV Mode") {
              toggleTVMode();
            } else if (item.name === "Sign Out") {
              logout();
            } else if (item.path) {
              navigate(item.path);
            }
          }
          break;
        }
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isTVMode, isMainNavActive, focusedIndex, allNavItems, navigate, currentPage, isUserMenuExpanded, toggleTVMode, logout]);

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

          {/* Bottom section - Help, Server Settings (admin), User Menu */}
          <div
            className="border-t p-2"
            style={{ borderColor: "var(--border-color)" }}
          >
            <div className="flex flex-col gap-1">
              {/* Help button */}
              {(() => {
                const itemIndex = navItems.length;
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

              {/* User Menu */}
              {(() => {
                const userMenuItemIndex = navItems.length + (user && user.role === "ADMIN" ? 2 : 1);
                const isUserMenuFocused = isTVMode && isMainNavActive && focusedIndex === userMenuItemIndex;

                return (
                  <div>
                    {/* User menu toggle - collapsed view with flyout */}
                    <div className="xl:hidden">
                      <Tooltip
                        position="right"
                        clickable={true}
                        content={
                          <div className="flex flex-col gap-1 min-w-[160px]">
                            <div className="px-2 py-1 text-xs font-medium opacity-60 border-b mb-1" style={{ borderColor: "var(--border-color)" }}>
                              {user?.username || "User"}
                            </div>
                            <Link
                              to="/watch-history"
                              className="flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors duration-200 nav-link"
                            >
                              <ThemedIcon name="history" size={16} />
                              <span>Watch History</span>
                            </Link>
                            <Link
                              to="/my-settings"
                              className="flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors duration-200 nav-link"
                            >
                              <ThemedIcon name="settings" size={16} />
                              <span>My Settings</span>
                            </Link>
                            <button
                              onClick={toggleTVMode}
                              className="w-full flex items-center justify-between px-3 py-2 text-sm rounded transition-colors duration-200 nav-link"
                            >
                              <div className="flex items-center gap-3">
                                <ThemedIcon name="tv" size={16} />
                                <span>TV Mode</span>
                              </div>
                              {isTVMode && <span className="text-sm">✓</span>}
                            </button>
                            <button
                              onClick={logout}
                              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors duration-200 text-red-600 hover:bg-red-50"
                            >
                              <ThemedIcon name="logout" size={16} color="currentColor" />
                              <span>Sign Out</span>
                            </button>
                          </div>
                        }
                      >
                        <button
                          ref={(el) => (itemRefs.current[userMenuItemIndex] = el)}
                          className={`flex items-center justify-center h-12 w-12 rounded-lg transition-colors duration-200 ${isUserMenuFocused ? "keyboard-focus" : "nav-link"}`}
                          aria-label="User menu"
                          tabIndex={isUserMenuFocused ? 0 : -1}
                        >
                          <ThemedIcon name="circle-user-round" size={20} />
                        </button>
                      </Tooltip>
                    </div>

                    {/* User menu toggle - expanded view */}
                    <button
                      ref={(el) => (itemRefs.current[userMenuItemIndex] = el)}
                      onClick={() => setIsUserMenuExpanded(!isUserMenuExpanded)}
                      className={`hidden xl:flex items-center justify-between px-4 py-3 rounded-lg transition-colors duration-200 ${isUserMenuFocused ? "keyboard-focus" : "nav-link"}`}
                      tabIndex={isUserMenuFocused ? 0 : -1}
                    >
                      <div className="flex items-center gap-3">
                        <ThemedIcon name="circle-user-round" size={20} />
                        <span className="text-sm font-medium">{user?.username || "User"}</span>
                      </div>
                      <ThemedIcon
                        name={isUserMenuExpanded ? "chevron-up" : "chevron-down"}
                        size={16}
                      />
                    </button>

                    {/* Nested user menu items - only in expanded view */}
                    {isUserMenuExpanded && (
                      <div className="hidden xl:block mt-1 ml-4 pl-4 border-l" style={{ borderColor: "var(--border-color)" }}>
                        {userMenuSubItems.map((subItem, subIndex) => {
                          const subItemIndex = userMenuItemIndex + 1 + subIndex;
                          const isSubItemFocused = isTVMode && isMainNavActive && focusedIndex === subItemIndex;

                          if (subItem.name === "TV Mode") {
                            return (
                              <button
                                key={subItem.name}
                                ref={(el) => (itemRefs.current[subItemIndex] = el)}
                                onClick={() => {
                                  toggleTVMode();
                                }}
                                className={`w-full flex items-center justify-between px-3 py-2 text-sm rounded transition-colors duration-200 mb-1 ${isSubItemFocused ? "keyboard-focus" : "nav-link"}`}
                                tabIndex={isSubItemFocused ? 0 : -1}
                              >
                                <div className="flex items-center gap-3">
                                  <ThemedIcon name="tv" size={16} />
                                  <span>TV Mode</span>
                                </div>
                                {isTVMode && <span className="text-sm">✓</span>}
                              </button>
                            );
                          } else if (subItem.name === "Sign Out") {
                            return (
                              <button
                                key={subItem.name}
                                ref={(el) => (itemRefs.current[subItemIndex] = el)}
                                onClick={logout}
                                className={`w-full flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors duration-200 mb-1 ${isSubItemFocused ? "keyboard-focus text-red-600 hover:bg-red-50" : "text-red-600 hover:bg-red-50"}`}
                                tabIndex={isSubItemFocused ? 0 : -1}
                              >
                                <ThemedIcon name="logout" size={16} color="currentColor" />
                                <span>Sign Out</span>
                              </button>
                            );
                          } else {
                            return (
                              <Link
                                key={subItem.name}
                                ref={(el) => (itemRefs.current[subItemIndex] = el)}
                                to={subItem.path}
                                className={`flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors duration-200 mb-1 ${isSubItemFocused ? "keyboard-focus" : "nav-link"}`}
                                tabIndex={isSubItemFocused ? 0 : -1}
                              >
                                <ThemedIcon name={subItem.icon} size={16} />
                                <span>{subItem.name}</span>
                              </Link>
                            );
                          }
                        })}
                      </div>
                    )}
                  </div>
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
