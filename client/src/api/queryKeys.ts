/**
 * Hierarchical query key factory for TanStack Query.
 *
 * Keys encode `instanceId` at the root level so all instance-scoped queries
 * can be invalidated at once when the active instance changes.
 *
 * Pattern: [domain, instanceId?, ...specifics]
 */

export const queryKeys = {
  // ── Library (entity search) ──────────────────────────────────────────
  scenes: {
    all: (instanceId?: string) => ["scenes", instanceId] as const,
    list: (instanceId: string | undefined, params: Record<string, unknown>) =>
      ["scenes", instanceId, "list", params] as const,
    detail: (instanceId: string | undefined, id: string) =>
      ["scenes", instanceId, "detail", id] as const,
  },
  performers: {
    all: (instanceId?: string) => ["performers", instanceId] as const,
    list: (instanceId: string | undefined, params: Record<string, unknown>) =>
      ["performers", instanceId, "list", params] as const,
    detail: (instanceId: string | undefined, id: string) =>
      ["performers", instanceId, "detail", id] as const,
    minimal: (instanceId: string | undefined, params: Record<string, unknown>) =>
      ["performers", instanceId, "minimal", params] as const,
  },
  studios: {
    all: (instanceId?: string) => ["studios", instanceId] as const,
    list: (instanceId: string | undefined, params: Record<string, unknown>) =>
      ["studios", instanceId, "list", params] as const,
    detail: (instanceId: string | undefined, id: string) =>
      ["studios", instanceId, "detail", id] as const,
    minimal: (instanceId: string | undefined, params: Record<string, unknown>) =>
      ["studios", instanceId, "minimal", params] as const,
  },
  tags: {
    all: (instanceId?: string) => ["tags", instanceId] as const,
    list: (instanceId: string | undefined, params: Record<string, unknown>) =>
      ["tags", instanceId, "list", params] as const,
    detail: (instanceId: string | undefined, id: string) =>
      ["tags", instanceId, "detail", id] as const,
    minimal: (instanceId: string | undefined, params: Record<string, unknown>) =>
      ["tags", instanceId, "minimal", params] as const,
  },
  galleries: {
    all: (instanceId?: string) => ["galleries", instanceId] as const,
    list: (instanceId: string | undefined, params: Record<string, unknown>) =>
      ["galleries", instanceId, "list", params] as const,
    detail: (instanceId: string | undefined, id: string) =>
      ["galleries", instanceId, "detail", id] as const,
    images: (instanceId: string | undefined, galleryId: string, params: Record<string, unknown>) =>
      ["galleries", instanceId, "images", galleryId, params] as const,
    minimal: (instanceId: string | undefined, params: Record<string, unknown>) =>
      ["galleries", instanceId, "minimal", params] as const,
  },
  groups: {
    all: (instanceId?: string) => ["groups", instanceId] as const,
    list: (instanceId: string | undefined, params: Record<string, unknown>) =>
      ["groups", instanceId, "list", params] as const,
    detail: (instanceId: string | undefined, id: string) =>
      ["groups", instanceId, "detail", id] as const,
    minimal: (instanceId: string | undefined, params: Record<string, unknown>) =>
      ["groups", instanceId, "minimal", params] as const,
  },
  images: {
    all: (instanceId?: string) => ["images", instanceId] as const,
    list: (instanceId: string | undefined, params: Record<string, unknown>) =>
      ["images", instanceId, "list", params] as const,
  },

  // ── Carousels ────────────────────────────────────────────────────────
  carousels: {
    all: () => ["carousels"] as const,
    list: () => ["carousels", "list"] as const,
    detail: (id: string) => ["carousels", "detail", id] as const,
    execute: (id: string) => ["carousels", "execute", id] as const,
  },

  // ── User data ────────────────────────────────────────────────────────
  user: {
    stats: () => ["user", "stats"] as const,
    permissions: () => ["user", "permissions"] as const,
    filterPresets: () => ["user", "filterPresets"] as const,
    defaultPresets: () => ["user", "defaultPresets"] as const,
    watchHistory: (page?: number) => ["user", "watchHistory", page] as const,
    hiddenEntities: () => ["user", "hiddenEntities"] as const,
  },

  // ── Playlists ────────────────────────────────────────────────────────
  playlists: {
    all: () => ["playlists"] as const,
    shared: () => ["playlists", "shared"] as const,
    shares: (playlistId: number) => ["playlists", "shares", playlistId] as const,
  },

  // ── Clips ────────────────────────────────────────────────────────────
  clips: {
    all: () => ["clips"] as const,
    list: (params: Record<string, unknown>) => ["clips", "list", params] as const,
    forScene: (sceneId: string, instanceId?: string) =>
      ["clips", "forScene", sceneId, instanceId] as const,
  },

  // ── Admin ────────────────────────────────────────────────────────────
  admin: {
    groups: () => ["admin", "groups"] as const,
    group: (id: string) => ["admin", "groups", id] as const,
    userPermissions: (userId: number) => ["admin", "userPermissions", userId] as const,
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
