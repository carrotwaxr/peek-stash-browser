/**
 * The views each list page renders: one table for the pages' view toggles,
 * the list state's view validation and the card display settings' "Default
 * view" dropdown, so a setting never offers a view its page lacks.
 */
import type { ListEntity } from "../../utils/urlParams";

export type ViewModeId =
  | "grid"
  | "wall"
  | "table"
  | "timeline"
  | "folder"
  | "hierarchy";

export const VIEW_MODE_LABELS: Record<ViewModeId, string> = {
  grid: "Grid",
  wall: "Wall",
  table: "Table",
  timeline: "Timeline",
  folder: "Folder",
  hierarchy: "Hierarchy",
};

export const LIST_VIEW_MODES = {
  scene: ["grid", "wall", "table", "timeline", "folder"],
  gallery: ["grid", "wall", "table", "timeline", "folder"],
  image: ["grid", "wall", "table", "timeline", "folder"],
  performer: ["grid", "table"],
  studio: ["grid", "table"],
  group: ["grid", "table"],
  tag: ["grid", "table", "hierarchy"],
  clip: ["grid", "wall", "table"],
} as const satisfies Record<ListEntity, readonly ViewModeId[]>;

/** A list page's view toggle options: "Grid view", "Table view", ... */
export const viewModeOptions = (entity: ListEntity) =>
  LIST_VIEW_MODES[entity].map((id) => ({
    id,
    label: `${VIEW_MODE_LABELS[id]} view`,
  }));

/** The card display settings' options: "Grid", "Table", ... */
export const viewModeSettingOptions = (entity: ListEntity) =>
  LIST_VIEW_MODES[entity].map((id) => ({ id, label: VIEW_MODE_LABELS[id] }));
