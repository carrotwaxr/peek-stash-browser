// shared/types/api/user.ts
/**
 * User Settings & Preferences Types
 *
 * Centralized type definitions for user settings endpoints.
 * Previously duplicated across controllers/user.ts, controllers/carousel.ts,
 * and controllers/setup.ts.
 */

/**
 * Carousel preference configuration for user home page
 */
export interface CarouselPreference {
  id: string;
  enabled: boolean;
  order: number;
}

/**
 * Table column configuration for a preset
 */
export interface TableColumnsConfig {
  visible: string[];
  order: string[];
}

/**
 * Filter preset for scene/performer/studio/tag filtering
 */
export interface FilterPreset {
  id: string;
  name: string;
  filters: unknown;
  sort?: string;
  direction?: string;
  viewMode?: string;
  zoomLevel?: string;
  tableColumns?: TableColumnsConfig | null;
  createdAt?: string;
  [key: string]: unknown;
}

/**
 * User filter presets collection, keyed by entity type
 */
export interface FilterPresets {
  scene?: FilterPreset[];
  performer?: FilterPreset[];
  studio?: FilterPreset[];
  tag?: FilterPreset[];
  group?: FilterPreset[];
  gallery?: FilterPreset[];
  [key: string]: FilterPreset[] | undefined;
}

/**
 * Default filter presets (preset IDs for each entity type)
 */
export interface DefaultFilterPresets {
  scene?: string;
  performer?: string;
  studio?: string;
  tag?: string;
  group?: string;
  gallery?: string;
  [key: string]: string | undefined;
}

/**
 * User content restriction from database
 */
export interface UserRestriction {
  id?: number;
  userId?: string;
  entityType: string;
  mode: string;
  entityIds: string[] | string;
  restrictEmpty?: boolean;
  [key: string]: unknown;
}

// =============================================================================
// Navigation preference
// =============================================================================

export interface NavPreference {
  id: string;
  enabled: boolean;
  order: number;
}

// =============================================================================
// Landing page preference
// =============================================================================

export interface LandingPagePreference {
  pages: string[];
  randomize: boolean;
}

// =============================================================================
// Card display settings (opaque JSON)
// =============================================================================

export type CardDisplaySettings = Record<string, unknown> | null;

// =============================================================================
// GET USER SETTINGS
// =============================================================================

/** GET /api/user/settings */
export interface GetUserSettingsResponse {
  settings: {
    preferredQuality: string;
    preferredPlaybackMode: string;
    preferredPreviewQuality: string | null;
    enableCast: boolean;
    theme: string;
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

// =============================================================================
// UPDATE USER SETTINGS
// =============================================================================

/** PUT /api/user/settings or PUT /api/user/:userId/settings */
export interface UpdateUserSettingsParams extends Record<string, string> {
  userId: string;
}

export interface UpdateUserSettingsBody {
  preferredQuality?: string;
  preferredPlaybackMode?: string;
  preferredPreviewQuality?: string;
  enableCast?: boolean;
  theme?: string;
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

export interface UpdateUserSettingsResponse {
  success: true;
  settings: {
    preferredQuality: string;
    preferredPlaybackMode: string;
    theme: string;
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

// =============================================================================
// CHANGE PASSWORD
// =============================================================================

/** PUT /api/user/password */
export interface ChangePasswordBody {
  currentPassword: string;
  newPassword: string;
}

export interface ChangePasswordResponse {
  success: true;
  message: string;
}

// =============================================================================
// RECOVERY KEY
// =============================================================================

/** GET /api/user/recovery-key. Only a hash is stored, so the key itself is never returned. */
export interface GetRecoveryKeyResponse {
  hasRecoveryKey: boolean;
}

/** POST /api/user/recovery-key/regenerate */
export interface RegenerateRecoveryKeyBody {
  currentPassword: string;
}

/** POST /api/user/recovery-key/regenerate. The new key, shown this once. */
export interface RegenerateRecoveryKeyResponse {
  recoveryKey: string;
}

// =============================================================================
// ADMIN USER MANAGEMENT
// =============================================================================

/** GET /api/users */
export interface GetAllUsersResponse {
  users: Array<{
    id: number;
    username: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
    syncToStash: boolean;
    groups: Array<{ id: number; name: string }>;
  }>;
}

/** POST /api/users */
export interface CreateUserBody {
  username: string;
  password: string;
  role?: string;
}

export interface CreateUserResponse {
  success: true;
  user: {
    id: number;
    username: string;
    role: string;
    createdAt: Date;
  };
}

/** DELETE /api/users/:userId */
export interface DeleteUserParams extends Record<string, string> {
  userId: string;
}

export interface DeleteUserResponse {
  success: true;
  message: string;
}

/** PUT /api/users/:userId/role */
export interface UpdateUserRoleParams extends Record<string, string> {
  userId: string;
}

export interface UpdateUserRoleBody {
  role: string;
}

export interface UpdateUserRoleResponse {
  success: true;
  user: {
    id: number;
    username: string;
    role: string;
    updatedAt: Date;
  };
}

// =============================================================================
// FILTER PRESETS
// =============================================================================

/** GET /api/user/filter-presets */
export interface GetFilterPresetsResponse {
  presets: FilterPresets;
}

/** POST /api/user/filter-presets */
export interface SaveFilterPresetBody {
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

export interface SaveFilterPresetResponse {
  success: true;
  preset: FilterPreset;
}

/** DELETE /api/user/filter-presets/:artifactType/:presetId */
export interface DeleteFilterPresetParams extends Record<string, string> {
  artifactType: string;
  presetId: string;
}

export interface DeleteFilterPresetResponse {
  success: true;
}

/** GET /api/user/default-filter-presets */
export interface GetDefaultFilterPresetsResponse {
  defaults: DefaultFilterPresets;
}

/** POST /api/user/default-filter-preset */
export interface SetDefaultFilterPresetBody {
  context: string;
  presetId?: string;
}

export interface SetDefaultFilterPresetResponse {
  success: true;
  defaults: DefaultFilterPresets;
}

// =============================================================================
// SYNC FROM STASH
// =============================================================================

/** POST /api/users/:userId/sync-from-stash */
export interface SyncFromStashParams extends Record<string, string> {
  userId: string;
}

/**
 * What to import, per type. An option Stash has no field for on the type
 * (a scene favorite, a tag rating) is ignored. `oCounter` imports O counts
 * with their dates, `playCount` play counts with their dates, the watch
 * time and the resume point.
 */
export interface SyncFromStashOptions {
  scenes: {
    rating: boolean;
    favorite?: boolean;
    oCounter: boolean;
    playCount: boolean;
  };
  performers: { rating: boolean; favorite: boolean };
  studios: { rating: boolean; favorite: boolean };
  tags: { rating?: boolean; favorite: boolean };
  galleries: { rating: boolean };
  groups: { rating: boolean };
  images: { rating: boolean };
}

export interface SyncFromStashBody {
  options?: {
    [K in keyof SyncFromStashOptions]?: Partial<SyncFromStashOptions[K]>;
  };
}

/** Per type: entities read from Stash, rows created, rows changed. */
export interface SyncTypeStats {
  checked: number;
  updated: number;
  created: number;
}

export type SyncStats = Record<keyof SyncFromStashOptions, SyncTypeStats>;

export interface SyncFromStashResponse {
  /** False when an instance's import failed; the others still ran */
  success: boolean;
  message: string;
  stats: SyncStats;
  /** The ids of the instances whose import failed */
  failedInstances: string[];
}

// =============================================================================
// CONTENT RESTRICTIONS
// =============================================================================

/** GET /api/users/:userId/restrictions */
export interface GetUserRestrictionsParams extends Record<string, string> {
  userId: string;
}

/** One stored restriction list, parsed for the editor */
export interface StoredRestriction {
  id: number;
  entityType: string;
  mode: string;
  /**
   * The list's entries (`"id:instanceId"`, or a bare id from older saves);
   * null when the stored list is not a JSON array of strings. A Show-only
   * list can be `[]`: its server was deleted, and it still hides that type.
   */
  entityIds: string[] | null;
  /** True when the stored list cannot be read; the editor offers to clear it */
  unreadable: boolean;
  restrictEmpty: boolean;
}

export interface GetUserRestrictionsResponse {
  restrictions: StoredRestriction[];
}

/** PUT /api/users/:userId/restrictions */
export interface UpdateUserRestrictionsBody {
  restrictions: UserRestriction[];
}

export interface UpdateUserRestrictionsResponse {
  success: true;
  message: string;
  restrictions: unknown[];
}

/** DELETE /api/users/:userId/restrictions */
export interface DeleteUserRestrictionsParams extends Record<string, string> {
  userId: string;
}

export interface DeleteUserRestrictionsResponse {
  success: true;
  message: string;
}

// =============================================================================
// HIDDEN ENTITIES
// =============================================================================

/** POST /api/user/hidden-entities */
export interface HideEntityBody {
  entityType: string;
  entityId: string;
  /** The entity's Stash instance; a hide without one answers 400 */
  instanceId: string;
}

export interface HideEntityResponse {
  success: true;
  message: string;
}

/** DELETE /api/user/hidden-entities/:entityType/:entityId */
export interface UnhideEntityParams extends Record<string, string> {
  entityType: string;
  entityId: string;
}

export interface UnhideEntityQuery extends Record<
  string,
  string | string[] | undefined
> {
  instanceId?: string;
}

export interface UnhideEntityResponse {
  success: true;
  message: string;
}

/** DELETE /api/user/hidden-entities */
export interface UnhideAllEntitiesQuery extends Record<
  string,
  string | string[] | undefined
> {
  entityType?: string;
}

export interface UnhideAllEntitiesResponse {
  success: true;
  message: string;
  count: number;
}

/** The entity types a user can hide */
export type HiddenEntityType =
  | "scene"
  | "performer"
  | "studio"
  | "tag"
  | "group"
  | "gallery"
  | "image";

/** GET /api/user/hidden-entities */
export interface GetHiddenEntitiesQuery extends Record<
  string,
  string | string[] | undefined
> {
  entityType?: string;
  /** 1-based, default 1 */
  page?: string;
  /** 1 to 100, default 50 */
  per_page?: string;
}

/**
 * What the Hidden Items page shows of an entity the user could see if they
 * had hidden nothing, read from the instance it shows from.
 */
export interface HiddenEntitySummary {
  id: string;
  /** The instance the entity shows from (a hide stored for every instance resolves to one) */
  instanceId: string;
  /** Title or name, else the file or folder name; null when there is none */
  name: string | null;
  /** A Peek proxy URL naming `instanceId`, used as it is; null for no image */
  imageUrl: string | null;
}

/** One hidden row */
export interface HiddenEntityItem {
  id: number;
  entityType: HiddenEntityType;
  entityId: string;
  /** As stored: "" for a hide that applies to every instance */
  instanceId: string;
  /** ISO timestamp */
  hiddenAt: string;
  /** The user could not see the entity even without their own hides */
  restricted: boolean;
  /** null when restricted */
  summary: HiddenEntitySummary | null;
}

export interface GetHiddenEntitiesResponse {
  /** The page's rows, newest first */
  items: HiddenEntityItem[];
  /** Rows of the requested type (every hideable type when none) */
  total: number;
  /** The user's rows per hideable type, whatever type was requested */
  counts: Record<HiddenEntityType, number>;
}

/** POST /api/user/hidden-entities/bulk */
export interface HideEntitiesBody {
  entities: Array<{
    entityType: string;
    entityId: string;
    /** The entity's Stash instance; a target without one answers 400 */
    instanceId: string;
  }>;
}

export interface HideEntitiesResponse {
  success: true;
  message: string;
  successCount: number;
  failCount: number;
}

/** PUT /api/user/hide-confirmation */
export interface UpdateHideConfirmationBody {
  hideConfirmationDisabled: boolean;
}

export interface UpdateHideConfirmationResponse {
  success: true;
  hideConfirmationDisabled: boolean;
}

// =============================================================================
// PERMISSIONS
// =============================================================================

/** GET /api/users/:userId/permissions */
export interface GetUserPermissionsParams extends Record<string, string> {
  userId: string;
}

/** PUT /api/users/:userId/permission-overrides */
export interface UpdatePermissionOverridesBody {
  canShareOverride?: boolean | null;
  canDownloadFilesOverride?: boolean | null;
  canDownloadPlaylistsOverride?: boolean | null;
}

/** GET /api/users/:userId/groups */
export interface GetUserGroupMembershipsParams extends Record<string, string> {
  userId: string;
}

// =============================================================================
// ADMIN PASSWORD / RECOVERY KEY
// =============================================================================

/** PUT /api/users/:userId/reset-password */
export interface AdminResetPasswordParams extends Record<string, string> {
  userId: string;
}

export interface AdminResetPasswordBody {
  newPassword: string;
}

export interface AdminResetPasswordResponse {
  success: true;
}

/** POST /api/users/:userId/regenerate-recovery-key */
export interface AdminRegenerateRecoveryKeyParams extends Record<
  string,
  string
> {
  userId: string;
}

export interface AdminRegenerateRecoveryKeyResponse {
  recoveryKey: string;
}

// =============================================================================
// USER STASH INSTANCE SELECTION
// =============================================================================

/** PUT /api/user/stash-instances */
export interface UpdateUserStashInstancesBody {
  instanceIds: string[];
}

// =============================================================================
// SETUP STATUS
// =============================================================================

/** POST /api/user/complete-setup */
export interface CompleteSetupBody {
  selectedInstanceIds?: string[];
}

/** POST /api/user/complete-setup. The first recovery key, shown this once; null when setup was already complete. */
export interface CompleteSetupResponse {
  success: true;
  recoveryKey: string | null;
}
