/**
 * Test-local panel rows for the editors F22b adds, as F18 to F21 add the
 * real ones: the scene Path (a text condition offering Starts with), the
 * scene Playlists picker (Peek playlist ids, own and shared) and the clip
 * Scenes picker (the scene `/minimal` endpoint). `withEditorRows` is for a
 * test file's `vi.mock("@peek/shared-types", ...)`: every reader of the
 * panel table in that file (options, codecs, chips, the URL) then sees them.
 */
import type * as Shared from "@peek/shared-types";
import { untrusted } from "./untrusted";

type SharedModule = typeof Shared;

/** The scene Path: a text box with a condition select offering Starts with */
export const PATH_ROW: Shared.PanelField = {
  key: "path",
  field: "path",
  label: "Path",
  group: "other",
  editor: "text",
  placeholder: "Search path...",
  modifierKey: "pathModifier",
  modifiers: ["INCLUDES", "EXCLUDES", "EQUALS", "NOT_EQUALS", "STARTS_WITH"],
};

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

/** The scene Playlists: Peek playlist ids, from the viewer's playlist lists */
export const PLAYLISTS_ROW: Shared.PanelField = {
  key: "playlistIds",
  field: "playlists",
  label: "Playlists",
  group: "other",
  editor: "ref",
  source: "playlists",
  multi: true,
  modifiers: ["INCLUDES", "INCLUDES_ALL", "EXCLUDES"],
  defaultModifier: "INCLUDES",
  modifierKey: "playlistIdsModifier",
  modifierLabels: "has",
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

/** `actual` with the test rows: Path and Playlists on scenes, Scenes on clips */
export function withEditorRows(actual: SharedModule): SharedModule {
  const extra: Partial<Record<Shared.ListKind, readonly Shared.PanelField[]>> =
    {
      scene: [PATH_ROW, PLAYLISTS_ROW],
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
