import { useState } from "react";

/**
 * Reusable tooltip component
 */
const Tooltip = ({
  children,
  content,
  position = "top",
  className = "",
  disabled = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);

  if (disabled || !content) {
    return children;
  }

  const positionClasses = {
    top: "bottom-full left-0 mb-2",
    bottom: "top-full left-0 mt-2",
    left: "right-full top-0 mr-2",
    right: "left-full top-0 ml-2",
  };

  return (
    <div
      className={`relative inline-block ${className}`}
      onMouseEnter={() => setIsVisible(true)}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}
      {isVisible && (
        <div
          className={`
            absolute z-50 px-4 py-3 text-sm rounded-lg shadow-xl max-w-sm
            ${positionClasses[position]}
          `}
          style={{
            backgroundColor: "var(--bg-tooltip, #1f2937)",
            color: "var(--text-tooltip, white)",
            border: "1px solid var(--border-color)",
            minWidth: "200px",
            maxWidth: "400px",
            lineHeight: "1.4",
            wordWrap: "break-word",
          }}
        >
          {typeof content === "string" ? (
            <span className="whitespace-pre-wrap">{content}</span>
          ) : (
            content
          )}
          {/* Arrow */}
          <div
            className={`absolute w-2 h-2 transform rotate-45 ${
              position === "top"
                ? "top-full left-6 -mt-1"
                : position === "bottom"
                ? "bottom-full left-6 -mb-1"
                : position === "left"
                ? "left-full top-4 -ml-1"
                : "right-full top-4 -mr-1"
            }`}
            style={{
              backgroundColor: "var(--bg-tooltip, #1f2937)",
              borderColor: "var(--border-color)",
              borderWidth:
                position === "top"
                  ? "0 1px 1px 0"
                  : position === "bottom"
                  ? "1px 0 0 1px"
                  : position === "left"
                  ? "1px 1px 0 0"
                  : "0 0 1px 1px",
            }}
          />
        </div>
      )}
    </div>
  );
};

export default Tooltip;
