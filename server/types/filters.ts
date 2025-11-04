/**
 * Filter Type Definitions
 *
 * Re-exports filter types from stashapp-api for use in Peek queries.
 * These types are used when filtering entities via the Stash GraphQL API.
 */

export type {
  PerformerFilterType,
  SceneFilterType,
  TagFilterType,
  StudioFilterType,
  GalleryFilterType,
  ImageFilterType,
  GroupFilterType,
} from "stashapp-api";

export { CriterionModifier, GenderEnum } from "stashapp-api";
