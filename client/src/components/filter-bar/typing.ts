import type { EditorKind, PanelField } from "@peek/shared-types";

/** Typing waits this long after the last key before it applies (or counts) */
export const TYPING_DELAY = 300;

/** Editors whose changes are typed: they apply once typing pauses */
const TYPED: ReadonlySet<EditorKind> = new Set(["number", "date", "text"]);

/** Whether a row's changes are typed (a number, date or text row) */
export const isTyped = (field: PanelField): boolean => TYPED.has(field.editor);
