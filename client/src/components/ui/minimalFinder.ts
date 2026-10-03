import type { MinimalEntity, MinimalRequest } from "@peek/shared-types";
import { libraryApi } from "../../api";

/** The entity types that have a `/minimal` endpoint */
export type MinimalEntityType =
  | "scenes"
  | "performers"
  | "studios"
  | "tags"
  | "groups"
  | "galleries";

export type FindMinimal = (
  params: MinimalRequest,
  signal?: AbortSignal
) => Promise<MinimalEntity[]>;

/** The entity's `/minimal` endpoint; undefined for a type that has none */
export function minimalFinder(entityType: string): FindMinimal | undefined {
  const finders: Record<MinimalEntityType, FindMinimal> = {
    // The scene endpoint takes neither a scope nor a count filter
    scenes: ({ ids, filter }, signal) =>
      libraryApi.findScenesMinimal(
        { ...(ids ? { ids } : {}), ...(filter ? { filter } : {}) },
        signal
      ),
    performers: libraryApi.findPerformersMinimal,
    studios: libraryApi.findStudiosMinimal,
    tags: libraryApi.findTagsMinimal,
    groups: libraryApi.findGroupsMinimal,
    galleries: libraryApi.findGalleriesMinimal,
  };
  return Object.prototype.hasOwnProperty.call(finders, entityType)
    ? finders[entityType as MinimalEntityType]
    : undefined;
}
