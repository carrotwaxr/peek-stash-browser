/**
 * Complete fixtures several server test files share: Prisma rows, the include
 * payloads mocks return, and service results.
 *
 * Each row builder fills every column with its schema default (or a fixed
 * placeholder where the column has none), so a mock returns a row of the real
 * shape; pass only the fields a test cares about. For a row shaped by a
 * query's `select`, or a model only one file mocks, use `partialRow` from
 * `prismaMock.ts` instead.
 */
import {
  DEFAULT_SORT,
  type EntityKind,
} from "@peek/shared-types/filters/index.js";
import type { Download, Prisma, StashInstance, User } from "@prisma/client";
import type { UserPermissions } from "../../services/PermissionService.js";
import type {
  ClipListRequest,
  ParsedListRequest,
} from "../../types/parsedFilters.js";

/** A user with their groups, as `groupMemberships: { include: { group: true } }` returns it. */
export type UserWithGroups = Prisma.UserGetPayload<{
  include: { groupMemberships: { include: { group: true } } };
}>;

/** A playlist with its items, as `include: { items: true }` returns it. */
export type PlaylistWithItems = Prisma.PlaylistGetPayload<{
  include: { items: true };
}>;

/** A playlist share with its group, as `include: { group: true }` returns it. */
export type PlaylistShareWithGroup = Prisma.PlaylistShareGetPayload<{
  include: { group: true };
}>;

/** A group membership with its group, as `include: { group: true }` returns it. */
export type MembershipWithGroup = Prisma.UserGroupMembershipGetPayload<{
  include: { group: true };
}>;

const EPOCH = new Date("2026-01-01T00:00:00.000Z");

/** A `User` row: a plain USER account with the schema's default settings. */
export function userRow(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    username: "testuser",
    password: "hashed-password",
    role: "USER",
    createdAt: EPOCH,
    updatedAt: EPOCH,
    preferredQuality: "auto",
    preferredPlaybackMode: "auto",
    preferredPreviewQuality: "sprite",
    wallPlayback: "autoplay",
    enableCast: true,
    theme: "dark",
    carouselPreferences: null,
    navPreferences: null,
    filterPresets: null,
    defaultFilterPresets: null,
    unitPreference: "metric",
    tableColumnDefaults: null,
    cardDisplaySettings: null,
    landingPagePreference: { pages: ["home"], randomize: false },
    lightboxDoubleTapAction: "favorite",
    setupCompleted: false,
    setupCompletedAt: null,
    minimumPlayPercent: 20,
    syncToStash: false,
    hideConfirmationDisabled: false,
    canShareOverride: null,
    canDownloadFilesOverride: null,
    canDownloadPlaylistsOverride: null,
    recoveryKeyHash: null,
    passwordChangedAt: null,
    ...overrides,
  };
}

/** A `StashInstance` row: enabled, priority 0, its first sync done. */
export function stashInstanceRow(
  overrides: Partial<StashInstance> = {}
): StashInstance {
  return {
    id: "instance-1",
    name: "Default",
    description: null,
    url: "http://stash:9999/graphql",
    uiUrl: null,
    apiKey: "test-api-key",
    enabled: true,
    priority: 0,
    createdAt: EPOCH,
    updatedAt: EPOCH,
    lastFullPassAt: null,
    firstSyncedAt: EPOCH,
    ...overrides,
  };
}

/**
 * A `Download` row: a scene download completed just now, with no expiry.
 */
export function downloadRow(overrides: Partial<Download> = {}): Download {
  return {
    id: 1,
    userId: 1,
    type: "SCENE",
    status: "COMPLETED",
    playlistId: null,
    entityType: "scene",
    entityId: "scene-123",
    instanceId: "inst-a",
    fileName: "test.mp4",
    fileSize: BigInt(1000),
    filePath: null,
    progress: 100,
    error: null,
    createdAt: new Date(),
    completedAt: new Date(),
    expiresAt: null,
    ...overrides,
  };
}

/** Resolved permissions: nothing granted, every source the default. */
export function userPermissions(
  overrides: Partial<UserPermissions> = {}
): UserPermissions {
  return {
    canShare: false,
    canDownloadFiles: false,
    canDownloadPlaylists: false,
    sources: {
      canShare: "default",
      canDownloadFiles: "default",
      canDownloadPlaylists: "default",
    },
    ...overrides,
  };
}

/**
 * A parsed list request for one entity, as the request parser hands it to
 * the query builders: page 1 of 10 in the entity's default sort, no filter,
 * no search. Pass only the parts a test changes.
 */
export function parsedListRequest<E extends EntityKind>(
  entity: E,
  overrides: Partial<ParsedListRequest<E>> = {}
): ParsedListRequest<E> {
  // DEFAULT_SORT holds a member of each entity's sort list
  const sort = DEFAULT_SORT[entity] as {
    field: ParsedListRequest<E>["sort"]["field"];
    direction: "ASC" | "DESC";
  };
  return {
    page: 1,
    perPage: 10,
    q: undefined,
    sort: { field: sort.field, direction: sort.direction, seed: undefined },
    filter: {},
    specificInstanceId: undefined,
    ...overrides,
  };
}

/**
 * A clip list request as the clip builder takes it: page 1 of 24, newest
 * first (the clips' default sort), no filter (`isGenerated` absent: every
 * clip), no search. Pass only the parts a test changes.
 */
export function parsedClipRequest(
  overrides: Partial<ClipListRequest> = {}
): ClipListRequest {
  return {
    page: 1,
    perPage: 24,
    q: undefined,
    sort: { field: "stashCreatedAt", direction: "DESC", seed: undefined },
    filter: {},
    specificInstanceId: undefined,
    ...overrides,
  };
}
