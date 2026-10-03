import {
  type RefObject,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  type EditorKind,
  type ListKind,
  PANEL_FIELDS,
  type RowKey,
} from "@peek/shared-types";
import { useFlushableDebounce } from "../../hooks/useDebounce";
import type { ListFilters } from "../../hooks/useListFilters";
import {
  type PanelState,
  type PanelTree,
  filtersEqual,
  removeRow,
  rowState,
  sameRowState,
  setRow,
  treeOf,
} from "../../utils/filterFields";
import Button from "../ui/Button";
import FieldEditor from "../ui/FieldEditor";
import Popover from "../ui/Popover";

/** Why an editor closed: closed by the user, its row removed, or the list changed under it */
export type ChipEditorClose = "closed" | "removed" | "outside";

/** Typing waits this long after the last key before it applies */
const TYPING_DELAY = 300;

/** Editors whose changes are typed: they apply once typing pauses */
const TYPED: ReadonlySet<EditorKind> = new Set(["number", "date", "text"]);

/** A row's state as the list holds it; undefined when the list holds no such row */
type RowValue = PanelState | undefined;

/** What one commit wrote: the row it named and that row's state after it */
interface Committed {
  readonly at: RowKey;
  readonly value: RowValue;
}

/** The rows of the container `at` names that are rows of its key */
function rowsOf(tree: PanelTree, at: RowKey) {
  const rows =
    at.group === 0 ? tree.rows : (tree.groups[at.group - 1]?.rows ?? []);
  return rows.filter((row) => row.field.key === at.key);
}

/** The state of the row `at` names, as the tree holds it */
const rowAt = (tree: PanelTree, at: RowKey): RowValue =>
  rowsOf(tree, at)[at.occurrence - 1]?.state;

const sameValue = (kind: ListKind, a: RowValue, b: RowValue): boolean =>
  a === undefined || b === undefined ? a === b : sameRowState(kind, a, b);

interface ChipEditorProps {
  filters: ListFilters;
  /** The row it edits; a row past the field's last is one it adds */
  rowKey: RowKey;
  /** The chip it sits under, which takes focus back on close */
  anchorRef: RefObject<HTMLElement | null>;
  /** Set to this editor's close (a flush, then `onClose`), for the chip that toggles it */
  closeRef: RefObject<(() => void) | null>;
  /** Its row emptied: the editor now adds a new row of its field, here */
  onRowKeyChange: (at: RowKey) => void;
  onClose: (reason: ChipEditorClose) => void;
}

/**
 * A chip's editor, in a popover under the chip: the row's `FieldEditor`
 * over a local draft, committed live through the list's filters. A pick
 * (a ref, enum, choice or toggle row) applies at once; typing (a number,
 * date or text row) applies 300 ms after the last key, and closing applies
 * what still waits. The first commit of an open editor adds a history
 * entry and later ones replace it, so Back undoes the whole edit.
 *
 * The draft is never re-read from the URL: the editor's own commits come
 * back canonical (an imperial height typed as 5 ft 10 in stays as typed),
 * and a list change that is not one of them (Back) closes it. A commit
 * that empties the row removes it from the list (later rows of the field
 * move up a number), and the editor stays open as a new row of that field
 * after its last, so a later pick adds that row and never edits the row
 * that took the old number.
 */
const ChipEditor = ({
  filters,
  rowKey,
  anchorRef,
  closeRef,
  onRowKeyChange,
  onClose,
}: ChipEditorProps) => {
  const { kind } = filters;
  const controlId = `chip-editor${useId().replace(/:/g, "-")}field`;
  const field = PANEL_FIELDS[kind].find((row) => row.key === rowKey.key);
  const option = filters.options.find((each) => each.key === rowKey.key);
  const [draft, setDraft] = useState<PanelState>(() =>
    rowState(kind, filters.filters, rowKey)
  );

  // The list's filters at the last render: a typed change commits later
  const latest = useRef(filters);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    latest.current = filters;
    onCloseRef.current = onClose;
  });
  // The row edited now: it moves when its row empties
  const atRef = useRef(rowKey);
  const pushedRef = useRef(false);
  // The commits not yet seen in the list, the row as it opened first
  const committedRef = useRef<Committed[]>([
    { at: rowKey, value: rowAt(filters.tree, rowKey) },
  ]);

  const commit = useCallback(
    (next: PanelState) => {
      const current = latest.current;
      const at = atRef.current;
      const nextFilters = setRow(kind, current.filters, at, next);
      if (filtersEqual(kind, nextFilters, current.filters)) return;
      const nextTree = treeOf(kind, nextFilters);
      const history = pushedRef.current ? "replace" : "push";
      pushedRef.current = true;
      current.setRow(at, next, { history });
      const left = rowsOf(nextTree, at).length;
      if (left < rowsOf(current.tree, at).length) {
        // Emptied: the list drops the row. The editor adds a new one, after
        // the field's last, so it never edits the row that moved up.
        const adding = { ...at, occurrence: left + 1 };
        atRef.current = adding;
        committedRef.current.push({ at: adding, value: undefined });
        onRowKeyChange(adding);
      } else {
        committedRef.current.push({ at, value: rowAt(nextTree, at) });
      }
    },
    [kind, onRowKeyChange]
  );

  const typing = useFlushableDebounce(commit, TYPING_DELAY);

  const change = (next: PanelState) => {
    setDraft(next);
    if (field !== undefined && TYPED.has(field.editor)) typing.run(next);
    else commit(next);
  };

  // The list changed: one of this editor's commits arriving is expected
  // (canonical, so compared row by row), anything else (Back, another
  // control) closes it without applying what waits
  useEffect(() => {
    const committed = committedRef.current;
    for (let at = committed.length - 1; at >= 0; at -= 1) {
      const entry = committed[at];
      if (
        entry !== undefined &&
        sameValue(kind, rowAt(filters.tree, entry.at), entry.value)
      ) {
        committedRef.current = committed.slice(at);
        return;
      }
    }
    typing.cancel();
    onCloseRef.current("outside");
  }, [kind, filters.tree, typing]);

  const close = useCallback(() => {
    typing.flush();
    onCloseRef.current("closed");
  }, [typing]);

  useLayoutEffect(() => {
    closeRef.current = close;
    return () => {
      closeRef.current = null;
    };
  }, [closeRef, close]);

  const remove = () => {
    typing.cancel();
    const current = latest.current;
    const at = atRef.current;
    if (rowAt(current.tree, at) !== undefined) {
      current.commit(removeRow(kind, current.filters, at), {
        history: pushedRef.current ? "replace" : "push",
      });
    }
    onCloseRef.current("removed");
  };

  // Focus on the field's first control. This runs after the popover's own
  // focus move (a parent's effects run after its children's); a picker's
  // list opens a render later and takes it into its search box.
  useEffect(() => {
    document.getElementById(controlId)?.focus();
  }, [controlId]);

  if (field === undefined || option === undefined) return null;
  const label = option.label ?? option.key;

  return (
    <Popover
      anchorRef={anchorRef}
      open
      onClose={close}
      label={`${label} filter`}
      className="w-80 max-w-[calc(100vw-2rem)] p-3"
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3
          className="text-sm font-semibold"
          style={{ color: "var(--text-primary)" }}
        >
          {label}
        </h3>
        <Button
          variant="tertiary"
          size="sm"
          onClick={remove}
          aria-label={`Remove ${label} filter`}
        >
          Remove
        </Button>
      </div>
      <FieldEditor
        option={option}
        state={draft}
        onChange={change}
        controlId={controlId}
        hideLabel
        openPicker={field.editor === "ref"}
      />
    </Popover>
  );
};

export default ChipEditor;
