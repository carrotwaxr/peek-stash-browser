import {
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

interface PopoverProps {
  /** The control that opens it: the popover sits under it and focus returns to it */
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  /** The dialog's accessible name */
  label: string;
  children: ReactNode;
  /** Which edge of the anchor it lines up with. Default `bottom-start`. */
  placement?: "bottom-start" | "bottom-end";
  className?: string;
}

const GAP = 4;

const FOCUSABLE =
  'button:not([disabled]), a[href], input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * A small panel under the control that opens it (a menu, a settings list).
 * Not modal: it adds no overlay scope, so page keys keep running, and the
 * page behind stays usable.
 *
 * Render it next to the anchor, inside the anchor's positioned wrapper (it is
 * placed with the anchor's offsets) and never through a portal: inside a
 * `Modal` it then stays within the dialog's focus trap and TV focus stays in
 * the dialog (`topModalRoot()`).
 *
 * Focus moves in on open (the child marked `data-popover-focus`, else the
 * first focusable one) and returns to the anchor on close. Escape closes it
 * through its own `onKeyDown`, unless a child (a `SearchableSelect` closing
 * its list) handled it first. A press outside closes it, heard on the
 * document in the capture phase: a `Modal`'s backdrop stops the press
 * bubbling.
 */
const Popover = ({
  anchorRef,
  open,
  onClose,
  label,
  children,
  placement = "bottom-start",
  className = "",
}: PopoverProps) => {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ top: 0, left: 0, up: false });
  const wasOpen = useRef(false);
  const onCloseRef = useRef(onClose);
  useLayoutEffect(() => {
    onCloseRef.current = onClose;
  });

  // Under the anchor, or above it when the viewport's bottom would cut it off
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const anchor = anchorRef.current;
      const popover = popoverRef.current;
      if (!anchor || !popover) return;
      const height = popover.offsetHeight;
      const rect = anchor.getBoundingClientRect();
      const fitsBelow = window.innerHeight - rect.bottom >= height + GAP;
      const up = !fitsBelow && rect.top >= height + GAP;
      setPosition({
        top: up
          ? anchor.offsetTop - height - GAP
          : anchor.offsetTop + anchor.offsetHeight + GAP,
        left:
          placement === "bottom-end"
            ? anchor.offsetLeft + anchor.offsetWidth
            : anchor.offsetLeft,
        up,
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, anchorRef, placement]);

  // Focus in on open, back to the anchor on close
  useEffect(() => {
    if (open) {
      wasOpen.current = true;
      const popover = popoverRef.current;
      const target =
        popover?.querySelector<HTMLElement>("[data-popover-focus]") ??
        popover?.querySelector<HTMLElement>(FOCUSABLE) ??
        popover;
      target?.focus();
    } else if (wasOpen.current) {
      wasOpen.current = false;
      // Where focus went on its own (a press on another control) stays
      const active = document.activeElement;
      if (!active || active === document.body) anchorRef.current?.focus();
    }
  }, [open, anchorRef]);

  // A press outside closes it. The anchor is outside too, but it toggles the
  // popover itself, so closing here would only reopen it.
  useEffect(() => {
    if (!open) return;
    const handlePress = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popoverRef.current?.contains(target)) return;
      if (anchorRef.current?.contains(target)) return;
      onCloseRef.current();
    };
    document.addEventListener("mousedown", handlePress, true);
    return () => document.removeEventListener("mousedown", handlePress, true);
  }, [open, anchorRef]);

  if (!open) return null;

  // A key a child handled (SearchableSelect's Escape closes its list and
  // calls preventDefault, which React bubbles to here) is not ours
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.defaultPrevented || event.key !== "Escape") return;
    event.preventDefault();
    onClose();
  };

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      className={`absolute z-50 rounded-lg shadow-lg focus:outline-none ${className}`}
      style={{
        top: position.top,
        left: position.left,
        transform: placement === "bottom-end" ? "translateX(-100%)" : undefined,
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
      }}
      data-placement={position.up ? "top" : "bottom"}
    >
      {children}
    </div>
  );
};

export default Popover;
