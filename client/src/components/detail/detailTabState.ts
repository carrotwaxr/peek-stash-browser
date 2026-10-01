/**
 * A detail page's tabs: what each one is, which one is open, and the
 * context that hands the open tab to the page's Statistics.
 */
import { type ReactNode, createContext, useContext } from "react";
import { useSearchParams } from "react-router-dom";

/** One tab of a detail page */
export interface DetailTabSpec {
  /** The tab's `tab` URL value; a key of the page's counts */
  id: string;
  label: string;
  /** The tab's list total for the viewer; undefined while the counts load */
  count: number | undefined;
  /** The tab's content, rendered only while it is open */
  render: () => ReactNode;
  /** The tab lists by a field that takes the page's Include sub-* toggle */
  takesSubToggle?: boolean;
}

/** What a detail page reads of its `useRelationCounts` result */
export interface DetailCounts {
  /** The counts answer; undefined until it arrives */
  data: unknown;
  error: unknown;
  refetch: () => unknown;
}

export interface DetailTabState {
  /** The URL's tab, else the default */
  activeTab: string;
  /**
   * The first tab with content, else the fallback, once the counts answer;
   * "" before, so no tab opens on a guess
   */
  defaultTab: string;
}

/** The open tab and the default, from the tabs, the counts and the URL */
export function useDetailTabState(
  tabs: readonly DetailTabSpec[],
  counts: DetailCounts,
  fallbackTab: string
): DetailTabState {
  const [searchParams] = useSearchParams();
  const defaultTab =
    counts.data === undefined
      ? ""
      : (tabs.find((tab) => (tab.count ?? 0) > 0)?.id ?? fallbackTab);
  const urlTab = searchParams.get("tab");
  return {
    activeTab: urlTab !== null && urlTab !== "" ? urlTab : defaultTab,
    defaultTab,
  };
}

/** The layout's open tab, for the parts its sections render (Statistics) */
export const DetailTabContext = createContext<DetailTabState | null>(null);

/**
 * The open tab and the default from the layout around the caller; outside
 * one, the URL's tab with no default
 */
export function useDetailTab(): DetailTabState {
  const fromLayout = useContext(DetailTabContext);
  const [searchParams] = useSearchParams();
  return (
    fromLayout ?? { activeTab: searchParams.get("tab") ?? "", defaultTab: "" }
  );
}
