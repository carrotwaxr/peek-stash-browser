import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  getNavKeyForPath,
  getOrderedNavItems,
} from "../../constants/navigation";
import { useAuth } from "../../hooks/useAuth";
import { useTVMode } from "../../hooks/useTVMode";
import { PeekLogo } from "../branding/PeekLogo";
import { ThemedIcon } from "../icons/index";
import Button from "./Button";
import HelpModal from "./HelpModal";
import Tooltip from "./Tooltip";

/**
 * Sidebar Navigation Component
 *
 * Responsive sidebar navigation with automatic sizing:
 * - < lg: Hidden (hamburger menu in TopBar)
 * - lg - xl: Collapsed (64px wide, icons only with tooltips)
 * - xl+: Expanded (240px wide, icons + text labels)
 *
 * Its links and buttons are in the Tab order; in TV mode the arrow keys reach
 * them by position (`TVNavigator`).
 */
interface NavPreference {
  id: string;
  enabled: boolean;
  order: number;
}

interface Props {
  navPreferences?: NavPreference[];
}

const Sidebar = ({ navPreferences = [] }: Props) => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { isTVMode, toggleTVMode } = useTVMode();
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isUserMenuExpanded, setIsUserMenuExpanded] = useState(false);

  // Get ordered and filtered nav items based on user preferences
  const navItems = getOrderedNavItems(navPreferences);

  // User menu sub-items (static definition). `as const` keeps the names
  // literal, so checking an item's name narrows its path
  const userMenuSubItems = useMemo(
    () =>
      [
        {
          name: "Watch History",
          path: "/watch-history",
          icon: "history",
          isSubItem: true,
        },
        {
          name: "My Stats",
          path: "/user-stats",
          icon: "bar-chart-3",
          isSubItem: true,
        },
        {
          name: "Downloads",
          path: "/downloads",
          icon: "download",
          isSubItem: true,
        },
        {
          name: "TV Mode",
          path: null,
          isToggle: true,
          icon: "tv",
          isSubItem: true,
        },
        {
          name: "Sign Out",
          path: null,
          isButton: true,
          icon: "logout",
          isSubItem: true,
        },
      ] as const,
    []
  );

  // The nav item the current path belongs to
  const currentPage = getNavKeyForPath(location.pathname);
  const isSettingsActive = currentPage === "Settings";

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
              {navItems
                .filter((i): i is NonNullable<typeof i> => Boolean(i))
                .map((item) => {
                  const isActive = currentPage === item.name;

                  return (
                    <li key={item.name}>
                      {/* Collapsed view (lg-xl): Icon only with tooltip */}
                      <div className="xl:hidden">
                        <Tooltip content={item.name} position="right">
                          <Link
                            to={item.path}
                            className={`flex items-center justify-center h-12 w-12 rounded-lg transition-colors duration-200 ${
                              isActive ? "nav-link-active" : "nav-link"
                            }`}
                            aria-label={item.name}
                          >
                            <ThemedIcon name={item.icon} size={20} />
                          </Link>
                        </Tooltip>
                      </div>

                      {/* Expanded view (xl+): Icon + text */}
                      <Link
                        to={item.path}
                        className={`hidden xl:flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
                          isActive ? "nav-link-active" : "nav-link"
                        }`}
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
                return (
                  <>
                    <div className="xl:hidden">
                      <Tooltip content="Help" position="right">
                        <button
                          onClick={() => setIsHelpModalOpen(true)}
                          className="flex items-center justify-center h-12 w-12 rounded-lg transition-colors duration-200 nav-link"
                          aria-label="Help"
                        >
                          <ThemedIcon name="questionCircle" size={20} />
                        </button>
                      </Tooltip>
                    </div>
                    <button
                      onClick={() => setIsHelpModalOpen(true)}
                      className="hidden xl:flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 nav-link"
                    >
                      <ThemedIcon name="questionCircle" size={20} />
                      <span className="text-sm font-medium">Help</span>
                    </button>
                  </>
                );
              })()}

              {/* Settings (universal) */}
              {(() => {
                return (
                  <>
                    <div className="xl:hidden">
                      <Tooltip content="Settings" position="right">
                        <Link
                          to="/settings"
                          className={`flex items-center justify-center h-12 w-12 rounded-lg transition-colors duration-200 ${
                            isSettingsActive ? "nav-link-active" : "nav-link"
                          }`}
                          aria-label="Settings"
                        >
                          <ThemedIcon name="settings" size={20} />
                        </Link>
                      </Tooltip>
                    </div>
                    <Link
                      to="/settings"
                      className={`hidden xl:flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 ${
                        isSettingsActive ? "nav-link-active" : "nav-link"
                      }`}
                    >
                      <ThemedIcon name="settings" size={20} />
                      <span className="text-sm font-medium">Settings</span>
                    </Link>
                  </>
                );
              })()}

              {/* User Menu */}
              {(() => {
                return (
                  <div>
                    {/* User menu toggle - collapsed view with flyout */}
                    <div className="xl:hidden">
                      <Tooltip
                        position="right"
                        clickable={true}
                        content={
                          <div className="flex flex-col gap-1 min-w-[160px]">
                            <div
                              className="px-2 py-1 text-xs font-medium opacity-60 border-b mb-1"
                              style={{ borderColor: "var(--border-color)" }}
                            >
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
                              to="/user-stats"
                              className="flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors duration-200 nav-link"
                            >
                              <ThemedIcon name="bar-chart-3" size={16} />
                              <span>My Stats</span>
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
                              onClick={() => void logout()}
                              className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors duration-200 text-red-600 hover:bg-red-50"
                            >
                              <ThemedIcon
                                name="logout"
                                size={16}
                                color="currentColor"
                              />
                              <span>Sign Out</span>
                            </button>
                          </div>
                        }
                      >
                        <button
                          className="flex items-center justify-center h-12 w-12 rounded-lg transition-colors duration-200 nav-link"
                          aria-label="User menu"
                        >
                          <ThemedIcon name="circle-user-round" size={20} />
                        </button>
                      </Tooltip>
                    </div>

                    {/* User menu toggle - expanded view */}
                    <button
                      onClick={() => setIsUserMenuExpanded(!isUserMenuExpanded)}
                      className="hidden xl:flex items-center justify-between px-4 py-3 rounded-lg transition-colors duration-200 nav-link"
                    >
                      <div className="flex items-center gap-3">
                        <ThemedIcon name="circle-user-round" size={20} />
                        <span className="text-sm font-medium">
                          {user?.username || "User"}
                        </span>
                      </div>
                      <ThemedIcon
                        name={
                          isUserMenuExpanded ? "chevron-up" : "chevron-down"
                        }
                        size={16}
                      />
                    </button>

                    {/* Nested user menu items - only in expanded view */}
                    {isUserMenuExpanded && (
                      <div
                        className="hidden xl:block mt-1 ml-4 pl-4 border-l"
                        style={{ borderColor: "var(--border-color)" }}
                      >
                        {userMenuSubItems.map((subItem) => {
                          if (subItem.name === "TV Mode") {
                            return (
                              <button
                                key={subItem.name}
                                onClick={() => {
                                  toggleTVMode();
                                }}
                                className="w-full flex items-center justify-between px-3 py-2 text-sm rounded transition-colors duration-200 mb-1 nav-link"
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
                                onClick={() => void logout()}
                                className="w-full flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors duration-200 mb-1 text-red-600 hover:bg-red-50"
                              >
                                <ThemedIcon
                                  name="logout"
                                  size={16}
                                  color="currentColor"
                                />
                                <span>Sign Out</span>
                              </button>
                            );
                          } else {
                            return (
                              <Link
                                key={subItem.name}
                                to={subItem.path}
                                className="flex items-center gap-3 px-3 py-2 text-sm rounded transition-colors duration-200 mb-1 nav-link"
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
