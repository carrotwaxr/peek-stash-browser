import { useCallback, useEffect, useRef, useState } from "react";

/**
 * SettingsLayout - Reusable layout for settings with horizontal tab navigation
 * Handles mobile scrolling, active tab indication, and tab content rendering
 */
const SettingsLayout = ({ tabs, activeTab, onTabChange, children }) => {
  const SCROLL_THRESHOLD = 1;
  const tabContainerRef = useRef(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);

  // Check scroll position to show/hide fade indicators
  const checkScroll = useCallback(() => {
    const container = tabContainerRef.current;
    if (!container) return;

    setShowLeftFade(container.scrollLeft > 0);
    setShowRightFade(
      container.scrollLeft < container.scrollWidth - container.clientWidth - SCROLL_THRESHOLD
    );
  }, []);

  // Scroll active tab into view
  useEffect(() => {
    const container = tabContainerRef.current;
    if (!container) return;

    const activeTabElement = container.querySelector(
      `[data-tab-id="${activeTab}"]`
    );
    if (activeTabElement) {
      activeTabElement.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "center",
      });
    }

    checkScroll();
  }, [activeTab, checkScroll]);

  // Add scroll listener
  useEffect(() => {
    const container = tabContainerRef.current;
    if (!container) return;

    container.addEventListener("scroll", checkScroll);
    window.addEventListener("resize", checkScroll);

    checkScroll();

    return () => {
      container.removeEventListener("scroll", checkScroll);
      window.removeEventListener("resize", checkScroll);
    };
  }, [checkScroll]);

  return (
    <div>
      {/* Tab Navigation */}
      <div className="relative mb-6">
        {/* Left fade indicator */}
        {showLeftFade && (
          <div
            className="absolute left-0 top-0 bottom-0 w-8 pointer-events-none z-10"
            style={{
              background: `linear-gradient(to right, var(--bg-primary), transparent)`,
            }}
          />
        )}

        {/* Tab container */}
        <div
          ref={tabContainerRef}
          className="settings-tab-container flex gap-4 overflow-x-auto pb-2"
          style={{
            scrollbarWidth: "none",
            WebkitOverflowScrolling: "touch",
            scrollBehavior: "smooth",
          }}
          role="tablist"
          aria-label="Settings tabs"
        >
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                data-tab-id={tab.id}
                onClick={() => onTabChange(tab.id)}
                className="flex-shrink-0 px-4 py-3 text-sm font-medium transition-all duration-200 whitespace-nowrap"
                style={{
                  color: isActive
                    ? "var(--accent-primary)"
                    : "var(--text-secondary)",
                  fontWeight: isActive ? "600" : "500",
                  borderBottom: isActive
                    ? "3px solid var(--accent-primary)"
                    : "3px solid transparent",
                  backgroundColor: "transparent",
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
                role="tab"
                aria-selected={isActive}
                aria-controls={`${tab.id}-panel`}
                id={`${tab.id}-tab`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Right fade indicator */}
        {showRightFade && (
          <div
            className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none z-10"
            style={{
              background: `linear-gradient(to left, var(--bg-primary), transparent)`,
            }}
          />
        )}

        {/* Hide scrollbar */}
        <style>{`
          .settings-tab-container::-webkit-scrollbar {
            display: none;
          }
        `}</style>
      </div>

      {/* Tab Content */}
      <div
        role="tabpanel"
        id={`${activeTab}-panel`}
        aria-labelledby={`${activeTab}-tab`}
      >
        {children}
      </div>
    </div>
  );
};

export default SettingsLayout;
