/**
 * Stand-in for `utils/hierarchyUtils.js` in the builder tests. Use it as
 * `vi.mock("../../utils/hierarchyUtils.js", () => import("../helpers/hierarchyMock.js"))`.
 *
 * With a depth, each ref expands to itself and one descendant, "99", on the
 * ref's own instance (the direction is ignored); a bare ref does so on every allowed instance. Depth 0
 * leaves the refs as they are, as the real expansion does.
 */
import { vi } from "vitest";
import type { FilterRef } from "../../types/parsedFilters.js";
import { entityKey } from "../../utils/entityRef.js";

export const DESCENDANT = "99";

function expandOne(
  ref: FilterRef,
  depth: number,
  allowedInstanceIds: readonly string[]
): readonly FilterRef[] {
  if (depth === 0) return [ref];
  const instances =
    ref.instanceId === undefined ? allowedInstanceIds : [ref.instanceId];
  return instances.flatMap((instanceId) => [
    { id: ref.id, instanceId },
    { id: DESCENDANT, instanceId },
  ]);
}

export const expandRefsEach = vi.fn(
  (
    _kind: "tag" | "studio" | "group",
    refs: readonly FilterRef[],
    depth: number,
    allowedInstanceIds: readonly string[],
    _direction: "down" | "up" = "down"
  ): Promise<readonly (readonly FilterRef[])[]> =>
    Promise.resolve(
      refs.map((ref) => expandOne(ref, depth, allowedInstanceIds))
    )
);

/** The groups as one set, each ref once, as the real expansion returns it */
function distinct(groups: readonly (readonly FilterRef[])[]): FilterRef[] {
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

export const expandRefs = vi.fn(
  (
    kind: "tag" | "studio" | "group",
    refs: readonly FilterRef[],
    depth: number,
    allowedInstanceIds: readonly string[],
    direction: "down" | "up" = "down"
  ): Promise<readonly FilterRef[]> =>
    depth === 0
      ? Promise.resolve(refs)
      : expandRefsEach(kind, refs, depth, allowedInstanceIds, direction).then(
          distinct
        )
);
