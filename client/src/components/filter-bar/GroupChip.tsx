import { LucideX } from "lucide-react";
import Button from "../ui/Button";

interface GroupChipProps {
  /** Its key (`g2`), which the bar finds it by */
  rowKey: string;
  /** `groupText`'s words, or "Match any" */
  text: string;
  onEdit: () => void;
  /** Absent on the root's "Match any" chip: its match is set in the Advanced view */
  onRemove?: () => void;
}

/**
 * One chip for a whole group of filters (or the root's "Match any"): its
 * body opens the Advanced view at the group, its button removes the group.
 */
const GroupChip = ({ rowKey, text, onEdit, onRemove }: GroupChipProps) => (
  <div data-chip="" data-chip-row={rowKey} className="relative">
    <div
      className={`inline-flex items-center gap-2 pl-3 py-1.5 rounded-full text-sm border ${
        onRemove === undefined ? "pr-3" : "pr-2"
      }`}
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--accent-primary)",
        color: "var(--text-primary)",
      }}
    >
      <button
        type="button"
        data-chip-edit=""
        onClick={onEdit}
        aria-label={`Edit filter group: ${text}`}
        aria-haspopup="dialog"
        className="text-left cursor-pointer hover:opacity-80 rounded-full"
      >
        {text}
      </button>
      {onRemove !== undefined && (
        <Button
          onClick={onRemove}
          data-chip-remove=""
          variant="tertiary"
          className="hover:opacity-70 !p-0 !border-0"
          aria-label={`Remove filter group: ${text}`}
          title={`Remove filter group: ${text}`}
          icon={<LucideX className="w-3.5 h-3.5" />}
        />
      )}
    </div>
  </div>
);

export default GroupChip;
