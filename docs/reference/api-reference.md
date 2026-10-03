# API Reference

> Generated from the server's source by `cd server && npm run generate-api-docs`; do not edit it by hand.
> Last updated: 2026-10-03

**Authentication** names who may call a route: **None** (anyone), **Session** (a signed-in Peek user), **Admin** (a signed-in admin), **Session or signed link** (a session, or the personal link the external player gets), or **None until setup starts, then Admin** (open to the setup wizard while Peek has no user and no Stash server).

## Contents

- [Server](#server)
- [Auth](#auth)
- [Setup](#setup)
- [User](#user)
- [User Groups](#user-groups)
- [Library](#library)
- [Clips](#clips)
- [Timeline](#timeline)
- [Playback](#playback)
- [Media Proxy](#media-proxy)
- [Playlists](#playlists)
- [Downloads](#downloads)
- [Ratings](#ratings)
- [Watch History](#watch-history)
- [Image View History](#image-view-history)
- [User Stats](#user-stats)
- [Carousels](#carousels)
- [Custom Themes](#custom-themes)
- [Sync](#sync)
- [Exclusions](#exclusions)
- [Admin](#admin)

## Server

Health check, version, and server statistics.

### GET /api/health

Health check (no auth). Proves Node answers through nginx and nothing more: no database query, per the homelab health-check convention.

**Authentication:** None

**Handler:** inline in `server/initializers/api.ts`

---

### GET /api/version

Version endpoint (no auth required)

**Authentication:** None

**Handler:** inline in `server/initializers/api.ts`

---

### GET /api/stats

Server stats endpoint (admin only - authenticated)

**Authentication:** Admin

**Response:**

```typescript
interface GetStatsResponse {
  system: StatsSystemInfo;
  process: StatsProcessInfo;
  cache: StatsCacheInfo;
  database: StatsDatabaseInfo;
}
```

**Handler:** `getStats` in `server/controllers/stats.ts`

---

### POST /api/stats/refresh-cache

Refresh cache endpoint (admin only)

**Authentication:** Admin

**Response:**

```typescript
interface RefreshCacheResponse {
  success: boolean;
  message: string;
  error?: string;
}
```

**Handler:** `refreshCache` in `server/controllers/stats.ts`

---

## Auth

Sign in and out, the signed-in user, and password recovery with a recovery key.

### POST /api/auth/login

Login endpoint

**Authentication:** None

**Handler:** inline in `server/routes/auth.ts`

---

### POST /api/auth/logout

Logout endpoint

**Authentication:** None

**Handler:** inline in `server/routes/auth.ts`

---

### GET /api/auth/me

Get current user

**Authentication:** Session

**Handler:** inline in `server/routes/auth.ts`

---

### GET /api/auth/check

Check if authenticated

**Authentication:** Session

**Handler:** inline in `server/routes/auth.ts`

---

### POST /api/auth/forgot-password/init

Forgot password - check username and get recovery method

**Authentication:** None

**Handler:** inline in `server/routes/auth.ts`

---

### POST /api/auth/forgot-password/reset

Forgot password - verify recovery key and set new password

**Authentication:** None

**Handler:** inline in `server/routes/auth.ts`

---

## Setup

The setup wizard, and the admin's management of Stash servers.

### GET /api/setup/status

**Authentication:** None

**Response:**

```typescript
interface GetSetupStatusResponse {
  setupComplete: boolean;
  hasUsers: boolean;
  hasStashInstance: boolean;
  stashInstanceCount: number;
}
```

**Handler:** `getSetupStatus` in `server/controllers/setup.ts`

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
    createdAt: string;
  };
}
```

**Handler:** `createFirstAdmin` in `server/controllers/setup.ts`

---

### POST /api/setup/test-stash-connection

**Authentication:** None until setup starts, then Admin

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
  version?: string;
  /** Stash's own error text; only the admin-only test of a saved instance sends it */
  details?: string;
}
```

**Handler:** `testStashConnection` in `server/controllers/setup.ts`

---

### POST /api/setup/create-stash-instance

**Authentication:** None until setup starts, then Admin

**Request Body:**

```typescript
interface CreateFirstStashInstanceRequest {
  name?: string;
  url: string;
  uiUrl?: string;
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
    uiUrl: string | null;
    enabled: boolean;
    createdAt: string;
  };
}
```

**Handler:** `createFirstStashInstance` in `server/controllers/setup.ts`

---

### GET /api/setup/stash-instance

The instance record carries Stash's address: admin only, like the Server settings tab that shows it

**Authentication:** Admin

**Response:**

```typescript
interface GetStashInstanceResponse {
  instance: {
    id: string;
    name: string;
    url: string;
    uiUrl: string | null;
    enabled: boolean;
    priority: number;
    createdAt: string;
    updatedAt: string;
  } | null;
  instanceCount: number;
}
```

**Handler:** `getStashInstance` in `server/controllers/setup.ts`

---

### GET /api/setup/stash-instances

**Authentication:** Admin

**Response:**

```typescript
interface GetAllStashInstancesResponse {
  instances: StashInstanceData[];
}
```

**Handler:** `getAllStashInstances` in `server/controllers/setup.ts`

---

### POST /api/setup/stash-instance

**Authentication:** Admin

**Request Body:**

```typescript
interface CreateStashInstanceRequest {
  name: string;
  description?: string;
  url: string;
  uiUrl?: string;
  apiKey: string;
  enabled?: boolean;
  priority?: number;
}
```

**Response:**

```typescript
interface CreateStashInstanceResponse {
  success: true;
  instance: StashInstanceData;
  /**
   * The instance's first sync: "started", "queued" to start once the running
   * sync ends, or "none" for a disabled instance
   */
  sync: "started" | "queued" | "none";
}
```

**Handler:** `createStashInstance` in `server/controllers/setup.ts`

---

### PUT /api/setup/stash-instance/:id

**Authentication:** Admin

**Request Body:**

```typescript
interface UpdateStashInstanceRequest {
  name?: string;
  description?: string;
  url?: string;
  uiUrl?: string;
  apiKey?: string;
  enabled?: boolean;
  priority?: number;
}
```

**URL Parameters:**

```typescript
interface UpdateStashInstanceParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface UpdateStashInstanceResponse {
  success: true;
  instance: StashInstanceData;
  /**
   * The re-sync a new URL or API key needs, or the first sync of an instance
   * enabled before one ever finished: "started", "queued" to start once the
   * running sync ends, or "none" (nothing to fetch, or disabled)
   */
  sync: "started" | "queued" | "none";
}
```

**Handler:** `updateStashInstance` in `server/controllers/setup.ts`

---

### POST /api/setup/stash-instance/:id/test-connection

**Authentication:** Admin

**Request Body:**

```typescript
interface TestSavedStashInstanceRequest {
  url?: string;
  apiKey?: string;
}
```

**URL Parameters:**

```typescript
interface TestSavedStashInstanceParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface TestStashConnectionResponse {
  success: boolean;
  message?: string;
  error?: string;
  version?: string;
  /** Stash's own error text; only the admin-only test of a saved instance sends it */
  details?: string;
}
```

**Handler:** `testSavedStashInstance` in `server/controllers/setup.ts`

---

### DELETE /api/setup/stash-instance/:id

**Authentication:** Admin

**Request Body:** `never`

**URL Parameters:**

```typescript
interface DeleteStashInstanceParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface DeleteStashInstanceResponse {
  success: true;
  message: string;
}
```

**Handler:** `deleteStashInstance` in `server/controllers/setup.ts`

---

## User

The signed-in user's settings, filter presets, hidden items, Stash server selection and permissions; user management for admins.

### GET /api/user/settings

**Authentication:** Session

**Response:**

```typescript
interface GetUserSettingsResponse {
  settings: {
    preferredPreviewQuality: string | null;
    /** A built-in key, the user's own `custom-<id>`, or null when none is chosen */
    theme: string | null;
    carouselPreferences: CarouselPreference[];
    navPreferences: NavPreference[] | null;
    minimumPlayPercent: number;
    syncToStash: boolean;
    hideConfirmationDisabled: boolean;
    unitPreference: string;
    wallPlayback: string;
    tableColumnDefaults: Record<string, TableColumnsConfig> | null;
    cardDisplaySettings: CardDisplaySettings;
    landingPagePreference: LandingPagePreference;
    lightboxDoubleTapAction: string;
  };
}
```

**Handler:** `getUserSettings` in `server/controllers/user.ts`

---

### PUT /api/user/settings

**Authentication:** Session

**Request Body:**

```typescript
interface UpdateUserSettingsBody {
  preferredPreviewQuality?: string;
  /** A built-in key or the target user's own `custom-<id>`; null clears it */
  theme?: string | null;
  carouselPreferences?: CarouselPreference[];
  navPreferences?: NavPreference[];
  minimumPlayPercent?: number;
  syncToStash?: boolean;
  unitPreference?: string;
  wallPlayback?: string;
  tableColumnDefaults?: Record<string, TableColumnsConfig> | null;
  cardDisplaySettings?: CardDisplaySettings;
  landingPagePreference?: LandingPagePreference | null;
  lightboxDoubleTapAction?: string;
}
```

**URL Parameters:**

```typescript
interface UpdateUserSettingsParams extends Record<string, string> {
  userId: string;
}
```

**Response:**

```typescript
interface UpdateUserSettingsResponse {
  success: true;
  settings: {
    theme: string | null;
    carouselPreferences: CarouselPreference[];
    navPreferences: NavPreference[] | null;
    minimumPlayPercent: number;
    syncToStash: boolean;
    wallPlayback: string;
    tableColumnDefaults: Record<string, TableColumnsConfig> | null;
    cardDisplaySettings: CardDisplaySettings;
    landingPagePreference: LandingPagePreference;
    lightboxDoubleTapAction: string;
  };
}
```

**Handler:** `updateUserSettings` in `server/controllers/user.ts`

---

### POST /api/user/change-password

**Authentication:** Session

**Request Body:**

```typescript
interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}
```

**Response:**

```typescript
interface ChangePasswordResponse {
  success: true;
  message: string;
}
```

**Handler:** `changePassword` in `server/controllers/user.ts`

---

### GET /api/user/recovery-key

**Authentication:** Session

**Response:**

```typescript
interface GetRecoveryKeyResponse {
  hasRecoveryKey: boolean;
}
```

**Handler:** `getRecoveryKey` in `server/controllers/user.ts`

---

### POST /api/user/recovery-key/regenerate

**Authentication:** Session

**Request Body:**

```typescript
interface RegenerateRecoveryKeyBody {
  currentPassword: string;
}
```

**Response:**

```typescript
interface RegenerateRecoveryKeyResponse {
  recoveryKey: string;
}
```

**Handler:** `regenerateRecoveryKey` in `server/controllers/user.ts`

---

### GET /api/user/setup-status

**Authentication:** Session

**Response:**

```typescript
{ setupCompleted: boolean; instances: unknown[]; instanceCount: number; }
```

**Handler:** `getSetupStatus` in `server/controllers/user.ts`

---

### POST /api/user/complete-setup

**Authentication:** Session

**Request Body:**

```typescript
interface CompleteSetupBody {
  selectedInstanceIds?: string[];
}
```

**Response:**

```typescript
interface CompleteSetupResponse {
  success: true;
  recoveryKey: string | null;
}
```

**Handler:** `completeSetup` in `server/controllers/user.ts`

---

### GET /api/user/filter-presets

**Authentication:** Session

**Response:**

```typescript
interface GetFilterPresetsResponse {
  presets: FilterPresets;
}
```

**Handler:** `getFilterPresets` in `server/controllers/user.ts`

---

### POST /api/user/filter-presets

**Authentication:** Session

**Request Body:**

```typescript
interface SaveFilterPresetBody {
  artifactType: string;
  context?: string;
  name: string;
  filters: unknown;
  sort: string;
  direction: string;
  viewMode?: string;
  zoomLevel?: string;
  gridDensity?: string;
  tableColumns?: TableColumnsConfig | null;
  perPage?: number | null;
  setAsDefault?: boolean;
}
```

**Response:**

```typescript
interface SaveFilterPresetResponse {
  success: true;
  preset: FilterPreset;
}
```

**Handler:** `saveFilterPreset` in `server/controllers/user.ts`

---

### DELETE /api/user/filter-presets/:artifactType/:presetId

**Authentication:** Session

**Request Body:** `never`

**URL Parameters:**

```typescript
interface DeleteFilterPresetParams extends Record<string, string> {
  artifactType: string;
  presetId: string;
}
```

**Response:**

```typescript
interface DeleteFilterPresetResponse {
  success: true;
}
```

**Handler:** `deleteFilterPreset` in `server/controllers/user.ts`

---

### GET /api/user/default-presets

**Authentication:** Session

**Response:**

```typescript
interface GetDefaultFilterPresetsResponse {
  defaults: DefaultFilterPresets;
}
```

**Handler:** `getDefaultFilterPresets` in `server/controllers/user.ts`

---

### PUT /api/user/default-preset

**Authentication:** Session

**Request Body:**

```typescript
interface SetDefaultFilterPresetBody {
  context: string;
  presetId?: string;
}
```

**Response:**

```typescript
interface SetDefaultFilterPresetResponse {
  success: true;
  defaults: DefaultFilterPresets;
}
```

**Handler:** `setDefaultFilterPreset` in `server/controllers/user.ts`

---

### GET /api/user/permissions

User's own permissions

**Authentication:** Session

**Response:**

```typescript
interface GetMyPermissionsResponse {
  permissions: {
    canShare: boolean;
    canDownloadFiles: boolean;
    canDownloadPlaylists: boolean;
    sources: {
      canShare: string;
      canDownloadFiles: string;
      canDownloadPlaylists: string;
    };
  };
}
```

**Handler:** `getUserPermissions` in `server/controllers/user.ts`

---

### GET /api/user/all

**Authentication:** Admin

**Response:**

```typescript
interface GetAllUsersResponse {
  users: Array<{
    id: number;
    username: string;
    role: string;
    createdAt: string;
    updatedAt: string;
    syncToStash: boolean;
    groups: Array<{ id: number; name: string }>;
  }>;
}
```

**Handler:** `getAllUsers` in `server/controllers/user.ts`

---

### POST /api/user/create

**Authentication:** Admin

**Request Body:**

```typescript
interface CreateUserBody {
  username: string;
  password: string;
  role?: string;
}
```

**Response:**

```typescript
interface CreateUserResponse {
  success: true;
  user: {
    id: number;
    username: string;
    role: string;
    createdAt: string;
  };
}
```

**Handler:** `createUser` in `server/controllers/user.ts`

---

### DELETE /api/user/:userId

**Authentication:** Admin

**Request Body:** `never`

**URL Parameters:**

```typescript
interface DeleteUserParams extends Record<string, string> {
  userId: string;
}
```

**Response:**

```typescript
interface DeleteUserResponse {
  success: true;
  message: string;
}
```

**Handler:** `deleteUser` in `server/controllers/user.ts`

---

### PUT /api/user/:userId/role

**Authentication:** Admin

**Request Body:**

```typescript
interface UpdateUserRoleBody {
  role: string;
}
```

**URL Parameters:**

```typescript
interface UpdateUserRoleParams extends Record<string, string> {
  userId: string;
}
```

**Response:**

```typescript
interface UpdateUserRoleResponse {
  success: true;
  user: {
    id: number;
    username: string;
    role: string;
    updatedAt: string;
  };
}
```

**Handler:** `updateUserRole` in `server/controllers/user.ts`

---

### PUT /api/user/:userId/settings

Admin can update any user's settings

**Authentication:** Admin

**Request Body:**

```typescript
interface UpdateUserSettingsBody {
  preferredPreviewQuality?: string;
  /** A built-in key or the target user's own `custom-<id>`; null clears it */
  theme?: string | null;
  carouselPreferences?: CarouselPreference[];
  navPreferences?: NavPreference[];
  minimumPlayPercent?: number;
  syncToStash?: boolean;
  unitPreference?: string;
  wallPlayback?: string;
  tableColumnDefaults?: Record<string, TableColumnsConfig> | null;
  cardDisplaySettings?: CardDisplaySettings;
  landingPagePreference?: LandingPagePreference | null;
  lightboxDoubleTapAction?: string;
}
```

**URL Parameters:**

```typescript
interface UpdateUserSettingsParams extends Record<string, string> {
  userId: string;
}
```

**Response:**

```typescript
interface UpdateUserSettingsResponse {
  success: true;
  settings: {
    theme: string | null;
    carouselPreferences: CarouselPreference[];
    navPreferences: NavPreference[] | null;
    minimumPlayPercent: number;
    syncToStash: boolean;
    wallPlayback: string;
    tableColumnDefaults: Record<string, TableColumnsConfig> | null;
    cardDisplaySettings: CardDisplaySettings;
    landingPagePreference: LandingPagePreference;
    lightboxDoubleTapAction: string;
  };
}
```

**Handler:** `updateUserSettings` in `server/controllers/user.ts`

---

### POST /api/user/:userId/sync-from-stash

Admin can sync Stash data for any user

**Authentication:** Admin

**Request Body:**

```typescript
interface SyncFromStashBody {
  options?: {
    [K in keyof SyncFromStashOptions]?: Partial<SyncFromStashOptions[K]>;
  };
}
```

**URL Parameters:**

```typescript
interface SyncFromStashParams extends Record<string, string> {
  userId: string;
}
```

**Response:**

```typescript
interface SyncFromStashResponse {
  /** False when an instance's import failed; the others still ran */
  success: boolean;
  message: string;
  stats: SyncStats;
  /** The instances whose import failed (the name falls back to the id) */
  failedInstances: Array<{ id: string; name: string }>;
}
```

**Handler:** `syncFromStash` in `server/controllers/user.ts`

---

### GET /api/user/:userId/permissions

**Authentication:** Admin

**Request Body:** `never`

**URL Parameters:**

```typescript
interface GetUserPermissionsParams extends Record<string, string> {
  userId: string;
}
```

**Response:**

```typescript
interface GetMyPermissionsResponse {
  permissions: {
    canShare: boolean;
    canDownloadFiles: boolean;
    canDownloadPlaylists: boolean;
    sources: {
      canShare: string;
      canDownloadFiles: string;
      canDownloadPlaylists: string;
    };
  };
}
```

**Handler:** `getAnyUserPermissions` in `server/controllers/user.ts`

---

### PUT /api/user/:userId/permissions

**Authentication:** Admin

**Request Body:**

```typescript
interface UpdatePermissionOverridesBody {
  canShareOverride?: boolean | null;
  canDownloadFilesOverride?: boolean | null;
  canDownloadPlaylistsOverride?: boolean | null;
}
```

**URL Parameters:**

```typescript
interface GetUserPermissionsParams extends Record<string, string> {
  userId: string;
}
```

**Response:**

```typescript
{ success: true; permissions: unknown }
```

**Handler:** `updateUserPermissionOverrides` in `server/controllers/user.ts`

---

### GET /api/user/:userId/groups

Admin: get user's group memberships

**Authentication:** Admin

**Request Body:** `never`

**URL Parameters:**

```typescript
interface GetUserGroupMembershipsParams extends Record<string, string> {
  userId: string;
}
```

**Response:**

```typescript
interface GetUserGroupMembershipsResponse {
  groups: UserGroupSummary[];
}
```

**Handler:** `getUserGroupMemberships` in `server/controllers/user.ts`

---

### POST /api/user/:userId/reset-password

Admin: reset user password

**Authentication:** Admin

**Request Body:**

```typescript
interface AdminResetPasswordBody {
  newPassword: string;
}
```

**URL Parameters:**

```typescript
interface AdminResetPasswordParams extends Record<string, string> {
  userId: string;
}
```

**Response:**

```typescript
interface AdminResetPasswordResponse {
  success: true;
}
```

**Handler:** `adminResetPassword` in `server/controllers/user.ts`

---

### POST /api/user/:userId/regenerate-recovery-key

Admin: regenerate user recovery key

**Authentication:** Admin

**Request Body:** `never`

**URL Parameters:**

```typescript
interface AdminRegenerateRecoveryKeyParams extends Record<
  string,
  string
> {
  userId: string;
}
```

**Response:**

```typescript
interface AdminRegenerateRecoveryKeyResponse {
  recoveryKey: string;
}
```

**Handler:** `adminRegenerateRecoveryKey` in `server/controllers/user.ts`

---

### GET /api/user/:userId/restrictions

Get user's content restrictions

**Authentication:** Admin

**Request Body:** `never`

**URL Parameters:**

```typescript
interface GetUserRestrictionsParams extends Record<string, string> {
  userId: string;
}
```

**Response:**

```typescript
interface GetUserRestrictionsResponse {
  restrictions: StoredRestriction[];
}
```

**Handler:** `getUserRestrictions` in `server/controllers/user.ts`

---

### PUT /api/user/:userId/restrictions

Update user's content restrictions

**Authentication:** Admin

**Request Body:**

```typescript
interface UpdateUserRestrictionsBody {
  restrictions: UserRestriction[];
}
```

**URL Parameters:**

```typescript
interface GetUserRestrictionsParams extends Record<string, string> {
  userId: string;
}
```

**Response:**

```typescript
interface UpdateUserRestrictionsResponse {
  success: true;
  message: string;
  restrictions: unknown[];
}
```

**Handler:** `updateUserRestrictions` in `server/controllers/user.ts`

---

### DELETE /api/user/:userId/restrictions

Delete all user's content restrictions

**Authentication:** Admin

**Request Body:** `never`

**URL Parameters:**

```typescript
interface DeleteUserRestrictionsParams extends Record<string, string> {
  userId: string;
}
```

**Response:**

```typescript
interface DeleteUserRestrictionsResponse {
  success: true;
  message: string;
}
```

**Handler:** `deleteUserRestrictions` in `server/controllers/user.ts`

---

### POST /api/user/hidden-entities

Hide an entity

**Authentication:** Session

**Request Body:**

```typescript
interface HideEntityBody {
  entityType: string;
  entityId: string;
  /** The entity's Stash instance; a hide without one answers 400 */
  instanceId: string;
}
```

**Response:**

```typescript
interface HideEntityResponse {
  success: true;
  message: string;
}
```

**Handler:** `hideEntity` in `server/controllers/user.ts`

---

### POST /api/user/hidden-entities/bulk

Hide multiple entities

**Authentication:** Session

**Request Body:**

```typescript
interface HideEntitiesBody {
  entities: Array<{
    entityType: string;
    entityId: string;
    /** The entity's Stash instance; a target without one answers 400 */
    instanceId: string;
  }>;
}
```

**Response:**

```typescript
interface HideEntitiesResponse {
  success: true;
  message: string;
  successCount: number;
  failCount: number;
}
```

**Handler:** `hideEntities` in `server/controllers/user.ts`

---

### DELETE /api/user/hidden-entities/all

Unhide all entities (optionally filtered by type) - must be before :entityType/:entityId route

**Authentication:** Session

**Request Body:** `never`

**URL Parameters:** `Record<string, string>`

**Query Parameters:**

```typescript
interface UnhideAllEntitiesQuery extends Record<
  string,
  string | string[] | undefined
> {
  entityType?: string;
}
```

**Response:**

```typescript
interface UnhideAllEntitiesResponse {
  success: true;
  message: string;
  count: number;
}
```

**Handler:** `unhideAllEntities` in `server/controllers/user.ts`

---

### DELETE /api/user/hidden-entities/:entityType/:entityId

Unhide an entity

**Authentication:** Session

**Request Body:** `never`

**URL Parameters:**

```typescript
interface UnhideEntityParams extends Record<string, string> {
  entityType: string;
  entityId: string;
}
```

**Query Parameters:**

```typescript
interface UnhideEntityQuery extends Record<
  string,
  string | string[] | undefined
> {
  instanceId?: string;
}
```

**Response:**

```typescript
interface UnhideEntityResponse {
  success: true;
  message: string;
}
```

**Handler:** `unhideEntity` in `server/controllers/user.ts`

---

### GET /api/user/hidden-entities

One page of hidden entities, with counts per type

**Authentication:** Session

**Request Body:** `never`

**URL Parameters:** `Record<string, string>`

**Query Parameters:**

```typescript
interface GetHiddenEntitiesQuery extends Record<
  string,
  string | string[] | undefined
> {
  entityType?: string;
  /** 1-based, default 1 */
  page?: string;
  /** 1 to 100, default 50 */
  per_page?: string;
}
```

**Response:**

```typescript
interface GetHiddenEntitiesResponse {
  /** The page's rows, newest first */
  items: HiddenEntityItem[];
  /** Rows of the requested type (every hideable type when none) */
  total: number;
  /** The user's rows per hideable type, whatever type was requested */
  counts: Record<HiddenEntityType, number>;
}
```

**Handler:** `getHiddenEntities` in `server/controllers/user.ts`

---

### PUT /api/user/hide-confirmation

Update hide confirmation preference

**Authentication:** Session

**Request Body:**

```typescript
interface UpdateHideConfirmationBody {
  hideConfirmationDisabled: boolean;
}
```

**Response:**

```typescript
interface UpdateHideConfirmationResponse {
  success: true;
  hideConfirmationDisabled: boolean;
}
```

**Handler:** `updateHideConfirmation` in `server/controllers/user.ts`

---

### GET /api/user/stash-instances

Get user's selected instances

**Authentication:** Session

**Response:**

```typescript
{ selectedInstanceIds: string[]; availableInstances: unknown[] }
```

**Handler:** `getUserStashInstances` in `server/controllers/user.ts`

---

### PUT /api/user/stash-instances

Update user's instance selection

**Authentication:** Session

**Request Body:**

```typescript
interface UpdateUserStashInstancesBody {
  instanceIds: string[];
}
```

**Response:**

```typescript
{ success: true; selectedInstanceIds: string[] }
```

**Handler:** `updateUserStashInstances` in `server/controllers/user.ts`

---

## User Groups

User groups and their members (admin only, except your own).

### GET /api/groups/user/mine

User-facing route (must be before /:id to avoid conflicts)

**Authentication:** Session

**Response:**

```typescript
interface GetCurrentUserGroupsResponse {
  groups: UserGroupSummary[];
}
```

**Handler:** `getUserGroups` in `server/controllers/groups.ts`

---

### GET /api/groups

**Authentication:** Admin

**Response:**

```typescript
interface GetAllUserGroupsResponse {
  groups: GroupData[];
}
```

**Handler:** `getAllGroups` in `server/controllers/groups.ts`

---

### GET /api/groups/:id

**Authentication:** Admin

**Request Body:** `never`

**URL Parameters:**

```typescript
interface GetUserGroupParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface GetUserGroupResponse {
  group: GroupWithMembers;
}
```

**Handler:** `getGroup` in `server/controllers/groups.ts`

---

### POST /api/groups

**Authentication:** Admin

**Request Body:**

```typescript
interface CreateUserGroupBody {
  name: string;
  /** null or empty clears it */
  description?: string | null;
  canShare?: boolean;
  canDownloadFiles?: boolean;
  canDownloadPlaylists?: boolean;
}
```

**Response:**

```typescript
interface CreateUserGroupResponse {
  group: {
    id: number;
    name: string;
    description: string | null;
    canShare: boolean;
    canDownloadFiles: boolean;
    canDownloadPlaylists: boolean;
    createdAt: string;
    updatedAt: string;
  };
}
```

**Handler:** `createGroup` in `server/controllers/groups.ts`

---

### PUT /api/groups/:id

**Authentication:** Admin

**Request Body:**

```typescript
interface UpdateUserGroupBody {
  name?: string;
  /** null or empty clears it */
  description?: string | null;
  canShare?: boolean;
  canDownloadFiles?: boolean;
  canDownloadPlaylists?: boolean;
}
```

**URL Parameters:**

```typescript
interface UpdateUserGroupParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface UpdateUserGroupResponse {
  group: {
    id: number;
    name: string;
    description: string | null;
    canShare: boolean;
    canDownloadFiles: boolean;
    canDownloadPlaylists: boolean;
    createdAt: string;
    updatedAt: string;
  };
}
```

**Handler:** `updateGroup` in `server/controllers/groups.ts`

---

### DELETE /api/groups/:id

**Authentication:** Admin

**Request Body:** `never`

**URL Parameters:**

```typescript
interface DeleteUserGroupParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface DeleteUserGroupResponse {
  success: true;
}
```

**Handler:** `deleteGroup` in `server/controllers/groups.ts`

---

### POST /api/groups/:id/members

**Authentication:** Admin

**Request Body:**

```typescript
interface AddMemberBody {
  userId: number;
}
```

**URL Parameters:**

```typescript
interface AddMemberParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface AddMemberResponse {
  membership: {
    id: number;
    userId: number;
    groupId: number;
    createdAt: string;
  };
}
```

**Handler:** `addMember` in `server/controllers/groups.ts`

---

### DELETE /api/groups/:id/members/:userId

**Authentication:** Admin

**Request Body:** `never`

**URL Parameters:**

```typescript
interface RemoveMemberParams extends Record<string, string> {
  id: string;
  userId: string;
}
```

**Response:**

```typescript
interface RemoveMemberResponse {
  success: true;
}
```

**Handler:** `removeMember` in `server/controllers/groups.ts`

---

## Library

Browsing scenes, performers, studios, tags, collections, galleries and images, with the user's restrictions and hidden items applied.

### GET /api/library/ready

**Authentication:** Session

**Response:**

```typescript
interface LibraryReadyResponse {
  ready: boolean;
}
```

**Handler:** `getLibraryReady` in `server/routes/library/ready.ts`

---

### POST /api/library/scenes

Find scenes with filters

**Authentication:** Session

**Request Body:**

```typescript
type FindScenesRequest = ListRequestInput<"scene">;
```

**Response:** `FindScenesResponse<ListCount> | AmbiguousLookupResponse`

**Handler:** `findScenes` in `server/controllers/library/scenes.ts`

---

### POST /api/library/scenes/minimal

Minimal data for the scene picker (a clip filter's scenes)

**Authentication:** Session

**Request Body:**

```typescript
type FindScenesMinimalRequest = Omit<
  MinimalRequest,
  "scope" | "count_filter"
>;
```

**Response:**

```typescript
interface FindScenesMinimalResponse {
  scenes: MinimalEntity[];
}
```

**Handler:** `findScenesMinimal` in `server/controllers/library/scenes.ts`

---

### GET /api/library/scenes/:id/similar

Find similar scenes

**Authentication:** Session

**URL Parameters:**

```typescript
interface FindSimilarScenesParams extends Record<string, string> {
  id: string;
}
```

**Query Parameters:**

```typescript
interface FindSimilarScenesQuery extends Record<
  string,
  string | undefined
> {
  page?: string;
  /** The seed's instance (required; a request without it answers 400) */
  instanceId?: string;
}
```

**Response:**

```typescript
interface FindSimilarScenesResponse {
  scenes: NormalizedScene[];
  count: number;
  page: number;
  perPage: number;
}
```

**Handler:** `findSimilarScenes` in `server/controllers/library/scenes.ts`

---

### GET /api/library/scenes/recommended

Get recommended scenes

**Authentication:** Session

**URL Parameters:** `Record<string, string>`

**Query Parameters:**

```typescript
interface GetRecommendedScenesQuery extends Record<
  string,
  string | undefined
> {
  page?: string;
  per_page?: string;
}
```

**Response:**

```typescript
interface GetRecommendedScenesResponse {
  scenes: NormalizedScene[];
  count: number;
  page: number;
  perPage: number;
  message?: string;
  criteria?: {
    favoritedPerformers: number;
    ratedPerformers: number;
    favoritedStudios: number;
    ratedStudios: number;
    favoritedTags: number;
    ratedTags: number;
    favoritedScenes: number;
    ratedScenes: number;
    /** Performers, studios and tags the user's viewing ranks in its top half */
    rankedEntities: number;
  };
}
```

**Handler:** `getRecommendedScenes` in `server/controllers/library/scenes.ts`

---

### POST /api/library/performers

Find performers with filters

**Authentication:** Session

**Request Body:**

```typescript
type FindPerformersRequest = ListRequestInput<"performer">;
```

**Response:** `FindPerformersResponse<ListCount> | AmbiguousLookupResponse`

**Handler:** `findPerformers` in `server/controllers/library/performers.ts`

---

### POST /api/library/performers/minimal

Minimal data for filter dropdowns

**Authentication:** Session

**Request Body:**

```typescript
type FindPerformersMinimalRequest = MinimalRequest;
```

**Response:**

```typescript
interface FindPerformersMinimalResponse {
  performers: MinimalEntity[];
}
```

**Handler:** `findPerformersMinimal` in `server/controllers/library/performers.ts`

---

### GET /api/library/performers/:id/counts

The detail page's tab counts, as the viewer sees them

**Authentication:** Session

**Handler:** `getPerformerCounts` in `server/controllers/library/performers.ts`

---

### POST /api/library/studios

Find studios with filters

**Authentication:** Session

**Request Body:**

```typescript
type FindStudiosRequest = ListRequestInput<"studio">;
```

**Response:** `FindStudiosResponse<ListCount> | AmbiguousLookupResponse`

**Handler:** `findStudios` in `server/controllers/library/studios.ts`

---

### POST /api/library/studios/minimal

Minimal data for filter dropdowns

**Authentication:** Session

**Request Body:**

```typescript
type FindStudiosMinimalRequest = MinimalRequest;
```

**Response:**

```typescript
interface FindStudiosMinimalResponse {
  studios: MinimalEntity[];
}
```

**Handler:** `findStudiosMinimal` in `server/controllers/library/studios.ts`

---

### GET /api/library/studios/:id/counts

The detail page's tab counts, as the viewer sees them

**Authentication:** Session

**Handler:** `getStudioCounts` in `server/controllers/library/studios.ts`

---

### POST /api/library/tags

Find tags with filters

**Authentication:** Session

**Request Body:**

```typescript
type FindTagsRequest = ListRequestInput<"tag">;
```

**Response:** `FindTagsResponse<ListCount> | AmbiguousLookupResponse`

**Handler:** `findTags` in `server/controllers/library/tags.ts`

---

### POST /api/library/tags/minimal

Minimal data for filter dropdowns

**Authentication:** Session

**Request Body:**

```typescript
type FindTagsMinimalRequest = MinimalRequest;
```

**Response:**

```typescript
interface FindTagsMinimalResponse {
  tags: MinimalEntity[];
}
```

**Handler:** `findTagsMinimal` in `server/controllers/library/tags.ts`

---

### POST /api/library/tags/tree

The compact tag tree (hierarchy and folder views), optionally scoped

**Authentication:** Session

**Request Body:** `FindTagTreeRequest | undefined`

**Response:**

```typescript
interface FindTagTreeResponse {
  tags: TagTreeRow[];
  /**
   * With `untagged` in the request: the items of that type the user can see
   * with no tag of their own, the total of the Untagged folder's list
   * (`tag_count` EQUALS 0). With a scope, the scope's scenes (galleries and
   * images 0, as the scoped rows count).
   */
  untagged?: number;
}
```

**Handler:** `findTagTree` in `server/controllers/library/tags.ts`

---

### GET /api/library/tags/:id/counts

The detail page's tab counts, as the viewer sees them

**Authentication:** Session

**Handler:** `getTagCounts` in `server/controllers/library/tags.ts`

---

### POST /api/library/groups

Find groups with filters

**Authentication:** Session

**Request Body:**

```typescript
type FindGroupsRequest = ListRequestInput<"group">;
```

**Response:** `FindGroupsResponse<ListCount> | AmbiguousLookupResponse`

**Handler:** `findGroups` in `server/controllers/library/groups.ts`

---

### POST /api/library/groups/minimal

Minimal data for filter dropdowns

**Authentication:** Session

**Request Body:**

```typescript
type FindGroupsMinimalRequest = MinimalRequest;
```

**Response:**

```typescript
interface FindGroupsMinimalResponse {
  groups: MinimalEntity[];
}
```

**Handler:** `findGroupsMinimal` in `server/controllers/library/groups.ts`

---

### GET /api/library/groups/:id/counts

The detail page's tab counts, as the viewer sees them

**Authentication:** Session

**Handler:** `getGroupCounts` in `server/controllers/library/groups.ts`

---

### POST /api/library/galleries

Gallery list: filter, sort and page

**Authentication:** Session

**Request Body:**

```typescript
type FindGalleriesRequest = ListRequestInput<"gallery">;
```

**Response:** `FindGalleriesResponse<ListCount> | AmbiguousLookupResponse`

**Handler:** `findGalleries` in `server/controllers/library/galleries.ts`

---

### POST /api/library/galleries/minimal

**Authentication:** Session

**Request Body:**

```typescript
type FindGalleriesMinimalRequest = MinimalRequest;
```

**Response:**

```typescript
interface FindGalleriesMinimalResponse {
  galleries: MinimalEntity[];
}
```

**Handler:** `findGalleriesMinimal` in `server/controllers/library/galleries.ts`

---

### GET /api/library/galleries/:id/counts

The detail page's tab counts, as the viewer sees them

**Authentication:** Session

**Handler:** `getGalleryCounts` in `server/controllers/library/galleries.ts`

---

### POST /api/library/images

Find images (with filters, pagination, sorting)

**Authentication:** Session

**Request Body:**

```typescript
type FindImagesRequest = ListRequestInput<"image">;
```

**Response:** `FindImagesResponse<ListCount> | AmbiguousLookupResponse`

**Handler:** `findImages` in `server/controllers/library/images.ts`

---

### POST /api/library/clips

Find clips with the clip filter body (GET /api/clips keeps the old parameters)

**Authentication:** Session

**Request Body:**

```typescript
type FindClipsRequest = ClipListRequestInput;
```

**Response:** `FindClipsResponse<ListCount>`

**Handler:** `findClips` in `server/controllers/clips.ts`

---

## Clips

Clips (scene markers from Stash).

### GET /api/scenes/:id/clips

Scene clips endpoint (get clips for a specific scene)

**Authentication:** Session

**Request Body:** `never`

**URL Parameters:**

```typescript
interface GetClipsForSceneParams extends Record<string, string> {
  id: string;
}
```

**Query Parameters:**

```typescript
interface GetClipsForSceneQuery extends Record<
  string,
  string | string[] | undefined
> {
  includeUngenerated?: string;
  instanceId?: string;
}
```

**Response:**

```typescript
interface GetClipsForSceneResponse {
  clips: ClipWithRelations[];
}
```

**Handler:** `getClipsForScene` in `server/controllers/clips.ts`

---

### GET /api/clips

**Authentication:** Session

**Request Body:** `never`

**URL Parameters:** `Record<string, string>`

**Query Parameters:**

```typescript
interface GetClipsQuery extends Record<
  string,
  string | string[] | undefined
> {
  page?: string;
  perPage?: string;
  sortBy?: string;
  sortDir?: string;
  isGenerated?: string;
  sceneId?: string;
  tagIds?: string;
  sceneTagIds?: string;
  performerIds?: string;
  studioId?: string;
  q?: string;
  instanceId?: string;
  /** "false": the page alone, `total` and `totalPages` null */
  count?: string;
}
```

**Response:** `GetClipsResponse<ListCount>`

**Handler:** `getClips` in `server/controllers/clips.ts`

---

### GET /api/clips/:id

**Authentication:** Session

**Request Body:** `never`

**URL Parameters:**

```typescript
interface GetClipByIdParams extends Record<string, string> {
  id: string;
}
```

**Response:** `GetClipByIdResponse | AmbiguousLookupResponse`

**Handler:** `getClipById` in `server/controllers/clips.ts`

---

## Timeline

Date distribution for the timeline view.

### POST /api/timeline/:entityType/distribution

The bars of a list: the list's own request (filter, search, ids) plus the period

**Authentication:** Session

**Request Body:**

```typescript
type PostDateDistributionRequest<
  E extends TimelineEntityType = TimelineEntityType,
> = ListRequestInput<E> & {
  /** Default "months" */
  granularity?: TimelineGranularity;
};
```

**URL Parameters:**

```typescript
interface GetDateDistributionParams extends Record<string, string> {
  entityType: string;
}
```

**Response:**

```typescript
interface GetDateDistributionResponse {
  distribution: DateDistributionEntry[];
}
```

**Handler:** `postDateDistribution` in `server/controllers/timelineController.ts`

---

### GET /api/timeline/:entityType/distribution

The documented form: one entity parameter (performerId, tagId, ...)

**Authentication:** Session

**Request Body:** `never`

**URL Parameters:**

```typescript
interface GetDateDistributionParams extends Record<string, string> {
  entityType: string;
}
```

**Query Parameters:**

```typescript
interface GetDateDistributionQuery extends Record<
  string,
  string | string[] | undefined
> {
  granularity?: string;
  performerId?: string;
  tagId?: string;
  studioId?: string;
  groupId?: string;
  galleryId?: string;
}
```

**Response:**

```typescript
interface GetDateDistributionResponse {
  distribution: DateDistributionEntry[];
}
```

**Handler:** `getDateDistribution` in `server/controllers/timelineController.ts`

---

## Playback

The stream and caption proxy, and the external player's personal signed link.

### GET /api/scene/:sceneId/proxy-stream/:streamPath/:subPath

**Authentication:** Session or signed link

**Request Body:** `never`

**URL Parameters:**

```typescript
{ sceneId: string; streamPath: string; subPath?: string }
```

**Query Parameters:**

```typescript
{ instanceId?: string }
```

**Handler:** `proxyStashStream` in `server/controllers/video.ts`

---

### GET /api/scene/:sceneId/proxy-stream/:streamPath

**Authentication:** Session or signed link

**Request Body:** `never`

**URL Parameters:**

```typescript
{ sceneId: string; streamPath: string; subPath?: string }
```

**Query Parameters:**

```typescript
{ instanceId?: string }
```

**Handler:** `proxyStashStream` in `server/controllers/video.ts`

---

### GET /api/scene/:sceneId/caption

Caption/subtitle proxy

**Authentication:** Session

**Request Body:** `never`

**URL Parameters:**

```typescript
{ sceneId: string }
```

**Query Parameters:**

```typescript
{ lang?: string; type?: string; instanceId?: string }
```

**Handler:** `getCaption` in `server/controllers/video.ts`

---

### POST /api/scene/:sceneId/external-player-link

Personal signed link for the external player button

**Authentication:** Session

**Request Body:**

```typescript
interface ExternalPlayerLinkRequest {
  instanceId: string;
}
```

**URL Parameters:**

```typescript
{ sceneId: string }
```

**Response:**

```typescript
interface ExternalPlayerLinkResponse {
  /** `/api/scene/:id/proxy-stream/stream?instanceId=...&uid=...&exp=...&sig=...` */
  url: string;
  /** ISO timestamp, 12 hours after minting. */
  expiresAt: string;
  /**
   * The scene file's MIME type from its extension (`video/x-matroska` for an
   * mkv), `video/*` when unknown. The path itself is never returned.
   */
  mimeType: string;
}
```

**Handler:** `createExternalPlayerLink` in `server/controllers/video.ts`

---

## Media Proxy

Images and previews from Stash, served through Peek so no user gets Stash's address or API key.

### GET /api/proxy/stash

Media proxy (requires a Peek session; per-entity access in the handler)

**Authentication:** Session

**Request Body:** `never`

**URL Parameters:** `Record<string, string>`

**Query Parameters:**

```typescript
{ path?: string; instanceId?: string }
```

**Handler:** `proxyStashMedia` in `server/controllers/proxy.ts`

---

### GET /api/proxy/scene/:id/preview

**Authentication:** Session

**Request Body:** `never`

**URL Parameters:**

```typescript
{ id: string }
```

**Query Parameters:**

```typescript
{ instanceId?: string }
```

**Handler:** `proxyScenePreview` in `server/controllers/proxy.ts`

---

### GET /api/proxy/scene/:id/webp

**Authentication:** Session

**Request Body:** `never`

**URL Parameters:**

```typescript
{ id: string }
```

**Query Parameters:**

```typescript
{ instanceId?: string }
```

**Handler:** `proxySceneWebp` in `server/controllers/proxy.ts`

---

### GET /api/proxy/image/:imageId/:type

Image proxy route (requires a Peek session; per-entity access in the handler)

**Authentication:** Session

**Request Body:** `never`

**URL Parameters:**

```typescript
{ imageId: string; type: string }
```

**Query Parameters:**

```typescript
{ instanceId?: string }
```

**Handler:** `proxyImage` in `server/controllers/proxy.ts`

---

### GET /api/proxy/clip/:id/preview

Clip preview proxy route (requires a Peek session; per-entity access in the handler)

**Authentication:** Session

**Request Body:** `never`

**URL Parameters:**

```typescript
{ id: string }
```

**Query Parameters:**

```typescript
{ instanceId?: string }
```

**Handler:** `proxyClipPreview` in `server/controllers/proxy.ts`

---

## Playlists

Playlists, their items, play queue and sharing.

### GET /api/playlists/shared

Get playlists shared with current user

**Authentication:** Session

**URL Parameters:** `Record<string, string>`

**Query Parameters:**

```typescript
interface GetUserPlaylistsQuery extends Record<
  string,
  string | undefined
> {
  containsScene?: string;
}
```

**Response:**

```typescript
interface GetSharedPlaylistsResponse {
  playlists: SharedPlaylistData[];
}
```

**Handler:** `getSharedPlaylists` in `server/controllers/playlist.ts`

---

### GET /api/playlists

Get all user playlists

**Authentication:** Session

**URL Parameters:** `Record<string, string>`

**Query Parameters:**

```typescript
interface GetUserPlaylistsQuery extends Record<
  string,
  string | undefined
> {
  containsScene?: string;
}
```

**Response:**

```typescript
interface GetUserPlaylistsResponse {
  playlists: PlaylistSummary[];
}
```

**Handler:** `getUserPlaylists` in `server/controllers/playlist.ts`

---

### GET /api/playlists/:id

Get single playlist with a page of its items

**Authentication:** Session

**URL Parameters:**

```typescript
interface GetPlaylistParams extends Record<string, string> {
  id: string;
}
```

**Query Parameters:**

```typescript
interface GetPlaylistQuery extends Record<string, string | undefined> {
  page?: string;
  per_page?: string;
  sort?: string;
  direction?: string;
}
```

**Response:**

```typescript
interface GetPlaylistResponse {
  playlist: PlaylistData & { items: PlaylistItemWithScene[] };
  /** How many of the playlist's items the viewer can see */
  totalItems: number;
  /**
   * The owner's count of items they cannot play (hidden, restricted,
   * deleted from Stash, or on an instance they do not use); 0 for anyone
   * else, who is told nothing about them
   */
  unavailableItems: number;
  /** The page read */
  page: number;
  perPage: number;
  /**
   * The sort the items came back in: one of `PLAYLIST_ITEM_SORTS`, a random
   * one as `random_<seed>` (a bare `random` names the seed it used)
   */
  sort: string;
  direction: "ASC" | "DESC";
  isOwner: boolean;
  accessLevel: "owner" | "shared";
  sharedViaGroups?: string[];
  /** Who owns the playlist, for "Shared by" */
  owner: { id: number; username: string };
}
```

**Handler:** `getPlaylist` in `server/controllers/playlist.ts`

---

### GET /api/playlists/:id/queue

Get the play queue: every visible item in the shown order

**Authentication:** Session

**URL Parameters:**

```typescript
interface GetPlaylistParams extends Record<string, string> {
  id: string;
}
```

**Query Parameters:**

```typescript
interface GetPlaylistQueueQuery extends Record<
  string,
  string | undefined
> {
  sort?: string;
  direction?: string;
}
```

**Response:**

```typescript
interface GetPlaylistQueueResponse {
  entries: PlaylistQueueEntry[];
}
```

**Handler:** `getPlaylistQueue` in `server/controllers/playlist.ts`

---

### POST /api/playlists

Create new playlist

**Authentication:** Session

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

**Handler:** `createPlaylist` in `server/controllers/playlist.ts`

---

### PUT /api/playlists/:id

Update playlist

**Authentication:** Session

**Request Body:**

```typescript
interface UpdatePlaylistRequest {
  /** Not empty once trimmed */
  name?: string;
  /** A client may send null to clear the description. */
  description?: string | null;
  shuffle?: boolean;
  repeat?: PlaylistRepeatMode;
}
```

**URL Parameters:**

```typescript
interface UpdatePlaylistParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface UpdatePlaylistResponse {
  playlist: PlaylistData;
}
```

**Handler:** `updatePlaylist` in `server/controllers/playlist.ts`

---

### DELETE /api/playlists/:id

Delete playlist

**Authentication:** Session

**URL Parameters:**

```typescript
interface DeletePlaylistParams extends Record<string, string> {
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

**Handler:** `deletePlaylist` in `server/controllers/playlist.ts`

---

### POST /api/playlists/:id/items

Add scene to playlist

**Authentication:** Session

**Request Body:**

```typescript
interface AddSceneToPlaylistRequest {
  instanceId: string;
  sceneId: string;
}
```

**URL Parameters:**

```typescript
interface AddSceneToPlaylistParams extends Record<string, string> {
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

**Handler:** `addSceneToPlaylist` in `server/controllers/playlist.ts`

---

### POST /api/playlists/:id/items/bulk

Add several scenes to playlist

**Authentication:** Session

**Request Body:**

```typescript
interface AddScenesToPlaylistRequest {
  scenes: { sceneId: string; instanceId: string }[];
}
```

**URL Parameters:**

```typescript
interface AddSceneToPlaylistParams extends Record<string, string> {
  id: string;
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

**Handler:** `addScenesToPlaylist` in `server/controllers/playlist.ts`

---

### POST /api/playlists/:id/items/remove-unavailable

Remove the items deleted from Stash (owner only)

**Authentication:** Session

**URL Parameters:**

```typescript
interface GetPlaylistParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface RemoveUnavailableItemsResponse {
  removed: number;
}
```

**Handler:** `removeUnavailablePlaylistItems` in `server/controllers/playlist.ts`

---

### POST /api/playlists/:id/items/remove

Remove several items by item id (owner only)

**Authentication:** Session

**Request Body:**

```typescript
interface RemovePlaylistItemsRequest {
  itemIds: number[];
}
```

**URL Parameters:**

```typescript
interface GetPlaylistParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface RemovePlaylistItemsResponse {
  removed: number;
}
```

**Handler:** `removePlaylistItems` in `server/controllers/playlist.ts`

---

### PUT /api/playlists/:id/items/:itemId/position

Move one item to an index among the items the owner sees (owner only)

**Authentication:** Session

**Request Body:**

```typescript
interface MovePlaylistItemRequest {
  index: number;
}
```

**URL Parameters:**

```typescript
interface MovePlaylistItemParams extends Record<string, string> {
  id: string;
  itemId: string;
}
```

**Response:**

```typescript
interface MovePlaylistItemResponse {
  success: true;
}
```

**Handler:** `movePlaylistItem` in `server/controllers/playlist.ts`

---

### DELETE /api/playlists/:id/items/:sceneId

Remove scene from playlist

**Authentication:** Session

**URL Parameters:**

```typescript
interface RemoveSceneFromPlaylistParams extends Record<string, string> {
  id: string;
  sceneId: string;
}
```

**Query Parameters:**

```typescript
interface RemoveSceneFromPlaylistQuery extends Record<
  string,
  string | string[] | undefined
> {
  instanceId?: string | string[];
}
```

**Response:**

```typescript
interface RemoveSceneFromPlaylistResponse {
  success: true;
  message: string;
}
```

**Handler:** `removeSceneFromPlaylist` in `server/controllers/playlist.ts`

---

### POST /api/playlists/:id/sort

Save a view sort as the playlist's order (owner only)

**Authentication:** Session

**Request Body:**

```typescript
interface SortPlaylistRequest {
  sort: string;
  direction: "ASC" | "DESC";
}
```

**URL Parameters:**

```typescript
interface GetPlaylistParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface SortPlaylistResponse {
  success: true;
  itemCount: number;
}
```

**Handler:** `sortPlaylist` in `server/controllers/playlist.ts`

---

### GET /api/playlists/:id/shares

Get sharing info for a playlist

**Authentication:** Session

**URL Parameters:**

```typescript
interface GetPlaylistParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface GetPlaylistSharesResponse {
  shares: PlaylistShareInfo[];
}
```

**Handler:** `getPlaylistShares` in `server/controllers/playlist.ts`

---

### PUT /api/playlists/:id/shares

Update playlist sharing

**Authentication:** Session

**Request Body:**

```typescript
interface UpdatePlaylistSharesRequest {
  groupIds: number[];
}
```

**URL Parameters:**

```typescript
interface GetPlaylistParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface UpdatePlaylistSharesResponse {
  shares: PlaylistShareInfo[];
}
```

**Handler:** `updatePlaylistShares` in `server/controllers/playlist.ts`

---

### POST /api/playlists/:id/duplicate

Duplicate a playlist

**Authentication:** Session

**URL Parameters:**

```typescript
interface GetPlaylistParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface DuplicatePlaylistResponse {
  playlist: PlaylistData;
}
```

**Handler:** `duplicatePlaylist` in `server/controllers/playlist.ts`

---

## Downloads

Scene, image and playlist downloads.

### GET /api/downloads

Get all user downloads

**Authentication:** Session

**Response:**

```typescript
interface GetUserDownloadsResponse {
  downloads: SerializedDownload[];
}
```

**Handler:** `getUserDownloads` in `server/controllers/download.ts`

---

### GET /api/downloads/:id

Get specific download status

**Authentication:** Session

**Request Body:** `never`

**URL Parameters:**

```typescript
interface GetDownloadStatusParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface GetDownloadStatusResponse {
  download: SerializedDownload;
}
```

**Handler:** `getDownloadStatus` in `server/controllers/download.ts`

---

### GET /api/downloads/:id/file

Get download file

**Authentication:** Session

**Request Body:** `never`

**URL Parameters:**

```typescript
interface GetDownloadFileParams extends Record<string, string> {
  id: string;
}
```

**Handler:** `getDownloadFile` in `server/controllers/download.ts`

---

### POST /api/downloads/scene/:sceneId

Start scene download

**Authentication:** Session

**Request Body:** `Partial<StartEntityDownloadRequest> | undefined`

**URL Parameters:**

```typescript
interface StartSceneDownloadParams extends Record<string, string> {
  sceneId: string;
}
```

**Response:**

```typescript
interface StartSceneDownloadResponse {
  download: SerializedDownload;
}
```

**Handler:** `startSceneDownload` in `server/controllers/download.ts`

---

### POST /api/downloads/image/:imageId

Start image download

**Authentication:** Session

**Request Body:** `Partial<StartEntityDownloadRequest> | undefined`

**URL Parameters:**

```typescript
interface StartImageDownloadParams extends Record<string, string> {
  imageId: string;
}
```

**Response:**

```typescript
interface StartImageDownloadResponse {
  download: SerializedDownload;
}
```

**Handler:** `startImageDownload` in `server/controllers/download.ts`

---

### POST /api/downloads/playlist/:playlistId

Start playlist download

**Authentication:** Session

**Request Body:** `never`

**URL Parameters:**

```typescript
interface StartPlaylistDownloadParams extends Record<string, string> {
  playlistId: string;
}
```

**Response:** `StartPlaylistDownloadResponse | PlaylistTooLargeResponse`

**Handler:** `startPlaylistDownload` in `server/controllers/download.ts`

---

### DELETE /api/downloads/:id

Delete download

**Authentication:** Session

**Request Body:** `never`

**URL Parameters:**

```typescript
interface DeleteDownloadParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface DeleteDownloadResponse {
  success: true;
  message: string;
}
```

**Handler:** `deleteDownload` in `server/controllers/download.ts`

---

### POST /api/downloads/:id/retry

Retry failed download

**Authentication:** Session

**Request Body:** `never`

**URL Parameters:**

```typescript
interface RetryDownloadParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface RetryDownloadResponse {
  download: SerializedDownload;
}
```

**Handler:** `retryDownload` in `server/controllers/download.ts`

---

## Ratings

The user's ratings and favorites.

### PUT /api/ratings/scene/:sceneId

**Authentication:** Session

**Handler:** `updateSceneRating` in `server/controllers/ratings.ts`

---

### PUT /api/ratings/performer/:performerId

**Authentication:** Session

**Handler:** `updatePerformerRating` in `server/controllers/ratings.ts`

---

### PUT /api/ratings/studio/:studioId

**Authentication:** Session

**Handler:** `updateStudioRating` in `server/controllers/ratings.ts`

---

### PUT /api/ratings/tag/:tagId

**Authentication:** Session

**Handler:** `updateTagRating` in `server/controllers/ratings.ts`

---

### PUT /api/ratings/gallery/:galleryId

**Authentication:** Session

**Handler:** `updateGalleryRating` in `server/controllers/ratings.ts`

---

### PUT /api/ratings/group/:groupId

**Authentication:** Session

**Handler:** `updateGroupRating` in `server/controllers/ratings.ts`

---

### PUT /api/ratings/image/:imageId

**Authentication:** Session

**Handler:** `updateImageRating` in `server/controllers/ratings.ts`

---

## Watch History

Plays, resume points and O counts of scenes.

### POST /api/watch-history/save-activity

Save activity (called by track-activity plugin every 10 seconds)

**Authentication:** Session

**Request Body:**

```typescript
interface SaveActivityRequest {
  /** The scene's instance: required, the server never guesses one */
  instanceId: string;
  sceneId: string;
  resumeTime?: number;
  playDuration?: number;
}
```

**Response:**

```typescript
interface SaveActivityResponse {
  success: true;
  watchHistory: WatchHistoryData;
}
```

**Handler:** `saveActivity` in `server/controllers/watchHistory.ts`

---

### POST /api/watch-history/increment-play-count

Increment play count (called when minimum play percentage reached)

**Authentication:** Session

**Request Body:**

```typescript
interface IncrementPlayCountRequest {
  /** The scene's instance: required, the server never guesses one */
  instanceId: string;
  sceneId: string;
  /**
   * One viewing's token (1 to 64 characters), the same on every retry of its
   * request: the server counts a token once for 10 minutes. A request
   * without one always counts.
   */
  playToken?: string;
}
```

**Response:**

```typescript
interface IncrementPlayCountResponse {
  success: true;
  watchHistory: WatchHistoryData;
}
```

**Handler:** `incrementPlayCount` in `server/controllers/watchHistory.ts`

---

### POST /api/watch-history/increment-o

Increment O counter

**Authentication:** Session

**Request Body:**

```typescript
interface IncrementOCounterRequest {
  instanceId: string;
  sceneId: string;
}
```

**Response:**

```typescript
interface IncrementOCounterResponse {
  success: true;
  oCount: number;
  timestamp: string;
}
```

**Handler:** `incrementOCounter` in `server/controllers/watchHistory.ts`

---

### POST /api/watch-history/decrement-o

Remove the newest O ("Remove last O")

**Authentication:** Session

**Request Body:**

```typescript
interface DecrementOCounterRequest {
  instanceId: string;
  sceneId: string;
}
```

**Response:**

```typescript
interface DecrementOCounterResponse {
  success: true;
  oCount: number;
}
```

**Handler:** `decrementOCounter` in `server/controllers/watchHistory.ts`

---

### DELETE /api/watch-history

Clear all watch history for current user

**Authentication:** Session

**Response:**

```typescript
interface ClearAllWatchHistoryResponse {
  success: true;
  deletedCounts: {
    watchHistory: number;
    performerStats: number;
    studioStats: number;
    tagStats: number;
    rankings: number;
  };
  message: string;
}
```

**Handler:** `clearAllWatchHistory` in `server/controllers/watchHistory.ts`

---

### GET /api/watch-history/scenes

The viewer's watched scenes, paged, sorted and filtered in SQL (before /:sceneId, which would take "scenes" as an id)

**Authentication:** Session

**URL Parameters:** `Record<string, string>`

**Query Parameters:**

```typescript
interface GetWatchedScenesQuery extends Record<
  string,
  string | undefined
> {
  /** A `WatchedScenesView`; default `all` */
  view?: string;
  /** A `WatchedScenesSort`; default `recent` */
  sort?: string;
  /** Default 1 */
  page?: string;
  /** 1 to 250; default 24 */
  per_page?: string;
  /** `false` skips the totals (both answer null); default `true` */
  count?: string;
}
```

**Response:**

```typescript
interface GetWatchedScenesResponse {
  scenes: NormalizedScene[];
  /** Every scene in the view; null when the request sent `count=false` */
  total: number | null;
  /** Seconds watched over every scene in the view; null with `count=false` */
  totalPlayDuration: number | null;
}
```

**Handler:** `getWatchedScenes` in `server/controllers/watchHistory.ts`

---

### GET /api/watch-history/:sceneId

Get watch history for specific scene

**Authentication:** Session

**URL Parameters:**

```typescript
interface GetWatchHistoryParams extends Record<string, string> {
  sceneId: string;
}
```

**Response:**

```typescript
interface GetWatchHistoryResponse {
  exists: boolean;
  resumeTime: number | null;
  playCount: number;
  playDuration?: number;
  lastPlayedAt?: Date | null;
  oCount: number;
  oHistory?: string[];
  playHistory?: string[];
}
```

**Handler:** `getWatchHistory` in `server/controllers/watchHistory.ts`

---

## Image View History

Image views and O counts.

### POST /api/image-view-history/increment-o

Increment O counter for image

**Authentication:** Session

**Request Body:**

```typescript
interface IncrementImageOCounterRequest {
  instanceId: string;
  imageId: string;
}
```

**Response:**

```typescript
interface IncrementImageOCounterResponse {
  success: true;
  oCount: number;
  timestamp: string;
}
```

**Handler:** `incrementImageOCounter` in `server/controllers/imageViewHistory.ts`

---

### POST /api/image-view-history/decrement-o

Remove the newest O ("Remove last O")

**Authentication:** Session

**Request Body:**

```typescript
interface DecrementImageOCounterRequest {
  instanceId: string;
  imageId: string;
}
```

**Response:**

```typescript
interface DecrementImageOCounterResponse {
  success: true;
  oCount: number;
}
```

**Handler:** `decrementImageOCounter` in `server/controllers/imageViewHistory.ts`

---

### POST /api/image-view-history/view

Record image view (when opened in Lightbox)

**Authentication:** Session

**Request Body:**

```typescript
interface RecordImageViewRequest {
  instanceId: string;
  imageId: string;
}
```

**Response:**

```typescript
interface RecordImageViewResponse {
  success: true;
  viewCount: number;
  lastViewedAt: Date | null;
}
```

**Handler:** `recordImageView` in `server/controllers/imageViewHistory.ts`

---

### GET /api/image-view-history/:imageId

Get view history for specific image

**Authentication:** Session

**URL Parameters:**

```typescript
interface GetImageViewHistoryParams extends Record<string, string> {
  imageId: string;
}
```

**Response:**

```typescript
interface GetImageViewHistoryResponse {
  exists: boolean;
  viewCount: number;
  viewHistory?: string[];
  oCount: number;
  oHistory?: string[];
  lastViewedAt?: Date | null;
}
```

**Handler:** `getImageViewHistory` in `server/controllers/imageViewHistory.ts`

---

## User Stats

The user's own statistics.

### GET /api/user-stats

Get user stats

**Authentication:** Session

**Response:**

```typescript
interface UserStatsResponse {
  library: LibraryStats;
  engagement: EngagementStats;
  topScenes: TopScene[];
  topPerformers: TopPerformer[];
  topStudios: TopStudio[];
  topTags: TopTag[];
  mostWatchedScene: HighlightScene | null;
  mostViewedImage: HighlightImage | null;
  mostOdScene: HighlightScene | null;
  mostOdPerformer: HighlightPerformer | null;
}
```

**Handler:** `getUserStats` in `server/controllers/userStats.ts`

---

## Carousels

Custom home page carousels.

### GET /api/carousels

Get all user's custom carousels

**Authentication:** Session

**Response:**

```typescript
interface GetUserCarouselsResponse {
  carousels: CarouselData[];
}
```

**Handler:** `getUserCarousels` in `server/controllers/carousel.ts`

---

### POST /api/carousels/preview

Preview carousel results without saving. Scenes are listed only from the user's instances: none ready yet answers 503 ready:false, as the lists do

**Authentication:** Session

**Request Body:**

```typescript
interface PreviewCarouselRequest {
  rules: CarouselRulesInput;
  sort?: string;
  direction?: string;
}
```

**Response:**

```typescript
interface PreviewCarouselResponse {
  scenes: WithStashUrl<NormalizedScene>[];
}
```

**Handler:** `previewCarousel` in `server/controllers/carousel.ts`

---

### GET /api/carousels/:id

Get single carousel by ID

**Authentication:** Session

**URL Parameters:**

```typescript
interface GetCarouselParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface GetCarouselResponse {
  carousel: CarouselData;
}
```

**Handler:** `getCarousel` in `server/controllers/carousel.ts`

---

### GET /api/carousels/:id/execute

Execute carousel query and get scenes (503 ready:false as above)

**Authentication:** Session

**URL Parameters:**

```typescript
interface ExecuteCarouselByIdParams extends Record<string, string> {
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
  scenes: WithStashUrl<NormalizedScene>[];
}
```

**Handler:** `executeCarouselById` in `server/controllers/carousel.ts`

---

### POST /api/carousels

Create new carousel

**Authentication:** Session

**Request Body:**

```typescript
interface CreateCarouselRequest {
  title: string;
  icon?: string;
  rules: CarouselRulesInput;
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

**Handler:** `createCarousel` in `server/controllers/carousel.ts`

---

### PUT /api/carousels/:id

Update carousel

**Authentication:** Session

**Request Body:**

```typescript
interface UpdateCarouselRequest {
  title?: string;
  icon?: string;
  rules?: CarouselRulesInput;
  sort?: string;
  direction?: string;
}
```

**URL Parameters:**

```typescript
interface UpdateCarouselParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface UpdateCarouselResponse {
  carousel: CarouselData;
}
```

**Handler:** `updateCarousel` in `server/controllers/carousel.ts`

---

### DELETE /api/carousels/:id

Delete carousel

**Authentication:** Session

**URL Parameters:**

```typescript
interface DeleteCarouselParams extends Record<string, string> {
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

**Handler:** `deleteCarousel` in `server/controllers/carousel.ts`

---

## Custom Themes

Custom themes.

### GET /api/themes/custom

Get all user custom themes

**Authentication:** Session

**Response:**

```typescript
interface GetUserCustomThemesResponse {
  themes: CustomThemeData[];
}
```

**Handler:** `getUserCustomThemes` in `server/controllers/customTheme.ts`

---

### GET /api/themes/custom/:id

Get single custom theme

**Authentication:** Session

**URL Parameters:**

```typescript
interface GetCustomThemeParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface GetCustomThemeResponse {
  theme: CustomThemeData & { userId: number };
}
```

**Handler:** `getCustomTheme` in `server/controllers/customTheme.ts`

---

### POST /api/themes/custom

Create new custom theme

**Authentication:** Session

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
  theme: CustomThemeData & { userId: number };
}
```

**Handler:** `createCustomTheme` in `server/controllers/customTheme.ts`

---

### PUT /api/themes/custom/:id

Update custom theme

**Authentication:** Session

**Request Body:**

```typescript
interface UpdateCustomThemeRequest {
  name?: string;
  config?: ThemeConfig;
}
```

**URL Parameters:**

```typescript
interface UpdateCustomThemeParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface UpdateCustomThemeResponse {
  theme: CustomThemeData & { userId: number };
}
```

**Handler:** `updateCustomTheme` in `server/controllers/customTheme.ts`

---

### DELETE /api/themes/custom/:id

Delete custom theme

**Authentication:** Session

**URL Parameters:**

```typescript
interface DeleteCustomThemeParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface DeleteCustomThemeResponse {
  success: true;
}
```

**Handler:** `deleteCustomTheme` in `server/controllers/customTheme.ts`

---

### POST /api/themes/custom/:id/duplicate

Duplicate custom theme

**Authentication:** Session

**URL Parameters:**

```typescript
interface DuplicateCustomThemeParams extends Record<string, string> {
  id: string;
}
```

**Response:**

```typescript
interface DuplicateCustomThemeResponse {
  theme: CustomThemeData & { userId: number };
}
```

**Handler:** `duplicateCustomTheme` in `server/controllers/customTheme.ts`

---

## Sync

Syncing the library cache from Stash (admin only).

### GET /api/sync/status

Whether a sync runs, the sync settings, and every configured instance's entity sync states (admin only: only the Server settings tab shows them). Instances appear by id and name, never by address.

**Authentication:** Admin

**Response:**

```typescript
interface SyncStatusResponse {
  /** A sync is running. */
  inProgress: boolean;
  /** What holds the lock, if anything: a sync or an instance's removal. */
  activeJob: SyncJob | null;
  settings: {
    syncIntervalMinutes: number;
    enableScanSubscription: boolean;
  };
  /** Every configured instance, enabled or not, in priority order. */
  instances: SyncInstanceStatus[];
}
```

**Handler:** inline in `server/routes/sync.ts`

---

### POST /api/sync/trigger

Manually trigger a sync (admin only)

Body: { type?: 'full' | 'incremental' } Default: incremental

**Authentication:** Admin

**Handler:** inline in `server/routes/sync.ts`

---

### POST /api/sync/abort

Abort the current sync (admin only)

**Authentication:** Admin

**Handler:** inline in `server/routes/sync.ts`

---

### POST /api/sync/cleanup

The sync status's "Apply deletions" (admin only): one type's cleanup on one enabled instance, without the ratio guard, after a cleanup refused to soft-delete more than half of the type. It runs in the background under the sync lock, so it answers 409 while a sync or an instance deletion runs; its outcome goes to the type's `lastError`.

Body: { instanceId: string, entityType: "tag" | "studio" | ... }

**Authentication:** Admin

**Request Body:** `Partial<ApplyDeletionsRequest> | undefined`

**Response:**

```typescript
interface ApplyDeletionsResponse {
  ok: true;
  message: string;
}
```

**Handler:** inline in `server/routes/sync.ts`

---

### POST /api/sync/reprobe-clips

Re-probe clips that were synced before previews were generated (admin only)

Body: { instanceId?: string } If instanceId is not provided, uses the first enabled instance

**Authentication:** Admin

**Handler:** inline in `server/routes/sync.ts`

---

### PUT /api/sync/settings

Update sync settings (admin only). A new interval re-arms the scheduler's timer; no sync starts, so the answer comes at once.

Body: { syncIntervalMinutes?: number, enableScanSubscription?: boolean }

**Authentication:** Admin

**Handler:** inline in `server/routes/sync.ts`

---

## Exclusions

Recomputing the content-restriction exclusions (admin only).

### POST /api/exclusions/recompute/:userId

Recompute exclusions for a single user (admin only)

**Authentication:** Admin

**Handler:** inline in `server/routes/exclusions.ts`

---

### POST /api/exclusions/recompute-all

Recompute exclusions for all users (admin only)

**Authentication:** Admin

**Handler:** inline in `server/routes/exclusions.ts`

---

### GET /api/exclusions/stats

Get exclusion statistics per user and entity type (admin only)

**Authentication:** Admin

**Handler:** inline in `server/routes/exclusions.ts`

---

## Admin

Merge reconciliation and database backups (admin only).

### GET /api/admin/orphaned-scenes

List all orphaned scenes with user activity

**Authentication:** Admin

**Handler:** inline in `server/routes/mergeReconciliation.ts`

---

### GET /api/admin/orphaned-scenes/:ref/matches

Live scenes of the orphan's instance with a matching phash

**Authentication:** Admin

**Handler:** inline in `server/routes/mergeReconciliation.ts`

---

### POST /api/admin/orphaned-scenes/:ref/reconcile

Transfer user data from the orphan to `targetSceneId`, a scene id on the orphan's instance. A target that is not a live scene there answers 400.

**Authentication:** Admin

**Handler:** inline in `server/routes/mergeReconciliation.ts`

---

### POST /api/admin/orphaned-scenes/:ref/discard

Delete the orphan's history, ratings and playlist entries (on its instance only)

**Authentication:** Admin

**Handler:** inline in `server/routes/mergeReconciliation.ts`

---

### POST /api/admin/reconcile-all

Reconcile every orphan with exactly one phash match on its instance, as sync does; orphans with several matches are left for the admin to pick.

**Authentication:** Admin

**Handler:** inline in `server/routes/mergeReconciliation.ts`

---

### GET /api/admin/database/backups

List all database backups

**Authentication:** Admin

**Response:**

```typescript
interface ListDatabaseBackupsResponse {
  backups: DatabaseBackup[];
  /** The directory backups are written to and listed from. */
  directory: string;
}
```

**Handler:** inline in `server/routes/databaseBackup.ts`

---

### POST /api/admin/database/backup

Create a new database backup

**Authentication:** Admin

**Response:**

```typescript
interface CreateDatabaseBackupResponse {
  backup: DatabaseBackup;
}
```

**Handler:** inline in `server/routes/databaseBackup.ts`

---

### DELETE /api/admin/database/backups/:filename

Delete a specific backup

**Authentication:** Admin

**Response:**

```typescript
interface DeleteDatabaseBackupResponse {
  ok: true;
}
```

**Handler:** inline in `server/routes/databaseBackup.ts`

---
