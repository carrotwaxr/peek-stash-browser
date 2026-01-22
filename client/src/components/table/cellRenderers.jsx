/* eslint-disable react-refresh/only-export-components */
// This file exports both components and utility functions by design

import { Link } from "react-router-dom";
import { Heart } from "lucide-react";
import RatingBadge from "../ui/RatingBadge.jsx";
import MultiValueCell from "./MultiValueCell.jsx";
import {
  formatDuration,
  formatFileSize,
  formatDate,
  calculateAge,
} from "./formatters.js";

// ============================================================================
// Cell Components
// ============================================================================

/**
 * RatingCell - Shows rating badge with bronze/silver/gold gradient (0-100 scale)
 * @param {Object} props
 * @param {number} props.rating - Rating value (0-100)
 */
export const RatingCell = ({ rating }) => {
  if (rating === null || rating === undefined) {
    return <span style={{ color: "var(--text-muted)" }}>-</span>;
  }

  // RatingBadge is display-only in table context (no onClick)
  return <RatingBadge rating={rating} size="small" />;
};

/**
 * FavoriteCell - Shows heart icon if favorite
 * @param {Object} props
 * @param {boolean} props.favorite - Whether entity is favorited
 */
export const FavoriteCell = ({ favorite }) => {
  return (
    <span className="inline-flex items-center justify-center">
      <Heart
        size={16}
        fill={favorite ? "var(--accent-primary)" : "none"}
        stroke={favorite ? "var(--accent-primary)" : "var(--text-muted)"}
        strokeWidth={favorite ? 2 : 1.5}
      />
    </span>
  );
};

/**
 * Get thumbnail dimensions based on entity type
 * @param {string} entityType - The entity type
 * @returns {{ width: string, height: string }} Tailwind classes for width and height
 */
const getThumbnailDimensions = (entityType) => {
  const normalizedType = entityType?.toLowerCase();
  // Portrait entities (2/3 aspect ratio)
  if (["performer", "performers", "gallery", "galleries", "group", "groups"].includes(normalizedType)) {
    return { width: "w-10", height: "h-14" };
  }
  // Square for images (variable aspect ratio)
  if (["image", "images"].includes(normalizedType)) {
    return { width: "w-10", height: "h-10" };
  }
  // Landscape (16/9) for scenes, studios, tags (default)
  return { width: "w-16", height: "h-10" };
};

/**
 * ThumbnailCell - Small image thumbnail with optional link
 * @param {Object} props
 * @param {string} props.src - Image source URL
 * @param {string} props.alt - Alt text for image
 * @param {string} props.linkTo - Optional link destination
 * @param {string} props.entityType - Entity type for aspect ratio (optional)
 */
export const ThumbnailCell = ({ src, alt = "", linkTo, entityType }) => {
  const { width, height } = getThumbnailDimensions(entityType);
  const sizeClasses = `${width} ${height}`;

  if (!src) {
    return (
      <div
        className={`${sizeClasses} rounded flex items-center justify-center`}
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>No image</span>
      </div>
    );
  }

  const image = (
    <img
      src={src}
      alt={alt}
      className={`${sizeClasses} object-cover rounded`}
      loading="lazy"
      onError={(e) => {
        e.target.style.display = "none";
      }}
    />
  );

  if (linkTo) {
    return (
      <Link to={linkTo} className="block hover:opacity-80 transition-opacity">
        {image}
      </Link>
    );
  }

  return image;
};

/**
 * LinkCell - Text link to detail page
 * @param {Object} props
 * @param {string} props.text - Text to display
 * @param {string} props.linkTo - Link destination
 */
export const LinkCell = ({ text, linkTo }) => {
  if (!text) {
    return <span style={{ color: "var(--text-muted)" }}>-</span>;
  }

  if (!linkTo) {
    return <span>{text}</span>;
  }

  return (
    <Link
      to={linkTo}
      className="hover:underline"
      style={{ color: "var(--accent-primary)" }}
    >
      {text}
    </Link>
  );
};

/**
 * TruncatedTextCell - Text with truncation and title for full content
 * @param {Object} props
 * @param {string} props.text - Text to display
 * @param {number} props.maxLength - Maximum characters to show (default: 50)
 */
const TruncatedTextCell = ({ text, maxLength = 50 }) => {
  if (!text) {
    return <span style={{ color: "var(--text-muted)" }}>-</span>;
  }

  const truncated = text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;

  return (
    <span
      title={text}
      className="block truncate"
      style={{ maxWidth: "200px" }}
    >
      {truncated}
    </span>
  );
};

/**
 * SimpleValueCell - Simple text or number value
 * @param {Object} props
 * @param {*} props.value - Value to display
 */
const SimpleValueCell = ({ value }) => {
  if (value === null || value === undefined || value === "") {
    return <span style={{ color: "var(--text-muted)" }}>-</span>;
  }

  return <span>{value}</span>;
};

// ============================================================================
// Entity-Specific Cell Renderers
// ============================================================================

/**
 * Scene cell renderers
 */
const sceneRenderers = {
  title: (scene) => (
    <LinkCell text={scene.title || `Scene ${scene.id}`} linkTo={`/scene/${scene.id}`} />
  ),
  preview: (scene) => (
    <ThumbnailCell
      src={scene.paths?.screenshot || scene.image_path}
      alt={scene.title}
      linkTo={`/scene/${scene.id}`}
      entityType="scene"
    />
  ),
  date: (scene) => formatDate(scene.date),
  duration: (scene) => formatDuration(scene.files?.[0]?.duration || scene.file?.duration || scene.duration),
  rating: (scene) => <RatingCell rating={scene.rating100 ?? scene.rating} />,
  studio: (scene) => {
    if (!scene.studio) {
      return <span style={{ color: "var(--text-muted)" }}>-</span>;
    }
    return <LinkCell text={scene.studio.name} linkTo={`/studio/${scene.studio.id}`} />;
  },
  performers: (scene) => {
    const items = (scene.performers || []).map((p) => ({
      id: p.id,
      name: p.name,
      linkTo: `/performer/${p.id}`,
    }));
    return <MultiValueCell items={items} />;
  },
  tags: (scene) => {
    const items = (scene.tags || []).map((t) => ({
      id: t.id,
      name: t.name,
      linkTo: `/tag/${t.id}`,
    }));
    return <MultiValueCell items={items} />;
  },
  resolution: (scene) => {
    const height = scene.file?.height || scene.files?.[0]?.height;
    return height ? `${height}p` : "-";
  },
  filesize: (scene) => formatFileSize(scene.file?.size || scene.files?.[0]?.size),
  play_count: (scene) => <SimpleValueCell value={scene.play_count} />,
  o_counter: (scene) => <SimpleValueCell value={scene.o_counter} />,
  path: (scene) => {
    const path = scene.path || scene.file?.path || scene.files?.[0]?.path;
    return <TruncatedTextCell text={path} />;
  },
  created_at: (scene) => formatDate(scene.created_at),
};

/**
 * Performer cell renderers
 */
const performerRenderers = {
  name: (performer) => (
    <LinkCell text={performer.name} linkTo={`/performer/${performer.id}`} />
  ),
  image: (performer) => (
    <ThumbnailCell
      src={performer.image_path}
      alt={performer.name}
      linkTo={`/performer/${performer.id}`}
      entityType="performer"
    />
  ),
  aliases: (performer) => {
    const aliasText = performer.alias_list?.join(", ") || performer.aliases;
    return <TruncatedTextCell text={aliasText} maxLength={30} />;
  },
  gender: (performer) => <SimpleValueCell value={performer.gender} />,
  country: (performer) => <SimpleValueCell value={performer.country} />,
  ethnicity: (performer) => <SimpleValueCell value={performer.ethnicity} />,
  rating: (performer) => <RatingCell rating={performer.rating100 ?? performer.rating} />,
  favorite: (performer) => <FavoriteCell favorite={performer.favorite} />,
  age: (performer) => <SimpleValueCell value={calculateAge(performer.birthdate)} />,
  scenes_count: (performer) => <SimpleValueCell value={performer.scene_count} />,
  o_counter: (performer) => <SimpleValueCell value={performer.o_counter} />,
};

/**
 * StudioLogoCell - Studio logo with object-contain (no cropping)
 * @param {Object} props
 * @param {string} props.src - Image source URL
 * @param {string} props.alt - Alt text for image
 * @param {string} props.linkTo - Optional link destination
 */
const StudioLogoCell = ({ src, alt = "", linkTo }) => {
  if (!src) {
    return (
      <div
        className="w-28 h-12 rounded flex items-center justify-center"
        style={{ backgroundColor: "var(--bg-secondary)" }}
      >
        <span style={{ color: "var(--text-muted)", fontSize: "10px" }}>No image</span>
      </div>
    );
  }

  const image = (
    <div
      className="w-28 h-12 rounded flex items-center justify-center"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      <img
        src={src}
        alt={alt}
        className="max-w-full max-h-full object-contain"
        loading="lazy"
        onError={(e) => {
          e.target.style.display = "none";
        }}
      />
    </div>
  );

  if (linkTo) {
    return (
      <Link to={linkTo} className="block hover:opacity-80 transition-opacity">
        {image}
      </Link>
    );
  }

  return image;
};

/**
 * Studio cell renderers
 */
const studioRenderers = {
  name: (studio) => (
    <LinkCell text={studio.name} linkTo={`/studio/${studio.id}`} />
  ),
  image: (studio) => (
    <StudioLogoCell
      src={studio.image_path}
      alt={studio.name}
      linkTo={`/studio/${studio.id}`}
    />
  ),
  rating: (studio) => <RatingCell rating={studio.rating100 ?? studio.rating} />,
  parent_studio: (studio) => {
    if (!studio.parent_studio) {
      return <span style={{ color: "var(--text-muted)" }}>-</span>;
    }
    return (
      <LinkCell
        text={studio.parent_studio.name}
        linkTo={`/studio/${studio.parent_studio.id}`}
      />
    );
  },
  scenes_count: (studio) => <SimpleValueCell value={studio.scene_count} />,
  child_count: (studio) => <SimpleValueCell value={studio.child_studios?.length} />,
};

/**
 * Tag cell renderers
 */
const tagRenderers = {
  name: (tag) => <LinkCell text={tag.name} linkTo={`/tag/${tag.id}`} />,
  image: (tag) => (
    <ThumbnailCell
      src={tag.image_path}
      alt={tag.name}
      linkTo={`/tag/${tag.id}`}
      entityType="tag"
    />
  ),
  scenes_count: (tag) => <SimpleValueCell value={tag.scene_count} />,
  performer_count: (tag) => <SimpleValueCell value={tag.performer_count} />,
  studio_count: (tag) => <SimpleValueCell value={tag.studio_count} />,
  image_count: (tag) => <SimpleValueCell value={tag.image_count} />,
  description: (tag) => <TruncatedTextCell text={tag.description} />,
};

/**
 * Gallery cell renderers
 */
const galleryRenderers = {
  title: (gallery) => (
    <LinkCell
      text={gallery.title || `Gallery ${gallery.id}`}
      linkTo={`/gallery/${gallery.id}`}
    />
  ),
  cover: (gallery) => (
    <ThumbnailCell
      src={gallery.cover}
      alt={gallery.title}
      linkTo={`/gallery/${gallery.id}`}
      entityType="gallery"
    />
  ),
  date: (gallery) => formatDate(gallery.date),
  rating: (gallery) => <RatingCell rating={gallery.rating100 ?? gallery.rating} />,
  studio: (gallery) => {
    if (!gallery.studio) {
      return <span style={{ color: "var(--text-muted)" }}>-</span>;
    }
    return <LinkCell text={gallery.studio.name} linkTo={`/studio/${gallery.studio.id}`} />;
  },
  performers: (gallery) => {
    const items = (gallery.performers || []).map((p) => ({
      id: p.id,
      name: p.name,
      linkTo: `/performer/${p.id}`,
    }));
    return <MultiValueCell items={items} />;
  },
  tags: (gallery) => {
    const items = (gallery.tags || []).map((t) => ({
      id: t.id,
      name: t.name,
      linkTo: `/tag/${t.id}`,
    }));
    return <MultiValueCell items={items} />;
  },
  image_count: (gallery) => <SimpleValueCell value={gallery.image_count} />,
  path: (gallery) => {
    const path = gallery.path || gallery.folder?.path;
    return <TruncatedTextCell text={path} />;
  },
};

/**
 * Image cell renderers
 */
const imageRenderers = {
  title: (image) => (
    <LinkCell
      text={image.title || image.path?.split(/[\\/]/).pop() || `Image ${image.id}`}
      linkTo={`/image/${image.id}`}
    />
  ),
  image: (image) => (
    <ThumbnailCell
      src={image.paths?.thumbnail || image.image_path}
      alt={image.title}
      linkTo={`/image/${image.id}`}
      entityType="image"
    />
  ),
  rating: (image) => <RatingCell rating={image.rating100 ?? image.rating} />,
  studio: (image) => {
    if (!image.studio) {
      return <span style={{ color: "var(--text-muted)" }}>-</span>;
    }
    return <LinkCell text={image.studio.name} linkTo={`/studio/${image.studio.id}`} />;
  },
  performers: (image) => {
    const items = (image.performers || []).map((p) => ({
      id: p.id,
      name: p.name,
      linkTo: `/performer/${p.id}`,
    }));
    return <MultiValueCell items={items} />;
  },
  tags: (image) => {
    const items = (image.tags || []).map((t) => ({
      id: t.id,
      name: t.name,
      linkTo: `/tag/${t.id}`,
    }));
    return <MultiValueCell items={items} />;
  },
  filesize: (image) => formatFileSize(image.file?.size || image.visual_files?.[0]?.size),
  resolution: (image) => {
    const height = image.file?.height || image.visual_files?.[0]?.height;
    const width = image.file?.width || image.visual_files?.[0]?.width;
    if (height && width) {
      return `${width}x${height}`;
    }
    return height ? `${height}p` : "-";
  },
  path: (image) => {
    const path = image.path || image.visual_files?.[0]?.path;
    return <TruncatedTextCell text={path} />;
  },
};

/**
 * Group cell renderers
 */
const groupRenderers = {
  name: (group) => (
    <LinkCell text={group.name} linkTo={`/collection/${group.id}`} />
  ),
  image: (group) => (
    <ThumbnailCell
      src={group.front_image_path}
      alt={group.name}
      linkTo={`/collection/${group.id}`}
      entityType="group"
    />
  ),
  rating: (group) => <RatingCell rating={group.rating100 ?? group.rating} />,
  studio: (group) => {
    if (!group.studio) {
      return <span style={{ color: "var(--text-muted)" }}>-</span>;
    }
    return <LinkCell text={group.studio.name} linkTo={`/studio/${group.studio.id}`} />;
  },
  date: (group) => formatDate(group.date),
  duration: (group) => formatDuration(group.duration),
  scene_count: (group) => <SimpleValueCell value={group.scene_count} />,
  performers: (group) => {
    // Groups don't have performers directly, but scenes in group do
    // This would need API support to aggregate performers across scenes
    const items = (group.performers || []).map((p) => ({
      id: p.id,
      name: p.name,
      linkTo: `/performer/${p.id}`,
    }));
    return <MultiValueCell items={items} />;
  },
  tags: (group) => {
    const items = (group.tags || []).map((t) => ({
      id: t.id,
      name: t.name,
      linkTo: `/tag/${t.id}`,
    }));
    return <MultiValueCell items={items} />;
  },
};

/**
 * TagLinkCell - Tag displayed as a link with theme secondary color
 */
const TagLinkCell = ({ tag }) => {
  if (!tag) {
    return <span style={{ color: "var(--text-muted)" }}>-</span>;
  }

  return (
    <Link
      to={`/tag/${tag.id}`}
      className="hover:underline"
      style={{ color: "var(--accent-secondary)" }}
    >
      {tag.name}
    </Link>
  );
};

/**
 * Clip cell renderers
 */
const clipRenderers = {
  title: (clip) => (
    <LinkCell
      text={clip.title || "Untitled"}
      linkTo={`/scene/${clip.sceneId}?t=${Math.floor(clip.seconds)}`}
    />
  ),
  thumbnail: (clip) => {
    // Use scene screenshot for static thumbnail in table view
    // (clip preview is video/mp4 which can't be displayed in an img tag)
    // pathScreenshot is already a proxy URL from ClipService
    const src = clip.scene?.pathScreenshot || null;
    return (
      <ThumbnailCell
        src={src}
        alt={clip.title}
        linkTo={`/scene/${clip.sceneId}?t=${Math.floor(clip.seconds)}`}
        entityType="scene"
      />
    );
  },
  scene: (clip) => {
    if (!clip.scene) {
      return <span style={{ color: "var(--text-muted)" }}>-</span>;
    }
    return (
      <LinkCell
        text={clip.scene.title || `Scene ${clip.sceneId}`}
        linkTo={`/scene/${clip.sceneId}`}
      />
    );
  },
  primary_tag: (clip) => <TagLinkCell tag={clip.primaryTag} />,
  start_time: (clip) => formatDuration(clip.seconds),
  duration: (clip) => {
    if (clip.endSeconds && clip.seconds) {
      return formatDuration(clip.endSeconds - clip.seconds);
    }
    return <span style={{ color: "var(--text-muted)" }}>-</span>;
  },
  tags: (clip) => {
    const items = (clip.tags || []).map((t) => ({
      id: t.tag?.id || t.id,
      name: t.tag?.name || t.name,
      linkTo: `/tag/${t.tag?.id || t.id}`,
    }));
    return <MultiValueCell items={items} />;
  },
};

// ============================================================================
// Main Export
// ============================================================================

/**
 * Map of entity types to their renderers
 */
const entityRenderers = {
  scene: sceneRenderers,
  scenes: sceneRenderers,
  performer: performerRenderers,
  performers: performerRenderers,
  studio: studioRenderers,
  studios: studioRenderers,
  tag: tagRenderers,
  tags: tagRenderers,
  gallery: galleryRenderers,
  galleries: galleryRenderers,
  image: imageRenderers,
  images: imageRenderers,
  group: groupRenderers,
  groups: groupRenderers,
  clip: clipRenderers,
  clips: clipRenderers,
};

/**
 * Get a cell renderer function for a specific column and entity type
 * @param {string} columnId - The column ID
 * @param {string} entityType - The entity type (scene, performer, studio, tag, gallery, image, group)
 * @returns {Function} A function (entity) => ReactNode
 */
export const getCellRenderer = (columnId, entityType) => {
  const normalizedType = entityType?.toLowerCase();
  const renderers = entityRenderers[normalizedType];

  if (!renderers) {
    // Unknown entity type - return a simple fallback renderer
    return (entity) => <SimpleValueCell value={entity[columnId]} />;
  }

  const renderer = renderers[columnId];

  if (!renderer) {
    // Unknown column - return a simple fallback renderer
    return (entity) => <SimpleValueCell value={entity[columnId]} />;
  }

  return renderer;
};

export default getCellRenderer;
