// client/src/components/pages/UserStats/components/LibraryOverview.tsx

import { ENTITY_ICONS } from "../../../../constants/entityIcons";
import StatCard from "./StatCard";

interface LibraryCounts {
  sceneCount: number;
  performerCount: number;
  studioCount: number;
  tagCount: number;
  galleryCount: number;
  imageCount: number;
  clipCount: number;
}

interface Props {
  library: LibraryCounts;
}

/**
 * Compact row of library count stats
 */
const LibraryOverview = ({ library }: Props) => {
  const SceneIcon = ENTITY_ICONS.scene;
  const PerformerIcon = ENTITY_ICONS.performer;
  const StudioIcon = ENTITY_ICONS.studio;
  const TagIcon = ENTITY_ICONS.tag;
  const GalleryIcon = ENTITY_ICONS.gallery;
  const ImageIcon = ENTITY_ICONS.image;
  const ClipIcon = ENTITY_ICONS.clip;

  const stats = [
    { label: "Scenes", value: library.sceneCount, icon: <SceneIcon size={20} /> },
    { label: "Performers", value: library.performerCount, icon: <PerformerIcon size={20} /> },
    { label: "Studios", value: library.studioCount, icon: <StudioIcon size={20} /> },
    { label: "Tags", value: library.tagCount, icon: <TagIcon size={20} /> },
    { label: "Galleries", value: library.galleryCount, icon: <GalleryIcon size={20} /> },
    { label: "Images", value: library.imageCount, icon: <ImageIcon size={20} /> },
    { label: "Clips", value: library.clipCount, icon: <ClipIcon size={20} /> },
  ];

  return (
    <div className="grid grid-cols-4 md:grid-cols-7 gap-3">
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
