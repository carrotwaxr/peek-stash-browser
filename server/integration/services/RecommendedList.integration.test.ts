/**
 * The scene list statement within ranked refs (Recommended's top 500, PR 9b
 * answer 9) against the real test SQLite database: the builder is called
 * with the refs a scoring would hand it, so each case names its own ranking.
 *
 * On the access fixture's instances (A and B enabled, OFF disabled), tag
 * SAME is on every live fixture scene of its instance, so a filter on it
 * matches every scene and only the ranked refs narrow the list. Each case
 * that hides or selects has a viewer of its own. Every seeded row is deleted
 * before the file ends.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { sceneQueryBuilder } from "../../services/SceneQueryBuilder.js";
import { getUserAllowedInstanceIds } from "../../services/UserInstanceService.js";
import { parsedListRequest } from "../../tests/helpers/fixtures.js";
import { must } from "../../tests/helpers/must.js";
import { untrusted } from "../../tests/helpers/untrusted.js";
import type {
  ParsedListRequest,
  ParsedWhereGroup,
} from "../../types/parsedFilters.js";
import type { EntityRef } from "../../utils/entityRef.js";
import { TEST_ADMIN } from "../fixtures/testEntities.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  hideFor,
  seedAccessFixture,
} from "../helpers/accessFixture.js";
import { adminClient } from "../helpers/testClient.js";

const { A, B, OFF } = FX;
const { SAME, GLOBAL, DELETED, ON_OFF, B_ONLY } = FX_ID;

const ref = (id: string, instanceId: string): EntityRef => ({
  id,
  instanceId,
});
const key = (row: { id: string; instanceId: string }) =>
  `${row.id}:${row.instanceId}`;

/** Tag SAME on its instance, which every live fixture scene of it holds */
const SAME_TAGS = [
  { id: SAME, instanceId: A },
  { id: SAME, instanceId: B },
];

/** The fixture's live scenes on an enabled instance, none of them ranked by default */
const LIVE = [
  ref(SAME, A),
  ref(GLOBAL, A),
  ref(SAME, B),
  ref(GLOBAL, B),
  ref(B_ONLY, B),
];

let counter = 0;
async function createViewer(): Promise<number> {
  counter += 1;
  const user = await prisma.user.create({
    data: {
      username: `access_it_ranked_${counter}`,
      password: "not-a-real-hash",
      role: "USER",
    },
  });
  return user.id;
}

/** The Recommended sort, which the plain scene parser does not offer (R3's parser does) */
const RECOMMENDED =
  untrusted<ParsedListRequest<"scene">["sort"]["field"]>("recommended");

async function listed(
  viewer: number,
  ranked: readonly EntityRef[],
  overrides: Partial<ParsedListRequest<"scene">> = {},
  allowedInstanceIds?: readonly string[]
) {
  const { items, total } = await sceneQueryBuilder.execute({
    userId: viewer,
    allowedInstanceIds:
      allowedInstanceIds ?? (await getUserAllowedInstanceIds(viewer)),
    request: parsedListRequest("scene", { perPage: 100, ...overrides }),
    ranked,
  });
  return { keys: items.map(key), total };
}

describe("the scene list within ranked refs (integration)", () => {
  let viewer = 0;

  beforeAll(async () => {
    await adminClient.login(TEST_ADMIN.username, TEST_ADMIN.password);
    await seedAccessFixture();
    await prisma.sceneTag.createMany({
      data: [
        ...LIVE,
        ref(DELETED, A),
        // ON_OFF's instance is disabled; its tag is SAME@OFF's, not seeded
      ].map((scene) => ({
        sceneId: scene.id,
        sceneInstanceId: scene.instanceId,
        tagId: SAME,
        tagInstanceId: scene.instanceId,
      })),
    });
    viewer = await createViewer();
  }, 60000);

  afterAll(async () => {
    // The viewers, the scenes and their tags go with the fixture
    await clearAccessFixture();
  }, 60000);

  it("the ranked scenes come in rank order under the Recommended sort, best first on DESC, worst first on ASC", async () => {
    const ranked = [
      ref(GLOBAL, B),
      ref(SAME, A),
      ref(B_ONLY, B),
      ref(GLOBAL, A),
    ];
    const byRank = ranked.map(key);

    const best = await listed(viewer, ranked, {
      sort: { field: RECOMMENDED, direction: "DESC", seed: undefined },
    });
    const worst = await listed(viewer, ranked, {
      sort: { field: RECOMMENDED, direction: "ASC", seed: undefined },
    });

    expect(best).toEqual({ keys: byRank, total: 4 });
    expect(worst).toEqual({ keys: [...byRank].reverse(), total: 4 });
  });

  it("a filter narrows within the ranked scenes only: a tag every fixture scene holds returns the ranked ones, never a scene outside the refs", async () => {
    const filter = {
      tags: { refs: SAME_TAGS, modifier: "INCLUDES" as const, depth: 0 },
    };
    // Unranked, the tag lists every live fixture scene
    const library = await sceneQueryBuilder.execute({
      userId: viewer,
      allowedInstanceIds: [A, B],
      request: parsedListRequest("scene", { perPage: 100, filter }),
    });
    expect(library.items.map(key).sort()).toEqual(LIVE.map(key).sort());

    const within = await listed(viewer, [ref(B_ONLY, B), ref(SAME, A)], {
      filter,
    });

    expect(within.keys.sort()).toEqual([`${SAME}:${A}`, `${B_ONLY}:${B}`]);
    expect(within.total).toBe(2);
  });

  it("an any group never lists a scene outside the ranked refs", async () => {
    // Each row alone matches every live fixture scene on its instance
    const where: ParsedWhereGroup<"scene"> = {
      match: "any",
      rules: [
        {
          field: "tags",
          criterion: {
            refs: [must(SAME_TAGS[0])],
            modifier: "INCLUDES",
            depth: 0,
          },
        },
        { field: "organized", criterion: false },
      ],
    };

    const within = await listed(viewer, [ref(SAME, A), ref(GLOBAL, B)], {
      where,
    });

    expect(within.keys.sort()).toEqual([`${SAME}:${A}`, `${GLOBAL}:${B}`]);
    expect(within.total).toBe(2);
  });

  it("a ranked scene the viewer hid after scoring is neither listed nor counted", async () => {
    const hider = await createViewer();
    const stale = [ref(SAME, A), ref(GLOBAL, A), ref(SAME, B)];

    await hideFor(hider, "scene", GLOBAL, A);
    const after = await listed(hider, stale);

    expect(after.keys.sort()).toEqual([`${SAME}:${A}`, `${SAME}:${B}`]);
    expect(after.total).toBe(2);
  });

  it("a ranked scene on an instance the viewer deselected is neither listed nor counted", async () => {
    const onlyA = await createViewer();
    await prisma.userStashInstance.create({
      data: { userId: onlyA, instanceId: A },
    });
    const allowed = await getUserAllowedInstanceIds(onlyA);
    expect(allowed).not.toContain(B);

    const within = await listed(onlyA, [
      ref(SAME, B),
      ref(SAME, A),
      ref(B_ONLY, B),
      ref(ON_OFF, OFF),
    ]);

    expect(within).toEqual({ keys: [`${SAME}:${A}`], total: 1 });
  });

  it("the count is the matching ranked scenes, not the refs", async () => {
    // DELETED@A was soft-deleted after it was scored
    const within = await listed(viewer, [
      ref(SAME, A),
      ref(DELETED, A),
      ref(GLOBAL, A),
    ]);

    expect(within.keys.sort()).toEqual([`${SAME}:${A}`, `${GLOBAL}:${A}`]);
    expect(within.total).toBe(2);
  });

  it("an empty ranked list never lists the library", async () => {
    expect(await listed(viewer, [])).toEqual({ keys: [], total: 0 });
  });

  it("any scene sort pages over the ranked scenes only", async () => {
    const ranked = [
      ref(B_ONLY, B),
      ref(SAME, A),
      ref(GLOBAL, B),
      ref(GLOBAL, A),
    ];
    const page = async (n: number) =>
      listed(viewer, ranked, {
        page: n,
        perPage: 2,
        sort: { field: "title", direction: "ASC", seed: undefined },
      });

    const first = await page(1);
    const second = await page(2);
    const third = await page(3);

    expect(first.keys).toHaveLength(2);
    expect(second.keys).toHaveLength(2);
    expect(third.keys).toEqual([]);
    expect([first.total, second.total]).toEqual([4, 4]);
    const seen = [...first.keys, ...second.keys];
    expect(new Set(seen).size).toBe(4);
    expect(seen.sort()).toEqual(ranked.map(key).sort());
  });
});
