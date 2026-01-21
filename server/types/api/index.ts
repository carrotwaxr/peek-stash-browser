// server/types/api/index.ts
/**
 * API Types Index
 *
 * Re-exports all API request/response types for easy importing.
 *
 * Usage:
 *   import type { FindScenesRequest, FindScenesResponse } from "../types/api/index.js";
 */

// Common types
export type {
  PaginationFilter,
  MinimalCountFilter,
  ApiErrorResponse,
  ApiSuccessResponse,
  CacheNotReadyResponse,
} from "./common.js";

// Express typed helpers
export type {
  TypedRequest,
  TypedAuthRequest,
  TypedResponse,
} from "./express.js";

// Library endpoint types
export type {
  // Scenes
  FindScenesRequest,
  FindScenesResponse,
  FindSimilarScenesParams,
  FindSimilarScenesQuery,
  FindSimilarScenesResponse,
  GetRecommendedScenesQuery,
  GetRecommendedScenesResponse,
  UpdateSceneParams,
  UpdateSceneRequest,
  UpdateSceneResponse,
  // Performers
  FindPerformersRequest,
  FindPerformersResponse,
  FindPerformersMinimalRequest,
  FindPerformersMinimalResponse,
  UpdatePerformerParams,
  UpdatePerformerRequest,
  UpdatePerformerResponse,
  // Studios
  FindStudiosRequest,
  FindStudiosResponse,
  FindStudiosMinimalRequest,
  FindStudiosMinimalResponse,
  UpdateStudioParams,
  UpdateStudioRequest,
  UpdateStudioResponse,
  // Tags
  FindTagsRequest,
  FindTagsResponse,
  FindTagsMinimalRequest,
  FindTagsMinimalResponse,
  UpdateTagParams,
  UpdateTagRequest,
  UpdateTagResponse,
  // Galleries
  FindGalleriesRequest,
  FindGalleriesResponse,
  GetGalleryParams,
  GetGalleryResponse,
  GetGalleryImagesParams,
  GetGalleryImagesQuery,
  GetGalleryImagesResponse,
  GalleryImageWithContext,
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
  GetImageParams,
  GetImageResponse,
} from "./library.js";

// Ratings endpoint types
export type {
  UpdateRatingRequest,
  UpdateRatingResponse,
  UpdateSceneRatingParams,
  UpdatePerformerRatingParams,
  UpdateStudioRatingParams,
  UpdateTagRatingParams,
  UpdateGalleryRatingParams,
  UpdateGroupRatingParams,
  UpdateImageRatingParams,
} from "./ratings.js";

// Watch History endpoint types
export type {
  WatchHistoryData,
  FullWatchHistoryRecord,
  PingWatchHistoryRequest,
  PingWatchHistoryResponse,
  SaveActivityRequest,
  SaveActivityResponse,
  IncrementPlayCountRequest,
  IncrementPlayCountResponse,
  IncrementOCounterRequest,
  IncrementOCounterResponse,
  GetAllWatchHistoryQuery,
  GetAllWatchHistoryResponse,
  GetWatchHistoryParams,
  GetWatchHistoryResponse,
  ClearAllWatchHistoryResponse,
} from "./watchHistory.js";

// Image View History endpoint types
export type {
  IncrementImageOCounterRequest,
  IncrementImageOCounterResponse,
  RecordImageViewRequest,
  RecordImageViewResponse,
  GetImageViewHistoryParams,
  GetImageViewHistoryResponse,
} from "./imageViewHistory.js";

// Playlist endpoint types
export type {
  PlaylistItemWithScene,
  PlaylistData,
  GetUserPlaylistsResponse,
  GetPlaylistParams,
  GetPlaylistResponse,
  CreatePlaylistRequest,
  CreatePlaylistResponse,
  UpdatePlaylistParams,
  UpdatePlaylistRequest,
  UpdatePlaylistResponse,
  DeletePlaylistParams,
  DeletePlaylistResponse,
  AddSceneToPlaylistParams,
  AddSceneToPlaylistRequest,
  AddSceneToPlaylistResponse,
  RemoveSceneFromPlaylistParams,
  RemoveSceneFromPlaylistResponse,
  ReorderPlaylistParams,
  ReorderPlaylistRequest,
  ReorderPlaylistResponse,
  SharedPlaylistData,
  GetSharedPlaylistsResponse,
  PlaylistShareInfo,
  GetPlaylistSharesResponse,
  UpdatePlaylistSharesRequest,
  UpdatePlaylistSharesResponse,
  DuplicatePlaylistResponse,
} from "./playlist.js";

// Carousel endpoint types
export type {
  CarouselData,
  GetUserCarouselsResponse,
  GetCarouselParams,
  GetCarouselResponse,
  CreateCarouselRequest,
  CreateCarouselResponse,
  UpdateCarouselParams,
  UpdateCarouselRequest,
  UpdateCarouselResponse,
  DeleteCarouselParams,
  DeleteCarouselResponse,
  PreviewCarouselRequest,
  PreviewCarouselResponse,
  ExecuteCarouselByIdParams,
  ExecuteCarouselByIdResponse,
} from "./carousel.js";

// Custom Theme endpoint types
export type {
  ThemeConfig,
  CustomThemeData,
  GetUserCustomThemesResponse,
  GetCustomThemeParams,
  GetCustomThemeResponse,
  CreateCustomThemeRequest,
  CreateCustomThemeResponse,
  UpdateCustomThemeParams,
  UpdateCustomThemeRequest,
  UpdateCustomThemeResponse,
  DeleteCustomThemeParams,
  DeleteCustomThemeResponse,
  DuplicateCustomThemeParams,
  DuplicateCustomThemeResponse,
} from "./customTheme.js";

// Setup endpoint types
export type {
  GetSetupStatusResponse,
  CreateFirstAdminRequest,
  CreateFirstAdminResponse,
  TestStashConnectionRequest,
  TestStashConnectionResponse,
  CreateFirstStashInstanceRequest,
  CreateFirstStashInstanceResponse,
  GetStashInstanceResponse,
  ResetSetupRequest,
  ResetSetupResponse,
} from "./setup.js";

// User Stats endpoint types
export type {
  LibraryStats,
  EngagementStats,
  TopScene,
  TopPerformer,
  TopStudio,
  TopTag,
  HighlightScene,
  HighlightImage,
  HighlightPerformer,
  UserStatsResponse,
} from "./userStats.js";
