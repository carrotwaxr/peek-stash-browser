import { useId, useRef, useState } from "react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import StatusMessage from "../ui/StatusMessage";

interface Props {
  isOpen: boolean;
  /** "Save view" or "Rename view": the dialog's name */
  title: string;
  /** The name the field starts with */
  initialName?: string;
  /**
   * The context label: shows "Set as default for <label>" (Save as new).
   * Left out, no default is offered (Rename).
   */
  defaultLabel?: string;
  /** The write is in flight: the dialog cannot be dismissed */
  saving: boolean;
  /** Why the last Save was refused, shown in the dialog */
  error: string | null;
  onCancel: () => void;
  onSave: (name: string, setAsDefault: boolean) => void;
}

/**
 * Asks a View's name: Save as new (with Set as default for the page) and
 * Rename. The name is trimmed; an empty one cannot be saved. A refusal (a
 * name another View has, Views changed elsewhere) shows here and the dialog
 * stays open. Mount it only while open, so each opening starts afresh.
 */
const ViewNameDialog = ({
  isOpen,
  title,
  initialName = "",
  defaultLabel,
  saving,
  error,
  onCancel,
  onSave,
}: Props) => {
  const [name, setName] = useState(initialName);
  const [setAsDefault, setSetAsDefault] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const trimmed = name.trim();

  const save = () => {
    if (trimmed === "" || saving) return;
    onSave(trimmed, setAsDefault);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      size="sm"
      title={title}
      initialFocusRef={inputRef}
      dismissible={!saving}
    >
      <label
        htmlFor={inputId}
        className="block text-sm mb-1"
        style={{ color: "var(--text-secondary)" }}
      >
        Name
      </label>
      <input
        id={inputId}
        ref={inputRef}
        type="text"
        value={name}
        maxLength={100}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            save();
          }
        }}
        className="w-full px-3 py-2 border rounded-md text-sm mb-4"
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
      />

      {defaultLabel !== undefined && (
        <label
          className="flex items-center gap-2 mb-4 cursor-pointer"
          style={{ color: "var(--text-secondary)" }}
        >
          <input
            type="checkbox"
            checked={setAsDefault}
            onChange={(e) => setSetAsDefault(e.target.checked)}
            className="w-4 h-4 rounded border cursor-pointer"
            style={{ accentColor: "var(--accent-primary)" }}
          />
          <span className="text-sm">Set as default for {defaultLabel}</span>
        </label>
      )}

      {error && (
        <div className="mb-4">
          <StatusMessage variant="error" message={error} />
        </div>
      )}

      <div className="flex justify-end gap-3">
        <Button
          onClick={onCancel}
          variant="secondary"
          size="sm"
          disabled={saving}
        >
          Cancel
        </Button>
        <Button
          onClick={save}
          variant="primary"
          size="sm"
          disabled={saving || trimmed === ""}
          loading={saving}
        >
          Save
        </Button>
      </div>
    </Modal>
  );
};

export default ViewNameDialog;
