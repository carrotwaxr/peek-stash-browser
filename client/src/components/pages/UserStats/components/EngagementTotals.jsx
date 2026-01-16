// client/src/components/pages/UserStats/components/EngagementTotals.jsx

import { Clock, Play, Heart, Image, Film } from "lucide-react";
import StatCard from "./StatCard.jsx";

/**
 * Format seconds as human-readable duration
 */
function formatDuration(seconds) {
  if (!seconds || seconds === 0) return "0m";

  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);

  return parts.join(" ");
}

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
      value: formatDuration(engagement.totalWatchTime),
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
