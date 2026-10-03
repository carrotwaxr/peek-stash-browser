import { useId } from "react";
import { PIN_LIMIT, type PanelField } from "@peek/shared-types";
import {
  LucideBookmarkMinus,
  LucideBookmarkPlus,
  LucidePin,
  LucidePinOff,
} from "lucide-react";
import { type PanelState, isRowActive } from "../../utils/filterFields";
import Button from "../ui/Button";

/** What an editor's header offers for pinning, from the list's pins */
export interface ChipPinning {
  /** The field is pinned to the bar */
  readonly fieldPinned: boolean;
  /** The list holds as many pins as it keeps: nothing more pins */
  readonly capped: boolean;
  /** Whether a row's value is a pinned filter */
  isFilterPinned(state: PanelState): boolean;
  toggleField(): void;
  /** Pins the row's value as a one-tap filter, or unpins it */
  toggleFilter(state: PanelState): void;
}

interface ChipEditorHeaderProps {
  /** The field's name, the header's heading */
  label: string;
  /** The row's panel field: a value it does not filter by has nothing to pin */
  field: PanelField;
  /** The row's state as its editor shows it */
  state: PanelState;
  /** Pin and unpin; none drawn without it */
  pinning?: ChipPinning | undefined;
  /** Runs before the value is pinned (a chip's editor applies its typing) */
  beforePin?: (() => void) | undefined;
  onRemove: () => void;
  /** The heading's level: h3 in a popover, h4 under the sheet's title */
  level?: 3 | 4;
}

/**
 * A row editor's header: the field's name, then "Pin <field>" (pins the
 * field to the bar) and "Pin as quick filter" (pins the row's value as a
 * one-tap filter), or their Unpin forms, then Remove. At the cap the pin
 * actions are disabled and say so ("Up to 10 pins"). The chip's popover
 * (`ChipEditor`) and each row of the sheet (`FilterSheet`) draw it: this is
 * where keyboard, phone and TV users pin (the "+ Filter" pin icon is
 * mouse-only). A pin saves at once; it is not part of a draft.
 */
const ChipEditorHeader = ({
  label,
  field,
  state,
  pinning,
  beforePin,
  onRemove,
  level = 3,
}: ChipEditorHeaderProps) => {
  const capId = `pin-cap${useId().replace(/:/g, "-")}`;
  const filterPinned = pinning?.isFilterPinned(state) ?? false;
  const fieldCapped =
    pinning !== undefined && pinning.capped && !pinning.fieldPinned;
  const filterCapped = pinning !== undefined && pinning.capped && !filterPinned;
  const capText = `Up to ${PIN_LIMIT} pins`;
  const Heading = level === 4 ? "h4" : "h3";

  const pinFilter = () => {
    beforePin?.();
    pinning?.toggleFilter(state);
  };

  return (
    <div className="flex items-center gap-1 mb-2">
      <Heading
        className="text-sm font-semibold mr-auto"
        style={{ color: "var(--text-primary)" }}
      >
        {label}
      </Heading>
      {pinning !== undefined && (
        <>
          <Button
            variant="tertiary"
            size="sm"
            onClick={() => pinning.toggleField()}
            disabled={fieldCapped}
            aria-label={`${pinning.fieldPinned ? "Unpin" : "Pin"} ${label}`}
            aria-describedby={fieldCapped ? capId : undefined}
            title={
              fieldCapped
                ? capText
                : pinning.fieldPinned
                  ? "Unpin this field from the bar"
                  : "Pin this field to the bar"
            }
            icon={
              pinning.fieldPinned ? (
                <LucidePinOff className="w-4 h-4" aria-hidden="true" />
              ) : (
                <LucidePin className="w-4 h-4" aria-hidden="true" />
              )
            }
          />
          <Button
            variant="tertiary"
            size="sm"
            onClick={pinFilter}
            disabled={
              filterCapped || (!filterPinned && !isRowActive(field, state))
            }
            aria-label={
              filterPinned ? "Unpin quick filter" : "Pin as quick filter"
            }
            aria-describedby={filterCapped ? capId : undefined}
            title={
              filterCapped
                ? capText
                : filterPinned
                  ? "Unpin this value's one-tap filter"
                  : "Pin this value as a one-tap filter"
            }
            icon={
              filterPinned ? (
                <LucideBookmarkMinus className="w-4 h-4" aria-hidden="true" />
              ) : (
                <LucideBookmarkPlus className="w-4 h-4" aria-hidden="true" />
              )
            }
          />
          {pinning.capped && (
            <span id={capId} className="sr-only">
              {capText}
            </span>
          )}
        </>
      )}
      <Button
        variant="tertiary"
        size="sm"
        onClick={onRemove}
        aria-label={`Remove ${label} filter`}
      >
        Remove
      </Button>
    </div>
  );
};

export default ChipEditorHeader;
