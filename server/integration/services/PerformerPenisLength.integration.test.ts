/**
 * A performer's penis length and circumcision (item 25), against the real
 * test SQLite database.
 *
 * Two made-up instances reuse the same ids, as two Stash servers do:
 * - pl-it-a: 7810001 at 15.5 cm (cut), 7810002 at 12.0 cm, 7810003 with no
 *   length
 * - pl-it-b: 7810001 with no length (uncut)
 *
 * The filter compares the stored length, so a performer without one never
 * matches, as in Stash; the sort puts performers without one last when
 * descending, as the height sort does. Sync stores Stash's values and clears
 * them when Stash's are null. The replay's performers carry neither field, so
 * the filter cases seed rows and the sync case stubs A's Stash client. Every
 * seeded row is deleted before the file ends.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { StashClient } from "../../graphql/StashClient.js";
import {
  CircumisedEnum,
  CriterionModifier,
} from "../../graphql/generated/graphql.js";
import prisma from "../../prisma/singleton.js";
import { performerQueryBuilder } from "../../services/PerformerQueryBuilder.js";
import { stashInstanceManager } from "../../services/StashInstanceManager.js";
import {
  type SyncEntityOf,
  type SyncRunContext,
  stashSyncService,
} from "../../services/StashSyncService.js";
import { SyncChangeSet } from "../../services/SyncChangeSet.js";
import { must } from "../../tests/helpers/must.js";
import { partialRow } from "../../tests/helpers/prismaMock.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "pl-it-a";
const B = "pl-it-b";

/** No user owns per-user rows here, and exclusions are off */
const OPTIONS = {
  userId: 0,
  applyExclusions: false,
  allowedInstanceIds: [A, B],
  sort: "name",
  sortDirection: "ASC" as const,
  page: 1,
  perPage: 50,
};

type SyncPerformer = SyncEntityOf<"performer">;

const keys = (rows: Array<{ id: string; instanceId: string }>): string[] =>
  rows.map((row) => `${row.id}:${row.instanceId}`);

const performer = (
  id: string,
  instance: string,
  penisLength: number | null,
  circumcised: string | null = null
) => ({
  id,
  stashInstanceId: instance,
  name: `PL ${id} ${instance}`,
  penisLength,
  circumcised,
});

async function lengthFilter(
  modifier: CriterionModifier,
  value: number,
  value2?: number
): Promise<string[]> {
  const { performers } = await performerQueryBuilder.execute({
    ...OPTIONS,
    filters: { penis_length: { modifier, value, value2 } },
  });
  return keys(performers).sort();
}

async function removeRows(): Promise<void> {
  await prisma.stashPerformer.deleteMany({
    where: { stashInstanceId: { in: [A, B] } },
  });
}

/** A performer as Stash's sync query returns it */
function stashPerformer(
  id: string,
  fields: Pick<SyncPerformer, "penis_length" | "circumcised">,
  updatedAt: string
): SyncPerformer {
  return partialRow<SyncPerformer>({
    id,
    name: `PL ${id} ${A}`,
    stash_ids: [],
    alias_list: [],
    tags: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: updatedAt,
    ...fields,
  });
}

function newRun(): SyncRunContext {
  return {
    signal: new AbortController().signal,
    changes: new SyncChangeSet(),
  };
}

/** What each instance stores for performer `id` */
async function stored(
  id: string
): Promise<
  Record<string, { penisLength: number | null; circumcised: string | null }>
> {
  const rows = await prisma.stashPerformer.findMany({
    where: { id, stashInstanceId: { in: [A, B] } },
    select: { stashInstanceId: true, penisLength: true, circumcised: true },
  });
  return Object.fromEntries(
    rows.map(({ stashInstanceId, penisLength, circumcised }) => [
      stashInstanceId,
      { penisLength, circumcised },
    ])
  );
}

describeWithDb("Performer penis length (integration)", () => {
  afterAll(async () => {
    await removeRows();
  });

  describe("filter, sort and list row", () => {
    beforeAll(async () => {
      await removeRows();
      await prisma.stashPerformer.createMany({
        data: [
          performer("7810001", A, 15.5, "CUT"),
          performer("7810002", A, 12.0),
          performer("7810003", A, null),
          performer("7810001", B, null, "UNCUT"),
        ],
      });
    });

    it("GREATER_THAN 14 returns 7810001 on A only", async () => {
      expect(await lengthFilter(CriterionModifier.GreaterThan, 14)).toEqual([
        `7810001:${A}`,
      ]);
    });

    it("BETWEEN 11 and 13 returns 7810002", async () => {
      expect(await lengthFilter(CriterionModifier.Between, 11, 13)).toEqual([
        `7810002:${A}`,
      ]);
    });

    it("LESS_THAN 20 leaves out performers with no length", async () => {
      expect(await lengthFilter(CriterionModifier.LessThan, 20)).toEqual([
        `7810001:${A}`,
        `7810002:${A}`,
      ]);
    });

    it("the list row carries penis_length 15.5 and circumcised CUT", async () => {
      const { performers } = await performerQueryBuilder.execute(OPTIONS);
      const row = must(
        performers.find((p) => p.id === "7810001" && p.instanceId === A)
      );

      expect(row.penis_length).toBe(15.5);
      expect(row.circumcised).toBe("CUT");
    });

    it("sort penis_length DESC lists 7810001 first", async () => {
      const { performers } = await performerQueryBuilder.execute({
        ...OPTIONS,
        sort: "penis_length",
        sortDirection: "DESC",
      });

      // No length last, then by name
      expect(keys(performers)).toEqual([
        `7810001:${A}`,
        `7810002:${A}`,
        `7810001:${B}`,
        `7810003:${A}`,
      ]);
    });
  });

  describe("sync", () => {
    let page: SyncPerformer[] = [];

    beforeAll(async () => {
      await removeRows();
      await prisma.stashPerformer.createMany({
        data: [performer("7810001", B, null, "UNCUT")],
      });
      const client: StashClient = partialRow<StashClient>({
        findPerformers: () =>
          Promise.resolve({
            findPerformers: { count: page.length, performers: page },
          }),
        withSignal: () => client,
      });
      const realGet = stashInstanceManager.get.bind(stashInstanceManager);
      vi.spyOn(stashInstanceManager, "get").mockImplementation((id) =>
        id === A ? client : realGet(id)
      );
    });

    afterEach(() => {
      page = [];
    });

    afterAll(() => {
      vi.restoreAllMocks();
    });

    it("a page with penis_length 15.5 stores 15.5, a later page with null clears it, and B's same id is untouched", async () => {
      page = [
        stashPerformer(
          "7810001",
          { penis_length: 15.5, circumcised: CircumisedEnum.Cut },
          "2026-01-02T00:00:00Z"
        ),
      ];
      await stashSyncService["paginate"]("performer", A, {}, newRun());

      expect(await stored("7810001")).toEqual({
        [A]: { penisLength: 15.5, circumcised: "CUT" },
        [B]: { penisLength: null, circumcised: "UNCUT" },
      });

      page = [
        stashPerformer(
          "7810001",
          { penis_length: null, circumcised: null },
          "2026-01-03T00:00:00Z"
        ),
      ];
      await stashSyncService["paginate"]("performer", A, {}, newRun());

      expect(await stored("7810001")).toEqual({
        [A]: { penisLength: null, circumcised: null },
        [B]: { penisLength: null, circumcised: "UNCUT" },
      });
    });
  });
});
