import { useEffect, useId, useState } from "react";
import type { ListKind } from "@peek/shared-types";
import { useConfirmDialog } from "../../hooks/useConfirmDialog";
import { useMediaQuery } from "../../hooks/useMediaQuery";
import { useTVMode } from "../../hooks/useTVMode";
import {
  type FilterChip,
  type PanelState,
  countGroups,
  countRows,
  editTreeOf,
  filtersEqual,
  normalizeEditTree,
  overLimit,
  panelTreeOf,
  stateOf,
  treeOf,
} from "../../utils/filterFields";
import { Button, Modal, StatusMessage } from "../ui/index";
import FilterRowsEditor from "./FilterRowsEditor";
import { matchSelectId } from "./controlIds";

export interface AdvancedFilterViewProps {
  isOpen: boolean;
  onClose: () => void;
  kind: ListKind;
  /** The list's applied state (Contract 3) */
  value: PanelState;
  /**
   * The state to open over when the list does not draw it yet (a chip
   * editor's edit flushed as the view opened); `value` otherwise
   */
  openedOver?: PanelState;
  /** Called once on Apply with the normalized state */
  onApply: (next: PanelState) => void;
  /** The page's permanent chips, shown read-only */
  permanentChips: readonly FilterChip[];
  /** A group number, 1 to 5: focus lands on that group's Match select */
  focusGroup?: number;
}

/** Below `md`, or on a TV, the view takes the whole screen */
const SHEET_QUERY = "(max-width: 767px)";

/** A permanent chip as text: "Performer: Jane" */
const chipText = ({ parts }: FilterChip): string => {
  const shown = [
    parts.condition,
    (parts.values ?? []).join(", ") ||
      (parts.ids === undefined || parts.ids.length === 0
        ? undefined
        : `${parts.ids.length} selected`),
    parts.suffix,
  ].filter((part) => part !== undefined && part !== "");
  return shown.length === 0
    ? parts.label
    : `${parts.label}: ${shown.join(" ")}`;
};

/** The open view: its draft lives as long as it is open */
const OpenView = ({
  onClose,
  kind,
  value,
  openedOver: opening,
  onApply,
  permanentChips,
  focusGroup,
}: Omit<AdvancedFilterViewProps, "isOpen">) => {
  // The draft is seeded once, when the view opens; the list's state is not
  // copied into it again (Back while open leaves it as it is)
  const [openedOver] = useState(opening ?? value);
  const [draft, setDraft] = useState(() =>
    editTreeOf(kind, treeOf(kind, openedOver))
  );
  const { confirm, dialog } = useConfirmDialog();
  const { isTVMode } = useTVMode();
  const isSheet = useMediaQuery(SHEET_QUERY) || isTVMode;
  const reasonId = useId();

  // The user's own edits: the list changing underneath (Back) is not one
  const dirty = !filtersEqual(
    kind,
    stateOf(kind, panelTreeOf(draft).tree),
    openedOver
  );
  const listChanged = !filtersEqual(kind, openedOver, value);
  const refused = overLimit(countRows(draft, kind), countGroups(draft));

  // Opened at a group (a group chip): its Match select. This runs after the
  // dialog's own focus on open, so the dialog still returns focus to the
  // opener when it closes
  const [focusGroupId] = useState(() =>
    focusGroup === undefined ? undefined : draft.groups[focusGroup - 1]?.id
  );
  useEffect(() => {
    if (focusGroupId === undefined) return;
    const target = document.getElementById(matchSelectId(focusGroupId));
    target?.scrollIntoView({ block: "nearest" });
    target?.focus();
  }, [focusGroupId]);

  // Escape, the backdrop, the close button and Cancel all come here
  const requestClose = async () => {
    if (!dirty) {
      onClose();
      return;
    }
    const discard = await confirm({
      title: "Discard changes?",
      message: "Your rule changes are not applied.",
      confirmText: "Discard",
      cancelText: "Keep editing",
      confirmStyle: "danger",
    });
    if (discard) onClose();
  };

  const apply = () => {
    if (refused !== null) return;
    onApply(stateOf(kind, panelTreeOf(normalizeEditTree(draft, kind)).tree));
    onClose();
  };

  return (
    <>
      <Modal
        isOpen
        onClose={() => void requestClose()}
        title="Advanced filters"
        size={isSheet ? "full" : "xl"}
        footer={
          <div className="flex w-full flex-wrap items-center justify-end gap-3">
            {refused !== null && (
              <div id={reasonId} className="mr-auto">
                <StatusMessage variant="info" title={null} message={refused} />
              </div>
            )}
            <Button variant="secondary" onClick={() => void requestClose()}>
              Cancel
            </Button>
            <Button
              variant="primary"
              aria-disabled={refused === null ? undefined : "true"}
              aria-describedby={refused === null ? undefined : reasonId}
              className={
                refused === null ? "" : "opacity-50 cursor-not-allowed"
              }
              onClick={apply}
            >
              Apply
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          {listChanged && (
            <StatusMessage
              variant="warning"
              title={null}
              message="The list's filters changed since you opened this. Apply replaces them."
            />
          )}
          {permanentChips.length > 0 && (
            <p className="text-sm" style={{ color: "var(--text-muted)" }}>
              {`Fixed by this page: ${permanentChips.map(chipText).join("; ")}`}
            </p>
          )}
          <FilterRowsEditor
            kind={kind}
            tree={draft}
            onChange={setDraft}
            allowGroups
          />
        </div>
      </Modal>
      {dialog}
    </>
  );
};

/**
 * The Advanced view: the list's filters as rows and groups (the row
 * editor), edited as a draft that sends nothing until Apply. Apply hands
 * the normalized state to `onApply` once and closes; closing with changes
 * of the user's own (not the list changing underneath) asks before
 * discarding them. A dialog on a desktop, the whole screen on a
 * phone or a TV, with Apply and Cancel always in view.
 */
const AdvancedFilterView = ({ isOpen, ...props }: AdvancedFilterViewProps) =>
  isOpen ? <OpenView {...props} /> : null;

export default AdvancedFilterView;
