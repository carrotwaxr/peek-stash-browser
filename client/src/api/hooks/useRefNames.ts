import type { MinimalEntity } from "@peek/shared-types";
import { skipToken, useQuery } from "@tanstack/react-query";
import { parseCompositeKey } from "../../utils/compositeKey";
import { libraryApi } from "../library";
import { getPlaylists, getSharedPlaylists } from "../playlists";
import { queryKeys } from "../queryKeys";
import { useLibraryReady } from "./useLibraryReady";

/** The names of some ids: each one named once, and how many the lookup did not return */
export interface RefNames {
  names: string[];
  unavailable: number;
}

/** Ids one lookup carries: the server's most is 100 (`MINIMAL_IDS_MAX`) */
const IDS_PER_LOOKUP = 100;

const NAMED_ENTITIES = [
  "scenes",
  "playlists",
  "performers",
  "studios",
  "tags",
  "groups",
  "galleries",
] as const;
type NamedEntity = (typeof NAMED_ENTITIES)[number];

const isNamedEntity = (value: string | undefined): value is NamedEntity =>
  NAMED_ENTITIES.some((entity) => entity === value);

const request = (ids: readonly string[]) => ({
  ids: [...ids],
  filter: { per_page: IDS_PER_LOOKUP },
});

/** The entity's `/minimal` endpoint, asked for these ids */
function findNames(
  entityType: NamedEntity,
  ids: readonly string[],
  signal: AbortSignal
): Promise<MinimalEntity[]> {
  switch (entityType) {
    case "scenes":
      return libraryApi.findScenesMinimal(request(ids), signal);
    case "playlists":
      return playlistsNamed();
    case "performers":
      return libraryApi.findPerformersMinimal(request(ids), signal);
    case "studios":
      return libraryApi.findStudiosMinimal(request(ids), signal);
    case "tags":
      return libraryApi.findTagsMinimal(request(ids), signal);
    case "groups":
      return libraryApi.findGroupsMinimal(request(ids), signal);
    case "galleries":
      return libraryApi.findGalleriesMinimal(request(ids), signal);
  }
}

/**
 * The viewer's playlists, their own and those shared with them, as named
 * ids: Peek playlist ids, which no `/minimal` endpoint knows. The instance
 * is empty: a playlist id is never joined with one.
 */
async function playlistsNamed(): Promise<MinimalEntity[]> {
  const [own, shared] = await Promise.all([
    getPlaylists(),
    getSharedPlaylists(),
  ]);
  return [...own.playlists, ...shared.playlists].map((playlist) => ({
    id: String(playlist.id),
    instanceId: "",
    name: playlist.name,
  }));
}

/**
 * Each entity's query key, under the root the library queries share; the
 * playlists' under the playlists root, which a playlist change invalidates
 */
const KEYS: Record<
  NamedEntity,
  (ids: readonly string[]) => readonly unknown[]
> = {
  scenes: queryKeys.scenes.names,
  playlists: queryKeys.playlists.names,
  performers: queryKeys.performers.names,
  studios: queryKeys.studios.names,
  tags: queryKeys.tags.names,
  groups: queryKeys.groups.names,
  galleries: queryKeys.galleries.names,
};

/**
 * What the ids name, from what the lookup returned: an "id:instanceId"
 * matches that instance's entity, a bare id (an old preset or bookmark)
 * every instance's, and the same name on two instances is one name. An id
 * nothing matched (hidden, restricted or gone) counts as unavailable.
 */
function namesOf(
  ids: readonly string[],
  entities: readonly MinimalEntity[]
): RefNames {
  const names = new Set<string>();
  let unavailable = 0;
  for (const stored of ids) {
    const { id, instanceId } = parseCompositeKey(stored);
    const found = entities.filter(
      (entity) =>
        entity.id === id &&
        (instanceId === undefined || entity.instanceId === instanceId)
    );
    if (found.length === 0) unavailable += 1;
    for (const entity of found) names.add(entity.name || "Unknown");
  }
  return { names: [...names], unavailable };
}

/**
 * The names of the entities a filter chip shows, with one `/minimal`
 * request carrying the ids (the server applies the user's exclusions and
 * instances); a scene's name is its title. Playlist ids are named from the
 * viewer's own and shared playlists (an id neither lists is unavailable).
 * Keyed under the entity's root, so a hide, a restore or an instance change
 * asks again and logout clears it. Nothing is asked for an entity without a
 * `/minimal` endpoint or for no ids.
 */
export function useRefNames(
  entityType: string | undefined,
  ids: readonly string[]
) {
  const { ready } = useLibraryReady();
  const named = isNamedEntity(entityType) ? entityType : undefined;
  return useQuery({
    queryKey:
      named === undefined
        ? (["names", entityType ?? null, ids] as const)
        : KEYS[named](ids),
    queryFn:
      named !== undefined && ids.length > 0 && ready
        ? ({ signal }) => findNames(named, ids, signal)
        : skipToken,
    select: (entities) => namesOf(ids, entities),
  });
}
