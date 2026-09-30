import type { ListView } from "../../hooks/useListUrlState";
import { periodDateRange } from "../timeline/useTimelineState";

const refValues = (criterion: unknown): string[] => {
  const value = (criterion as { value?: unknown } | undefined)?.value;
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string" && v !== "")
    : [];
};

/**
 * The filters a view adds: the timeline's period as the `date` range, the
 * open folder's tag as `tags` at depth 0 (the folder's own items; its
 * sub-folders list theirs), each only in its view, so leaving the view drops
 * it. On a tag's page (`pageFilters` holding `tags`) the folder joins the
 * page's tag: the items carrying both (INCLUDES_ALL), still at depth 0; a
 * page that takes sub-tags offers no folder view.
 */
export const timelineAndFolderFilters = (
  { viewMode, timelinePeriod, folderPath }: ListView,
  pageFilters: Record<string, unknown> = {}
): Record<string, unknown> => {
  if (viewMode === "timeline") {
    const range = periodDateRange(timelinePeriod);
    return range ? { date: range } : {};
  }
  const folder = folderPath.at(-1);
  if (viewMode !== "folder" || !folder) return {};
  const pageTags = refValues(pageFilters.tags);
  if (pageTags.length === 0) {
    return { tags: { value: [folder], modifier: "INCLUDES", depth: 0 } };
  }
  return {
    tags: {
      value: [...new Set([...pageTags, folder])],
      modifier: "INCLUDES_ALL",
      depth: 0,
    },
  };
};
