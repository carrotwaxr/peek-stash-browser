// client/src/components/pages/UserStats/components/LibraryOverview.jsx

import { Film, Users, Building2, Tag, Images, Image } from "lucide-react";
import StatCard from "./StatCard.jsx";

/**
 * Compact row of library count stats
 */
const LibraryOverview = ({ library }) => {
  const stats = [
    { label: "Scenes", value: library.sceneCount, icon: <Film size={20} /> },
    { label: "Performers", value: library.performerCount, icon: <Users size={20} /> },
    { label: "Studios", value: library.studioCount, icon: <Building2 size={20} /> },
    { label: "Tags", value: library.tagCount, icon: <Tag size={20} /> },
    { label: "Galleries", value: library.galleryCount, icon: <Images size={20} /> },
    { label: "Images", value: library.imageCount, icon: <Image size={20} /> },
  ];

  return (
    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
      {stats.map((stat) => (
        <StatCard
          key={stat.label}
          label={stat.label}
          value={stat.value.toLocaleString()}
          icon={stat.icon}
        />
      ))}
    </div>
  );
};

export default LibraryOverview;
