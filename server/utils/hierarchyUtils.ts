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
 * levels. Direction "up" walks to the ancestors instead (parent tags, the
 * parent studio, the collections containing a collection); collections
 * ("group") follow GroupRelation between live collections only.
 *
 * A row's own parents and children are the builders' (TagQueryBuilder and
 * StudioQueryBuilder, through `services/query/nestedRefs.ts`).
 */
import prisma from "../prisma/singleton.js";
import type { FilterRef } from "../types/parsedFilters.js";
import { type EntityRef, entityKey } from "./entityRef.js";
import { parseJsonArray } from "./sqlHelpers.js";

export type HierarchyKind = "tag" | "studio" | "group";

/** "down" walks to the descendants, "up" to the ancestors */
type Direction = "down" | "up";

/**
 * The links of each entity, by its key, for the instances loaded: its
 * children walking down, its parents walking up
 */
type Links = Map<string, EntityRef[]>;

function isBare(ref: FilterRef): boolean {
  return ref.instanceId === undefined || ref.instanceId === "";
}

/**
 * The live rows' parent links of the instances: children by parent walking
 * down, parents by child walking up. One statement, whatever the number of
 * refs: three columns for tags and studios, the links between live
 * collections (joined to both ends) for collections.
 */
async function loadLinks(
  kind: HierarchyKind,
  instanceIds: readonly string[],
  direction: Direction
): Promise<Links> {
  const links: Links = new Map();
  const add = (parent: EntityRef, child: EntityRef) => {
    const [from, to] = direction === "down" ? [parent, child] : [child, parent];
    const key = entityKey(from.id, from.instanceId);
    const list = links.get(key);
    if (list === undefined) links.set(key, [to]);
    else list.push(to);
  };
  const instances = [...instanceIds];
  const where = { stashInstanceId: { in: instances }, deletedAt: null };
  if (kind === "tag") {
    const rows = await prisma.stashTag.findMany({
      where,
      select: { id: true, stashInstanceId: true, parentIds: true },
    });
    for (const row of rows) {
      // A parent list that is not JSON reads as no parents
      for (const parentId of parseJsonArray<unknown>(row.parentIds)) {
        add(
          { id: String(parentId), instanceId: row.stashInstanceId },
          { id: row.id, instanceId: row.stashInstanceId }
        );
      }
    }
  } else if (kind === "studio") {
    const rows = await prisma.stashStudio.findMany({
      where,
      select: { id: true, stashInstanceId: true, parentId: true },
    });
    for (const row of rows) {
      if (row.parentId !== null) {
        add(
          { id: row.parentId, instanceId: row.stashInstanceId },
          { id: row.id, instanceId: row.stashInstanceId }
        );
      }
    }
  } else {
    // A link to or from a deleted collection is not followed
    const rows = await prisma.groupRelation.findMany({
      where: {
        containingInstanceId: { in: instances },
        subInstanceId: { in: instances },
        containing: { deletedAt: null },
        sub: { deletedAt: null },
      },
      select: {
        containingId: true,
        containingInstanceId: true,
        subId: true,
        subInstanceId: true,
      },
    });
    for (const row of rows) {
      add(
        { id: row.containingId, instanceId: row.containingInstanceId },
        { id: row.subId, instanceId: row.subInstanceId }
      );
    }
  }
  return links;
}

/**
 * The root, then what it links to (its descendants, or its ancestors when
 * the map is by child) to the depth, breadth first, each once
 */
function withDescendants(
  children: Links,
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
 * One group per selected ref: the ref with its descendants (ancestors going
 * "up") to the depth,
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
  allowedInstanceIds: readonly string[],
  direction: Direction = "down"
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
  const links =
    involved.size === 0
      ? new Map<string, EntityRef[]>()
      : await loadLinks(kind, [...involved], direction);
  return refs.map((ref): readonly FilterRef[] => {
    const { id, instanceId } = ref;
    if (isBare(ref)) {
      return allowedInstanceIds.flatMap((instanceId) =>
        withDescendants(links, { id, instanceId }, depth)
      );
    }
    if (instanceId === undefined || !allowed.has(instanceId)) return [ref];
    return withDescendants(links, { id, instanceId }, depth);
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
  allowedInstanceIds: readonly string[],
  direction: Direction = "down"
): Promise<readonly FilterRef[]> {
  if (depth === 0) return refs;
  const groups = await expandRefsEach(
    kind,
    refs,
    depth,
    allowedInstanceIds,
    direction
  );
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
