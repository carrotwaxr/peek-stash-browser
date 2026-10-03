import { useMemo } from "react";
import {
  type ListKind,
  PANEL_FIELDS,
  type PinnedFilter,
} from "@peek/shared-types";
import { LucidePinOff } from "lucide-react";
import { useRefNames } from "../../api/hooks";
import { useUnitPreference } from "../../contexts/UnitPreferenceContext";
import { normalizePanelState, rowChip } from "../../utils/filterFields";
import { NAMES_SHOWN, chipText } from "./chipText";

interface PinnedFilterToggleProps {
  kind: ListKind;
  pin: PinnedFilter;
  /** Its key's first root row holds its value */
  on: boolean;
  /** For resolving the names of its ids (`tags`) */
  entityType: string | undefined;
  onToggle: () => void;
  onUnpin: () => void;
}

/**
 * A pinned filter in the chip bar: one button that turns the filter on and
 * off (`aria-pressed`), named by the pin's label or, without one, by its
 * chip text ("Tags: any of Blonde"), and a small button that unpins it.
 */
const PinnedFilterToggle = ({
  kind,
  pin,
  on,
  entityType,
  onToggle,
  onUnpin,
}: PinnedFilterToggleProps) => {
  const { unitPreference } = useUnitPreference();
  const field = PANEL_FIELDS[kind].find((row) => row.key === pin.key);
  const parts = useMemo(
    () =>
      pin.label !== undefined || field === undefined
        ? null
        : rowChip(
            kind,
            { field, state: normalizePanelState(kind, pin.state) },
            unitPreference
          ),
    [kind, pin, field, unitPreference]
  );
  const { data } = useRefNames(
    entityType,
    parts?.ids?.slice(0, NAMES_SHOWN) ?? []
  );
  const { data: excludedNames } = useRefNames(
    entityType,
    parts?.excludedIds?.slice(0, NAMES_SHOWN) ?? []
  );
  const text =
    pin.label ??
    (parts === null
      ? (field?.label ?? pin.key)
      : chipText(parts, data, excludedNames));

  return (
    <div
      data-pinned-filter={pin.id}
      className="inline-flex items-center rounded-full text-sm border transition-colors"
      style={{
        backgroundColor: on ? "var(--accent-primary)" : "var(--bg-secondary)",
        borderColor: "var(--accent-primary)",
        color: on ? "white" : "var(--text-primary)",
      }}
    >
      <button
        type="button"
        aria-pressed={on}
        onClick={onToggle}
        className="pl-3 pr-2 py-1.5 rounded-full cursor-pointer hover:opacity-80"
      >
        {text}
      </button>
      <button
        type="button"
        onClick={onUnpin}
        aria-label={`Unpin ${text}`}
        title={`Unpin ${text}`}
        className="mr-2 p-0.5 rounded-full cursor-pointer hover:opacity-70"
      >
        <LucidePinOff className="w-3.5 h-3.5" aria-hidden="true" />
      </button>
    </div>
  );
};

export default PinnedFilterToggle;
