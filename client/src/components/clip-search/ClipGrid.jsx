import ClipCard from "../cards/ClipCard.jsx";
import { useNavigate } from "react-router-dom";
import { getGridClasses } from "../../constants/grids.js";

export default function ClipGrid({ clips, loading, density = "medium", onClipClick }) {
  const navigate = useNavigate();
  const gridClasses = getGridClasses("scene", density);

  const handleClipClick = (clip) => {
    if (onClipClick) {
      onClipClick(clip);
    } else {
      navigate(`/scene/${clip.sceneId}?t=${Math.floor(clip.seconds)}`);
    }
  };

  if (loading) {
    return (
      <div className={gridClasses}>
        {[...Array(12)].map((_, i) => (
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
      <div className="text-center py-12" style={{ color: "var(--text-secondary)" }}>
        No clips found matching your filters
      </div>
    );
  }

  return (
    <div className={gridClasses}>
      {clips.map((clip) => (
        <ClipCard
          key={clip.id}
          clip={clip}
          onClick={handleClipClick}
          showSceneTitle
        />
      ))}
    </div>
  );
}
