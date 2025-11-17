import { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { getOrderedNavItems } from "../../constants/navigation.js";
import { useAuth } from "../../hooks/useAuth.js";
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
 */
const Sidebar = ({ navPreferences = [] }) => {
  const location = useLocation();
  const { user } = useAuth();
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);

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
    if (path.startsWith("/playlists") || path.startsWith("/playlist/"))
      return "Playlists";
    if (path.startsWith("/watch-history")) return "Watch History";
    return null;
  };

  const currentPage = getCurrentPage();

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
              {navItems.map((item) => {
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

          {/* Bottom section - Help, Settings, My Settings, Watch History */}
          <div
            className="border-t p-2"
            style={{ borderColor: "var(--border-color)" }}
          >
            <div className="flex flex-col gap-1">
              {/* Help button */}
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

              {/* Server Settings (admin only) */}
              {user && user.role === "ADMIN" && (
                <>
                  <div className="xl:hidden">
                    <Tooltip content="Server Settings" position="right">
                      <Link
                        to="/server-settings"
                        className="flex items-center justify-center h-12 w-12 rounded-lg transition-colors duration-200 nav-link"
                        aria-label="Server Settings"
                      >
                        <ThemedIcon name="wrench" size={20} />
                      </Link>
                    </Tooltip>
                  </div>
                  <Link
                    to="/server-settings"
                    className="hidden xl:flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 nav-link"
                  >
                    <ThemedIcon name="wrench" size={20} />
                    <span className="text-sm font-medium">Server Settings</span>
                  </Link>
                </>
              )}

              {/* My Settings */}
              <div className="xl:hidden">
                <Tooltip content="My Settings" position="right">
                  <Link
                    to="/my-settings"
                    className="flex items-center justify-center h-12 w-12 rounded-lg transition-colors duration-200 nav-link"
                    aria-label="My Settings"
                  >
                    <ThemedIcon name="settings" size={20} />
                  </Link>
                </Tooltip>
              </div>
              <Link
                to="/my-settings"
                className="hidden xl:flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 nav-link"
              >
                <ThemedIcon name="settings" size={20} />
                <span className="text-sm font-medium">My Settings</span>
              </Link>

              {/* Watch History */}
              <div className="xl:hidden">
                <Tooltip content="Watch History" position="right">
                  <Link
                    to="/watch-history"
                    className="flex items-center justify-center h-12 w-12 rounded-lg transition-colors duration-200 nav-link"
                    aria-label="Watch History"
                  >
                    <ThemedIcon name="history" size={20} />
                  </Link>
                </Tooltip>
              </div>
              <Link
                to="/watch-history"
                className="hidden xl:flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 nav-link"
              >
                <ThemedIcon name="history" size={20} />
                <span className="text-sm font-medium">Watch History</span>
              </Link>
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
