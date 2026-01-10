/**
 * Re-export commonly used types from generated GraphQL types.
 *
 * These replace the type imports that previously came from stashapp-api.
 */

// Entity types
export type {
  Performer,
  Scene,
  Tag,
  Studio,
  Gallery,
  Group,
  Image,
} from "./generated/graphql.js";

// Filter types
export type {
  PerformerFilterType,
  SceneFilterType,
  TagFilterType,
  StudioFilterType,
  GalleryFilterType,
  ImageFilterType,
  GroupFilterType,
  FindFilterType,
} from "./generated/graphql.js";

// Input types
export type {
  ScanMetadataInput,
  PerformerDestroyInput,
  TagDestroyInput,
  StudioDestroyInput,
  SceneDestroyInput,
  TagCreateInput,
  TagUpdateInput,
  SceneUpdateInput,
  PerformerUpdateInput,
  StudioUpdateInput,
  GalleryUpdateInput,
  GroupUpdateInput,
  ImageUpdateInput,
} from "./generated/graphql.js";

// Enums - re-export as values (not just types)
export {
  CriterionModifier,
  GenderEnum,
} from "./generated/graphql.js";
