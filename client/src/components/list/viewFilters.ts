import type { ListView } from "../../hooks/useListUrlState";
import { periodDateRange } from "../timeline/useTimelineState";

/**
 * The filters a view adds: the timeline's period as the `date` range, the
 * open folder's tag as `tags` (at `folderDepth`: -1 with its sub-tags, 0 the
 * tag itself), each only in its view, so leaving the view drops it
 */
const viewFiltersWithFolderDepth =
  (folderDepth: number) =>
  ({
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
      return {
        tags: { value: [folder], modifier: "INCLUDES", depth: folderDepth },
      };
    }
    return {};
  };

/** Galleries and images: a folder lists its tag's items with its sub-tags' */
export const timelineAndFolderFilters = viewFiltersWithFolderDepth(-1);

/** Scenes: a folder lists the scenes tagged with the folder's tag itself */
export const sceneTimelineAndFolderFilters = viewFiltersWithFolderDepth(0);
