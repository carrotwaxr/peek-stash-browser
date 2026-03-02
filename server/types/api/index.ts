// server/types/api/index.ts
/**
 * API Types Index
 *
 * Re-exports all API request/response types for easy importing.
 * Types from shared/ are dependency-free contracts; types from ./local files
 * have server-internal dependencies (Express, Prisma, GraphQL).
 *
 * Usage:
 *   import type { FindScenesRequest, FindScenesResponse } from "../types/api/index.js";
 */

// ---------------------------------------------------------------------------
// Shared API types (canonical definitions in shared/types/api/)
// ---------------------------------------------------------------------------

// Common types
export type {
  PaginationFilter,
  MinimalCountFilter,
  ApiErrorResponse,
  ApiSuccessResponse,
  CacheNotReadyResponse,
  AmbiguousLookupResponse,
} from "@peek/shared-types/api/common.js";

// User settings & preferences types
export type {
  CarouselPreference,
  TableColumnsConfig,
  FilterPreset,
  FilterPresets,
  DefaultFilterPresets,
  SyncUpdates,
  UserRestriction,
  NavPreference,
  LandingPagePreference,
  CardDisplaySettings,
  GetUserSettingsResponse,
  UpdateUserSettingsParams,
  UpdateUserSettingsBody,
  UpdateUserSettingsResponse,
  ChangePasswordBody,
  ChangePasswordResponse,
  GetRecoveryKeyResponse,
  RegenerateRecoveryKeyResponse,
  GetAllUsersResponse,
  CreateUserBody,
  CreateUserResponse,
  DeleteUserParams,
  DeleteUserResponse,
  UpdateUserRoleParams,
  UpdateUserRoleBody,
  UpdateUserRoleResponse,
  GetFilterPresetsResponse,
  SaveFilterPresetBody,
  SaveFilterPresetResponse,
  DeleteFilterPresetParams,
  DeleteFilterPresetResponse,
  GetDefaultFilterPresetsResponse,
  SetDefaultFilterPresetBody,
  SetDefaultFilterPresetResponse,
  SyncFromStashParams,
  SyncFromStashBody,
  SyncFromStashResponse,
  GetUserRestrictionsParams,
  UpdateUserRestrictionsBody,
  UpdateUserRestrictionsResponse,
  DeleteUserRestrictionsParams,
  DeleteUserRestrictionsResponse,
  HideEntityBody,
  HideEntityResponse,
  UnhideEntityParams,
  UnhideEntityQuery,
  UnhideEntityResponse,
  UnhideAllEntitiesQuery,
  UnhideAllEntitiesResponse,
  GetHiddenEntitiesQuery,
  GetHiddenEntityIdsResponse,
  HideEntitiesBody,
  HideEntitiesResponse,
  UpdateHideConfirmationBody,
  UpdateHideConfirmationResponse,
  GetUserPermissionsParams,
  UpdatePermissionOverridesBody,
  GetUserGroupMembershipsParams,
  AdminResetPasswordParams,
  AdminResetPasswordBody,
  AdminResetPasswordResponse,
  AdminRegenerateRecoveryKeyParams,
  AdminRegenerateRecoveryKeyResponse,
  UpdateUserStashInstancesBody,
  CompleteSetupBody,
} from "@peek/shared-types/api/user.js";

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
} from "@peek/shared-types/api/ratings.js";

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
} from "@peek/shared-types/api/watchHistory.js";

// Image View History endpoint types
export type {
  IncrementImageOCounterRequest,
  IncrementImageOCounterResponse,
  RecordImageViewRequest,
  RecordImageViewResponse,
  GetImageViewHistoryParams,
  GetImageViewHistoryResponse,
} from "@peek/shared-types/api/imageViewHistory.js";

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
  // Multi-instance management (admin)
  StashInstanceData,
  GetAllStashInstancesResponse,
  CreateStashInstanceRequest,
  CreateStashInstanceResponse,
  UpdateStashInstanceParams,
  UpdateStashInstanceRequest,
  UpdateStashInstanceResponse,
  DeleteStashInstanceParams,
  DeleteStashInstanceResponse,
  // User instance selection
  GetUserStashInstancesResponse,
  UpdateUserStashInstancesRequest,
  UpdateUserStashInstancesResponse,
} from "@peek/shared-types/api/setup.js";

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
} from "@peek/shared-types/api/userStats.js";

// Download endpoint types
export type {
  SerializedDownload,
  StartSceneDownloadParams,
  StartSceneDownloadResponse,
  StartImageDownloadParams,
  StartImageDownloadResponse,
  StartPlaylistDownloadParams,
  StartPlaylistDownloadResponse,
  GetUserDownloadsResponse,
  GetDownloadStatusParams,
  GetDownloadStatusResponse,
  GetDownloadFileParams,
  DeleteDownloadParams,
  DeleteDownloadResponse,
  RetryDownloadParams,
  RetryDownloadResponse,
} from "@peek/shared-types/api/download.js";

// User Groups endpoint types (user groups, not Stash groups)
export type {
  GroupData,
  GroupMember,
  GroupWithMembers,
  GetAllUserGroupsResponse,
  GetUserGroupParams,
  GetUserGroupResponse,
  CreateUserGroupBody,
  CreateUserGroupResponse,
  UpdateUserGroupParams,
  UpdateUserGroupBody,
  UpdateUserGroupResponse,
  DeleteUserGroupParams,
  DeleteUserGroupResponse,
  AddMemberParams,
  AddMemberBody,
  AddMemberResponse,
  RemoveMemberParams,
  RemoveMemberResponse,
  GetCurrentUserGroupsResponse,
} from "@peek/shared-types/api/groups.js";

// Clips endpoint types
export type {
  GetClipsQuery,
  GetClipsResponse,
  GetClipByIdParams,
  GetClipsForSceneParams,
  GetClipsForSceneQuery,
  GetClipsForSceneResponse,
} from "@peek/shared-types/api/clips.js";

// Timeline endpoint types
export type {
  GetDateDistributionParams,
  GetDateDistributionQuery,
  DateDistributionEntry,
  GetDateDistributionResponse,
} from "@peek/shared-types/api/timeline.js";

// Server Stats endpoint types
export type {
  StatsSystemInfo,
  StatsProcessInfo,
  StatsCacheInfo,
  StatsDatabaseInfo,
  GetStatsResponse,
  RefreshCacheResponse,
} from "@peek/shared-types/api/stats.js";

// ---------------------------------------------------------------------------
// Server-local API types (dependencies on Express, Prisma, GraphQL)
// ---------------------------------------------------------------------------

// Express typed helpers
export type {
  TypedRequest,
  TypedAuthRequest,
  TypedResponse,
} from "./express.js";

// Proxy controller types
export type { ProxyOptions } from "./proxy.js";

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
  ScoredSceneId,
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
