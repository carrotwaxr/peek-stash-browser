import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { useFocusTrap } from "../../hooks/useFocusTrap";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** Rendered as the dialog's labelled heading */
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** max-w-md / 2xl / 4xl / 5xl; default "md" */
  size?: "sm" | "md" | "lg" | "xl";
  /** Default true: Escape, the backdrop and the close button close it */
  dismissible?: boolean;
  /** Focused on open instead of the first focusable element */
  initialFocusRef?: RefObject<HTMLElement | null>;
  "aria-describedby"?: string;
}

const SIZE_CLASSES = {
  sm: "max-w-md",
  md: "max-w-2xl",
  lg: "max-w-4xl",
  xl: "max-w-5xl",
} as const;

/**
 * The app's dialog: portalled to `document.body` (out of any transformed or
 * clipped ancestor), `role="dialog"` with `aria-modal` and a labelled title,
 * focus trapped inside and returned to the opener on close, and a modal
 * overlay scope on the shortcut stack, so no page or global key runs while it
 * is open. Escape, a backdrop click and the close button call `onClose`
 * unless `dismissible` is false.
 */
const Modal = ({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
  dismissible = true,
  initialFocusRef,
  "aria-describedby": ariaDescribedBy,
}: ModalProps) => {
  const dialogRef = useFocusTrap(isOpen, dismissible ? onClose : null);
  const titleId = useId();
  // Whether the current press began on the backdrop itself: a text selection
  // dragged out of a field ends with a click on the backdrop, which must not
  // close the dialog
  const pressStartedOnBackdrop = useRef(false);

  // Runs after useFocusTrap's effect, which focused the first focusable
  useEffect(() => {
    if (isOpen) initialFocusRef?.current?.focus();
  }, [isOpen, initialFocusRef]);

  if (!isOpen) return null;

  // React bubbles a portal's events to its React ancestors (a card's click
  // and mousedown handlers), so the backdrop stops them
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(e) => {
        e.stopPropagation();
        pressStartedOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        e.stopPropagation();
        const startedOnBackdrop = pressStartedOnBackdrop.current;
        pressStartedOnBackdrop.current = false;
        if (dismissible && startedOnBackdrop && e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef as React.Ref<HTMLDivElement>}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={ariaDescribedBy}
        className={`flex max-h-[90vh] w-full flex-col overflow-y-auto rounded-lg border shadow-lg ${SIZE_CLASSES[size]}`}
        style={{
          backgroundColor: "var(--bg-card)",
          borderColor: "var(--border-color)",
        }}
      >
        <div
          className="flex items-center justify-between gap-4 border-b px-6 py-4"
          style={{ borderColor: "var(--border-color)" }}
        >
          <h3
            id={titleId}
            className="text-lg font-semibold"
            style={{ color: "var(--text-primary)" }}
          >
            {title}
          </h3>
          {dismissible && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1 transition-opacity hover:opacity-70 focus:outline-none focus-visible:ring-2"
              style={{ color: "var(--text-secondary)" }}
            >
              <X size={20} aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="px-6 py-4" style={{ color: "var(--text-secondary)" }}>
          {children}
        </div>

        {footer && (
          <div
            className="flex justify-end gap-3 border-t px-6 py-4"
            style={{ borderColor: "var(--border-color)" }}
          >
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default Modal;
