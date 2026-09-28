// server/types/api/library.ts
/**
 * Library API Types
 *
 * The request and response types for /api/library/* endpoints live in
 * shared/types/api/library.ts; this file re-exports them beside the server's
 * own scoring type.
 */
export type {
  WithStashUrl,
  // Entity pickers
  MinimalRequest,
  MinimalEntity,
  // Scenes
  FindScenesRequest,
  FindScenesResponse,
  FindSimilarScenesParams,
  FindSimilarScenesQuery,
  FindSimilarScenesResponse,
  GetRecommendedScenesQuery,
  GetRecommendedScenesResponse,
  // Performers
  FindPerformersRequest,
  FindPerformersResponse,
  FindPerformersMinimalRequest,
  FindPerformersMinimalResponse,
  // Studios
  FindStudiosRequest,
  FindStudiosResponse,
  FindStudiosMinimalRequest,
  FindStudiosMinimalResponse,
  // Tags
  FindTagsRequest,
  FindTagsResponse,
  FindTagsMinimalRequest,
  FindTagsMinimalResponse,
  TagTreeScope,
  FindTagTreeRequest,
  TagTreeRow,
  FindTagTreeResponse,
  // Galleries
  FindGalleriesRequest,
  FindGalleriesResponse,
  FindGalleriesMinimalRequest,
  FindGalleriesMinimalResponse,
  // Groups
  FindGroupsRequest,
  FindGroupsResponse,
  FindGroupsMinimalRequest,
  FindGroupsMinimalResponse,
  // Images
  FindImagesRequest,
  FindImagesResponse,
} from "@peek/shared-types/api/library.js";

/**
 * Scene recommendation scoring intermediate type
 */
export interface ScoredSceneId {
  id: string;
  score: number;
  oCounter: number;
}
