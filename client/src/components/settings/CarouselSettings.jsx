import { useState, useEffect } from "react";
import { GripVertical, Eye, EyeOff } from "lucide-react";

/**
 * Carousel metadata mapping fetchKey to display information
 */
const CAROUSEL_METADATA = {
  highRatedScenes: { title: "High Rated", description: "Top rated scenes" },
  recentlyAddedScenes: { title: "Recently Added", description: "Newly added content" },
  longScenes: { title: "Feature Length", description: "Longer duration scenes" },
  highBitrateScenes: { title: "High Bitrate", description: "Highest quality videos" },
  barelyLegalScenes: { title: "Barely Legal", description: "18 year old performers" },
  favoritePerformerScenes: { title: "Favorite Performers", description: "Scenes with your favorite performers" },
  favoriteStudioScenes: { title: "Favorite Studios", description: "Content from your favorite studios" },
  favoriteTagScenes: { title: "Favorite Tags", description: "Scenes with your favorite tags" },
};

/**
 * CarouselSettings Component
 * Allows users to enable/disable and reorder homepage carousels via drag-and-drop
 */
const CarouselSettings = ({ carouselPreferences = [], onSave }) => {
  const [preferences, setPreferences] = useState([]);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    // Sort by order on initial load
    const sorted = [...carouselPreferences].sort((a, b) => a.order - b.order);
    setPreferences(sorted);
  }, [carouselPreferences]);

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e, index) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === index) {
      return;
    }

    const newPreferences = [...preferences];
    const [draggedItem] = newPreferences.splice(draggedIndex, 1);
    newPreferences.splice(index, 0, draggedItem);

    // Update order values
    const reordered = newPreferences.map((pref, idx) => ({
      ...pref,
      order: idx,
    }));

    setPreferences(reordered);
    setDraggedIndex(index);
    setHasChanges(true);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
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
        <h3 className="text-lg font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
          Homepage Carousels
        </h3>
        <p className="text-sm mb-4" style={{ color: "var(--text-secondary)" }}>
          Drag to reorder carousels, click the eye icon to toggle visibility
        </p>
      </div>

      <div className="space-y-2">
        {preferences.map((pref, index) => {
          const metadata = CAROUSEL_METADATA[pref.id] || { title: pref.id, description: "" };

          return (
            <div
              key={pref.id}
              draggable
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={(e) => handleDragOver(e, index)}
              onDragEnd={handleDragEnd}
              className={`
                flex items-center justify-between p-4 rounded-lg border
                transition-all duration-200 cursor-move
                ${draggedIndex === index ? "opacity-50" : "opacity-100"}
                ${pref.enabled ? "" : "opacity-60"}
              `}
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-color)",
              }}
            >
              <div className="flex items-center space-x-3 flex-1">
                <GripVertical
                  className="w-5 h-5 flex-shrink-0"
                  style={{ color: "var(--text-secondary)" }}
                />

                <div className="flex-1">
                  <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                    {metadata.title}
                  </div>
                  <div className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {metadata.description}
                  </div>
                </div>
              </div>

              <button
                onClick={() => toggleEnabled(pref.id)}
                className="p-2 rounded-lg hover:bg-opacity-80 transition-colors"
                style={{
                  backgroundColor: pref.enabled ? "var(--accent-primary)" : "var(--bg-secondary)",
                  color: pref.enabled ? "white" : "var(--text-secondary)",
                }}
                title={pref.enabled ? "Hide carousel" : "Show carousel"}
              >
                {pref.enabled ? (
                  <Eye className="w-5 h-5" />
                ) : (
                  <EyeOff className="w-5 h-5" />
                )}
              </button>
            </div>
          );
        })}
      </div>

      {hasChanges && (
        <div className="flex items-center justify-end space-x-3 pt-4 border-t" style={{ borderColor: "var(--border-color)" }}>
          <button
            onClick={handleReset}
            className="px-4 py-2 border rounded-md text-sm hover:bg-opacity-80 transition-colors"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-color)",
              color: "var(--text-primary)",
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-6 py-2 rounded-md text-sm font-medium transition-colors hover:opacity-90"
            style={{
              backgroundColor: "var(--accent-primary)",
              color: "white",
            }}
          >
            Save Changes
          </button>
        </div>
      )}
    </div>
  );
};

export default CarouselSettings;
