export type {
  PerformerRef,
  TagRef,
  StudioRef,
  GroupRef,
  GalleryRef,
  GroupRelationRef,
  RelationTotals,
  SceneFile,
  ScenePaths,
  SceneStream,
  NormalizedScene,
  NormalizedPerformer,
  NormalizedStudio,
  StashId,
  NormalizedTag,
  NormalizedGroup,
  NormalizedGallery,
  ImageListItem,
  WithInstanceId,
} from "./entities.js";

// Instance-aware composite key types
export type { InstanceAwareId } from "./instanceAwareId.js";
export {
  makeEntityRef,
  parseEntityRef,
  isEntityRef,
  assertEntityRef,
} from "./instanceAwareId.js";

// Recommendation preferences
export {
  PERFORMER_GENDERS,
  NO_PARTNER_SCENES,
  DISCOVERY_MODES,
  MAX_IGNORED_TAGS,
  DEFAULT_RECOMMENDATION_PREFERENCES,
  readRecommendationPreferences,
  validateRecommendationPreferences,
} from "./recommendationPreferences.js";
export type {
  PerformerGender,
  RecommendationPreferences,
} from "./recommendationPreferences.js";

// VR projections
export { VR_PROJECTIONS } from "./vr.js";
export type { VrProjection, VrSource, SceneVr } from "./vr.js";

// Theme keys
export {
  BUILT_IN_THEME_KEYS,
  isBuiltInThemeKey,
  customThemeKey,
  parseCustomThemeKey,
} from "./themes.js";
export type { BuiltInThemeKey } from "./themes.js";

// Filter preset contexts
export {
  PRESET_CONTEXTS,
  PRESET_CONTEXT_LABELS,
  isPresetContext,
  presetArtifactType,
} from "./presetContexts.js";
export type { PresetContext } from "./presetContexts.js";

// API contract types
export * from "./api/index.js";

// List filter and sort contract
export * from "./filters/index.js";
