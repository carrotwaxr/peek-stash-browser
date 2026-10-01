/**
 * Hierarchical query key factory for TanStack Query.
 *
 * Keys encode `instanceId` at the root level so all instance-scoped queries
 * can be invalidated at once when the active instance changes.
 *
 * Pattern: [domain, instanceId?, ...specifics]
 */
import type { WatchedScenesSort, WatchedScenesView } from "@peek/shared-types";

/** One request for the viewer's watched scenes (`GET /watch-history/scenes`) */
export interface WatchedScenesKeyParams {
  view: WatchedScenesView;
  sort: WatchedScenesSort;
  page: number;
  perPage: number;
  /** `false` when the totals are not wanted (`count=false`) */
  count?: boolean;
}

export const queryKeys = {
  // ── Library (entity search) ──────────────────────────────────────────
  scenes: {
    all: (instanceId?: string) => ["scenes", instanceId] as const,
    list: (instanceId: string | undefined, params: Record<string, unknown>) =>
      ["scenes", instanceId, "list", params] as const,
    detail: (instanceId: string | undefined, id: string | undefined) =>
      ["scenes", instanceId, "detail", id] as const,
    externalPlayerLink: (instanceId: string | undefined, id: string) =>
      ["scenes", instanceId, "externalPlayerLink", id] as const,
    similar: (instanceId: string, id: string, page: number) =>
      ["scenes", instanceId, "similar", id, page] as const,
    recommended: (page: number, perPage: number) =>
      ["scenes", undefined, "recommended", { page, perPage }] as const,
  },
  performers: {
    all: (instanceId?: string) => ["performers", instanceId] as const,
    list: (instanceId: string | undefined, params: Record<string, unknown>) =>
      ["performers", instanceId, "list", params] as const,
    detail: (instanceId: string | undefined, id: string | undefined) =>
      ["performers", instanceId, "detail", id] as const,
    counts: (
      instanceId: string | undefined,
      id: string | undefined,
      options: Record<string, boolean>
    ) => ["performers", instanceId, "counts", id, options] as const,
  },
  studios: {
    all: (instanceId?: string) => ["studios", instanceId] as const,
    list: (instanceId: string | undefined, params: Record<string, unknown>) =>
      ["studios", instanceId, "list", params] as const,
    detail: (instanceId: string | undefined, id: string | undefined) =>
      ["studios", instanceId, "detail", id] as const,
    counts: (
      instanceId: string | undefined,
      id: string | undefined,
      options: Record<string, boolean>
    ) => ["studios", instanceId, "counts", id, options] as const,
  },
  tags: {
    all: (instanceId?: string) => ["tags", instanceId] as const,
    list: (instanceId: string | undefined, params: Record<string, unknown>) =>
      ["tags", instanceId, "list", params] as const,
    tree: (scope: Record<string, unknown> | undefined, untagged?: string) =>
      ["tags", undefined, "tree", scope ?? null, untagged ?? null] as const,
    detail: (instanceId: string | undefined, id: string | undefined) =>
      ["tags", instanceId, "detail", id] as const,
    counts: (
      instanceId: string | undefined,
      id: string | undefined,
      options: Record<string, boolean>
    ) => ["tags", instanceId, "counts", id, options] as const,
  },
  galleries: {
    all: (instanceId?: string) => ["galleries", instanceId] as const,
    list: (instanceId: string | undefined, params: Record<string, unknown>) =>
      ["galleries", instanceId, "list", params] as const,
    detail: (instanceId: string | undefined, id: string | undefined) =>
      ["galleries", instanceId, "detail", id] as const,
    counts: (
      instanceId: string | undefined,
      id: string | undefined,
      options: Record<string, boolean>
    ) => ["galleries", instanceId, "counts", id, options] as const,
  },
  groups: {
    all: (instanceId?: string) => ["groups", instanceId] as const,
    list: (instanceId: string | undefined, params: Record<string, unknown>) =>
      ["groups", instanceId, "list", params] as const,
    detail: (instanceId: string | undefined, id: string | undefined) =>
      ["groups", instanceId, "detail", id] as const,
    counts: (
      instanceId: string | undefined,
      id: string | undefined,
      options: Record<string, boolean>
    ) => ["groups", instanceId, "counts", id, options] as const,
  },
  images: {
    all: (instanceId?: string) => ["images", instanceId] as const,
    list: (instanceId: string | undefined, params: Record<string, unknown>) =>
      ["images", instanceId, "list", params] as const,
  },

  // Whether the user's library can be shown yet (useLibraryReady)
  library: {
    ready: () => ["library", "ready"] as const,
  },

  // ── Carousels ────────────────────────────────────────────────────────
  // The Home page's built-in carousels
  homeCarousels: {
    all: () => ["homeCarousel"] as const,
    byKey: (fetchKey: string) => ["homeCarousel", fetchKey] as const,
  },
  // The viewer's watched scenes (Continue Watching, Watch History). The root
  // is one the library predicate matches: a hide, a restore or an instance
  // change refetches it (`invalidateLibraryQueries`)
  watchHistory: {
    all: () => ["watchHistory"] as const,
    scenes: (params: WatchedScenesKeyParams) =>
      ["watchHistory", "scenes", params] as const,
  },
  // The user's custom carousels
  carousels: {
    all: () => ["carousels"] as const,
    list: () => ["carousels", "list"] as const,
    detail: (id: string) => ["carousels", "detail", id] as const,
    execute: (id: string) => ["carousels", "execute", id] as const,
  },

  // ── User data ────────────────────────────────────────────────────────
  user: {
    /** The user's settings (GET /user/settings), read by useUserSettings */
    settings: () => ["user", "settings"] as const,
    stats: () => ["user", "stats"] as const,
    permissions: () => ["user", "permissions"] as const,
    filterPresets: () => ["user", "filterPresets"] as const,
    defaultPresets: () => ["user", "defaultPresets"] as const,
    watchHistory: (page?: number) => ["user", "watchHistory", page] as const,
    hiddenEntities: () => ["user", "hiddenEntities"] as const,
    /** One page of the Hidden Items list; `hiddenEntities()` is its prefix */
    hiddenItems: (type: string, page: number) =>
      ["user", "hiddenEntities", type, page] as const,
  },

  // ── Playlists ────────────────────────────────────────────────────────
  playlists: {
    /** The prefix of every playlist query: one invalidation covers them all */
    all: () => ["playlists"] as const,
    /** The user's playlists, with `containsScene` when the menu asks */
    list: (params: { containsScene?: string } = {}) =>
      ["playlists", "list", params] as const,
    shared: () => ["playlists", "shared"] as const,
    /** One page of one playlist's items in one order */
    detail: (playlistId: number, params: object = {}) =>
      ["playlists", "detail", playlistId, params] as const,
    /** One playlist's play queue in one order */
    queue: (playlistId: number, sort?: string, direction?: string) =>
      ["playlists", "queue", playlistId, sort, direction] as const,
    shares: (playlistId: number) =>
      ["playlists", "shares", playlistId] as const,
  },

  // ── Clips ────────────────────────────────────────────────────────────
  clips: {
    all: () => ["clips"] as const,
    list: (params: Record<string, unknown>) =>
      ["clips", "list", params] as const,
    forScene: (sceneId: string, instanceId?: string) =>
      ["clips", "forScene", sceneId, instanceId] as const,
  },

  // ── Admin ────────────────────────────────────────────────────────────
  admin: {
    groups: () => ["admin", "groups"] as const,
    group: (id: string) => ["admin", "groups", id] as const,
    userPermissions: (userId: number) =>
      ["admin", "userPermissions", userId] as const,
    userGroups: (userId: number) => ["admin", "userGroups", userId] as const,
  },

  // ── Setup ────────────────────────────────────────────────────────────
  setup: {
    status: () => ["setup", "status"] as const,
  },

  // ── Config / Server ──────────────────────────────────────────────────
  config: {
    all: () => ["config"] as const,
    syncStatus: () => ["config", "syncStatus"] as const,
  },
} as const;
