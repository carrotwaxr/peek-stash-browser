import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp, Eye, EyeOff } from "lucide-react";
import { Button } from "../ui/index.js";

/**
 * Carousel metadata mapping fetchKey to display information
 */
const CAROUSEL_METADATA = {
  continueWatching: {
    title: "Continue Watching",
    description: "Resume your in-progress scenes",
  },
  highRatedScenes: { title: "High Rated", description: "Top rated scenes" },
  recentlyAddedScenes: {
    title: "Recently Added",
    description: "Newly added content",
  },
  longScenes: {
    title: "Feature Length",
    description: "Longer duration scenes",
  },
  highBitrateScenes: {
    title: "High Bitrate",
    description: "Highest quality videos",
  },
  barelyLegalScenes: {
    title: "Barely Legal",
    description: "18 year old performers",
  },
  favoritePerformerScenes: {
    title: "Favorite Performers",
    description: "Scenes with your favorite performers",
  },
  favoriteStudioScenes: {
    title: "Favorite Studios",
    description: "Content from your favorite studios",
  },
  favoriteTagScenes: {
    title: "Favorite Tags",
    description: "Scenes with your favorite tags",
  },
};

/**
 * CarouselSettings Component
 * Allows users to enable/disable and reorder homepage carousels using up/down buttons
 */
const CarouselSettings = ({ carouselPreferences = [], onSave }) => {
  const [preferences, setPreferences] = useState([]);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    // Sort by order on initial load
    const sorted = [...carouselPreferences].sort((a, b) => a.order - b.order);
    setPreferences(sorted);
  }, [carouselPreferences]);

  const moveUp = (index) => {
    if (index === 0) return; // Already at top

    const newPreferences = [...preferences];
    [newPreferences[index - 1], newPreferences[index]] = [
      newPreferences[index],
      newPreferences[index - 1],
    ];

    // Update order values
    const reordered = newPreferences.map((pref, idx) => ({
      ...pref,
      order: idx,
    }));

    setPreferences(reordered);
    setHasChanges(true);
  };

  const moveDown = (index) => {
    if (index === preferences.length - 1) return; // Already at bottom

    const newPreferences = [...preferences];
    [newPreferences[index], newPreferences[index + 1]] = [
      newPreferences[index + 1],
      newPreferences[index],
    ];

    // Update order values
    const reordered = newPreferences.map((pref, idx) => ({
      ...pref,
      order: idx,
    }));

    setPreferences(reordered);
    setHasChanges(true);
  };

  const toggleEnabled = (id) => {
    const updated = preferences.map((pref) =>
      pref.id === id ? { ...pref, enabled: !pref.enabled } : pref
    );
    setPreferences(updated);
    setHasChanges(true);
  };

  const handleSave = () => {
    onSave(preferences);
    setHasChanges(false);
  };

  const handleReset = () => {
    const sorted = [...carouselPreferences].sort((a, b) => a.order - b.order);
    setPreferences(sorted);
    setHasChanges(false);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3
          className="text-lg font-semibold mb-2"
          style={{ color: "var(--text-primary)" }}
        >
          Homepage Carousels
        </h3>
        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
          Use arrow buttons to reorder carousels, click the eye icon to toggle
          visibility
        </p>
      </div>

      <div className="space-y-2">
        {preferences.map((pref, index) => {
          const metadata = CAROUSEL_METADATA[pref.id] || {
            title: pref.id,
            description: "",
          };

          return (
            <div
              key={pref.id}
              className={`
                flex items-center justify-between p-4 rounded-lg border
                transition-all duration-200
                ${pref.enabled ? "" : "opacity-60"}
              `}
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="flex items-center space-x-3 flex-1">
                <div className="flex flex-col space-y-1">
                  <Button
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    variant="secondary"
                    className="p-1"
                    icon={<ChevronUp className="w-4 h-4" />}
                    title="Move up"
                  />
                  <Button
                    onClick={() => moveDown(index)}
                    disabled={index === preferences.length - 1}
                    variant="secondary"
                    className="p-1"
                    icon={<ChevronDown className="w-4 h-4" />}
                    title="Move down"
                  />
                </div>

                <div className="flex-1">
                  <div
                    className="font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {metadata.title}
                  </div>
                  <div
                    className="text-sm"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {metadata.description}
                  </div>
                </div>
              </div>

              <Button
                onClick={() => toggleEnabled(pref.id)}
                variant={pref.enabled ? "primary" : "secondary"}
                className="p-2"
                icon={
                  pref.enabled ? (
                    <Eye className="w-5 h-5" />
                  ) : (
                    <EyeOff className="w-5 h-5" />
                  )
                }
                title={pref.enabled ? "Hide carousel" : "Show carousel"}
              />
            </div>
          );
        })}
      </div>

      <div
        className="flex items-center justify-end space-x-3 pt-4 border-t"
        style={{ borderColor: "var(--border-color)" }}
      >
        <Button
          disabled={!hasChanges}
          onClick={handleReset}
          variant="secondary"
        >
          Cancel
        </Button>
        <Button disabled={!hasChanges} onClick={handleSave} variant="primary">
          Save Changes
        </Button>
      </div>
    </div>
  );
};

export default CarouselSettings;
