import { useSearchParams } from "react-router-dom";

/** Use this value for tab count when data is still loading (shows tab without count badge) */
export const TAB_COUNT_LOADING = -1;

/**
 * TabNavigation - A reusable tab navigation component with URL query parameter support
 *
 * @param {Object} props
 * @param {Array<{id: string, label: string, count: number}>} props.tabs - Array of tab objects
 *   - count > 0: Show tab with count badge
 *   - count === 0: Hide tab (no content) unless showEmpty is true
 *   - count === TAB_COUNT_LOADING (-1): Show tab without count badge (loading state)
 * @param {string} props.defaultTab - Default tab ID if none specified in URL
 * @param {Function} [props.onTabChange] - Optional callback when tab changes (receives tabId)
 * @param {boolean} [props.showSingleTab] - If true, show tab bar even when only one tab is visible
 * @param {boolean} [props.showEmpty] - If true, show tabs even when count is 0 (still shows count badge)
 */
const TabNavigation = ({ tabs, defaultTab, onTabChange, showSingleTab = false, showEmpty = false }) => {
  const [searchParams, setSearchParams] = useSearchParams();

  // Get active tab from URL or use default
  const activeTab = searchParams.get('tab') || defaultTab;

  // Filter out tabs with zero count unless showEmpty is true
  // TAB_COUNT_LOADING means loading, show tab without badge
  const visibleTabs = tabs.filter(tab => tab.count > 0 || tab.count === TAB_COUNT_LOADING || showEmpty);

  // Pagination/filter params that should be cleared when switching tabs
  // Each tab has its own pagination state, so these shouldn't carry over
  const PAGINATION_PARAMS = ['page', 'per_page', 'sort', 'dir', 'q'];

  const handleTabClick = (tabId) => {
    if (tabId === activeTab) return; // Already on this tab

    // Update URL query parameter and clear pagination params
    const newParams = new URLSearchParams(searchParams);

    // Clear pagination params - each tab has independent pagination state
    PAGINATION_PARAMS.forEach(param => newParams.delete(param));

    if (tabId === defaultTab) {
      // Remove tab param if switching to default
      newParams.delete('tab');
    } else {
      newParams.set('tab', tabId);
    }
    setSearchParams(newParams);

    // Call optional callback
    if (onTabChange) {
      onTabChange(tabId);
    }
  };

  // If no visible tabs, don't render anything
  if (visibleTabs.length === 0) {
    return null;
  }

  // If only one visible tab, don't show tab navigation (unless showSingleTab is true)
  if (visibleTabs.length === 1 && !showSingleTab) {
    return null;
  }

  return (
    <div
      className="flex overflow-x-auto scrollbar-thin scrollbar-thumb-rounded"
      style={{
        borderBottom: '2px solid var(--bg-tertiary)',
        marginBottom: '1.5rem',
      }}
    >
      <div className="flex gap-1 min-w-full">
        {visibleTabs.map((tab) => {
          const isActive = tab.id === activeTab;

          return (
            <button
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
              className="px-6 py-3 font-medium whitespace-nowrap transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-offset-2"
              style={{
                color: isActive ? 'var(--accent-primary)' : 'var(--text-secondary)',
                borderBottom: isActive ? '3px solid var(--accent-primary)' : '3px solid transparent',
                backgroundColor: isActive ? 'rgba(59, 130, 246, 0.05)' : 'transparent',
                cursor: isActive ? 'default' : 'pointer',
              }}
              aria-current={isActive ? 'page' : undefined}
              disabled={isActive}
            >
              <span className="flex items-center gap-2">
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count >= 0 && (
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{
                      backgroundColor: isActive
                        ? 'var(--accent-primary)'
                        : 'var(--bg-tertiary)',
                      color: isActive ? 'white' : 'var(--text-muted)',
                    }}
                  >
                    {tab.count}
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default TabNavigation;
