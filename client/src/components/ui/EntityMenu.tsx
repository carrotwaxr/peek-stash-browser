import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreVertical } from "lucide-react";
import { useCoarsePointer } from "../../hooks/useHoverCapable";

/**
 * EntityMenu - 3-dot menu for entity cards, the scene page and the image viewer
 * Items: "Remove last O" (when `onRemoveLastO` is given and the O count is
 * above 0) and "Hide [Entity Type]" (when `onHide` is given). A menu with no
 * item to show renders nothing, or, with `reserveSpace`, a blank of the
 * button's width, so a menu that appears later (after the first O) moves
 * nothing beside it.
 * Uses portal to render dropdown outside card stacking context
 */
interface HidePayload {
  entityType: string;
  entityId: string;
  entityName: string;
  instanceId: string;
}

interface Props {
  entityType: string;
  entityId: string;
  entityName: string;
  instanceId: string;
  onHide?: (payload: HidePayload) => void;
  /** The entity's O count: Remove last O shows only above 0 */
  oCount?: number;
  onRemoveLastO?: () => void;
  /** Keep the button's 26 px while there is nothing to offer */
  reserveSpace?: boolean;
}

const EntityMenu = ({
  entityType,
  entityId,
  entityName,
  instanceId,
  onHide,
  oCount = 0,
  onRemoveLastO,
  reserveSpace = false,
}: Props) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const coarsePointer = useCoarsePointer();

  // Update menu position when opening (useLayoutEffect prevents position flicker)
  useLayoutEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 4, // 4px gap below button
        right: window.innerWidth - rect.right,
      });
    }
  }, [isOpen]);

  // Close menu when clicking outside,
  // in the capture phase: a Modal stops the press bubbling past its backdrop
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent | TouchEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside, true);
      document.addEventListener("touchstart", handleClickOutside, true);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside, true);
      document.removeEventListener("touchstart", handleClickOutside, true);
    };
  }, [isOpen]);

  // Close menu on scroll
  useEffect(() => {
    if (isOpen) {
      const handleScroll = () => setIsOpen(false);
      window.addEventListener("scroll", handleScroll, true);
      return () => window.removeEventListener("scroll", handleScroll, true);
    }
    return undefined;
  }, [isOpen]);

  const handleButtonClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleHideClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(false);
    onHide?.({
      entityType,
      entityId,
      entityName,
      instanceId,
    });
  };

  const handleRemoveLastOClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(false);
    onRemoveLastO?.();
  };

  const showRemoveLastO = onRemoveLastO !== undefined && oCount > 0;
  const showHide = onHide !== undefined;

  // Capitalize first letter of entity type
  const capitalizedType =
    entityType.charAt(0).toUpperCase() + entityType.slice(1);

  if (!showRemoveLastO && !showHide) {
    // Nothing to offer (the last O just went): no button, and closed
    if (isOpen) setIsOpen(false);
    return reserveSpace ? (
      <div
        data-testid="entity-menu-spacer"
        aria-hidden="true"
        className="w-[26px] shrink-0"
      />
    ) : null;
  }

  return (
    <div className={reserveSpace ? "relative w-[26px] shrink-0" : "relative"}>
      {/* 3-dot button */}
      <button
        ref={buttonRef}
        onClick={handleButtonClick}
        className={`p-1 rounded hover:bg-opacity-20 hover:bg-white transition-colors ${
          // The 26 px button gets a 44 px hit area from a ::before; its box
          // (and the card's row) stay as they are
          coarsePointer ? "relative before:absolute before:-inset-[9px]" : ""
        }`}
        style={{ color: "var(--text-primary)" }}
        aria-label="More options"
        title="More options"
      >
        <MoreVertical size={18} />
      </button>

      {/* Dropdown menu - rendered via portal to escape card stacking context */}
      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed rounded shadow-lg min-w-[160px]"
            style={{
              top: menuPosition.top,
              right: menuPosition.right,
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-color)",
              borderWidth: "1px",
              zIndex: 9999,
            }}
          >
            {showRemoveLastO && (
              <button
                onClick={handleRemoveLastOClick}
                className="w-full text-left px-4 py-2 hover:bg-opacity-10 hover:bg-white transition-colors text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                Remove last O
              </button>
            )}
            {showHide && (
              <button
                onClick={handleHideClick}
                className="w-full text-left px-4 py-2 hover:bg-opacity-10 hover:bg-white transition-colors text-sm"
                style={{ color: "var(--text-primary)" }}
              >
                Hide {capitalizedType}
              </button>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

export default EntityMenu;
