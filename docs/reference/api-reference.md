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

**Authentication:** None until an admin or Stash instance exists, then admin

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
}
```

**Controller:** `testStashConnection` in `../controllers/setup.ts`

---

### POST /api/setup/create-stash-instance

**Authentication:** None until an admin or Stash instance exists, then admin

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

### GET /api/setup/stash-instance

**Authentication:** Admin

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

**Request Body:**

```typescript
interface HideEntityBody {
  entityType: string; // scene, performer, studio, tag, group, gallery, image or clip
  entityId: string; // numeric Stash id
  instanceId: string; // required: the entity's Stash instance
}
```

A hide without `instanceId` answers 400 "instanceId is required"; one naming no configured instance answers 400 "Invalid instanceId". The hide applies to that instance only: an entity with the same id on another Stash server stays visible. An entity the user cannot see answers 404.

**Controller:** `hideEntity` in `../controllers/user.ts`

---

### POST /api/user/hidden-entities/bulk

**Authentication:** Required

**Request Body:**

```typescript
interface HideEntitiesBody {
  entities: Array<{
    entityType: string;
    entityId: string;
    instanceId: string; // required, as for a single hide
  }>;
}
```

All or nothing: a target without `instanceId`, or with an unknown one, answers 400 naming it (`entities[1]: instanceId is required`), and a target the user cannot see answers 404 naming it; nothing is hidden in either case.

**Controller:** `hideEntities` in `../controllers/user.ts`

---

### DELETE /api/user/hidden-entities/all

**Authentication:** Required

**Controller:** `unhideAllEntities` in `../controllers/user.ts`

---

### DELETE /api/user/hidden-entities/:entityType/:entityId

**Authentication:** Required

**Query:** `instanceId` (optional): the hidden row's instance. Without it, the legacy row stored for every instance is removed.

**Controller:** `unhideEntity` in `../controllers/user.ts`

---

### GET /api/user/hidden-entities

**Authentication:** Required

**Query:** `entityType` (optional: `scene`, `performer`, `studio`, `tag`, `group`, `gallery`, `image` or `clip`), `page` (default 1), `per_page` (1 to 100, default 50). Anything else answers 400.

**Response:** `{ items, total, counts }`. `items` is the page's hidden rows, newest first; each has `entityType`, `entityId`, `instanceId` (as stored: `""` for a legacy hide of every instance), `hiddenAt`, `restricted` and `summary`. `summary` is `{ id, instanceId, name, imageUrl }` when the user could see the entity without their own hides, read from the instance it shows from, with `imageUrl` a proxy URL naming that instance; otherwise it is `null` and `restricted` is `true`. `total` counts the rows of the requested type (every type when none), and `counts` the rows of each type whatever was requested.

**Controller:** `getHiddenEntities` in `../controllers/user.ts`

---

### PUT /api/user/hide-confirmation

**Authentication:** Required

**Controller:** `updateHideConfirmation` in `../controllers/user.ts`

---

## Playlists

Playlist management endpoints for creating and organizing scene collections.

### GET /api/playlists/

**Authentication:** Required

The user's own playlists, each with its first four items and the item count this user can see. With `containsScene`, each playlist also says whether it holds that scene on that instance (`containsScene: boolean`; left out when not asked). A bare id, an empty value or a malformed instance answers 400 naming `containsScene`.

**Query Parameters:**

```typescript
interface GetUserPlaylistsQuery {
  /** A scene as "id:instanceId" */
  containsScene?: string;
}
```

**Response:**

```typescript
interface GetUserPlaylistsResponse {
  playlists: PlaylistSummary[];
}
```

**Controller:** `getUserPlaylists` in `../controllers/playlist.ts`

---

### GET /api/playlists/shared

**Authentication:** Required

Playlists other users shared with a group this user belongs to, with the previews and count this user can see. Takes `containsScene` as `GET /api/playlists/` does.

**Response:**

```typescript
interface GetSharedPlaylistsResponse {
  playlists: SharedPlaylistData[];
}
```

**Controller:** `getSharedPlaylists` in `../controllers/playlist.ts`

---

### GET /api/playlists/:id

**Authentication:** Required

**URL Parameters:**

```typescript
interface GetPlaylistParams {
  id: string;
}
```

**Query:** `page` (from 1, default 1), `per_page` (1 to 100, default 50), `sort` and `direction`. Anything else answers 400.

- `sort`: `position` (the playlist's own order, the default), `added_at` (when each item was added, ties in playlist order), or any scene sort except `scene_index` (`title`, `rating`, `last_played_at`, ...), which orders the items as the Scenes page orders scenes, with the viewer's own rating and history, ties in playlist order. A random order is `random_<seed>`: the same seed gives the same order on every page. A bare `random` uses the user's daily seed. An unknown sort answers 400 "Unknown sort".
- `direction`: `ASC` or `DESC`. When absent, `ASC` for `position` and `added_at`, `DESC` for a scene sort.
- The response always holds one page of the items the viewer can see, each with its scene: page 1 of 50 when the request names no page. Items the viewer cannot see (hidden, restricted, deleted from Stash, or on an instance they do not use) are never listed.
- `unavailableItems` is how many of the playlist's items the owner cannot see; for a recipient it is always 0 (they are told nothing about those items). `POST /api/playlists/:id/items/remove-unavailable` removes the ones deleted from Stash.

**Response:**

```typescript
interface GetPlaylistResponse {
  playlist: PlaylistData & { items: PlaylistItemWithScene[] };
  totalItems: number; // the items the viewer can see
  unavailableItems: number; // the owner's items they cannot see; 0 for a recipient
  page: number;
  perPage: number;
  sort: string; // the sort read: a random one as random_<seed>
  direction: "ASC" | "DESC";
  isOwner: boolean;
  accessLevel: "owner" | "shared";
  sharedViaGroups?: string[];
  owner: { id: number; username: string }; // who owns the playlist
}
```

A share counts only while its owner holds Can Share (an admin has no bypass here): without it a recipient gets 404 here and the playlist leaves `GET /api/playlists/shared`, and both return when the permission does.

**Controller:** `getPlaylist` in `../controllers/playlist.ts`

---

### GET /api/playlists/:id/queue

**Authentication:** Required

The play queue: every item of the playlist the viewer can see, in the order `GET /api/playlists/:id` shows them under the same `sort` and `direction` (a random order as `random_<seed>`), each with the fields the player's queue shows. `position` is the entry's index in that order. The title falls back to the file name; the screenshot goes through Peek's proxy; the studio's name is left out (`studio: null`) when the viewer may not see the studio. The owner and the users the playlist is shared with can read it, each seeing only what their own exclusions and instances allow; anyone else gets 404. Takes no paging: anything but `sort` and `direction` answers 400.

**Query:** `sort` and `direction`, as `GET /api/playlists/:id` takes them (position ASC when absent).

**Response:**

```typescript
interface GetPlaylistQueueResponse {
  entries: Array<{
    sceneId: string;
    instanceId: string;
    position: number; // 0-based, in the shown order
    scene: {
      title: string | null;
      paths: { screenshot: string | null };
      files: [{ duration: number | null; basename: string | null }] | [];
      studio: { name: string } | null;
    };
  }>;
}
```

**Controller:** `getPlaylistQueue` in `../controllers/playlist.ts`

---

### POST /api/playlists/

**Authentication:** Required

**Request Body:**

```typescript
interface CreatePlaylistRequest {
  name: string;
  description?: string;
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

### POST /api/playlists/:id/duplicate

**Authentication:** Required

Copies a playlist the user owns or has shared with them into a new playlist they own, named "<name> (Copy)". The copy holds only the scenes the requesting user can see (not deleted, not hidden or restricted for them, on an instance they use), numbered from 0 in the original's order. The response's `_count.items` is the number of scenes copied. Answers 404 when the playlist is neither theirs nor shared with them.

**URL Parameters:**

```typescript
interface GetPlaylistParams {
  id: string;
}
```

**Response (201):**

```typescript
interface DuplicatePlaylistResponse {
  playlist: PlaylistData;
}
```

**Controller:** `duplicatePlaylist` in `../controllers/playlist.ts`

---

### POST /api/playlists/:id/items

**Authentication:** Required

Adds the scene on the named instance; the server never guesses one. Owners and users the playlist is shared with can add. Answers 400 when `sceneId` or `instanceId` is missing, 404 when the playlist is not theirs or the scene is not one this user can see (missing, hidden, restricted or on an instance they do not use), and 409 when that scene on that instance is already in the playlist.

**Request Body:**

```typescript
interface AddSceneToPlaylistRequest {
  sceneId: string;
  instanceId: string;
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
  instanceId: string;
  sceneId: string;
  position: number;
  addedAt: Date;
};
}
```

**Controller:** `addSceneToPlaylist` in `../controllers/playlist.ts`

---

### POST /api/playlists/:id/items/bulk

**Authentication:** Required

Adds up to 250 scenes (a page) in one request, in the order given, after the playlist's last item. A scene named twice is added once; scenes already in the playlist and scenes this user cannot see (missing, hidden, restricted or on an instance they do not use) are skipped and counted. Owners and users the playlist is shared with can add. Answers 400 when `scenes` is not an array of 1 to 250 entries or an entry lacks its `sceneId` or `instanceId` (the error names the entry, as `scenes[1].instanceId is required`), with nothing added, and 404 when the playlist is not theirs.

**Request Body:**

```typescript
interface AddScenesToPlaylistRequest {
  scenes: { sceneId: string; instanceId: string }[];
}
```

**Response:**

```typescript
interface AddScenesToPlaylistResponse {
  added: number;
  alreadyInPlaylist: number;
  /** Scenes the requester cannot see or that no longer exist */
  unavailable: number;
}
```

**Controller:** `addScenesToPlaylist` in `../controllers/playlist.ts`

---

### POST /api/playlists/:id/items/remove-unavailable

**Authentication:** Required

Removes the playlist's items whose scene is deleted from Stash (owner only): the cached scene is marked deleted, or there is none while the item's server is enabled and synced. Items that are hidden, restricted, or on a server the owner does not use or an admin disabled stay, since they may come back. The other items keep their positions. One statement. Answers 404 when the playlist is not the user's (a recipient's request is refused this way), with nothing removed.

**Response:**

```typescript
interface RemoveUnavailableItemsResponse {
  removed: number;
}
```

**Controller:** `removeUnavailablePlaylistItems` in `../controllers/playlist.ts`

---

### DELETE /api/playlists/:id/items/:sceneId?instanceId=

**Authentication:** Required

Removes the item of that scene on that instance only (owner only); an item of the same scene id on another instance stays. Answers 400 without `instanceId`, and 404 when the playlist is not the user's or the item is not in it.

**URL Parameters:**

```typescript
interface RemoveSceneFromPlaylistParams {
  id: string;
  sceneId: string;
}
```

**Query Parameters:**

```typescript
interface RemoveSceneFromPlaylistQuery {
  instanceId: string;
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

### POST /api/playlists/:id/items/remove

**Authentication:** Required

Removes several items by item id (owner only), in one statement. Ids of another playlist's items, or of no item, are ignored and not counted. The other items keep their positions. Answers 400 unless `itemIds` is an array of 1 to 250 positive integers, and 404 when the playlist is not the user's (a recipient's request is refused this way), with nothing removed.

**Request Body:**

```typescript
interface RemovePlaylistItemsRequest {
  itemIds: number[]; // PlaylistItemWithScene.id
}
```

**Response:**

```typescript
interface RemovePlaylistItemsResponse {
  removed: number;
}
```

**Controller:** `removePlaylistItems` in `../controllers/playlist.ts`

---

### PUT /api/playlists/:id/items/:itemId/position

**Authentication:** Required

Moves one item, named by its item id, to `index` among the items the owner can see, in playlist order (the order the page shows when sorted by playlist order); an `index` past the end puts it after the last one. Every item of the playlist is then numbered 0 to n-1, and the items the owner cannot see (hidden, restricted, deleted from Stash or on an instance they do not use) keep their places between their neighbours. The read and the renumbering are one transaction, so two moves at once both land. Answers 400 when `index` is not a non-negative integer or `itemId` is not a positive integer, and 404 when the playlist is not the user's (a recipient's move is refused this way), or the item is not in it or not visible to the owner, with nothing moved.

**URL Parameters:**

```typescript
interface MovePlaylistItemParams {
  id: string;
  itemId: string;
}
```

**Request Body:**

```typescript
interface MovePlaylistItemRequest {
  index: number;
}
```

**Response:**

```typescript
interface MovePlaylistItemResponse {
  success: true;
}
```

**Controller:** `movePlaylistItem` in `../controllers/playlist.ts`

---

### POST /api/playlists/:id/sort

**Authentication:** Required

Saves a view sort as the playlist's order (owner only): "Save as playlist order". `sort` and `direction` are the ones `GET /api/playlists/:id` read and answered, a random order as `random_<seed>`, so the saved order is the order the page showed. The items the owner can see take positions 0 to n-1 in that order; the items the owner cannot see (hidden, restricted, deleted from Stash or on an instance they do not use) follow, in their own order, so they keep it if they come back. No item list is sent. The renumbering is one statement. Answers 400 for a missing or unknown `sort` (`scene_index` included) or `direction`, or any other field, and 404 when the playlist is not the user's (a recipient's save is refused this way), with nothing written.

**Request Body:**

```typescript
interface SortPlaylistRequest {
  sort: string; // as GET /api/playlists/:id takes it
  direction: "ASC" | "DESC";
}
```

**URL Parameters:**

```typescript
interface GetPlaylistParams {
  id: string;
}
```

**Response:**

```typescript
interface SortPlaylistResponse {
  success: true;
  itemCount: number; // the items renumbered, the ones the owner cannot see included
}
```

**Controller:** `sortPlaylist` in `../controllers/playlist.ts`

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

### POST /api/watch-history/save-activity

**Authentication:** Required

**Controller:** `saveActivity` in `../controllers/watchHistory.ts`

**Body:** `sceneId`, `instanceId` (required); optional `resumeTime` and `playDuration`. Scene ids repeat across Stash servers, so the write names the scene's instance; a missing or empty `instanceId` answers 400, and a scene the user cannot see on that instance answers 404.

---

### POST /api/watch-history/increment-play-count

**Authentication:** Required

**Controller:** `incrementPlayCount` in `../controllers/watchHistory.ts`

**Body:** `sceneId`, `instanceId` (required). Scene ids repeat across Stash servers, so the write names the scene's instance; a missing or empty `instanceId` answers 400, and a scene the user cannot see on that instance answers 404.

Optional `playToken` (1 to 64 characters; anything else answers 400): the player makes one per viewing of a scene and sends the same token on every retry. The server counts a token once per user and scene for 10 minutes, so a retry after a lost answer adds no second play; a repeat answers the current row and writes nothing. A request without a token always counts. Tokens are kept in memory, at most 5,000.

---

### POST /api/watch-history/increment-o

**Authentication:** Required

**Controller:** `incrementOCounter` in `../controllers/watchHistory.ts`

**Body:** `sceneId`, `instanceId` (required). Scene ids repeat across Stash servers, so the write names the scene's instance; a missing or empty `instanceId` answers 400, and a scene the user cannot see on that instance answers 404.

---

### GET /api/watch-history/scenes

**Authentication:** Required (503 `ready: false` while none of the user's instances has finished its first sync)

**Controller:** `getWatchedScenes` in `../controllers/watchHistory.ts`

**Query:**

- `view`: `all` (default: played, watched for any time, or left with a resume point; a scene with only an O is not listed), `in_progress` (a resume point before the final 10% of the scene with at least 2% of it watched; any resume point when the length is unknown) or `completed` (played at least once, and the last session finished or stopped within the final 10% of the scene)
- `sort`: `recent` (default: last played first, scenes never dated last), `most_watched` (play count) or `longest_duration` (time watched)
- `page` (default 1), `per_page` (1 to 250, default 24)
- `count`: `false` skips the totals; default `true`

Unknown parameters or values answer 400 naming each one.

**Response:** `{ scenes: NormalizedScene[], total: number | null, totalPlayDuration: number | null }`. Only scenes the user can see are listed and counted: deleted scenes, hidden or restricted ones and scenes on instances the user does not see are left out. The same scene id on two instances is two entries. `total` and `totalPlayDuration` (seconds) cover the whole view, or are null with `count=false`.

---

### DELETE /api/watch-history/

**Authentication:** Required

**Controller:** `clearAllWatchHistory` in `../controllers/watchHistory.ts`

---

### GET /api/watch-history/:sceneId

**Authentication:** Required

**Query:** `instanceId` (required). Scene ids repeat across Stash servers, so the read names the scene's instance; a missing or malformed value answers 400.

**Controller:** `getWatchHistory` in `../controllers/watchHistory.ts`

---

## Image View History

Image view history tracking endpoints.

### POST /api/image-view-history/increment-o

**Authentication:** Required

**Body:** `imageId`, `instanceId` (required). Image ids repeat across Stash servers, so the write names the image's instance; a missing or empty `instanceId` answers 400, and an image the user cannot see on that instance answers 404.

**Controller:** `incrementImageOCounter` in `../controllers/imageViewHistory.ts`

---

### POST /api/image-view-history/view

**Authentication:** Required

**Body:** `imageId`, `instanceId` (required). Image ids repeat across Stash servers, so the write names the image's instance; a missing or empty `instanceId` answers 400, and an image the user cannot see on that instance answers 404.

**Controller:** `recordImageView` in `../controllers/imageViewHistory.ts`

---

### GET /api/image-view-history/:imageId

**Authentication:** Required

**Query:** `instanceId` (required). Image ids repeat across Stash servers, so the read names the image's instance; a missing or malformed value answers 400.

**Controller:** `getImageViewHistory` in `../controllers/imageViewHistory.ts`

---

## Ratings

Rating and favorite management endpoints.

### PUT /api/ratings/scene/:sceneId

**Authentication:** Required

**Body:** `instanceId` (required) and `rating` and/or `favorite`. The write names the entity's instance, since ids repeat across Stash servers; a missing or empty `instanceId` answers 400, and an entity the user cannot see on that instance answers 404.

**Controller:** `updateSceneRating` in `../controllers/ratings.ts`

---

### PUT /api/ratings/performer/:performerId

**Authentication:** Required

**Body:** `instanceId` (required) and `rating` and/or `favorite`. The write names the entity's instance, since ids repeat across Stash servers; a missing or empty `instanceId` answers 400, and an entity the user cannot see on that instance answers 404.

**Controller:** `updatePerformerRating` in `../controllers/ratings.ts`

---

### PUT /api/ratings/studio/:studioId

**Authentication:** Required

**Body:** `instanceId` (required) and `rating` and/or `favorite`. The write names the entity's instance, since ids repeat across Stash servers; a missing or empty `instanceId` answers 400, and an entity the user cannot see on that instance answers 404.

**Controller:** `updateStudioRating` in `../controllers/ratings.ts`

---

### PUT /api/ratings/tag/:tagId

**Authentication:** Required

**Body:** `instanceId` (required) and `rating` and/or `favorite`. The write names the entity's instance, since ids repeat across Stash servers; a missing or empty `instanceId` answers 400, and an entity the user cannot see on that instance answers 404.

**Controller:** `updateTagRating` in `../controllers/ratings.ts`

---

### PUT /api/ratings/gallery/:galleryId

**Authentication:** Required

**Body:** `instanceId` (required) and `rating` and/or `favorite`. The write names the entity's instance, since ids repeat across Stash servers; a missing or empty `instanceId` answers 400, and an entity the user cannot see on that instance answers 404.

**Controller:** `updateGalleryRating` in `../controllers/ratings.ts`

---

### PUT /api/ratings/group/:groupId

**Authentication:** Required

**Body:** `instanceId` (required) and `rating` and/or `favorite`. The write names the entity's instance, since ids repeat across Stash servers; a missing or empty `instanceId` answers 400, and an entity the user cannot see on that instance answers 404.

**Controller:** `updateGroupRating` in `../controllers/ratings.ts`

---

### PUT /api/ratings/image/:imageId

**Authentication:** Required

**Body:** `instanceId` (required) and `rating` and/or `favorite`. The write names the entity's instance, since ids repeat across Stash servers; a missing or empty `instanceId` answers 400, and an entity the user cannot see on that instance answers 404.

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

A list request (`POST /api/library/<entities>`) answers one page and the list's total, `find<Entities>.count`. With `filter.count: false` it answers the page alone and `count` is `null`: the client sends it on a page change of a list whose total it already holds, so the count statement is not run again. `GET /api/clips` takes the same flag as `count=false`, and then answers `total` and `totalPages` as `null`. Any other value of either answers 400. A detail page's tab counts (`GET /api/library/<entities>/:id/counts`) always count.

### POST /api/library/galleries

**Authentication:** Required

**Controller:** `findGalleries` in `../../controllers/library/galleries.ts`

---

### POST /api/library/galleries/minimal

**Authentication:** Required

**Controller:** `findGalleriesMinimal` in `../../controllers/library/galleries.ts`

---

### GET /api/library/galleries/:id/counts

**Authentication:** Required

**Controller:** `getGalleryCounts` in `../../controllers/library/galleries.ts`

The tab counts of a gallery page, as the viewer sees them: each is the total of the tab's list. `instanceId` (required) names the entity's server; Any other query answers 400; an entity the viewer cannot see answers 404.

---

### POST /api/library/groups

**Authentication:** Required

**Controller:** `findGroups` in `../../controllers/library/groups.ts`

---

### POST /api/library/groups/minimal

**Authentication:** Required

**Controller:** `findGroupsMinimal` in `../../controllers/library/groups.ts`

---

### GET /api/library/groups/:id/counts

**Authentication:** Required

**Controller:** `getGroupCounts` in `../../controllers/library/groups.ts`

The tab counts of a collection page, as the viewer sees them: each is the total of the tab's list. `instanceId` (required) names the entity's server; Any other query answers 400; an entity the viewer cannot see answers 404.

---

### POST /api/library/images

**Authentication:** Required

**Controller:** `findImages` in `../../controllers/library/images.ts`

---

### POST /api/library/performers

**Authentication:** Required

**Controller:** `findPerformers` in `../../controllers/library/performers.ts`

---

### POST /api/library/performers/minimal

**Authentication:** Required

**Controller:** `findPerformersMinimal` in `../../controllers/library/performers.ts`

---

### GET /api/library/performers/:id/counts

**Authentication:** Required

**Controller:** `getPerformerCounts` in `../../controllers/library/performers.ts`

The tab counts of a performer page, as the viewer sees them: each is the total of the tab's list. `instanceId` (required) names the entity's server; Any other query answers 400; an entity the viewer cannot see answers 404.

---

### POST /api/library/scenes

**Authentication:** Required

**Controller:** `findScenes` in `../../controllers/library/scenes.ts`

---

### GET /api/library/scenes/:id/similar

**Authentication:** Required

**Query:** `instanceId` (required): the seed scene's instance, since ids repeat across Stash servers; a missing or malformed value answers 400. `page` is optional; any other parameter answers 400. A seed the user cannot see answers 404.

**Controller:** `findSimilarScenes` in `../../controllers/library/scenes.ts`

---

### GET /api/library/scenes/recommended

**Authentication:** Required

**Controller:** `getRecommendedScenes` in `../../controllers/library/scenes.ts`

---

### POST /api/library/studios

**Authentication:** Required

**Controller:** `findStudios` in `../../controllers/library/studios.ts`

---

### POST /api/library/studios/minimal

**Authentication:** Required

**Controller:** `findStudiosMinimal` in `../../controllers/library/studios.ts`

---

### GET /api/library/studios/:id/counts

**Authentication:** Required

**Controller:** `getStudioCounts` in `../../controllers/library/studios.ts`

The tab counts of a studio page, as the viewer sees them: each is the total of the tab's list. `instanceId` (required) names the entity's server; `includeSubStudios=true` counts the sub-studios' content. Any other query answers 400; an entity the viewer cannot see answers 404.

---

### POST /api/library/tags

**Authentication:** Required

**Controller:** `findTags` in `../../controllers/library/tags.ts`

---

### POST /api/library/tags/minimal

**Authentication:** Required

**Controller:** `findTagsMinimal` in `../../controllers/library/tags.ts`

---

### GET /api/library/tags/:id/counts

**Authentication:** Required

**Controller:** `getTagCounts` in `../../controllers/library/tags.ts`

The tab counts of a tag page, as the viewer sees them: each is the total of the tab's list. `instanceId` (required) names the entity's server; `includeSubTags=true` counts the sub-tags' content. Any other query answers 400; an entity the viewer cannot see answers 404.

---
