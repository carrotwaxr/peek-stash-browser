# API Reference

> Auto-generated from TypeScript source files.
> Last updated: 2026-01-04

## Contents

- [Auth](#auth)
- [Setup](#setup)
- [Sync](#sync)
- [Exclusions](#exclusions)
- [User](#user)
- [Playlists](#playlists)
- [Carousels](#carousels)
- [Watch History](#watch-history)
- [Image View History](#image-view-history)
- [Ratings](#ratings)
- [Custom Themes](#custom-themes)
- [Library](#library)

## Auth

Authentication endpoints for login, logout, and session management.

## Setup

Setup wizard endpoints for initial configuration.

### GET /api/setup/status

**Authentication:** None

**Response:**

```typescript
interface GetSetupStatusResponse {
  setupComplete: boolean;
  hasUsers: boolean;
  hasStashInstance: boolean;
  userCount: number;
  stashInstanceCount: number;
}
```

**Controller:** `getSetupStatus` in `../controllers/setup.ts`

---

### POST /api/setup/create-admin

**Authentication:** None

**Request Body:**

```typescript
interface CreateFirstAdminRequest {
  username: string;
  password: string;
}
```

**Response:**

```typescript
interface CreateFirstAdminResponse {
  success: true;
  user: {
  id: number;
  username: string;
  role: string;
  createdAt: Date;
};
}
```

**Controller:** `createFirstAdmin` in `../controllers/setup.ts`

---

### POST /api/setup/test-stash-connection

**Authentication:** None

**Request Body:**

```typescript
interface TestStashConnectionRequest {
  url: string;
  apiKey: string;
}
```

**Response:**

```typescript
interface TestStashConnectionResponse {
  success: boolean;
  message?: string;
  error?: string;
  details?: string;
}
```

**Controller:** `testStashConnection` in `../controllers/setup.ts`

---

### POST /api/setup/create-stash-instance

**Authentication:** None

**Request Body:**

```typescript
interface CreateFirstStashInstanceRequest {
  name?: string;
  url: string;
  apiKey: string;
}
```

**Response:**

```typescript
interface CreateFirstStashInstanceResponse {
  success: true;
  instance: {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  createdAt: Date;
};
}
```

**Controller:** `createFirstStashInstance` in `../controllers/setup.ts`

---

### POST /api/setup/reset

**Authentication:** None

**Response:**

```typescript
interface ResetSetupResponse {
  success: true;
  message: string;
  deleted: {
  users: number;
  stashInstances: number;
};
}
```

**Controller:** `resetSetup` in `../controllers/setup.ts`

---

### GET /api/setup/stash-instance

**Authentication:** None

**Response:**

```typescript
interface GetStashInstanceResponse {
  instance: {
  id: string;
  name: string;
  url: string;
  enabled: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
} | null;
  instanceCount: number;
}
```

**Controller:** `getStashInstance` in `../controllers/setup.ts`

---

## Sync

Cache synchronization endpoints for refreshing Stash data.

## Exclusions

Content exclusion management endpoints.

## User

User settings and preference endpoints.

### GET /api/user/settings

**Authentication:** Required

**Controller:** `getUserSettings` in `../controllers/user.ts`

---

### PUT /api/user/settings

**Authentication:** Required

**Controller:** `updateUserSettings` in `../controllers/user.ts`

---

### POST /api/user/change-password

**Authentication:** Required

**Controller:** `changePassword` in `../controllers/user.ts`

---

### GET /api/user/filter-presets

**Authentication:** Required

**Controller:** `getFilterPresets` in `../controllers/user.ts`

---

### POST /api/user/filter-presets

**Authentication:** Required

**Controller:** `saveFilterPreset` in `../controllers/user.ts`

---

### DELETE /api/user/filter-presets/:artifactType/:presetId

**Authentication:** Required

**Controller:** `deleteFilterPreset` in `../controllers/user.ts`

---

### GET /api/user/default-presets

**Authentication:** Required

**Controller:** `getDefaultFilterPresets` in `../controllers/user.ts`

---

### PUT /api/user/default-preset

**Authentication:** Required

**Controller:** `setDefaultFilterPreset` in `../controllers/user.ts`

---

### GET /api/user/all

**Authentication:** Required

**Controller:** `getAllUsers` in `../controllers/user.ts`

---

### POST /api/user/create

**Authentication:** Required

**Controller:** `createUser` in `../controllers/user.ts`

---

### DELETE /api/user/:userId

**Authentication:** Required

**Controller:** `deleteUser` in `../controllers/user.ts`

---

### PUT /api/user/:userId/role

**Authentication:** Required

**Controller:** `updateUserRole` in `../controllers/user.ts`

---

### PUT /api/user/:userId/settings

**Authentication:** Required

**Controller:** `updateUserSettings` in `../controllers/user.ts`

---

### POST /api/user/:userId/sync-from-stash

**Authentication:** Required

**Controller:** `syncFromStash` in `../controllers/user.ts`

---

### GET /api/user/:userId/restrictions

**Authentication:** Required

**Controller:** `getUserRestrictions` in `../controllers/user.ts`

---

### PUT /api/user/:userId/restrictions

**Authentication:** Required

**Controller:** `updateUserRestrictions` in `../controllers/user.ts`

---

### DELETE /api/user/:userId/restrictions

**Authentication:** Required

**Controller:** `deleteUserRestrictions` in `../controllers/user.ts`

---

### POST /api/user/hidden-entities

**Authentication:** Required

**Controller:** `hideEntity` in `../controllers/user.ts`

---

### DELETE /api/user/hidden-entities/all

**Authentication:** Required

**Controller:** `unhideAllEntities` in `../controllers/user.ts`

---

### DELETE /api/user/hidden-entities/:entityType/:entityId

**Authentication:** Required

**Controller:** `unhideEntity` in `../controllers/user.ts`

---

### GET /api/user/hidden-entities

**Authentication:** Required

**Controller:** `getHiddenEntities` in `../controllers/user.ts`

---

### GET /api/user/hidden-entities/ids

**Authentication:** Required

**Controller:** `getHiddenEntityIds` in `../controllers/user.ts`

---

### PUT /api/user/hide-confirmation

**Authentication:** Required

**Controller:** `updateHideConfirmation` in `../controllers/user.ts`

---

## Playlists

Playlist management endpoints for creating and organizing scene collections.

### GET /api/playlists/

**Authentication:** Required

**Response:**

```typescript
interface GetUserPlaylistsResponse {
  playlists: PlaylistData[];
}
```

**Controller:** `getUserPlaylists` in `../controllers/playlist.ts`

---

### GET /api/playlists/:id

**Authentication:** Required

**URL Parameters:**

```typescript
interface GetPlaylistParams {
  id: string;
}
```

**Response:**

```typescript
interface GetPlaylistResponse {
  playlist: PlaylistData;
}
```

**Controller:** `getPlaylist` in `../controllers/playlist.ts`

---

### POST /api/playlists/

**Authentication:** Required

**Request Body:**

```typescript
interface CreatePlaylistRequest {
  name: string;
  description?: string;
  isPublic?: boolean;
}
```

**Response:**

```typescript
interface CreatePlaylistResponse {
  playlist: PlaylistData;
}
```

**Controller:** `createPlaylist` in `../controllers/playlist.ts`

---

### PUT /api/playlists/:id

**Authentication:** Required

**Request Body:**

```typescript
interface UpdatePlaylistRequest {
  name?: string;
  description?: string;
  isPublic?: boolean;
  shuffle?: boolean;
  repeat?: string;
}
```

**URL Parameters:**

```typescript
interface UpdatePlaylistParams {
  id: string;
}
```

**Response:**

```typescript
interface UpdatePlaylistResponse {
  playlist: PlaylistData;
}
```

**Controller:** `updatePlaylist` in `../controllers/playlist.ts`

---

### DELETE /api/playlists/:id

**Authentication:** Required

**URL Parameters:**

```typescript
interface DeletePlaylistParams {
  id: string;
}
```

**Response:**

```typescript
interface DeletePlaylistResponse {
  success: true;
  message: string;
}
```

**Controller:** `deletePlaylist` in `../controllers/playlist.ts`

---

### POST /api/playlists/:id/items

**Authentication:** Required

**Request Body:**

```typescript
interface AddSceneToPlaylistRequest {
  sceneId: string;
}
```

**URL Parameters:**

```typescript
interface AddSceneToPlaylistParams {
  id: string;
}
```

**Response:**

```typescript
interface AddSceneToPlaylistResponse {
  item: {
  id: number;
  playlistId: number;
  sceneId: string;
  position: number;
  addedAt: Date;
};
}
```

**Controller:** `addSceneToPlaylist` in `../controllers/playlist.ts`

---

### DELETE /api/playlists/:id/items/:sceneId

**Authentication:** Required

**URL Parameters:**

```typescript
interface RemoveSceneFromPlaylistParams {
  id: string;
  sceneId: string;
}
```

**Response:**

```typescript
interface RemoveSceneFromPlaylistResponse {
  success: true;
  message: string;
}
```

**Controller:** `removeSceneFromPlaylist` in `../controllers/playlist.ts`

---

### PUT /api/playlists/:id/reorder

**Authentication:** Required

**Request Body:**

```typescript
interface ReorderPlaylistRequest {
  items: Array<{
  sceneId: string;
  position: number;
}>;
}
```

**URL Parameters:**

```typescript
interface ReorderPlaylistParams {
  id: string;
}
```

**Response:**

```typescript
interface ReorderPlaylistResponse {
  success: true;
  message: string;
}
```

**Controller:** `reorderPlaylist` in `../controllers/playlist.ts`

---

## Carousels

Custom carousel configuration endpoints.

### GET /api/carousels/

**Authentication:** Required

**Response:**

```typescript
interface GetUserCarouselsResponse {
  carousels: CarouselData[];
}
```

**Controller:** `getUserCarousels` in `../controllers/carousel.ts`

---

### POST /api/carousels/preview

**Authentication:** Required

**Request Body:**

```typescript
interface PreviewCarouselRequest {
  rules: PeekSceneFilter;
  sort?: string;
  direction?: string;
}
```

**Response:**

```typescript
interface PreviewCarouselResponse {
  scenes: NormalizedScene[];
}
```

**Controller:** `previewCarousel` in `../controllers/carousel.ts`

---

### GET /api/carousels/:id

**Authentication:** Required

**URL Parameters:**

```typescript
interface GetCarouselParams {
  id: string;
}
```

**Response:**

```typescript
interface GetCarouselResponse {
  carousel: CarouselData;
}
```

**Controller:** `getCarousel` in `../controllers/carousel.ts`

---

### GET /api/carousels/:id/execute

**Authentication:** Required

**URL Parameters:**

```typescript
interface ExecuteCarouselByIdParams {
  id: string;
}
```

**Response:**

```typescript
interface ExecuteCarouselByIdResponse {
  carousel: {
  id: string;
  title: string;
  icon: string;
};
  scenes: NormalizedScene[];
}
```

**Controller:** `executeCarouselById` in `../controllers/carousel.ts`

---

### POST /api/carousels/

**Authentication:** Required

**Request Body:**

```typescript
interface CreateCarouselRequest {
  title: string;
  icon?: string;
  rules: PeekSceneFilter;
  sort?: string;
  direction?: string;
}
```

**Response:**

```typescript
interface CreateCarouselResponse {
  carousel: CarouselData;
}
```

**Controller:** `createCarousel` in `../controllers/carousel.ts`

---

### PUT /api/carousels/:id

**Authentication:** Required

**Request Body:**

```typescript
interface UpdateCarouselRequest {
  title?: string;
  icon?: string;
  rules?: PeekSceneFilter;
  sort?: string;
  direction?: string;
}
```

**URL Parameters:**

```typescript
interface UpdateCarouselParams {
  id: string;
}
```

**Response:**

```typescript
interface UpdateCarouselResponse {
  carousel: CarouselData;
}
```

**Controller:** `updateCarousel` in `../controllers/carousel.ts`

---

### DELETE /api/carousels/:id

**Authentication:** Required

**URL Parameters:**

```typescript
interface DeleteCarouselParams {
  id: string;
}
```

**Response:**

```typescript
interface DeleteCarouselResponse {
  success: true;
  message: string;
}
```

**Controller:** `deleteCarousel` in `../controllers/carousel.ts`

---

## Watch History

Watch history tracking endpoints.

### POST /api/watch-history/ping

**Authentication:** Required

**Controller:** `pingWatchHistory` in `../controllers/watchHistory.ts`

---

### POST /api/watch-history/save-activity

**Authentication:** Required

**Controller:** `saveActivity` in `../controllers/watchHistory.ts`

---

### POST /api/watch-history/increment-play-count

**Authentication:** Required

**Controller:** `incrementPlayCount` in `../controllers/watchHistory.ts`

---

### POST /api/watch-history/increment-o

**Authentication:** Required

**Controller:** `incrementOCounter` in `../controllers/watchHistory.ts`

---

### GET /api/watch-history/

**Authentication:** Required

**Controller:** `getAllWatchHistory` in `../controllers/watchHistory.ts`

---

### DELETE /api/watch-history/

**Authentication:** Required

**Controller:** `clearAllWatchHistory` in `../controllers/watchHistory.ts`

---

### GET /api/watch-history/:sceneId

**Authentication:** Required

**Controller:** `getWatchHistory` in `../controllers/watchHistory.ts`

---

## Image View History

Image view history tracking endpoints.

### POST /api/image-view-history/increment-o

**Authentication:** Required

**Controller:** `incrementImageOCounter` in `../controllers/imageViewHistory.ts`

---

### POST /api/image-view-history/view

**Authentication:** Required

**Controller:** `recordImageView` in `../controllers/imageViewHistory.ts`

---

### GET /api/image-view-history/:imageId

**Authentication:** Required

**Controller:** `getImageViewHistory` in `../controllers/imageViewHistory.ts`

---

## Ratings

Rating and favorite management endpoints.

### PUT /api/ratings/scene/:sceneId

**Authentication:** Required

**Controller:** `updateSceneRating` in `../controllers/ratings.ts`

---

### PUT /api/ratings/performer/:performerId

**Authentication:** Required

**Controller:** `updatePerformerRating` in `../controllers/ratings.ts`

---

### PUT /api/ratings/studio/:studioId

**Authentication:** Required

**Controller:** `updateStudioRating` in `../controllers/ratings.ts`

---

### PUT /api/ratings/tag/:tagId

**Authentication:** Required

**Controller:** `updateTagRating` in `../controllers/ratings.ts`

---

### PUT /api/ratings/gallery/:galleryId

**Authentication:** Required

**Controller:** `updateGalleryRating` in `../controllers/ratings.ts`

---

### PUT /api/ratings/group/:groupId

**Authentication:** Required

**Controller:** `updateGroupRating` in `../controllers/ratings.ts`

---

### PUT /api/ratings/image/:imageId

**Authentication:** Required

**Controller:** `updateImageRating` in `../controllers/ratings.ts`

---

## Custom Themes

Custom theme management endpoints.

### GET /api/themes/custom/

**Authentication:** Required

**Response:**

```typescript
interface GetUserCustomThemesResponse {
  themes: CustomThemeData[];
}
```

**Controller:** `getUserCustomThemes` in `../controllers/customTheme.ts`

---

### GET /api/themes/custom/:id

**Authentication:** Required

**URL Parameters:**

```typescript
interface GetCustomThemeParams {
  id: string;
}
```

**Response:**

```typescript
interface GetCustomThemeResponse {
  theme: CustomThemeData & {
  userId: number
};
}
```

**Controller:** `getCustomTheme` in `../controllers/customTheme.ts`

---

### POST /api/themes/custom/

**Authentication:** Required

**Request Body:**

```typescript
interface CreateCustomThemeRequest {
  name: string;
  config: ThemeConfig;
}
```

**Response:**

```typescript
interface CreateCustomThemeResponse {
  theme: CustomThemeData & {
  userId: number
};
}
```

**Controller:** `createCustomTheme` in `../controllers/customTheme.ts`

---

### PUT /api/themes/custom/:id

**Authentication:** Required

**Request Body:**

```typescript
interface UpdateCustomThemeRequest {
  name?: string;
  config?: ThemeConfig;
}
```

**URL Parameters:**

```typescript
interface UpdateCustomThemeParams {
  id: string;
}
```

**Response:**

```typescript
interface UpdateCustomThemeResponse {
  theme: CustomThemeData & {
  userId: number
};
}
```

**Controller:** `updateCustomTheme` in `../controllers/customTheme.ts`

---

### DELETE /api/themes/custom/:id

**Authentication:** Required

**URL Parameters:**

```typescript
interface DeleteCustomThemeParams {
  id: string;
}
```

**Response:**

```typescript
interface DeleteCustomThemeResponse {
  success: true;
}
```

**Controller:** `deleteCustomTheme` in `../controllers/customTheme.ts`

---

### POST /api/themes/custom/:id/duplicate

**Authentication:** Required

**URL Parameters:**

```typescript
interface DuplicateCustomThemeParams {
  id: string;
}
```

**Response:**

```typescript
interface DuplicateCustomThemeResponse {
  theme: CustomThemeData & {
  userId: number
};
}
```

**Controller:** `duplicateCustomTheme` in `../controllers/customTheme.ts`

---

## Library

Library browsing endpoints for scenes, performers, studios, tags, groups, galleries, and images.

### POST /api/library/galleries

**Authentication:** Required

**Controller:** `findGalleries` in `../../controllers/library/galleries.ts`

---

### POST /api/library/galleries/minimal

**Authentication:** Required

**Controller:** `findGalleriesMinimal` in `../../controllers/library/galleries.ts`

---

### GET /api/library/galleries/:id

**Authentication:** Required

**Controller:** `findGalleryById` in `../../controllers/library/galleries.ts`

---

### GET /api/library/galleries/:galleryId/images

**Authentication:** Required

**Controller:** `getGalleryImages` in `../../controllers/library/galleries.ts`

---

### POST /api/library/groups

**Authentication:** Required

**Controller:** `findGroups` in `../../controllers/library/groups.ts`

---

### POST /api/library/groups/minimal

**Authentication:** Required

**Controller:** `findGroupsMinimal` in `../../controllers/library/groups.ts`

---

### POST /api/library/images

**Authentication:** Required

**Controller:** `findImages` in `../../controllers/library/images.ts`

---

### GET /api/library/images/:id

**Authentication:** Required

**Controller:** `findImageById` in `../../controllers/library/images.ts`

---

### POST /api/library/performers

**Authentication:** Required

**Controller:** `findPerformers` in `../../controllers/library/performers.ts`

---

### POST /api/library/performers/minimal

**Authentication:** Required

**Controller:** `findPerformersMinimal` in `../../controllers/library/performers.ts`

---

### PUT /api/library/performers/:id

**Authentication:** Required

**Controller:** `updatePerformer` in `../../controllers/library/performers.ts`

---

### POST /api/library/scenes

**Authentication:** Required

**Controller:** `findScenes` in `../../controllers/library/scenes.ts`

---

### GET /api/library/scenes/:id/similar

**Authentication:** Required

**Controller:** `findSimilarScenes` in `../../controllers/library/scenes.ts`

---

### GET /api/library/scenes/recommended

**Authentication:** Required

**Controller:** `getRecommendedScenes` in `../../controllers/library/scenes.ts`

---

### PUT /api/library/scenes/:id

**Authentication:** Required

**Controller:** `updateScene` in `../../controllers/library/scenes.ts`

---

### POST /api/library/studios

**Authentication:** Required

**Controller:** `findStudios` in `../../controllers/library/studios.ts`

---

### POST /api/library/studios/minimal

**Authentication:** Required

**Controller:** `findStudiosMinimal` in `../../controllers/library/studios.ts`

---

### PUT /api/library/studios/:id

**Authentication:** Required

**Controller:** `updateStudio` in `../../controllers/library/studios.ts`

---

### POST /api/library/tags

**Authentication:** Required

**Controller:** `findTags` in `../../controllers/library/tags.ts`

---

### POST /api/library/tags/minimal

**Authentication:** Required

**Controller:** `findTagsMinimal` in `../../controllers/library/tags.ts`

---

### PUT /api/library/tags/:id

**Authentication:** Required

**Controller:** `updateTag` in `../../controllers/library/tags.ts`

---
