import { Link } from "react-router-dom";
import { Heart, Star } from "lucide-react";
import MultiValueCell from "./MultiValueCell.jsx";

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Format duration in seconds to MM:SS or HH:MM:SS
 * @param {number} seconds - Duration in seconds
 * @returns {string} Formatted duration string
 */
export const formatDuration = (seconds) => {
  if (seconds === null || seconds === undefined || isNaN(seconds)) {
    return "-";
  }

  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${secs.toString().padStart(2, "0")}`;
};

/**
 * Format file size in bytes to human readable format
 * @param {number} bytes - File size in bytes
 * @returns {string} Formatted file size (KB/MB/GB)
 */
export const formatFileSize = (bytes) => {
  if (bytes === null || bytes === undefined || isNaN(bytes)) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB", "TB"];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

/**
 * Format date string to locale date
 * @param {string} dateStr - ISO date string or YYYY-MM-DD
 * @returns {string} Formatted date string
 */
export const formatDate = (dateStr) => {
  if (!dateStr) {
    return "-";
  }

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return "-";
    }
    return date.toLocaleDateString();
  } catch {
    return "-";
  }
};

/**
 * Calculate age from birthdate
 * @param {string} birthdate - ISO date string or YYYY-MM-DD
 * @returns {number|string} Age in years or "-" if invalid
 */
export const calculateAge = (birthdate) => {
  if (!birthdate) {
    return "-";
  }

  try {
    const birth = new Date(birthdate);
    if (isNaN(birth.getTime())) {
      return "-";
    }

    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();

    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
      age--;
    }

    return age;
  } catch {
    return "-";
  }
};

// ============================================================================
// Cell Components
// ============================================================================

/**
 * RatingCell - Shows 5 stars based on rating (0-100 scale)
 * @param {Object} props
 * @param {number} props.rating - Rating value (0-100)
 */
export const RatingCell = ({ rating }) => {
  if (rating === null || rating === undefined) {
    return <span style={{ color: "var(--text-muted)" }}>-</span>;
  }

  // Convert 0-100 scale to 0-5 stars
  const starCount = Math.round(rating / 20);
  const stars = [];

  for (let i = 0; i < 5; i++) {
    stars.push(
      <Star
        key={i}
        size={14}
        fill={i < starCount ? "var(--accent-primary)" : "none"}
        stroke={i < starCount ? "var(--accent-primary)" : "var(--text-muted)"}
        strokeWidth={1.5}
      />
    );
  }

  return (
    <span
      className="inline-flex items-center gap-0.5"
      title={`${(rating / 10).toFixed(1)} / 10`}
    >
      {stars}
    </span>
  );
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
 * ThumbnailCell - Small image thumbnail with optional link
 * @param {Object} props
 * @param {string} props.src - Image source URL
 * @param {string} props.alt - Alt text for image
 * @param {string} props.linkTo - Optional link destination
 */
export const ThumbnailCell = ({ src, alt = "", linkTo }) => {
  if (!src) {
    return (
      <div
        className="w-16 h-10 rounded flex items-center justify-center"
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
      className="w-16 h-10 object-cover rounded"
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
  thumbnail: (scene) => (
    <ThumbnailCell
      src={scene.paths?.screenshot || scene.image_path}
      alt={scene.title}
      linkTo={`/scene/${scene.id}`}
    />
  ),
  date: (scene) => formatDate(scene.date),
  duration: (scene) => formatDuration(scene.file?.duration || scene.duration),
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
 * Studio cell renderers
 */
const studioRenderers = {
  name: (studio) => (
    <LinkCell text={studio.name} linkTo={`/studio/${studio.id}`} />
  ),
  image: (studio) => (
    <ThumbnailCell
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
    />
  ),
  scenes_count: (tag) => <SimpleValueCell value={tag.scene_count} />,
  performer_count: (tag) => <SimpleValueCell value={tag.performer_count} />,
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
  thumbnail: (gallery) => (
    <ThumbnailCell
      src={gallery.cover?.paths?.thumbnail || gallery.image_path}
      alt={gallery.title}
      linkTo={`/gallery/${gallery.id}`}
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
  thumbnail: (image) => (
    <ThumbnailCell
      src={image.paths?.thumbnail || image.image_path}
      alt={image.title}
      linkTo={`/image/${image.id}`}
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
