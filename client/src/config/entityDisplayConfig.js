/**
 * Shared configuration for entity display settings.
 * Used by CardDisplaySettingsContext, CardDisplaySettings UI, and page components.
 * Single source of truth for available view modes and settings per entity type.
 */

export const ENTITY_DISPLAY_CONFIG = {
  scene: {
    label: "Scene",
    viewModes: [
      { id: "grid", label: "Grid" },
      { id: "wall", label: "Wall" },
      { id: "table", label: "Table" },
    ],
    defaultSettings: {
      defaultViewMode: "grid",
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showCodeOnCard: true,
      showStudio: true,
      showDate: true,
      showRelationshipIndicators: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    },
    availableSettings: [
      "defaultViewMode",
      "showCodeOnCard",
      "showStudio",
      "showDate",
      "showDescriptionOnCard",
      "showDescriptionOnDetail",
      "showRelationshipIndicators",
      "showRating",
      "showFavorite",
      "showOCounter",
    ],
  },
  gallery: {
    label: "Gallery",
    viewModes: [
      { id: "grid", label: "Grid" },
      { id: "wall", label: "Wall" },
      { id: "table", label: "Table" },
    ],
    defaultSettings: {
      defaultViewMode: "grid",
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showStudio: true,
      showDate: true,
      showRelationshipIndicators: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    },
    availableSettings: [
      "defaultViewMode",
      "showStudio",
      "showDate",
      "showDescriptionOnCard",
      "showDescriptionOnDetail",
      "showRelationshipIndicators",
      "showRating",
      "showFavorite",
      "showOCounter",
    ],
  },
  image: {
    label: "Image",
    viewModes: [
      { id: "grid", label: "Grid" },
      { id: "wall", label: "Wall" },
    ],
    defaultSettings: {
      defaultViewMode: "grid",
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showStudio: true,
      showDate: true,
      showRelationshipIndicators: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    },
    availableSettings: [
      "defaultViewMode",
      "showStudio",
      "showDate",
      "showDescriptionOnCard",
      "showDescriptionOnDetail",
      "showRelationshipIndicators",
      "showRating",
      "showFavorite",
      "showOCounter",
    ],
  },
  performer: {
    label: "Performer",
    viewModes: [
      { id: "grid", label: "Grid" },
      { id: "wall", label: "Wall" },
      { id: "table", label: "Table" },
    ],
    defaultSettings: {
      defaultViewMode: "grid",
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showRelationshipIndicators: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    },
    availableSettings: [
      "defaultViewMode",
      "showDescriptionOnCard",
      "showDescriptionOnDetail",
      "showRelationshipIndicators",
      "showRating",
      "showFavorite",
      "showOCounter",
    ],
  },
  studio: {
    label: "Studio",
    viewModes: [
      { id: "grid", label: "Grid" },
      { id: "wall", label: "Wall" },
      { id: "table", label: "Table" },
    ],
    defaultSettings: {
      defaultViewMode: "grid",
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showRelationshipIndicators: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    },
    availableSettings: [
      "defaultViewMode",
      "showDescriptionOnCard",
      "showDescriptionOnDetail",
      "showRelationshipIndicators",
      "showRating",
      "showFavorite",
      "showOCounter",
    ],
  },
  tag: {
    label: "Tag",
    viewModes: [
      { id: "grid", label: "Grid" },
      { id: "table", label: "Table" },
      { id: "hierarchy", label: "Hierarchy" },
    ],
    defaultSettings: {
      defaultViewMode: "grid",
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showRelationshipIndicators: true,
    },
    availableSettings: [
      "defaultViewMode",
      "showDescriptionOnCard",
      "showDescriptionOnDetail",
      "showRelationshipIndicators",
    ],
  },
  group: {
    label: "Group",
    viewModes: [
      { id: "grid", label: "Grid" },
      { id: "wall", label: "Wall" },
      { id: "table", label: "Table" },
    ],
    defaultSettings: {
      defaultViewMode: "grid",
      showDescriptionOnCard: true,
      showDescriptionOnDetail: true,
      showRelationshipIndicators: true,
      showRating: true,
      showFavorite: true,
      showOCounter: true,
    },
    availableSettings: [
      "defaultViewMode",
      "showDescriptionOnCard",
      "showDescriptionOnDetail",
      "showRelationshipIndicators",
      "showRating",
      "showFavorite",
      "showOCounter",
    ],
  },
};

/**
 * Get list of entity types in display order
 */
export const getEntityTypes = () => Object.keys(ENTITY_DISPLAY_CONFIG);

/**
 * Get default settings for an entity type
 */
export const getDefaultSettings = (entityType) => {
  return ENTITY_DISPLAY_CONFIG[entityType]?.defaultSettings || {};
};

/**
 * Get available view modes for an entity type
 */
export const getViewModes = (entityType) => {
  return ENTITY_DISPLAY_CONFIG[entityType]?.viewModes || [{ id: "grid", label: "Grid" }];
};

/**
 * Get available settings for an entity type (for UI rendering)
 */
export const getAvailableSettings = (entityType) => {
  return ENTITY_DISPLAY_CONFIG[entityType]?.availableSettings || [];
};

/**
 * Setting labels for UI display
 */
export const SETTING_LABELS = {
  defaultViewMode: "Default view mode",
  showCodeOnCard: "Show studio code on cards",
  showStudio: "Show studio name",
  showDate: "Show date",
  showDescriptionOnCard: "Show description on cards",
  showDescriptionOnDetail: "Show description on detail page",
  showRelationshipIndicators: "Show relationship indicators",
  showRating: "Show rating",
  showFavorite: "Show favorite",
  showOCounter: "Show O counter",
};

/**
 * Setting descriptions for UI display
 */
export const SETTING_DESCRIPTIONS = {
  showCodeOnCard: "Display scene codes (e.g., JAV codes) in card subtitles",
  showStudio: "Display studio name in card subtitles",
  showDate: "Display date in card subtitles",
  showRelationshipIndicators: "Display count badges for performers, tags, etc.",
};
