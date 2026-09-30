import type { ListView } from "../../hooks/useListUrlState";
import { periodDateRange } from "../timeline/useTimelineState";

/**
 * The filters a view adds: the timeline's period as the `date` range, the
 * open folder's tag (with its sub-tags) as `tags`, each only in its view, so
 * leaving the view drops it
 */
export const timelineAndFolderFilters = ({
  viewMode,
  timelinePeriod,
  folderPath,
}: ListView): Record<string, unknown> => {
  if (viewMode === "timeline") {
    const range = periodDateRange(timelinePeriod);
    return range ? { date: range } : {};
  }
  const folder = folderPath.at(-1);
  if (viewMode === "folder" && folder) {
    return { tags: { value: [folder], modifier: "INCLUDES", depth: -1 } };
  }
  return {};
};
