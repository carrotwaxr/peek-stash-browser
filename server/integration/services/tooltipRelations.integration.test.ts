/**
 * Tooltip relations against the real test SQLite database (item 11).
 *
 * The tag, studio, performer and group builders list related entities for
 * card tooltips. A related entity the user can't see (hidden, restricted,
 * deleted, or on an instance they don't use) is left out, because its
 * exclusion doesn't cascade to the row that lists it.
 *
 * The fixture seeds entities on made-up instances (see
 * helpers/accessFixture.ts). Users:
 * - u: the default hides, which include HIDDEN_A's performer and tag on A
 * - v: no hides
 */
import { coerceEntityRefs } from "@peek/shared-types/instanceAwareId.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { groupQueryBuilder } from "../../services/GroupQueryBuilder.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { studioQueryBuilder } from "../../services/StudioQueryBuilder.js";
import { tagQueryBuilder } from "../../services/TagQueryBuilder.js";
import {
  FX,
  FX_ID,
  clearAccessFixture,
  hideFixtureDefaults,
  seedAccessFixture,
} from "../helpers/accessFixture.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

async function createUser(username: string): Promise<number> {
  const user = await prisma.user.create({
    data: { username, password: "not-a-real-hash", role: "USER" },
  });
  return user.id;
}

/** The builder options for one entity on instance A. */
function byIdOnA(userId: number, id: string) {
  return {
    userId,
    filters: { ids: { value: coerceEntityRefs([id]), modifier: "INCLUDES" } },
    specificInstanceId: FX.A,
    sort: "name",
    sortDirection: "ASC" as const,
    page: 1,
    perPage: 10,
  };
}

const ids = (refs: Array<{ id: string }> | undefined) =>
  (refs ?? []).map((r) => r.id).sort();

async function tagPerformers(userId: number) {
  const { tags } = await tagQueryBuilder.execute(byIdOnA(userId, FX_ID.SAME));
  expect(tags).toHaveLength(1);
  return ids(tags[0]?.performers);
}

async function studioTags(userId: number) {
  const { studios } = await studioQueryBuilder.execute(
    byIdOnA(userId, FX_ID.SAME)
  );
  expect(studios).toHaveLength(1);
  return ids(studios[0]?.tags);
}

async function performerTags(userId: number) {
  const { performers } = await performerQueryBuilder.execute(
    byIdOnA(userId, FX_ID.VISIBLE_A)
  );
  expect(performers).toHaveLength(1);
  return ids(performers[0]?.tags);
}

async function groupTags(userId: number) {
  const { groups } = await groupQueryBuilder.execute(
    byIdOnA(userId, FX_ID.SAME)
  );
  expect(groups).toHaveLength(1);
  return ids(groups[0]?.tags);
}

describeWithDb("Tooltip relations (integration)", () => {
  let u: number;
  let v: number;

  beforeAll(async () => {
    await seedAccessFixture();
    u = await createUser("access-it-tip-u");
    v = await createUser("access-it-tip-v");
    await hideFixtureDefaults(u);
  }, 60000);

  afterAll(async () => {
    await clearAccessFixture();
  }, 60000);

  it("tag tooltips drop hidden performers", async () => {
    expect(await tagPerformers(u)).toEqual([FX_ID.VISIBLE_A]);
  });

  it("studio tooltips drop hidden tags", async () => {
    expect(await studioTags(u)).toEqual([FX_ID.VISIBLE_A]);
  });

  it("performer tooltips drop hidden tags", async () => {
    expect(await performerTags(u)).toEqual([FX_ID.SAME, FX_ID.VISIBLE_A]);
  });

  it("group tooltips drop hidden tags", async () => {
    expect(await groupTags(u)).toEqual([FX_ID.VISIBLE_A]);
  });

  it("an unrestricted user still sees every relation", async () => {
    expect(await tagPerformers(v)).toEqual([FX_ID.HIDDEN_A, FX_ID.VISIBLE_A]);
    expect(await studioTags(v)).toEqual([FX_ID.HIDDEN_A, FX_ID.VISIBLE_A]);
    expect(await performerTags(v)).toEqual([
      FX_ID.SAME,
      FX_ID.HIDDEN_A,
      FX_ID.VISIBLE_A,
    ]);
    expect(await groupTags(v)).toEqual([FX_ID.HIDDEN_A, FX_ID.VISIBLE_A]);
  });
});
