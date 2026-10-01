import { type ReactNode } from "react";
import Button from "./Button";
import Modal from "./Modal";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: ReactNode;
  confirmText?: string;
  cancelText?: string;
  confirmStyle?: "danger" | "primary";
  variant?: string;
}

/**
 * Reusable confirmation dialog on `Modal`
 * HTML-based modal, no browser native dialogs
 */
const ConfirmDialog = ({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm Action",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  confirmStyle = "danger",
}: Props) => {
  const handleConfirm = (e: React.MouseEvent<HTMLButtonElement>) => {
    e?.preventDefault();
    e?.stopPropagation();
    onConfirm();
    // Don't call onClose here - let the caller handle closing after async operations
  };

  const confirmVariant = confirmStyle === "danger" ? "destructive" : "primary";

  // Modal portals the dialog out of a card's scaled, clipped box, and its
  // backdrop stops the click and mousedown React would bubble to the card
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title={title}
      footer={
        <>
          <Button onClick={onClose} variant="secondary">
            {cancelText}
          </Button>
          <Button onClick={handleConfirm} variant={confirmVariant}>
            {confirmText}
          </Button>
        </>
      }
    >
      {typeof message === "string" ? <p>{message}</p> : message}
    </Modal>
  );
};

export default ConfirmDialog;
