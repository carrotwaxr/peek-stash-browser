import { useState, useEffect } from "react";
import { LANDING_PAGE_OPTIONS } from "../../constants/navigation.js";
import { Button, Switch } from "../ui/index.js";

/**
 * Landing page preference settings component
 * Allows users to configure which page to land on after login
 */
const LandingPageSettings = ({ landingPagePreference, onSave }) => {
  const [randomize, setRandomize] = useState(
    landingPagePreference?.randomize || false
  );
  const [selectedPages, setSelectedPages] = useState(
    landingPagePreference?.pages || ["home"]
  );
  const [hasChanges, setHasChanges] = useState(false);
  const [validationError, setValidationError] = useState("");

  // Sync state when prop changes (e.g., after settings reload)
  useEffect(() => {
    setRandomize(landingPagePreference?.randomize || false);
    setSelectedPages(landingPagePreference?.pages || ["home"]);
    setHasChanges(false);
    setValidationError("");
  }, [landingPagePreference]);

  const handleRandomizeToggle = (checked) => {
    setRandomize(checked);
    setHasChanges(true);
    setValidationError("");

    // If turning off randomize and multiple pages selected, keep only first
    if (!checked && selectedPages.length > 1) {
      setSelectedPages([selectedPages[0]]);
    }
  };

  const handlePageSelect = (pageKey) => {
    setHasChanges(true);
    setValidationError("");

    if (randomize) {
      // Multi-select mode
      if (selectedPages.includes(pageKey)) {
        // Don't allow deselecting if only 2 left (minimum for random)
        if (selectedPages.length <= 2) {
          setValidationError("Select at least 2 pages for random mode");
          return;
        }
        setSelectedPages(selectedPages.filter((p) => p !== pageKey));
      } else {
        setSelectedPages([...selectedPages, pageKey]);
      }
    } else {
      // Single-select mode (radio behavior)
      setSelectedPages([pageKey]);
    }
  };

  const handleSave = () => {
    // Validate
    if (randomize && selectedPages.length < 2) {
      setValidationError("Select at least 2 pages for random mode");
      return;
    }

    onSave({
      pages: selectedPages,
      randomize,
    });
    setHasChanges(false);
  };

  const handleReset = () => {
    setRandomize(landingPagePreference?.randomize || false);
    setSelectedPages(landingPagePreference?.pages || ["home"]);
    setHasChanges(false);
    setValidationError("");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3
          className="text-lg font-medium"
          style={{ color: "var(--text-primary)" }}
        >
          Landing Page After Login
        </h3>
      </div>

      {/* Randomize toggle */}
      <div className="flex items-center gap-3">
        <Switch
          checked={randomize}
          onChange={handleRandomizeToggle}
          id="randomize-toggle"
        />
        <label
          htmlFor="randomize-toggle"
          className="text-sm cursor-pointer"
          style={{ color: "var(--text-secondary)" }}
        >
          Random one of selected pages
        </label>
      </div>

      {/* Page options */}
      <div className="space-y-2">
        {LANDING_PAGE_OPTIONS.map((option) => {
          const isSelected = selectedPages.includes(option.key);
          return (
            <label
              key={option.key}
              className="flex items-center gap-3 p-2 rounded cursor-pointer hover:bg-opacity-50"
              style={{
                backgroundColor: isSelected
                  ? "var(--bg-hover)"
                  : "transparent",
              }}
            >
              <input
                type={randomize ? "checkbox" : "radio"}
                name="landing-page"
                checked={isSelected}
                onChange={() => handlePageSelect(option.key)}
                className="w-4 h-4"
                style={{ accentColor: "var(--accent-primary)" }}
              />
              <span style={{ color: "var(--text-primary)" }}>
                {option.label}
              </span>
            </label>
          );
        })}
      </div>

      {/* Validation error */}
      {validationError && (
        <p className="text-sm" style={{ color: "var(--status-error)" }}>
          {validationError}
        </p>
      )}

      {/* Save/Reset buttons */}
      {hasChanges && (
        <div className="flex gap-2 pt-2">
          <Button variant="primary" onClick={handleSave}>
            Save
          </Button>
          <Button variant="secondary" onClick={handleReset}>
            Reset
          </Button>
        </div>
      )}
    </div>
  );
};

export default LandingPageSettings;
