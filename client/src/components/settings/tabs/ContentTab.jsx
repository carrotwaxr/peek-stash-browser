import { ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { useHiddenEntities } from "../../../hooks/useHiddenEntities.js";

const ContentTab = () => {
  const { hideConfirmationDisabled, updateHideConfirmation } = useHiddenEntities();

  return (
    <div
      className="p-6 rounded-lg border"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-color)",
      }}
    >
      <h3
        className="text-lg font-semibold mb-4"
        style={{ color: "var(--text-primary)" }}
      >
        Hidden Items
      </h3>

      <div className="space-y-4">
        {/* Link to Hidden Items page */}
        <Link
          to="/hidden-items"
          className="flex items-center justify-between py-3 px-4 -mx-4 rounded-lg transition-colors duration-200"
          style={{
            color: "var(--text-primary)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--bg-secondary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <div>
            <div className="font-medium" style={{ color: "var(--text-primary)" }}>
              Hidden Items
            </div>
            <div className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
              Manage items you've hidden from your library
            </div>
          </div>
          <ChevronRight size={20} style={{ color: "var(--text-muted)" }} />
        </Link>

        {/* Hide confirmation toggle */}
        <div
          className="pt-4 border-t"
          style={{ borderColor: "var(--border-color)" }}
        >
          <label className="flex items-center gap-3 cursor-pointer py-3">
            <input
              type="checkbox"
              checked={hideConfirmationDisabled}
              onChange={(e) => updateHideConfirmation(e.target.checked)}
              className="w-5 h-5 cursor-pointer"
              style={{ accentColor: "var(--accent-primary)" }}
            />
            <div>
              <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                Don't ask for confirmation when hiding items
              </div>
              <div
                className="text-sm mt-1"
                style={{ color: "var(--text-secondary)" }}
              >
                Skip the confirmation dialog when hiding entities
              </div>
            </div>
          </label>
        </div>
      </div>
    </div>
  );
};

export default ContentTab;
