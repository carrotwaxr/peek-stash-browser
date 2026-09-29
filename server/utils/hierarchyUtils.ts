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
 * A row's own parents and children are the builders' (TagQueryBuilder and
 * StudioQueryBuilder, through `services/query/nestedRefs.ts`).
 */
import prisma from "../prisma/singleton.js";
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
