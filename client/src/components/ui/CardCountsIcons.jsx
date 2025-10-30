import {
  Clapperboard,
  Image,
  GalleryHorizontal,
  Film,
  Spotlight,
  UserStar,
} from "lucide-react";

/**
 * CardCountsIcons - Display entity counts with icons
 * Used in tag cards, performer cards, studio cards, etc. to show content counts
 */
export default function CardCountsIcons({
  className = "",
  sceneCount,
  imageCount,
  galleryCount,
  groupCount,
  studioCount,
  performerCount,
}) {
  return (
    <div className={`flex items-center gap-3 flex-wrap ${className}`}>
      {sceneCount > 0 && (
        <div
          className="flex items-center gap-1 text-xs"
          style={{ color: "var(--text-muted)" }}
          title={`${sceneCount} Scene${sceneCount !== 1 ? "s" : ""}`}
        >
          <Clapperboard size={14} />
          <span>{sceneCount}</span>
        </div>
      )}
      {imageCount > 0 && (
        <div
          className="flex items-center gap-1 text-xs"
          style={{ color: "var(--text-muted)" }}
          title={`${imageCount} Image${imageCount !== 1 ? "s" : ""}`}
        >
          <Image size={14} />
          <span>{imageCount}</span>
        </div>
      )}
      {galleryCount > 0 && (
        <div
          className="flex items-center gap-1 text-xs"
          style={{ color: "var(--text-muted)" }}
          title={`${galleryCount} Galler${galleryCount !== 1 ? "ies" : "y"}`}
        >
          <GalleryHorizontal size={14} />
          <span>{galleryCount}</span>
        </div>
      )}
      {groupCount > 0 && (
        <div
          className="flex items-center gap-1 text-xs"
          style={{ color: "var(--text-muted)" }}
          title={`${groupCount} Group${groupCount !== 1 ? "s" : ""}`}
        >
          <Film size={14} />
          <span>{groupCount}</span>
        </div>
      )}
      {studioCount > 0 && (
        <div
          className="flex items-center gap-1 text-xs"
          style={{ color: "var(--text-muted)" }}
          title={`${studioCount} Studio${studioCount !== 1 ? "s" : ""}`}
        >
          <Spotlight size={14} />
          <span>{studioCount}</span>
        </div>
      )}
      {performerCount > 0 && (
        <div
          className="flex items-center gap-1 text-xs"
          style={{ color: "var(--text-muted)" }}
          title={`${performerCount} Performer${performerCount !== 1 ? "s" : ""}`}
        >
          <UserStar size={14} />
          <span>{performerCount}</span>
        </div>
      )}
    </div>
  );
}
