import { type ReactNode, Suspense, lazy, useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  getNavKeyForPath,
  getOrderedNavItems,
} from "../../constants/navigation";
import { useAuth } from "../../hooks/useAuth";
import { useSharedMediaQuery } from "../../hooks/useHoverCapable";
import { useTVMode } from "../../hooks/useTVMode";
import { showError } from "../../utils/toast";
import { PeekLogo } from "../branding/PeekLogo";
import { ThemedIcon } from "../icons/index";
import Button from "./Button";
import { PieceErrorBoundary } from "./ErrorBoundary";
import Tooltip from "./Tooltip";
import UserMenu from "./UserMenu";

// Loaded on first open: the shortcut list is not part of the first load
const HelpModal = lazy(() => import("./HelpModal"));

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

/** Tailwind's `xl` breakpoint: the sidebar shows labels from here up */
const EXPANDED_QUERY = "(min-width: 1280px)";

interface NavEntryProps {
  label: string;
  icon: ReactNode;
  /** The sidebar shows labels: no tooltip */
  expanded: boolean;
  active?: boolean;
  /** A link when given, else a button */
  to?: string;
  onClick?: () => void;
}

/**
 * One sidebar item, rendered once: an icon, and a label that CSS hides below
 * xl. The tooltip names the item only while the labels are hidden.
 */
const NavEntry = ({
  label,
  icon,
  expanded,
  active = false,
  to,
  onClick,
}: NavEntryProps) => {
  const className = `flex items-center justify-center xl:justify-start gap-3 h-12 w-12 xl:h-auto xl:w-auto xl:px-4 xl:py-3 rounded-lg transition-colors duration-200 ${
    active ? "nav-link-active" : "nav-link"
  }`;
  const content = (
    <>
      {icon}
      <span className="hidden xl:inline text-sm font-medium">{label}</span>
    </>
  );

  return (
    <Tooltip content={label} position="right" disabled={expanded}>
      {to ? (
        <Link to={to} className={className} aria-label={label}>
          {content}
        </Link>
      ) : (
        <button onClick={onClick} className={className} aria-label={label}>
          {content}
        </button>
      )}
    </Tooltip>
  );
};

const Sidebar = ({ navPreferences = [] }: Props) => {
  const location = useLocation();
  const { user, logout } = useAuth();
  const { isTVMode, toggleTVMode } = useTVMode();
  const [isHelpModalOpen, setIsHelpModalOpen] = useState(false);
  const [isUserMenuExpanded, setIsUserMenuExpanded] = useState(false);
  const expanded = useSharedMediaQuery(EXPANDED_QUERY);

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
                      <NavEntry
                        to={item.path}
                        label={item.name}
                        icon={<ThemedIcon name={item.icon} size={20} />}
                        expanded={expanded}
                        active={isActive}
                      />
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
              <NavEntry
                label="Help"
                icon={<ThemedIcon name="questionCircle" size={20} />}
                expanded={expanded}
                onClick={() => setIsHelpModalOpen(true)}
              />

              <NavEntry
                to="/settings"
                label="Settings"
                icon={<ThemedIcon name="settings" size={20} />}
                expanded={expanded}
                active={isSettingsActive}
              />

              {/* User menu: a flyout while collapsed, the username's own list expanded */}
              {!expanded ? (
                <UserMenu placement="right-end" />
              ) : (
                <div>
                  <button
                    onClick={() => setIsUserMenuExpanded(!isUserMenuExpanded)}
                    className="flex w-full items-center justify-between px-4 py-3 rounded-lg transition-colors duration-200 nav-link"
                  >
                    <div className="flex items-center gap-3">
                      <ThemedIcon name="circle-user-round" size={20} />
                      <span className="text-sm font-medium">
                        {user?.username || "User"}
                      </span>
                    </div>
                    <ThemedIcon
                      name={isUserMenuExpanded ? "chevron-up" : "chevron-down"}
                      size={16}
                    />
                  </button>

                  {/* The user's items */}
                  {isUserMenuExpanded && (
                    <div
                      className="mt-1 ml-4 pl-4 border-l"
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
              )}
            </div>
          </div>
        </div>
      </aside>

      {/* Help Modal */}
      {isHelpModalOpen && (
        // Its own chunk: one that fails to load closes and says so
        <PieceErrorBoundary
          onError={() => {
            setIsHelpModalOpen(false);
            showError("Couldn't open help");
          }}
        >
          <Suspense fallback={null}>
            <HelpModal onClose={() => setIsHelpModalOpen(false)} />
          </Suspense>
        </PieceErrorBoundary>
      )}
    </>
  );
};

export default Sidebar;
