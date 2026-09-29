/**
 * Hierarchy Utilities
 *
 * The expansion behind the hierarchical ref filters (tags and studios,
 * item 34b): "Include sub-tags" and "Include sub-studios" add each chosen
 * entity's descendants to the filter. Every ref keeps its instance through
 * it: a ref with an instance expands within that instance's tree, a bare
 * legacy id on every allowed instance, and each descendant carries the
 * instance it was found on, since two Stash servers reuse small ids. The
 * hierarchy is one slim load per request over the involved instances (id,
 * instance and the parent list of every live row), expanded in memory.
 *
 * Depth: 0 none (the refs as they are), -1 every descendant, n that many
 * levels.
 *
 * The hydrators below serve the tag and studio detail pages (C10 moves them
 * into the builders).
 */
import prisma from "../prisma/singleton.js";
import { stashEntityService } from "../services/StashEntityService.js";
import type { FilterRef } from "../types/parsedFilters.js";
import { type EntityRef, entityKey } from "./entityRef.js";
import { parseJsonArray } from "./sqlHelpers.js";

export type HierarchyKind = "tag" | "studio";

/** The children of each entity, by the parent's key, for the instances loaded */
type Children = Map<string, EntityRef[]>;

function isBare(ref: FilterRef): boolean {
  return ref.instanceId === undefined || ref.instanceId === "";
}

/**
 * The live rows' parent links of the instances, as children by parent: one
 * statement selecting three columns, whatever the number of refs.
 */
async function loadChildren(
  kind: HierarchyKind,
  instanceIds: readonly string[]
): Promise<Children> {
  const children: Children = new Map();
  const add = (parentId: string, child: EntityRef) => {
    const key = entityKey(parentId, child.instanceId);
    const list = children.get(key);
    if (list === undefined) children.set(key, [child]);
    else list.push(child);
  };
  const where = { stashInstanceId: { in: [...instanceIds] }, deletedAt: null };
  if (kind === "tag") {
    const rows = await prisma.stashTag.findMany({
      where,
      select: { id: true, stashInstanceId: true, parentIds: true },
    });
    for (const row of rows) {
      // A parent list that is not JSON reads as no parents
      for (const parentId of parseJsonArray<unknown>(row.parentIds)) {
        add(String(parentId), { id: row.id, instanceId: row.stashInstanceId });
      }
    }
  } else {
    const rows = await prisma.stashStudio.findMany({
      where,
      select: { id: true, stashInstanceId: true, parentId: true },
    });
    for (const row of rows) {
      if (row.parentId !== null) {
        add(row.parentId, { id: row.id, instanceId: row.stashInstanceId });
      }
    }
  }
  return children;
}

/** The root, then its descendants to the depth, breadth first, each once */
function withDescendants(
  children: Children,
  root: EntityRef,
  depth: number
): EntityRef[] {
  const seen = new Set([entityKey(root.id, root.instanceId)]);
  const result = [root];
  let frontier = [root];
  for (
    let level = 0;
    frontier.length > 0 && (depth === -1 || level < depth);
    level++
  ) {
    const next: EntityRef[] = [];
    for (const parent of frontier) {
      for (const child of children.get(
        entityKey(parent.id, parent.instanceId)
      ) ?? []) {
        const key = entityKey(child.id, child.instanceId);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(child);
        next.push(child);
      }
    }
    frontier = next;
  }
  return result;
}

/**
 * One group per selected ref: the ref with its descendants to the depth,
 * for a filter that needs every selected entity ("has all of": any
 * descendant of each). A ref with an instance expands within that
 * instance's tree; a bare ref becomes one root per allowed instance, each
 * with that instance's descendants. Only allowed instances are loaded, once
 * for all the refs; a ref on another instance, and every ref at depth 0 or
 * with no allowed instance, stays as it is in a group of its own.
 */
export async function expandRefsEach(
  kind: HierarchyKind,
  refs: readonly FilterRef[],
  depth: number,
  allowedInstanceIds: readonly string[]
): Promise<readonly (readonly FilterRef[])[]> {
  if (depth === 0 || allowedInstanceIds.length === 0) {
    return refs.map((ref) => [ref]);
  }
  const allowed = new Set(allowedInstanceIds);
  const involved = new Set<string>();
  for (const ref of refs) {
    if (isBare(ref)) {
      for (const instanceId of allowedInstanceIds) involved.add(instanceId);
    } else if (ref.instanceId !== undefined && allowed.has(ref.instanceId)) {
      involved.add(ref.instanceId);
    }
  }
  const children =
    involved.size === 0
      ? new Map<string, EntityRef[]>()
      : await loadChildren(kind, [...involved]);
  return refs.map((ref): readonly FilterRef[] => {
    const { id, instanceId } = ref;
    if (isBare(ref)) {
      return allowedInstanceIds.flatMap((instanceId) =>
        withDescendants(children, { id, instanceId }, depth)
      );
    }
    if (instanceId === undefined || !allowed.has(instanceId)) return [ref];
    return withDescendants(children, { id, instanceId }, depth);
  });
}

/**
 * The refs with their descendants to the depth as one set, each once, in
 * the refs' order (see expandRefsEach): the refs themselves at depth 0.
 */
export async function expandRefs(
  kind: HierarchyKind,
  refs: readonly FilterRef[],
  depth: number,
  allowedInstanceIds: readonly string[]
): Promise<readonly FilterRef[]> {
  if (depth === 0) return refs;
  const groups = await expandRefsEach(kind, refs, depth, allowedInstanceIds);
  const seen = new Set<string>();
  const result: FilterRef[] = [];
  for (const ref of groups.flat()) {
    const key = entityKey(ref.id, ref.instanceId ?? "");
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

/**
 * Hydrate tag parent/child relationships
 *
 * Tags only store parentIds. This function:
 * 1. Hydrates parents with full tag data (id + name)
 * 2. Computes children by inverting parent relationships
 *
 * @param tags - Tags to hydrate
 * @returns Tags with hydrated parents and computed children
 */
export async function hydrateTagRelationships<
  T extends {
    id: string;
    name?: string;
    parents?: { id: string; name?: string }[];
  },
>(tags: T[]): Promise<(T & { children: { id: string; name: string }[] })[]> {
  // Fetch ALL tags from cache to build complete name lookup
  // This ensures we can resolve parent names even for single-item requests
  const allTags = await stashEntityService.getAllTags();
  const tagNameMap = new Map<string, string>();
  for (const tag of allTags) {
    tagNameMap.set(tag.id, tag.name || "Unknown");
  }

  // Build children map by inverting parent relationships from ALL tags
  const childrenMap = new Map<string, { id: string; name: string }[]>();
  for (const tag of allTags) {
    if (tag.parents && Array.isArray(tag.parents)) {
      for (const parent of tag.parents) {
        if (!childrenMap.has(parent.id)) {
          childrenMap.set(parent.id, []);
        }
        childrenMap.get(parent.id)?.push({
          id: tag.id,
          name: tag.name || "Unknown",
        });
      }
    }
  }

  // Hydrate each tag in the input array
  return tags.map((tag) => ({
    ...tag,
    // Hydrate parents with names
    parents: (tag.parents ?? []).map((p) => ({
      id: p.id,
      name: tagNameMap.get(p.id) || "Unknown",
    })),
    // Add computed children
    children: childrenMap.get(tag.id) ?? [],
  }));
}

/**
 * Hydrate entity tags with full tag data (id, name, image_path)
 *
 * Entities store tagIds as JSON array of IDs. This function:
 * 1. Fetches all tags from cache
 * 2. Hydrates tag objects with names and image_path (preserving existing data)
 *
 * @param entities - Entities with tags array of {id} objects
 * @returns Entities with hydrated tags array of {id, name, image_path} objects
 */
export async function hydrateEntityTags<
  T extends {
    tags?: { id: string; name?: string; image_path?: string | null }[];
  },
>(entities: T[]): Promise<T[]> {
  // Get all tags to build lookup
  const allTags = await stashEntityService.getAllTags();
  const tagDataMap = new Map<
    string,
    { name: string; image_path: string | null }
  >();
  for (const tag of allTags) {
    tagDataMap.set(tag.id, {
      name: tag.name || "Unknown",
      image_path: tag.image_path || null,
    });
  }

  // Hydrate each entity's tags, preserving existing data
  return entities.map((entity) => ({
    ...entity,
    tags: (entity.tags ?? []).map((t) => {
      const tagData = tagDataMap.get(t.id);
      return {
        ...t,
        id: t.id,
        name: tagData?.name || t.name || "Unknown",
        image_path: t.image_path ?? tagData?.image_path ?? null,
      };
    }),
  }));
}

/**
 * Hydrate studio parent/child relationships
 *
 * Studios only store parentId. This function:
 * 1. Hydrates parent_studio with full studio data (id + name)
 * 2. Computes child_studios by inverting parent relationships
 *
 * @param studios - Studios to hydrate
 * @returns Studios with hydrated parent_studio and computed child_studios
 */
export async function hydrateStudioRelationships<
  T extends {
    id: string;
    name?: string;
    parent_studio?: { id: string; name?: string } | null;
  },
>(
  studios: T[]
): Promise<(T & { child_studios: { id: string; name: string }[] })[]> {
  // Fetch ALL studios from cache to build complete name lookup
  // This ensures we can resolve parent names even for single-item requests
  const allStudios = await stashEntityService.getAllStudios();
  const studioNameMap = new Map<string, string>();
  for (const studio of allStudios) {
    studioNameMap.set(studio.id, studio.name || "Unknown");
  }

  // Build children map by inverting parent relationships from ALL studios
  const childrenMap = new Map<string, { id: string; name: string }[]>();
  for (const studio of allStudios) {
    if (studio.parent_studio?.id) {
      const parentId = studio.parent_studio.id;
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)?.push({
        id: studio.id,
        name: studio.name || "Unknown",
      });
    }
  }

  // Hydrate each studio in the input array
  return studios.map((studio) => ({
    ...studio,
    // Hydrate parent with name
    parent_studio: studio.parent_studio?.id
      ? {
          id: studio.parent_studio.id,
          name: studioNameMap.get(studio.parent_studio.id) || "Unknown",
        }
      : null,
    // Add computed children
    child_studios: childrenMap.get(studio.id) ?? [],
  }));
}
