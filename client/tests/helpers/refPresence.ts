/**
 * The shared module with some ref rows offering "Has none" and "Has any"
 * (IS_NULL and NOT_NULL), as F18 to F21 opt real rows in. For a test file's
 * `vi.mock("@peek/shared-types", ...)`: every reader of the panel table in
 * that file (options, codecs, chips, the URL) then sees the widened rows.
 */
import type * as Shared from "@peek/shared-types";
import { untrusted } from "./untrusted";

type SharedModule = typeof Shared;

/** `actual` with the named ref rows (`[list, key]`) offering presence */
export function withRefPresence(
  actual: SharedModule,
  rows: readonly (readonly [Shared.ListKind, string])[]
): SharedModule {
  const widened = (kind: string, row: Shared.PanelField): Shared.PanelField =>
    row.editor === "ref" &&
    rows.some(([list, key]) => list === kind && key === row.key)
      ? { ...row, modifiers: [...row.modifiers, "IS_NULL", "NOT_NULL"] }
      : row;
  const panel = Object.fromEntries(
    Object.entries(actual.PANEL_FIELDS).map(([kind, fields]) => [
      kind,
      (fields as readonly Shared.PanelField[]).map((row) => widened(kind, row)),
    ])
  );
  // The widened rows are no longer the table's literal types
  return {
    ...actual,
    PANEL_FIELDS: untrusted<SharedModule["PANEL_FIELDS"]>(panel),
  };
}
