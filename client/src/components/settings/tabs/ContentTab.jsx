import { Eye } from "lucide-react";
import { Link } from "react-router-dom";
import { useHiddenEntities } from "../../../hooks/useHiddenEntities.js";
import { Button } from "../../ui/index.js";

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
        <p style={{ color: "var(--text-secondary)" }}>
          Manage items you've hidden from your library. Hidden items will not appear in
          any views or searches.
        </p>

        {/* Link to Hidden Items page */}
        <Link to="/hidden-items">
          <Button variant="primary" icon={<Eye size={18} />}>
            View Hidden Items
          </Button>
        </Link>

        {/* Hide confirmation toggle */}
        <div
          className="pt-4 border-t"
          style={{ borderColor: "var(--border-color)" }}
        >
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={hideConfirmationDisabled}
              onChange={(e) => updateHideConfirmation(e.target.checked)}
              className="w-5 h-5 cursor-pointer"
              style={{ accentColor: "var(--accent-color)" }}
            />
            <div>
              <div style={{ color: "var(--text-primary)" }}>
                Don't ask for confirmation when hiding items
              </div>
              <div
                className="text-sm"
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
