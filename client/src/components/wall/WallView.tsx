import { useMemo } from "react";
import { RowsPhotoAlbum } from "react-photo-album";
import "react-photo-album/rows.css";
import WallItem from "./WallItem";
import { wallConfig, ZOOM_LEVELS, DEFAULT_ZOOM } from "./wallConfig";

/**
 * Justified gallery view using react-photo-album.
 * Renders items in rows with preserved aspect ratios.
 */
interface Props {
  items?: Record<string, unknown>[];
  entityType?: keyof typeof wallConfig;
  zoomLevel?: keyof typeof ZOOM_LEVELS;
  playbackMode?: "autoplay" | "hover" | "static";
  onItemClick?: (item: Record<string, unknown>) => void;
  loading?: boolean;
  emptyMessage?: string;
}

const WallView = ({
  items = [],
  entityType = "scene",
  zoomLevel = DEFAULT_ZOOM as keyof typeof ZOOM_LEVELS,
  playbackMode = "autoplay",
  onItemClick,
  loading = false,
  emptyMessage = "No items found",
}: Props) => {
  const config = wallConfig[entityType];
  const { targetRowHeight } = ZOOM_LEVELS[zoomLevel] || ZOOM_LEVELS[DEFAULT_ZOOM];

  // Transform items to photo album format
  const photos = useMemo(() => {
    if (!items || !config) return [];

    return items.map((item) => {
      const aspectRatio = config.getAspectRatio(item as Record<string, unknown>);
      // react-photo-album needs width/height, we use aspect ratio to derive them
      const baseHeight = targetRowHeight;
      const baseWidth = baseHeight * aspectRatio;

      return {
        src: config.getImageUrl(item as Record<string, unknown>) || "",
        width: baseWidth,
        height: baseHeight,
        key: item.id as string,
        // Pass original item for rendering
        _item: item,
      };
    });
  }, [items, config, targetRowHeight]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div
          className="animate-spin rounded-full h-8 w-8 border-b-2"
          style={{ borderColor: "var(--accent-primary)" }}
        />
      </div>
    );
  }

  if (!items || items.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center">
          <div className="text-6xl mb-4" style={{ color: "var(--text-muted)" }}>
            {entityType === "scene" ? "🎬" : entityType === "gallery" ? "🖼️" : "📷"}
          </div>
          <h3
            className="text-xl font-medium mb-2"
            style={{ color: "var(--text-primary)" }}
          >
            {emptyMessage}
          </h3>
        </div>
      </div>
    );
  }

  return (
    <div className="wall-view">
      <RowsPhotoAlbum
        photos={photos}
        targetRowHeight={targetRowHeight}
        rowConstraints={{ maxPhotos: 8 }}
        spacing={4}
        render={{
          photo: (_, { photo, width, height }) => (
            <WallItem
              key={photo.key}
              item={photo._item}
              config={config}
              entityType={entityType}
              width={width}
              height={height}
              playbackMode={playbackMode}
              onClick={onItemClick}
            />
          ),
        }}
      />
    </div>
  );
};

export default WallView;
