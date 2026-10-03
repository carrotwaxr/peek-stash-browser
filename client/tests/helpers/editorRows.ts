/**
 * Test-local panel rows for the editors F22b adds, until F21 adds the real
 * ones: the clip Scenes picker (the scene `/minimal` endpoint) and a text
 * row with Has none. The scene Path and Playlists rows are real (F18).
 * `withEditorRows` is for a test file's `vi.mock("@peek/shared-types", ...)`:
 * every reader of the panel table in that file (options, codecs, chips, the
 * URL) then sees them.
 */
import type * as Shared from "@peek/shared-types";
import { untrusted } from "./untrusted";

type SharedModule = typeof Shared;

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

/** The clip Scenes: scene refs from the scene `/minimal` endpoint */
export const CLIP_SCENES_ROW: Shared.PanelField = {
  key: "sceneIds",
  field: "scenes",
  label: "Scenes",
  group: "common",
  editor: "ref",
  multi: true,
  modifiers: ["INCLUDES", "INCLUDES_ALL", "EXCLUDES"],
  defaultModifier: "INCLUDES",
  modifierKey: "sceneIdsModifier",
  modifierLabels: "has",
};

/** `actual` with the test rows: Scenes on clips */
export function withEditorRows(actual: SharedModule): SharedModule {
  const extra: Partial<Record<Shared.ListKind, readonly Shared.PanelField[]>> =
    {
      clip: [CLIP_SCENES_ROW],
    };
  const panel = Object.fromEntries(
    Object.entries(actual.PANEL_FIELDS).map(([kind, fields]) => [
      kind,
      [
        ...(fields as readonly Shared.PanelField[]),
        ...(extra[kind as Shared.ListKind] ?? []),
      ],
    ])
  );
  // The added rows are no longer the table's literal types
  return {
    ...actual,
    PANEL_FIELDS: untrusted<SharedModule["PANEL_FIELDS"]>(panel),
  };
}
