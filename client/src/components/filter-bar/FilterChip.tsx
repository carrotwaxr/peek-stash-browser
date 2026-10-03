import type { ReactNode, RefObject } from "react";
import { LucideX } from "lucide-react";
import { useRefNames } from "../../api/hooks";
import type { ChipParts } from "../../utils/filterFields";
import Button from "../ui/Button";
import { NAMES_SHOWN, chipText } from "./chipText";

interface FilterChipProps {
  /** Its row's key (`2.tagIds`), which the bar finds it by */
  rowKey: string;
  /**
   * The row's chip, or null for the row an open editor is adding (its row
   * emptied while open): the chip then reads only the field's name
   */
  parts: ChipParts | null;
  /** The field's name, on a chip whose row the list does not hold yet */
  label: string;
  /** The panel option's entity (`tags`), for resolving names */
  entityType: string | undefined;
  /** Its editor is open */
  open: boolean;
  /** The open chip's body, which the editor's popover sits under */
  anchorRef?: RefObject<HTMLButtonElement | null> | undefined;
  onToggle: () => void;
  onRemove: () => void;
  /** The open editor, drawn in the chip's own wrapper so it sits under the chip */
  children?: ReactNode;
}

/**
 * One filter chip: its body opens the row's editor, its button removes the
 * row. The wrapper is positioned, so the editor's popover drawn inside it
 * sits under the chip.
 */
const FilterChip = ({
  rowKey,
  parts,
  label,
  entityType,
  open,
  anchorRef,
  onToggle,
  onRemove,
  children,
}: FilterChipProps) => {
  const lookedUp = parts?.ids?.slice(0, NAMES_SHOWN) ?? [];
  const excluded = parts?.excludedIds?.slice(0, NAMES_SHOWN) ?? [];
  const { data } = useRefNames(entityType, lookedUp);
  const { data: excludedNames } = useRefNames(entityType, excluded);
  const text = parts === null ? label : chipText(parts, data, excludedNames);

  return (
    <div data-chip="" data-chip-row={rowKey} className="relative">
      <div
        className={`inline-flex items-center gap-2 pl-3 py-1.5 rounded-full text-sm border transition-colors ${
          parts === null ? "pr-3 border-dashed" : "pr-2"
        }`}
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--accent-primary)",
          color:
            parts === null ? "var(--text-secondary)" : "var(--text-primary)",
        }}
      >
        <button
          ref={anchorRef}
          type="button"
          data-chip-edit=""
          onClick={onToggle}
          aria-label={`Edit filter: ${text}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          className="text-left cursor-pointer hover:opacity-80 rounded-full"
        >
          {text}
        </button>
        {parts !== null && (
          <Button
            onClick={onRemove}
            data-chip-remove=""
            variant="tertiary"
            className="hover:opacity-70 !p-0 !border-0"
            aria-label={`Remove filter: ${text}`}
            title={`Remove filter: ${text}`}
            icon={<LucideX className="w-3.5 h-3.5" />}
          />
        )}
      </div>
      {children}
    </div>
  );
};

export default FilterChip;
