/**
 * The bridge from the request parser's criteria (`ParsedFilter`) to the
 * filter shapes the query builders still read: each `FilterRef` back to the
 * "id" or "id:instanceId" string the builders parse, a multi-valued enum back
 * to its value list, and the tag list's scene and collection refs back under
 * `scenes_filter`. Every criterion arrives validated, with its modifier set,
 * so a builder sees what a well-formed request carried before the parser.
 *
 * Transitional: each builder port (C4 to C8) takes `ParsedListRequest`
 * directly and drops its entity's call; C8 deletes this file.
 */
import {
  type EntityKind,
  FIELDS,
  type FieldSpec,
} from "@peek/shared-types/filters/index.js";
import {
  coerceEntityRefs,
  makeEntityRef,
} from "@peek/shared-types/instanceAwareId.js";
import type { ClipQueryOptions } from "../services/ClipService.js";
import type {
  PeekGalleryFilter,
  PeekGroupFilter,
  PeekPerformerFilter,
  PeekSceneFilter,
  PeekStudioFilter,
  PeekTagFilter,
} from "../types/index.js";
import type {
  FilterRef,
  MultiEnumCriterion,
  ParsedClipFilter,
  ParsedFilter,
  RefCriterion,
} from "../types/parsedFilters.js";

/** The filter each list's query builder reads */
export interface LegacyFilters {
  scene: PeekSceneFilter;
  performer: PeekPerformerFilter;
  studio: PeekStudioFilter;
  tag: PeekTagFilter;
  group: PeekGroupFilter;
  gallery: PeekGalleryFilter;
  /** No builder reads it: the image builder takes the parsed filter (C7) */
  image: Record<string, unknown>;
}

/** A ref as the wire spells it: "id" when bare, else "id:instanceId" */
function refValue(ref: FilterRef): string {
  return ref.instanceId === undefined
    ? ref.id
    : makeEntityRef(ref.id, ref.instanceId);
}

/** One parsed criterion in the builder's shape */
function legacyCriterion(spec: FieldSpec, criterion: unknown): unknown {
  switch (spec.kind) {
    case "ref": {
      const { refs, modifier, depth } = criterion as RefCriterion;
      const value = coerceEntityRefs(refs.map(refValue));
      return spec.hierarchical
        ? { value, modifier, depth }
        : { value, modifier };
    }
    case "enum":
      if (spec.multi) {
        const { values, modifier } = criterion as MultiEnumCriterion<string>;
        return { value: [...values], modifier };
      }
      return { ...(criterion as object) };
    case "number":
    case "date":
    case "text":
      // Already { modifier, value?, value2? }
      return { ...(criterion as object) };
    case "boolean":
    case "instance":
      return criterion;
  }
}

const fieldMaps = new Map<EntityKind, ReadonlyMap<string, FieldSpec>>(
  Object.entries(FIELDS).map(([entity, fields]) => [
    entity as EntityKind,
    new Map<string, FieldSpec>(Object.entries(fields)),
  ])
);

/** The parsed filter in the shape `entity`'s query builder reads */
export function toLegacyFilter<E extends EntityKind>(
  entity: E,
  filter: ParsedFilter<E>
): LegacyFilters[E] {
  const specs = fieldMaps.get(entity);
  const legacy: Record<string, unknown> = {};
  for (const [name, criterion] of Object.entries(filter)) {
    const spec = specs?.get(name);
    if (spec === undefined) {
      throw new Error(`No ${entity} filter field named ${name}`);
    }
    const value = legacyCriterion(spec, criterion);
    if (spec.kind === "ref" && spec.path) {
      // Carried nested on the wire (tag scenes_filter.id and .groups)
      const [parent, child] = spec.path;
      const nested = legacy[parent];
      legacy[parent] = {
        ...(typeof nested === "object" && nested !== null ? nested : {}),
        [child]: value,
      };
    } else {
      legacy[name] = value;
    }
  }
  // The one boundary cast: each criterion was validated against its field
  return legacy as LegacyFilters[E];
}

/** The clip list's filter options, as `ClipService.getClips` reads them */
export type LegacyClipFilter = Pick<
  ClipQueryOptions,
  | "isGenerated"
  | "sceneId"
  | "tagIds"
  | "sceneTagIds"
  | "performerIds"
  | "studioId"
>;

/**
 * The parsed clip filter in `ClipService.getClips`' options. The clip
 * builder matches any of the refs whatever the modifier, and takes one scene
 * and one studio (the client sends one): the first ref stands for the
 * criterion until C8 moves the builder onto `RefCriterion`.
 */
export function toLegacyClipFilter(filter: ParsedClipFilter): LegacyClipFilter {
  const values = (criterion: RefCriterion | undefined) =>
    criterion?.refs.map(refValue);
  return {
    isGenerated: filter.isGenerated,
    sceneId: values(filter.sceneId)?.[0],
    tagIds: values(filter.tagIds),
    sceneTagIds: values(filter.sceneTagIds),
    performerIds: values(filter.performerIds),
    studioId: values(filter.studioId)?.[0],
  };
}
