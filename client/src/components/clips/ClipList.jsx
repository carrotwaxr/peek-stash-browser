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
          <div key={i} className="aspect-video bg-slate-700 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <div className="text-center py-8 text-slate-400">
        No clips available for this scene
      </div>
    );
  }

  return (
    <div>
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-300">
          Clips ({filteredClips.length})
        </h3>
        {ungeneratedCount > 0 && (
          <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
            <input
              type="checkbox"
              checked={showUngenerated}
              onChange={(e) => setShowUngenerated(e.target.checked)}
              className="rounded border-slate-500"
            />
            Show all ({ungeneratedCount} without preview)
          </label>
        )}
      </div>

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
