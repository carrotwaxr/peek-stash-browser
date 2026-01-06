/**
 * SectionSelector - Segmented control for switching between User/Server settings
 * Two-button toggle with accent styling for active section
 */
const SectionSelector = ({ activeSection, onSectionChange, isAdmin }) => {
  return (
    <div className="flex justify-center mb-6">
      <div
        className="inline-flex rounded-lg p-1"
        style={{
          backgroundColor: "var(--bg-secondary)",
        }}
        role="radiogroup"
        aria-label="Settings section"
      >
        {/* User Settings Button */}
        <button
          onClick={() => onSectionChange("user")}
          className="px-6 py-2 rounded-md text-sm font-medium transition-all duration-200"
          style={{
            backgroundColor:
              activeSection === "user" ? "var(--accent-primary)" : "transparent",
            color: activeSection === "user" ? "white" : "var(--text-primary)",
          }}
          role="radio"
          aria-checked={activeSection === "user"}
        >
          User Settings
        </button>

        {/* Server Settings Button (admin only) */}
        {isAdmin && (
          <button
            onClick={() => onSectionChange("server")}
            className="px-6 py-2 rounded-md text-sm font-medium transition-all duration-200"
            style={{
              backgroundColor:
                activeSection === "server"
                  ? "var(--accent-primary)"
                  : "transparent",
              color:
                activeSection === "server" ? "white" : "var(--text-primary)",
            }}
            role="radio"
            aria-checked={activeSection === "server"}
          >
            Server Settings
          </button>
        )}
      </div>
    </div>
  );
};

export default SectionSelector;
