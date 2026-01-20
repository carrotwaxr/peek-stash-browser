/**
 * Centralized entity icon definitions.
 * Single source of truth for icons representing entity types throughout the app.
 *
 * Usage:
 *   import { ENTITY_ICONS, getEntityIcon } from "../constants/entityIcons.js";
 *
 *   // Get icon component directly
 *   const SceneIcon = ENTITY_ICONS.scene;
 *
 *   // Or use helper for dynamic lookup
 *   const Icon = getEntityIcon("performer");
 */
import {
  Building2,
  Clapperboard,
  Film,
  GalleryVertical,
  Image,
  Images,
  List,
  Tag,
  User,
  Users,
} from "lucide-react";

/**
 * Icon components for each entity type.
 * These are the canonical icons - use these everywhere for consistency.
 */
export const ENTITY_ICONS = {
  // Primary content entities
  scene: Clapperboard,
  performer: User,
  studio: Building2,
  tag: Tag,
  group: Film, // Collections/Movies

  // Media entities
  image: Image,
  gallery: GalleryVertical,
  images: Images, // Plural for "multiple images" context

  // Other
  playlist: List,

  // Aliases for convenience
  collection: Film, // Same as group
  movie: Film, // Same as group
};

/**
 * Icon names (strings) for ThemedIcon component and navigation.
 * Maps to lucide icon names that ThemedIcon can resolve.
 */
export const ENTITY_ICON_NAMES = {
  scene: "clapperboard",
  performer: "user",
  studio: "building-2",
  tag: "tag",
  group: "film",
  image: "image",
  gallery: "gallery-vertical",
  images: "images",
  playlist: "list",
  collection: "film",
  movie: "film",
};

/**
 * Plural forms for entity labels
 */
export const ENTITY_LABELS = {
  scene: { singular: "Scene", plural: "Scenes" },
  performer: { singular: "Performer", plural: "Performers" },
  studio: { singular: "Studio", plural: "Studios" },
  tag: { singular: "Tag", plural: "Tags" },
  group: { singular: "Collection", plural: "Collections" },
  image: { singular: "Image", plural: "Images" },
  gallery: { singular: "Gallery", plural: "Galleries" },
  playlist: { singular: "Playlist", plural: "Playlists" },
};

/**
 * Get the icon component for an entity type.
 * @param {string} entityType - The entity type (e.g., "scene", "performer")
 * @returns {React.ComponentType} The Lucide icon component
 */
export const getEntityIcon = (entityType) => {
  return ENTITY_ICONS[entityType] || ENTITY_ICONS.scene;
};

/**
 * Get the icon name string for an entity type.
 * @param {string} entityType - The entity type
 * @returns {string} The icon name for ThemedIcon
 */
export const getEntityIconName = (entityType) => {
  return ENTITY_ICON_NAMES[entityType] || ENTITY_ICON_NAMES.scene;
};

/**
 * Get the label for an entity type.
 * @param {string} entityType - The entity type
 * @param {boolean} plural - Whether to return plural form
 * @returns {string} The label
 */
export const getEntityLabel = (entityType, plural = false) => {
  const labels = ENTITY_LABELS[entityType];
  if (!labels) return entityType;
  return plural ? labels.plural : labels.singular;
};
