import { useState } from "react";
import ClipCard from "../cards/ClipCard.jsx";

/**
 * ClipList - Displays clips for a scene with toggle for ungenerated
 */
export default function ClipList({ clips, onClipClick, loading = false }) {
  const [showUngenerated, setShowUngenerated] = useState(false);

  const filteredClips = showUngenerated
    ? clips
    : clips.filter((c) => c.isGenerated);

  const ungeneratedCount = clips.filter((c) => !c.isGenerated).length;

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {[...Array(4)].map((_, i) => (
          <div
            key={i}
            className="aspect-video rounded-lg animate-pulse"
            style={{ backgroundColor: "var(--bg-tertiary)" }}
          />
        ))}
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <div className="text-center py-8" style={{ color: "var(--text-secondary)" }}>
        No clips available for this scene
      </div>
    );
  }

  return (
    <div>
      {/* Toggle for ungenerated clips */}
      {ungeneratedCount > 0 && (
        <div className="flex items-center justify-end mb-3">
          <label
            className="flex items-center gap-2 text-xs cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
          >
            <input
              type="checkbox"
              checked={showUngenerated}
              onChange={(e) => setShowUngenerated(e.target.checked)}
              className="rounded"
              style={{ borderColor: "var(--border-color)" }}
            />
            Show all ({ungeneratedCount} without preview)
          </label>
        </div>
      )}

      {/* Clip grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
        {filteredClips.map((clip) => (
          <ClipCard
            key={clip.id}
            clip={clip}
            onClick={onClipClick}
            showSceneTitle={false}
          />
        ))}
      </div>
    </div>
  );
}
