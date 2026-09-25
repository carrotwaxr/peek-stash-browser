/**
 * The per-run change set of a sync (item 42).
 *
 * Every batch a sync writes reports what it found (`BatchChanges`, built by
 * `detectChanges` from the rows stored before the write and the junction
 * rows it deleted), and every cleanup reports what it soft-deleted. One
 * `SyncChangeSet` collects them across every instance of the run, and the
 * post-sync steps read it once at the end: nothing changed means no step
 * runs, and the exclusion recompute covers only the users who can see a
 * changed instance. C4 and C5 scope the inheritance and count steps to the
 * refs it holds; C14 and C15 add what they refetch; C17 and C18 read it too.
 *
 * What counts as changed (lead decision, 2026-09-24): an entity is changed
 * when it is new, its `stashUpdatedAt` differs (clips compare epoch
 * milliseconds), it was soft-deleted and is back, or, for every type but
 * images, its old and new far-side sets differ, or its studio does (scenes
 * and galleries). An image's junction rows and studio are never compared:
 * gallery inheritance writes into them, so a far-side diff would mark nearly
 * every image changed on every full pass.
 *
 * Memory bound: past SCOPE_LIMIT refs, a type switches to "whole library"
 * and stores no more refs (a full sync of a large instance lands there); the
 * instances with a change are still known.
 */
import type { SyncEntityType } from "../types/api/sync.js";

/** One entity on one instance. */
export interface EntityRef {
  id: string;
  instanceId: string;
}

/** The 13 junction tables sync writes. */
export type JunctionName =
  | "ScenePerformer"
  | "SceneTag"
  | "SceneGroup"
  | "SceneGallery"
  | "PerformerTag"
  | "StudioTag"
  | "GroupTag"
  | "GalleryPerformer"
  | "GalleryTag"
  | "ImagePerformer"
  | "ImageTag"
  | "ImageGallery"
  | "ClipTag";

/** What one batch wrote and what of it changed. */
export interface BatchChanges {
  /** Every row written (a row with an unsafe id is skipped) */
  written: EntityRef[];
  /** The rows that are new, updated, resurrected or relinked */
  changed: EntityRef[];
  /** Old and new far sides of the changed entities, per junction */
  farSides: Partial<Record<JunctionName, EntityRef[]>>;
  /** Old and new studio of changed scenes, images and galleries */
  studioIds: EntityRef[];
  /** Performers, studios and groups whose tag set differs */
  tagSetChanged: EntityRef[];
}

/** A batch that wrote nothing. */
export function noChanges(): BatchChanges {
  return {
    written: [],
    changed: [],
    farSides: {},
    studioIds: [],
    tagSetChanged: [],
  };
}

/** What was stored of an entity before its batch wrote it. */
export interface StoredEntity {
  /** As the type compares it: RFC3339 text, or epoch ms for clips */
  updatedAt: string | number | null;
  /** Soft-deleted: the row comes back with this write */
  deleted: boolean;
  studioId?: string | null;
}

/** An entity as Stash returned it, reduced to what the diff reads. */
export interface IncomingEntity {
  id: string;
  updatedAt: string | number | null;
  studioId?: string | null;
  /**
   * Far-side ids on the entity's own instance, per junction the batch
   * rewrote for it. A junction left out was not rewritten for this entity,
   * so it is not compared.
   */
  links?: Partial<Record<JunctionName, readonly string[]>>;
}

export interface DetectChangesOptions {
  instanceId: string;
  /** Stored rows of the batch's ids, by id; a missing id is a new entity */
  stored: ReadonlyMap<string, StoredEntity>;
  incoming: readonly IncomingEntity[];
  /** The junction rows the batch deleted, per junction, by near id */
  oldLinks?: Partial<
    Record<JunctionName, ReadonlyMap<string, readonly EntityRef[]>>
  >;
  /** Whether a differing far-side set marks the entity changed (not for images) */
  compareLinks?: boolean;
  /** Whether a differing studio marks the entity changed (scenes, galleries) */
  compareStudio?: boolean;
  /** The junction whose difference lists the entity in `tagSetChanged` */
  tagJunction?: JunctionName;
}

/** In-memory key of a ref (`${id}\0${instanceId}`, as the other maps use). */
const KEY_SEP = "\0";
const refKey = (ref: EntityRef): string =>
  `${ref.id}${KEY_SEP}${ref.instanceId}`;

/** Refs without duplicates, in first-seen order. */
class RefList {
  private readonly byKey = new Map<string, EntityRef>();

  add(ref: EntityRef): void {
    const key = refKey(ref);
    if (!this.byKey.has(key)) this.byKey.set(key, ref);
  }

  addAll(refs: Iterable<EntityRef>): void {
    for (const ref of refs) this.add(ref);
  }

  get size(): number {
    return this.byKey.size;
  }

  refs(): EntityRef[] {
    return Array.from(this.byKey.values());
  }
}

/** Refs without duplicates, in first-seen order. */
export function distinctRefs(refs: Iterable<EntityRef>): EntityRef[] {
  const list = new RefList();
  list.addAll(refs);
  return list.refs();
}

/**
 * Refs as one JSON parameter of [id, instanceId] pairs, which a statement
 * reads with `json_each(?)` and `json_extract(j.value, '$[0]')`/`'$[1]'`.
 */
export function pairsJson(refs: readonly EntityRef[]): string {
  return JSON.stringify(refs.map((ref) => [ref.id, ref.instanceId]));
}

/** The junction rows a batch deleted, grouped by their near id. */
export function linksByNearId(
  rows: ReadonlyArray<{ nearId: string; farId: string; farInstanceId: string }>
): Map<string, EntityRef[]> {
  const grouped = new Map<string, EntityRef[]>();
  for (const { nearId, farId, farInstanceId } of rows) {
    let list = grouped.get(nearId);
    if (!list) {
      list = [];
      grouped.set(nearId, list);
    }
    list.push({ id: farId, instanceId: farInstanceId });
  }
  return grouped;
}

function sameKeys(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const key of a) if (!b.has(key)) return false;
  return true;
}

/**
 * Which of a batch's entities changed, and what the change touched. See the
 * module header for the rule.
 */
export function detectChanges({
  instanceId,
  stored,
  incoming,
  oldLinks = {},
  compareLinks = true,
  compareStudio = false,
  tagJunction,
}: DetectChangesOptions): BatchChanges {
  const written: EntityRef[] = [];
  const changed: EntityRef[] = [];
  const farSides = new Map<JunctionName, RefList>();
  const studioIds = new RefList();
  const tagSetChanged: EntityRef[] = [];

  const farSidesOf = (junction: JunctionName): RefList => {
    let list = farSides.get(junction);
    if (!list) {
      list = new RefList();
      farSides.set(junction, list);
    }
    return list;
  };

  for (const entity of incoming) {
    const ref: EntityRef = { id: entity.id, instanceId };
    written.push(ref);
    const before = stored.get(entity.id);

    let isChanged =
      before === undefined ||
      before.deleted ||
      before.updatedAt !== entity.updatedAt;
    if (
      !isChanged &&
      compareStudio &&
      (before?.studioId ?? null) !== (entity.studioId ?? null)
    ) {
      isChanged = true;
    }

    // The far-side diff per junction the batch rewrote for this entity
    const linkDiffs: Array<{
      junction: JunctionName;
      old: readonly EntityRef[];
      next: readonly EntityRef[];
      differs: boolean;
    }> = [];
    for (const [name, farIds] of Object.entries(entity.links ?? {})) {
      const junction = name as JunctionName;
      const old = oldLinks[junction]?.get(entity.id) ?? [];
      const next = farIds.map((id): EntityRef => ({ id, instanceId }));
      const differs = !sameKeys(
        new Set(old.map(refKey)),
        new Set(next.map(refKey))
      );
      linkDiffs.push({ junction, old, next, differs });
      if (differs && compareLinks) isChanged = true;
      if (differs && junction === tagJunction) tagSetChanged.push(ref);
    }

    if (!isChanged) continue;
    changed.push(ref);
    for (const { junction, old, next } of linkDiffs) {
      const list = farSidesOf(junction);
      list.addAll(old);
      list.addAll(next);
    }
    if (before?.studioId) {
      studioIds.add({ id: before.studioId, instanceId });
    }
    if (entity.studioId) {
      studioIds.add({ id: entity.studioId, instanceId });
    }
  }

  const farSidesOut: Partial<Record<JunctionName, EntityRef[]>> = {};
  for (const [junction, list] of farSides) {
    if (list.size > 0) farSidesOut[junction] = list.refs();
  }
  return {
    written,
    changed,
    farSides: farSidesOut,
    studioIds: studioIds.refs(),
    tagSetChanged,
  };
}

/**
 * Refs of one kind for a type or junction over the run, or, past
 * SCOPE_LIMIT of them, "whole library": `whole` is true and `refs` empty.
 */
export interface RefScope {
  readonly whole: boolean;
  readonly refs: readonly EntityRef[];
  /** Neither whole nor any ref: nothing of this kind changed */
  isEmpty(): boolean;
}

/** Refs a type stores before switching to "whole library". */
export const SCOPE_LIMIT = 20_000;

/** One kind's refs with the memory bound. */
class BoundedRefs implements RefScope {
  private list = new RefList();
  private isWhole = false;

  add(ref: EntityRef): void {
    if (this.isWhole) return;
    if (this.list.size >= SCOPE_LIMIT) {
      this.markWhole();
      return;
    }
    this.list.add(ref);
  }

  markWhole(): void {
    this.isWhole = true;
    this.list = new RefList();
  }

  get whole(): boolean {
    return this.isWhole;
  }

  get refs(): readonly EntityRef[] {
    return this.list.refs();
  }

  isEmpty(): boolean {
    return !this.isWhole && this.list.size === 0;
  }
}

/** `isEmpty()` is true, no refs, no whole: nothing of the kind. */
const NOTHING: RefScope = {
  whole: false,
  refs: [],
  isEmpty: () => true,
};

/**
 * Everything one sync run changed, across its instances: the batches'
 * changes and the cleanups' deletions, read once by the post-sync steps.
 */
export class SyncChangeSet {
  private readonly writtenByType = new Map<SyncEntityType, BoundedRefs>();
  private readonly changedByType = new Map<SyncEntityType, BoundedRefs>();
  private readonly deletedByType = new Map<SyncEntityType, BoundedRefs>();
  private readonly farSidesByJunction = new Map<JunctionName, BoundedRefs>();
  private readonly tagSetChangedByType = new Map<SyncEntityType, BoundedRefs>();
  private readonly studioRefs = new BoundedRefs();
  /** Instances with a change or a deletion, kept past every limit */
  private readonly changedInstances = new Set<string>();

  private static scope<K>(
    map: Map<K, BoundedRefs>,
    key: K,
    create: boolean
  ): BoundedRefs | undefined {
    let scope = map.get(key);
    if (!scope && create) {
      scope = new BoundedRefs();
      map.set(key, scope);
    }
    return scope;
  }

  /** What one batch of `type` wrote. */
  addBatch(type: SyncEntityType, batch: BatchChanges): void {
    const written = SyncChangeSet.scope(this.writtenByType, type, true);
    for (const ref of batch.written) written?.add(ref);

    if (batch.changed.length > 0) {
      const changed = SyncChangeSet.scope(this.changedByType, type, true);
      for (const ref of batch.changed) {
        changed?.add(ref);
        this.changedInstances.add(ref.instanceId);
      }
    }
    for (const [name, refs] of Object.entries(batch.farSides)) {
      const junction = name as JunctionName;
      if (refs.length === 0) continue;
      const list = SyncChangeSet.scope(this.farSidesByJunction, junction, true);
      for (const ref of refs) list?.add(ref);
    }
    for (const ref of batch.studioIds) this.studioRefs.add(ref);
    if (batch.tagSetChanged.length > 0) {
      const list = SyncChangeSet.scope(this.tagSetChangedByType, type, true);
      for (const ref of batch.tagSetChanged) list?.add(ref);
    }
  }

  /** The rows a cleanup soft-deleted. */
  addDeleted(type: SyncEntityType, instanceId: string, ids: string[]): void {
    if (ids.length === 0) return;
    const deleted = SyncChangeSet.scope(this.deletedByType, type, true);
    for (const id of ids) deleted?.add({ id, instanceId });
    this.changedInstances.add(instanceId);
  }

  /** No change and no deletion of any type (written rows do not count). */
  isEmpty(): boolean {
    for (const scope of this.changedByType.values()) {
      if (!scope.isEmpty()) return false;
    }
    for (const scope of this.deletedByType.values()) {
      if (!scope.isEmpty()) return false;
    }
    return true;
  }

  /** The instances with a change or a deletion. */
  instances(): string[] {
    return Array.from(this.changedInstances);
  }

  written(type: SyncEntityType): RefScope {
    return this.writtenByType.get(type) ?? NOTHING;
  }

  changed(type: SyncEntityType): RefScope {
    return this.changedByType.get(type) ?? NOTHING;
  }

  deleted(type: SyncEntityType): RefScope {
    return this.deletedByType.get(type) ?? NOTHING;
  }

  farSides(junction: JunctionName): RefScope {
    return this.farSidesByJunction.get(junction) ?? NOTHING;
  }

  /** Old and new studios of changed scenes, images and galleries. */
  studios(): RefScope {
    return this.studioRefs;
  }

  tagSetChanged(type: SyncEntityType): RefScope {
    return this.tagSetChangedByType.get(type) ?? NOTHING;
  }
}
