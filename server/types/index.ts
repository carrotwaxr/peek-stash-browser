/**
 * Type System Index
 *
 * Centralized export for all Peek-specific type definitions.
 *
 * Usage:
 *   import { NormalizedScene, NormalizedPerformer } from "../types/index.js";
 *   import type { SceneFilterType, PerformerFilterType } from "../types/index.js";
 *
 * Note: For base types from stashapp-api (Scene, Performer, etc.), import directly:
 *   import type { Scene, Performer } from "stashapp-api";
 */

// Normalized entity types (Stash types + Peek user data)
export type {
  NormalizedScene,
  NormalizedPerformer,
  NormalizedStudio,
  NormalizedTag,
  NormalizedGallery,
  NormalizedGroup,
  SceneScoringData,
} from "./entities.js";

// Base filter types from stashapp-api
export type {
  PerformerFilterType,
  SceneFilterType,
  TagFilterType,
  StudioFilterType,
  GalleryFilterType,
  ImageFilterType,
  GroupFilterType,
} from "./filters.js";

export { CriterionModifier, GenderEnum } from "./filters.js";

// Peek extended filter types
export type {
  PeekSceneFilter,
  PeekPerformerFilter,
  PeekStudioFilter,
  PeekTagFilter,
  PeekGalleryFilter,
  PeekGroupFilter,
} from "./peekFilters.js";
