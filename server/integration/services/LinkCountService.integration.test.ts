/**
 * The count columns as Peek's live link counts (item 36, B13a), against the
 * real test SQLite database.
 *
 * Two made-up instances reuse the same small ids, as two Stash servers do.
 * lc-a holds a small library with soft-deleted rows on every side:
 * - studio 1; tags 1, 2 and 3; performers 1 and 2, performer 3 deleted;
 *   collection 1 (studio 1), collection 2 deleted (studio 1)
 * - scene 1: studio 1, performers 1 and 2, tag 1 of its own, inherits
 *   tags 1 and 2, collections 1 and 2
 * - scene 2: studio 1, performers 1 and 3, inherits tags 1 and 2,
 *   collection 1
 * - scene 3, deleted: studio 1, performer 1, tag 1, inherits tag 2,
 *   collection 1
 * - scene 4: performer 2, tag 2 of its own
 * - gallery 1: studio 1, performer 1, tag 1; gallery 2 deleted, the same
 * - images 1 and 3 in gallery 1; image 2, deleted, in gallery 1
 * - performers 1 and 3, studio 1 and collections 1 and 2 carry tag 1
 * lc-b holds performer 1 and tag 1 on its scene 1 only.
 *
 * Every count column starts at STALE, as Stash's lagging number would.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { galleryQueryBuilder } from "../../services/GalleryQueryBuilder.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { imageQueryBuilder } from "../../services/ImageQueryBuilder.js";
import { linkCountService } from "../../services/LinkCountService.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { studioQueryBuilder } from "../../services/StudioQueryBuilder.js";
import { parsedListRequest } from "../../tests/helpers/fixtures.js";
import { must } from "../../tests/helpers/must.js";
import type { RefCriterion } from "../../types/parsedFilters.js";
import type { EntityRef } from "../../utils/entityRef.js";
import { mirrorInheritedTags } from "../helpers/inheritedTags.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "lc-a";
const B = "lc-b";
const STALE = 99;
const DELETED = new Date("2026-01-01T00:00:00Z");

/** The builders' options: no user owns per-user rows here, and exclusions are off */
const BUILDER_OPTIONS = {
  userId: 0,
  applyExclusions: false,
  allowedInstanceIds: [A, B],
};

/** One ref on lc-a, as the tab's filter sends it (no depth) */
const on = (id: string): RefCriterion => ({
  refs: [{ id, instanceId: A }],
  modifier: "INCLUDES",
  depth: 0,
});

const refs = (...ids: string[]): EntityRef[] =>
  ids.map((id) => ({ id, instanceId: A }));

/** Every seeded row of every type, as a scope */
const WHOLE_SEED = {
  performers: [...refs("1", "2", "3"), { id: "1", instanceId: B }],
  studios: refs("1"),
  tags: [...refs("1", "2", "3"), { id: "1", instanceId: B }],
  groups: refs("1", "2"),
  galleries: refs("1", "2"),
};

const STALE_COUNTS = {
  sceneCount: STALE,
  galleryCount: STALE,
  groupCount: STALE,
};

async function seed(): Promise<void> {
  const live = (id: string, instance = A) => ({
    id,
    stashInstanceId: instance,
  });
  const gone = (id: string) => ({ ...live(id), deletedAt: DELETED });

  await prisma.stashStudio.create({
    data: {
      ...live("1"),
      name: "LC studio",
      ...STALE_COUNTS,
      performerCount: STALE,
    },
  });
  await prisma.stashTag.createMany({
    data: [...["1", "2", "3"].map((id) => live(id)), live("1", B)].map(
      (row) => ({
        ...row,
        name: `LC tag ${row.id}`,
        ...STALE_COUNTS,
        sceneCountAll: STALE,
        performerCount: STALE,
        studioCount: STALE,
      })
    ),
  });
  await prisma.stashPerformer.createMany({
    data: [live("1"), live("2"), gone("3"), live("1", B)].map((row) => ({
      ...row,
      name: `LC performer ${row.id}`,
      ...STALE_COUNTS,
    })),
  });
  await prisma.stashGroup.createMany({
    data: [live("1"), gone("2")].map((row) => ({
      ...row,
      name: `LC group ${row.id}`,
      studioId: "1",
      sceneCount: STALE,
      performerCount: STALE,
    })),
  });
  await prisma.stashScene.createMany({
    data: [
      { ...live("1"), studioId: "1", inheritedTagIds: '["1","2"]' },
      { ...live("2"), studioId: "1", inheritedTagIds: '["1","2"]' },
      { ...gone("3"), studioId: "1", inheritedTagIds: '["2"]' },
      { ...live("4"), inheritedTagIds: "[]" },
      { ...live("1", B), inheritedTagIds: "[]" },
    ],
  });
  await mirrorInheritedTags([A, B]);
  await prisma.stashGallery.createMany({
    data: [live("1"), gone("2")].map((row) => ({
      ...row,
      title: `LC gallery ${row.id}`,
      studioId: "1",
      imageCount: STALE,
    })),
  });
  await prisma.stashImage.createMany({
    data: [live("1"), gone("2"), live("3")],
  });

  const pairs = (rows: Array<[string, string]>, instance = A) =>
    rows.map(([near, far]) => ({ near, far, instance }));
  for (const { near, far, instance } of pairs([
    ["1", "1"],
    ["1", "2"],
    ["2", "1"],
    ["2", "3"],
    ["3", "1"],
    ["4", "2"],
  ]).concat(pairs([["1", "1"]], B))) {
    await prisma.scenePerformer.create({
      data: {
        sceneId: near,
        sceneInstanceId: instance,
        performerId: far,
        performerInstanceId: instance,
      },
    });
  }
  for (const { near, far, instance } of pairs([
    ["1", "1"],
    ["3", "1"],
    ["4", "2"],
  ]).concat(pairs([["1", "1"]], B))) {
    await prisma.sceneTag.create({
      data: {
        sceneId: near,
        sceneInstanceId: instance,
        tagId: far,
        tagInstanceId: instance,
      },
    });
  }
  for (const { near, far } of pairs([
    ["1", "1"],
    ["1", "2"],
    ["2", "1"],
    ["3", "1"],
  ])) {
    await prisma.sceneGroup.create({
      data: {
        sceneId: near,
        sceneInstanceId: A,
        groupId: far,
        groupInstanceId: A,
      },
    });
  }
  for (const gallery of ["1", "2"]) {
    await prisma.galleryPerformer.create({
      data: {
        galleryId: gallery,
        galleryInstanceId: A,
        performerId: "1",
        performerInstanceId: A,
      },
    });
    await prisma.galleryTag.create({
      data: {
        galleryId: gallery,
        galleryInstanceId: A,
        tagId: "1",
        tagInstanceId: A,
      },
    });
  }
  for (const image of ["1", "2", "3"]) {
    await prisma.imageGallery.create({
      data: {
        imageId: image,
        imageInstanceId: A,
        galleryId: "1",
        galleryInstanceId: A,
      },
    });
  }
  for (const performer of ["1", "3"]) {
    await prisma.performerTag.create({
      data: {
        performerId: performer,
        performerInstanceId: A,
        tagId: "1",
        tagInstanceId: A,
      },
    });
  }
  await prisma.studioTag.create({
    data: {
      studioId: "1",
      studioInstanceId: A,
      tagId: "1",
      tagInstanceId: A,
    },
  });
  for (const group of ["1", "2"]) {
    await prisma.groupTag.create({
      data: {
        groupId: group,
        groupInstanceId: A,
        tagId: "1",
        tagInstanceId: A,
      },
    });
  }
}

/** The junction rows go with their entities (ON DELETE CASCADE) */
async function removeRows(): Promise<void> {
  const where = { stashInstanceId: { in: [A, B] } };
  await prisma.stashImage.deleteMany({ where });
  await prisma.stashGallery.deleteMany({ where });
  await prisma.stashScene.deleteMany({ where });
  await prisma.stashGroup.deleteMany({ where });
  await prisma.stashPerformer.deleteMany({ where });
  await prisma.stashStudio.deleteMany({ where });
  await prisma.stashTag.deleteMany({ where });
}

const key = { stashInstanceId: A };

async function performer(id: string, instance = A) {
  return prisma.stashPerformer.findUniqueOrThrow({
    where: { id_stashInstanceId: { id, stashInstanceId: instance } },
    select: { sceneCount: true, galleryCount: true, groupCount: true },
  });
}

async function tag(id: string, instance = A) {
  return prisma.stashTag.findUniqueOrThrow({
    where: { id_stashInstanceId: { id, stashInstanceId: instance } },
    select: {
      sceneCount: true,
      sceneCountAll: true,
      galleryCount: true,
      performerCount: true,
      studioCount: true,
      groupCount: true,
    },
  });
}

async function studio(id: string) {
  return prisma.stashStudio.findUniqueOrThrow({
    where: { id_stashInstanceId: { id, ...key } },
    select: {
      sceneCount: true,
      galleryCount: true,
      performerCount: true,
      groupCount: true,
    },
  });
}

async function group(id: string) {
  return prisma.stashGroup.findUniqueOrThrow({
    where: { id_stashInstanceId: { id, ...key } },
    select: { sceneCount: true, performerCount: true },
  });
}

async function gallery(id: string) {
  return prisma.stashGallery.findUniqueOrThrow({
    where: { id_stashInstanceId: { id, ...key } },
    select: { imageCount: true },
  });
}

/** Each column of lc-a's live rows beside the total of the list behind it */
async function columnsAndTabs(): Promise<
  Array<{ column: string; stored: number; listed: number }>
> {
  const out: Array<{ column: string; stored: number; listed: number }> = [];
  const push = (column: string, stored: number, listed: number) =>
    out.push({ column, stored, listed });
  const total = async (
    run: Promise<{ total: number | null }>
  ): Promise<number> => must((await run).total, "the list's total");

  for (const id of ["1", "2"]) {
    const p = await performer(id);
    push(
      `performer ${id} sceneCount`,
      p.sceneCount,
      await total(
        sceneQueryBuilder.execute({
          ...BUILDER_OPTIONS,
          request: parsedListRequest("scene", {
            filter: { performers: on(id) },
          }),
        })
      )
    );
    push(
      `performer ${id} galleryCount`,
      p.galleryCount,
      await total(
        galleryQueryBuilder.execute({
          ...BUILDER_OPTIONS,
          request: parsedListRequest("gallery", {
            filter: { performers: on(id) },
          }),
        })
      )
    );
    push(
      `performer ${id} groupCount`,
      p.groupCount,
      await total(
        groupQueryBuilder.execute({
          ...BUILDER_OPTIONS,
          request: parsedListRequest("group", {
            filter: { performers: on(id) },
          }),
        })
      )
    );
  }

  const s = await studio("1");
  push(
    "studio sceneCount",
    s.sceneCount,
    await total(
      sceneQueryBuilder.execute({
        ...BUILDER_OPTIONS,
        request: parsedListRequest("scene", { filter: { studios: on("1") } }),
      })
    )
  );
  push(
    "studio galleryCount",
    s.galleryCount,
    await total(
      galleryQueryBuilder.execute({
        ...BUILDER_OPTIONS,
        request: parsedListRequest("gallery", {
          filter: { studios: on("1") },
        }),
      })
    )
  );
  push(
    "studio performerCount",
    s.performerCount,
    await total(
      performerQueryBuilder.execute({
        ...BUILDER_OPTIONS,
        request: parsedListRequest("performer", {
          filter: { studios: on("1") },
        }),
      })
    )
  );
  push(
    "studio groupCount",
    s.groupCount,
    await total(
      groupQueryBuilder.execute({
        ...BUILDER_OPTIONS,
        request: parsedListRequest("group", { filter: { studios: on("1") } }),
      })
    )
  );

  for (const id of ["1", "2", "3"]) {
    const t = await tag(id);
    push(
      `tag ${id} sceneCountAll`,
      t.sceneCountAll,
      await total(
        sceneQueryBuilder.execute({
          ...BUILDER_OPTIONS,
          request: parsedListRequest("scene", { filter: { tags: on(id) } }),
        })
      )
    );
    push(
      `tag ${id} galleryCount`,
      t.galleryCount,
      await total(
        galleryQueryBuilder.execute({
          ...BUILDER_OPTIONS,
          request: parsedListRequest("gallery", { filter: { tags: on(id) } }),
        })
      )
    );
    push(
      `tag ${id} performerCount`,
      t.performerCount,
      await total(
        performerQueryBuilder.execute({
          ...BUILDER_OPTIONS,
          request: parsedListRequest("performer", {
            filter: { tags: on(id) },
          }),
        })
      )
    );
    push(
      `tag ${id} studioCount`,
      t.studioCount,
      await total(
        studioQueryBuilder.execute({
          ...BUILDER_OPTIONS,
          request: parsedListRequest("studio", { filter: { tags: on(id) } }),
        })
      )
    );
    push(
      `tag ${id} groupCount`,
      t.groupCount,
      await total(
        groupQueryBuilder.execute({
          ...BUILDER_OPTIONS,
          request: parsedListRequest("group", { filter: { tags: on(id) } }),
        })
      )
    );
  }

  const g = await group("1");
  push(
    "group sceneCount",
    g.sceneCount,
    await total(
      sceneQueryBuilder.execute({
        ...BUILDER_OPTIONS,
        request: parsedListRequest("scene", { filter: { groups: on("1") } }),
      })
    )
  );
  push(
    "group performerCount",
    g.performerCount,
    await total(
      performerQueryBuilder.execute({
        ...BUILDER_OPTIONS,
        request: parsedListRequest("performer", {
          filter: { groups: on("1") },
        }),
      })
    )
  );

  push(
    "gallery imageCount",
    (await gallery("1")).imageCount,
    await total(
      imageQueryBuilder.execute({
        ...BUILDER_OPTIONS,
        request: parsedListRequest("image", {
          filter: { galleries: on("1") },
        }),
      })
    )
  );
  return out;
}

describeWithDb("LinkCountService (integration)", () => {
  beforeEach(async () => {
    await removeRows();
    await seed();
  });

  afterAll(async () => {
    await removeRows();
  });

  it("a performer's sceneCount is its live ScenePerformer rows on its own instance, soft-deleted scenes left out, and the same-id performer on the other instance keeps its own", async () => {
    await linkCountService.rebuildLinkCounts({
      ...WHOLE_SEED,
      studios: [],
      tags: [],
      groups: [],
      galleries: [],
    });

    // Scenes 1 and 2; scene 3 is deleted
    expect(await performer("1")).toEqual({
      sceneCount: 2,
      galleryCount: 1,
      groupCount: 1,
    });
    expect(await performer("2")).toEqual({
      sceneCount: 2,
      galleryCount: 0,
      groupCount: 1,
    });
    expect((await performer("1", B)).sceneCount).toBe(1);
  });

  it("a tag's sceneCountAll counts a scene once whether tagged directly, inherited or both, and equals the scene list's count for the tag", async () => {
    await linkCountService.rebuildLinkCounts({
      ...WHOLE_SEED,
      performers: [],
      studios: [],
      groups: [],
      galleries: [],
    });

    // Tag 1: scene 1 (both) and scene 2 (inherited); scene 3 is deleted
    expect(await tag("1")).toEqual({
      sceneCount: 1,
      sceneCountAll: 2,
      galleryCount: 1,
      performerCount: 1,
      studioCount: 1,
      groupCount: 1,
    });
    // Tag 2: scene 4 (direct), scenes 1 and 2 (inherited)
    expect(await tag("2")).toMatchObject({ sceneCount: 1, sceneCountAll: 3 });
    expect(await tag("3")).toMatchObject({ sceneCount: 0, sceneCountAll: 0 });
    expect(await tag("1", B)).toMatchObject({
      sceneCount: 1,
      sceneCountAll: 1,
    });
    const listed = await sceneQueryBuilder.execute({
      ...BUILDER_OPTIONS,
      request: parsedListRequest("scene", { filter: { tags: on("2") } }),
    });
    expect(listed.total).toBe(3);
  });

  it("a studio's performerCount counts a performer once across its scenes", async () => {
    await linkCountService.rebuildLinkCounts({
      ...WHOLE_SEED,
      performers: [],
      tags: [],
      groups: [],
      galleries: [],
    });

    // Performer 1 on scenes 1 and 2, performer 2 on scene 1; performer 3
    // is deleted, scene 3 is deleted, collection 2 is deleted
    expect(await studio("1")).toEqual({
      sceneCount: 2,
      galleryCount: 1,
      performerCount: 2,
      groupCount: 1,
    });
  });

  it("a scoped rebuild changes only the scope's rows", async () => {
    await linkCountService.rebuildLinkCounts({
      performers: refs("1"),
      studios: [],
      tags: [],
      groups: [],
      galleries: [],
    });

    expect((await performer("1")).sceneCount).toBe(2);
    expect(await performer("2")).toEqual({
      sceneCount: STALE,
      galleryCount: STALE,
      groupCount: STALE,
    });
    expect((await performer("1", B)).sceneCount).toBe(STALE);
    expect((await tag("1")).sceneCountAll).toBe(STALE);
  });

  it("every count column equals the total of the list behind its card", async () => {
    await linkCountService.rebuildLinkCounts(WHOLE_SEED);

    const rows = await columnsAndTabs();
    expect(rows.filter((row) => row.stored !== row.listed)).toEqual([]);
    // Collection 1: scenes 1 and 2, performers 1 and 2; gallery 1: images
    // 1 and 3
    expect(await group("1")).toEqual({ sceneCount: 2, performerCount: 2 });
    expect(await gallery("1")).toEqual({ imageCount: 2 });
  });

  it("the whole-library rebuild gives what the scoped one gives, and a second one writes nothing of the seed", async () => {
    await linkCountService.rebuildLinkCounts("all");
    const whole = await columnsAndTabs();

    expect(whole.filter((row) => row.stored !== row.listed)).toEqual([]);
    expect((await performer("1", B)).sceneCount).toBe(1);
    // Nothing moved since: no row is written again
    const again = await linkCountService.rebuildLinkCounts("all");
    expect(Object.values(again).every((n) => n === 0)).toBe(true);
  });

  it("the data migration's whole-library rebuild never overwrites a count written after it read", async () => {
    // A sync commits performer 1's newer count between the rebuild's reads
    // and its write (migrations run while syncs do)
    const readCounts = linkCountService["readCounts"];
    let raced = false;
    linkCountService["readCounts"] = async (...args) => {
      const counts = await readCounts.apply(linkCountService, args);
      if (!raced) {
        raced = true;
        await prisma.stashPerformer.update({
          where: { id_stashInstanceId: { id: "1", stashInstanceId: A } },
          data: { sceneCount: 7 },
        });
      }
      return counts;
    };
    try {
      await linkCountService.rebuildLinkCounts("all", {
        onlyIfUnchanged: true,
      });
    } finally {
      linkCountService["readCounts"] = readCounts;
    }

    expect(raced).toBe(true);
    expect((await performer("1")).sceneCount).toBe(7);
    // The rows nothing wrote meanwhile get their counts
    expect((await performer("2")).sceneCount).toBe(2);
    expect((await performer("1", B)).sceneCount).toBe(1);
    expect((await performer("1")).galleryCount).toBe(1);
  });

  it("the stored links of deleted or changed rows name what they count toward", async () => {
    const linked = await linkCountService.linkedThrough({
      scenes: refs("3"),
      galleries: refs("2"),
      images: refs("2"),
      performers: refs("3"),
      studios: [],
      groups: refs("2"),
    });

    const sorted = (list: readonly EntityRef[]) =>
      list.map((ref) => `${ref.id}:${ref.instanceId}`).sort();
    // Scene 3: performer 1, tags 1 (direct) and 2 (inherited), collection
    // 1, studio 1. Gallery 2: performer 1, tag 1, studio 1. Performer 3:
    // tag 1, studio 1 and collection 1 through scene 2. Collection 2: tag
    // 1, studio 1, performers 1 and 2 through scene 1
    expect(sorted(linked.performers)).toEqual([`1:${A}`, `2:${A}`]);
    expect(sorted(linked.tags)).toEqual([`1:${A}`, `2:${A}`]);
    expect(sorted(linked.studios)).toEqual([`1:${A}`]);
    expect(sorted(linked.groups)).toEqual([`1:${A}`]);
    expect(sorted(linked.galleries)).toEqual([`1:${A}`]);
  });

  it("the inherited tags of scenes are read as stored", async () => {
    const tags = await linkCountService.inheritedTagsOf(refs("1", "3", "4"));

    expect(tags.map((ref) => `${ref.id}:${ref.instanceId}`).sort()).toEqual([
      `1:${A}`,
      `2:${A}`,
    ]);
  });
});
