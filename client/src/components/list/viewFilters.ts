import type { UntaggedKind } from "@peek/shared-types";
import type { ListView } from "../../hooks/useListUrlState";
import { UNTAGGED_FOLDER_ID } from "../../utils/buildFolderTree";
import { periodDateRange } from "../timeline/useTimelineState";

/**
 * The Untagged folder's filter, the items in no tag's folder: a scene with
 * no tag, its own or inherited (folders match inherited tags; `tag_count`
 * counts its own only, and a `tag_count` key with no value locks the panel's
 * Tag Count), a gallery or an image with no tag rows (an image's include its
 * galleries' tags)
 */
const UNTAGGED_FILTER: Record<UntaggedKind, Record<string, unknown>> = {
  scene: { tagged: false, tag_count: undefined },
  gallery: { tag_count: { value: 0, modifier: "EQUALS" } },
  image: { tag_count: { value: 0, modifier: "EQUALS" } },
};

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
 * page that takes sub-tags offers no folder view. The Untagged folder
 * (`untagged`, the page's type) lists the items in no tag's folder, beside a
 * tag page's own tag, and locks the panel's Tags as a tag folder does.
 */
export const timelineAndFolderFilters = (
  { viewMode, timelinePeriod, folderPath }: ListView,
  pageFilters: Record<string, unknown> = {},
  untagged: UntaggedKind = "scene"
): Record<string, unknown> => {
  if (viewMode === "timeline") {
    const range = periodDateRange(timelinePeriod);
    return range ? { date: range } : {};
  }
  const folder = folderPath.at(-1);
  if (viewMode !== "folder" || !folder) return {};
  const pageTags = refValues(pageFilters.tags);
  if (folder === UNTAGGED_FOLDER_ID) {
    const filter = UNTAGGED_FILTER[untagged];
    // A view field's key locks it: `tags` with no value hides the panel's
    // Tags (a tag page's own `tags` is locked by the page and stays)
    return pageTags.length === 0 ? { ...filter, tags: undefined } : filter;
  }
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
