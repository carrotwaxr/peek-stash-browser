/**
 * A test-local panel row with no real equivalent: the scene Details with
 * Has none. The scene Path and Playlists rows (F18) and the clip Scenes row
 * (F21) are real; tests use them from the `@peek/shared-types` panel tables.
 */
import type * as Shared from "@peek/shared-types";

/** The scene Details with Has none, a text field whose spec takes IS_NULL */
export const DETAILS_WITH_PRESENCE_ROW: Shared.PanelField = {
  key: "details",
  field: "details",
  label: "Details Search",
  group: "common",
  editor: "text",
  placeholder: "Search details...",
  modifierKey: "detailsModifier",
  modifiers: ["INCLUDES", "IS_NULL"],
};
