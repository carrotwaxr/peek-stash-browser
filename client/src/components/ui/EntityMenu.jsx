import { MoreVertical } from "lucide-react";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

/**
 * EntityMenu - 3-dot menu for entity cards
 * Provides "Hide [Entity Type]" option
 * Uses portal to render dropdown outside card stacking context
 */
const EntityMenu = ({ entityType, entityId, entityName, onHide }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, right: 0 });
  const menuRef = useRef(null);
  const buttonRef = useRef(null);

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

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("touchstart", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [isOpen]);

  // Close menu on scroll
  useEffect(() => {
    if (isOpen) {
      const handleScroll = () => setIsOpen(false);
      window.addEventListener("scroll", handleScroll, true);
      return () => window.removeEventListener("scroll", handleScroll, true);
    }
  }, [isOpen]);

  const handleButtonClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(!isOpen);
  };

  const handleHideClick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(false);
    onHide?.({ entityType, entityId, entityName });
  };

  // Capitalize first letter of entity type
  const capitalizedType =
    entityType.charAt(0).toUpperCase() + entityType.slice(1);

  return (
    <div className="relative">
      {/* 3-dot button */}
      <button
        ref={buttonRef}
        onClick={handleButtonClick}
        className="p-1 rounded hover:bg-opacity-20 hover:bg-white transition-colors"
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
            <button
              onClick={handleHideClick}
              className="w-full text-left px-4 py-2 hover:bg-opacity-10 hover:bg-white transition-colors text-sm"
              style={{ color: "var(--text-primary)" }}
            >
              Hide {capitalizedType}
            </button>
          </div>,
          document.body
        )}
    </div>
  );
};

export default EntityMenu;
