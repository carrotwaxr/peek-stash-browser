import { useLayoutEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { switchTabParams } from "../utils/urlParams";

/**
 * Opens a tab from outside its tab bar (a detail page's statistic): the tab
 * opens with its list on page 1, and once its content has rendered the page
 * scrolls down to the tab bar. Scrolling in the click aimed at the page as
 * the old tab left it; the new tab's shorter content then stopped the smooth
 * scroll where it started.
 */
export function useOpenTabAndScroll(
  defaultTab: string
): (tabId: string) => void {
  const [searchParams, setSearchParams] = useSearchParams();
  const scrollPending = useRef(false);
  const urlTab = searchParams.get("tab");

  useLayoutEffect(() => {
    if (!scrollPending.current) return;
    scrollPending.current = false;
    // TabNavigation marks its bar
    const tabBar = document.querySelector("[data-tab-bar]");
    if (tabBar) {
      tabBar.scrollIntoView({ behavior: "smooth", block: "start" });
    } else {
      window.scrollTo({
        top: document.documentElement.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [urlTab]);

  return (tabId: string) => {
    const next = switchTabParams(searchParams, tabId, defaultTab);
    // The effect scrolls on the URL's tab changing; nothing else may arm it
    scrollPending.current = next.get("tab") !== urlTab;
    setSearchParams(next);
  };
}
