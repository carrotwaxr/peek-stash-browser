/**
 * Unit tests for the per-run change set (item 42): which synced entities
 * count as changed, what one run collects across its batches and cleanups,
 * and the memory bound that switches a type to "whole library".
 */
import { describe, expect, it } from "vitest";
import {
  type BatchChanges,
  type EntityRef,
  type IncomingEntity,
  SCOPE_LIMIT,
  type StoredEntity,
  SyncChangeSet,
  detectChanges,
  distinctRefs,
  linksByNearId,
  noChanges,
  pairsJson,
} from "../../services/SyncChangeSet.js";

const INSTANCE = "cs-a";
const UPDATED = "2026-01-02T03:04:05-08:00";
const LATER = "2026-01-03T00:00:00-08:00";

const ref = (id: string, instanceId = INSTANCE): EntityRef => ({
  id,
  instanceId,
});
const refs = (list: EntityRef[]) =>
  list.map((r) => `${r.id}@${r.instanceId}`).sort();

/** Stored rows by id. */
function stored(rows: Record<string, StoredEntity>): Map<string, StoredEntity> {
  return new Map(Object.entries(rows));
}

/** Old junction rows of one junction, by near id. */
function old(rows: Record<string, string[]>): Map<string, EntityRef[]> {
  return new Map(
    Object.entries(rows).map(([nearId, farIds]) => [
      nearId,
      farIds.map((id) => ref(id)),
    ])
  );
}

describe("detectChanges", () => {
  it("an entity whose stored stashUpdatedAt equals the incoming one and whose junction rows are unchanged is not changed", () => {
    const incoming: IncomingEntity[] = [
      {
        id: "1",
        updatedAt: UPDATED,
        studioId: "s1",
        links: { SceneTag: ["t1", "t2"], ScenePerformer: ["p1"] },
      },
    ];
    const changes = detectChanges({
      instanceId: INSTANCE,
      stored: stored({
        "1": { updatedAt: UPDATED, deleted: false, studioId: "s1" },
      }),
      incoming,
      oldLinks: {
        SceneTag: old({ "1": ["t2", "t1"] }),
        ScenePerformer: old({ "1": ["p1"] }),
      },
      compareStudio: true,
    });

    expect(refs(changes.written)).toEqual(["1@cs-a"]);
    expect(changes.changed).toEqual([]);
    expect(changes.farSides).toEqual({});
    expect(changes.studioIds).toEqual([]);
    expect(changes.tagSetChanged).toEqual([]);
  });

  it("a new entity, a new stashUpdatedAt, a resurrected (deletedAt set) row or a different junction set is changed", () => {
    const incoming: IncomingEntity[] = [
      { id: "new", updatedAt: UPDATED, links: { SceneTag: [] } },
      { id: "newer", updatedAt: LATER, links: { SceneTag: ["t1"] } },
      { id: "back", updatedAt: UPDATED, links: { SceneTag: ["t1"] } },
      { id: "relinked", updatedAt: UPDATED, links: { SceneTag: ["t1", "t3"] } },
      { id: "same", updatedAt: UPDATED, links: { SceneTag: ["t1"] } },
    ];
    const changes = detectChanges({
      instanceId: INSTANCE,
      stored: stored({
        newer: { updatedAt: UPDATED, deleted: false },
        back: { updatedAt: UPDATED, deleted: true },
        relinked: { updatedAt: UPDATED, deleted: false },
        same: { updatedAt: UPDATED, deleted: false },
      }),
      incoming,
      oldLinks: {
        SceneTag: old({
          newer: ["t1"],
          back: ["t1"],
          relinked: ["t1", "t2"],
          same: ["t1"],
        }),
      },
    });

    expect(refs(changes.changed)).toEqual([
      "back@cs-a",
      "new@cs-a",
      "newer@cs-a",
      "relinked@cs-a",
    ]);
    // Old and new far sides of the changed entities, once each
    expect(refs(changes.farSides.SceneTag ?? [])).toEqual([
      "t1@cs-a",
      "t2@cs-a",
      "t3@cs-a",
    ]);
  });

  it("clips compare stashUpdatedAt as epoch milliseconds", () => {
    const at = Date.parse(UPDATED);
    const changes = detectChanges({
      instanceId: INSTANCE,
      stored: stored({
        "1": { updatedAt: at, deleted: false },
        "2": { updatedAt: at, deleted: false },
      }),
      incoming: [
        { id: "1", updatedAt: at },
        { id: "2", updatedAt: at + 1000 },
      ],
    });
    expect(refs(changes.changed)).toEqual(["2@cs-a"]);
  });

  it("an image is changed only when new, updated or resurrected: its junction rows and studio are not compared", () => {
    const changes = detectChanges({
      instanceId: INSTANCE,
      stored: stored({
        "1": { updatedAt: UPDATED, deleted: false, studioId: "gallery-studio" },
        "2": { updatedAt: UPDATED, deleted: false, studioId: null },
      }),
      incoming: [
        // Its stored links and studio came from gallery inheritance
        {
          id: "1",
          updatedAt: UPDATED,
          studioId: null,
          links: { ImageTag: [] },
        },
        { id: "2", updatedAt: LATER, studioId: "s2", links: { ImageTag: [] } },
      ],
      oldLinks: { ImageTag: old({ "1": ["t1"] }) },
      compareLinks: false,
      compareStudio: false,
    });

    expect(refs(changes.changed)).toEqual(["2@cs-a"]);
    // The changed image's old and new studio, for the count rebuild
    expect(refs(changes.studioIds)).toEqual(["s2@cs-a"]);
    expect(changes.farSides.ImageTag ?? []).toEqual([]);
  });

  it("markChanged counts every row changed, with its old and new far sides and studios, even an image (a refetch for a known link change)", () => {
    const changes = detectChanges({
      instanceId: INSTANCE,
      stored: stored({
        "1": { updatedAt: UPDATED, deleted: false, studioId: "s1" },
      }),
      // Same updated_at: a merge in Stash moved the image's tag, not its time
      incoming: [
        {
          id: "1",
          updatedAt: UPDATED,
          studioId: null,
          links: { ImageTag: ["t2"] },
        },
      ],
      oldLinks: { ImageTag: old({ "1": ["t1"] }) },
      compareLinks: false,
      compareStudio: false,
      markChanged: true,
    });

    expect(refs(changes.changed)).toEqual(["1@cs-a"]);
    expect(refs(changes.farSides.ImageTag ?? [])).toEqual([
      "t1@cs-a",
      "t2@cs-a",
    ]);
    expect(refs(changes.studioIds)).toEqual(["s1@cs-a"]);
    expect(refs(changes.written)).toEqual(["1@cs-a"]);
  });

  it("a scene whose studio changed is changed, and both studios are recorded", () => {
    const changes = detectChanges({
      instanceId: INSTANCE,
      stored: stored({
        "1": { updatedAt: UPDATED, deleted: false, studioId: "s1" },
      }),
      incoming: [{ id: "1", updatedAt: UPDATED, studioId: "s2" }],
      compareStudio: true,
    });
    expect(refs(changes.changed)).toEqual(["1@cs-a"]);
    expect(refs(changes.studioIds)).toEqual(["s1@cs-a", "s2@cs-a"]);
  });

  it("a performer whose tag set differs is listed in tagSetChanged", () => {
    const changes = detectChanges({
      instanceId: INSTANCE,
      stored: stored({
        "1": { updatedAt: UPDATED, deleted: false },
        "2": { updatedAt: UPDATED, deleted: false },
      }),
      incoming: [
        { id: "1", updatedAt: UPDATED, links: { PerformerTag: ["t1"] } },
        // Updated, same tags: changed but not in tagSetChanged
        { id: "2", updatedAt: LATER, links: { PerformerTag: ["t1"] } },
      ],
      oldLinks: { PerformerTag: old({ "1": ["t2"], "2": ["t1"] }) },
      tagJunction: "PerformerTag",
    });
    expect(refs(changes.changed)).toEqual(["1@cs-a", "2@cs-a"]);
    expect(refs(changes.tagSetChanged)).toEqual(["1@cs-a"]);
  });

  it("a junction left out of an entity's links is not compared", () => {
    // No StudioTag in the links: the batch did not rewrite it for this entity
    const changes = detectChanges({
      instanceId: INSTANCE,
      stored: stored({ "1": { updatedAt: UPDATED, deleted: false } }),
      incoming: [{ id: "1", updatedAt: UPDATED, links: {} }],
      oldLinks: { StudioTag: old({}) },
      tagJunction: "StudioTag",
    });
    expect(changes.changed).toEqual([]);
  });
});

describe("linksByNearId", () => {
  it("groups deleted junction rows by their near id, keeping the far instance", () => {
    const grouped = linksByNearId([
      { nearId: "1", farId: "a", farInstanceId: INSTANCE },
      { nearId: "1", farId: "b", farInstanceId: "other" },
      { nearId: "2", farId: "a", farInstanceId: INSTANCE },
    ]);
    expect(grouped.get("1")).toEqual([ref("a"), ref("b", "other")]);
    expect(grouped.get("2")).toEqual([ref("a")]);
    expect(grouped.has("3")).toBe(false);
  });
});

describe("SyncChangeSet", () => {
  const batch = (over: Partial<BatchChanges>): BatchChanges => ({
    ...noChanges(),
    ...over,
  });

  it("is empty until a batch changes something or a cleanup deletes something", () => {
    const changes = new SyncChangeSet();
    expect(changes.isEmpty()).toBe(true);

    // Written but unchanged rows do not count
    changes.addBatch("image", batch({ written: [ref("1")] }));
    expect(changes.isEmpty()).toBe(true);
    expect(changes.written("image").refs).toEqual([ref("1")]);

    changes.addBatch("scene", batch({ changed: [ref("2")] }));
    expect(changes.isEmpty()).toBe(false);

    const deletions = new SyncChangeSet();
    deletions.addDeleted("tag", "cs-b", ["9"]);
    expect(deletions.isEmpty()).toBe(false);
    expect(deletions.deleted("tag").refs).toEqual([ref("9", "cs-b")]);
  });

  it("instances() lists only instances with a change or a deletion", () => {
    const changes = new SyncChangeSet();
    changes.addBatch("image", batch({ written: [ref("1", "written-only")] }));
    changes.addBatch(
      "scene",
      batch({ changed: [ref("1", "cs-a")], written: [ref("1", "cs-a")] })
    );
    changes.addDeleted("performer", "cs-b", ["3"]);
    changes.addDeleted("performer", "cs-c", []);

    expect(changes.instances().sort()).toEqual(["cs-a", "cs-b"]);
  });

  it("collects far sides, studios and tag-set changes across batches without duplicates", () => {
    const changes = new SyncChangeSet();
    changes.addBatch(
      "scene",
      batch({
        changed: [ref("1")],
        farSides: { SceneTag: [ref("t1"), ref("t2")] },
        studioIds: [ref("s1")],
      })
    );
    changes.addBatch(
      "scene",
      batch({
        changed: [ref("1"), ref("2")],
        farSides: { SceneTag: [ref("t2")], ScenePerformer: [ref("p1")] },
        studioIds: [ref("s1")],
      })
    );
    changes.addBatch("performer", batch({ tagSetChanged: [ref("p1")] }));

    expect(changes.changed("scene").refs).toEqual([ref("1"), ref("2")]);
    expect(changes.farSides("SceneTag").refs).toEqual([ref("t1"), ref("t2")]);
    expect(changes.farSides("ScenePerformer").refs).toEqual([ref("p1")]);
    expect(changes.studios().refs).toEqual([ref("s1")]);
    expect(changes.tagSetChanged("performer").refs).toEqual([ref("p1")]);
    expect(changes.tagSetChanged("studio").isEmpty()).toBe(true);
  });

  it("past SCOPE_LIMIT refs a type switches to whole library and stops storing refs", () => {
    const changes = new SyncChangeSet();
    const many = Array.from({ length: SCOPE_LIMIT }, (_, i) => ref(String(i)));
    changes.addBatch("image", batch({ changed: many, written: many }));
    expect(changes.changed("image").whole).toBe(false);
    expect(changes.changed("image").refs).toHaveLength(SCOPE_LIMIT);

    changes.addBatch(
      "image",
      batch({ changed: [ref("one-more")], written: [ref("one-more")] })
    );
    const scope = changes.changed("image");
    expect(scope.whole).toBe(true);
    expect(scope.refs).toEqual([]);
    expect(scope.isEmpty()).toBe(false);
    expect(changes.isEmpty()).toBe(false);
    // The instance is still known
    expect(changes.instances()).toEqual([INSTANCE]);
    // Other types are unaffected
    expect(changes.changed("scene").whole).toBe(false);
  });
});

describe("ref helpers", () => {
  it("distinctRefs keeps each id once per instance, in first-seen order", () => {
    expect(
      distinctRefs([ref("2"), ref("1"), ref("2"), ref("2", "cs-b")])
    ).toEqual([ref("2"), ref("1"), ref("2", "cs-b")]);
  });

  it("pairsJson binds refs as [id, instanceId] pairs", () => {
    expect(pairsJson([ref("1"), ref("1", "cs-b")])).toBe(
      '[["1","cs-a"],["1","cs-b"]]'
    );
  });
});
