import ClipCard from "../cards/ClipCard.jsx";
import { useNavigate } from "react-router-dom";

export default function ClipGrid({ clips, loading }) {
  const navigate = useNavigate();

  const handleClipClick = (clip) => {
    navigate(`/scene/${clip.sceneId}?t=${Math.floor(clip.seconds)}`);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {[...Array(12)].map((_, i) => (
          <div key={i} className="aspect-video bg-slate-700 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  if (clips.length === 0) {
    return (
      <div className="text-center py-12 text-slate-400">
        No clips found matching your filters
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
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
