import { LucideGrid2X2, LucideSquare } from "lucide-react";

/**
 * Toggle between Grid and Wall view modes.
 */
const ViewModeToggle = ({ value = "grid", onChange, className = "" }) => {
  const modes = [
    { id: "grid", icon: LucideGrid2X2, label: "Grid view" },
    { id: "wall", icon: LucideSquare, label: "Wall view" },
  ];

  return (
    <div
      className={`inline-flex rounded-lg overflow-hidden ${className}`}
      style={{
        backgroundColor: "var(--bg-secondary)",
        border: "1px solid var(--border-color)",
      }}
    >
      {modes.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className="px-3 py-1.5 transition-colors"
          style={{
            backgroundColor: value === id ? "var(--accent-primary)" : "transparent",
            color: value === id ? "white" : "var(--text-secondary)",
          }}
          title={label}
          aria-label={label}
          aria-pressed={value === id}
        >
          <Icon size={18} />
        </button>
      ))}
    </div>
  );
};

export default ViewModeToggle;
