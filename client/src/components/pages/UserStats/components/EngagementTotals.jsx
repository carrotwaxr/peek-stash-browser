// client/src/components/pages/UserStats/components/EngagementTotals.jsx

import { Clock, Play, Heart, Image, Film } from "lucide-react";
import StatCard from "./StatCard.jsx";
import { formatDurationHumanReadable } from "../../../../utils/format.js";

/**
 * Hero section with engagement totals
 */
const EngagementTotals = ({ engagement, librarySceneCount }) => {
  const coveragePercent =
    librarySceneCount > 0
      ? Math.round((engagement.uniqueScenesWatched / librarySceneCount) * 100)
      : 0;

  const stats = [
    {
      label: "Watch Time",
      value: formatDurationHumanReadable(engagement.totalWatchTime),
      icon: <Clock size={24} />,
    },
    {
      label: "Play Count",
      value: engagement.totalPlayCount.toLocaleString(),
      icon: <Play size={24} />,
    },
    {
      label: "O Count",
      value: engagement.totalOCount.toLocaleString(),
      icon: <Heart size={24} />,
    },
    {
      label: "Scenes Watched",
      value: engagement.uniqueScenesWatched.toLocaleString(),
      subtitle: `${coveragePercent}% of library`,
      icon: <Film size={24} />,
    },
    {
      label: "Images Viewed",
      value: engagement.totalImagesViewed.toLocaleString(),
      icon: <Image size={24} />,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {stats.map((stat) => (
        <StatCard
          key={stat.label}
          label={stat.label}
          value={stat.value}
          subtitle={stat.subtitle}
          icon={stat.icon}
        />
      ))}
    </div>
  );
};

export default EngagementTotals;
