/**
 * Type System Index
 *
 * Centralized export for all Peek-specific type definitions.
 *
 * Usage:
 *   import { NormalizedScene, NormalizedPerformer } from "../types/index.js";
 *   import type { SceneFilterType, PerformerFilterType } from "../types/index.js";
 *
 * Note: For base types from Stash (Scene, Performer, etc.), import from graphql/types.js:
 *   import type { Scene, Performer } from "../graphql/types.js";
 */

// Normalized entity types (Stash types + Peek user data)
export type {
  NormalizedScene,
  NormalizedPerformer,
  NormalizedStudio,
  NormalizedTag,
  NormalizedGallery,
  NormalizedGroup,
  NormalizedImage,
  SceneScoringData,
} from "./entities.js";

// Base filter types from Stash GraphQL
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
