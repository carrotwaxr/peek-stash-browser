/**
 * Every image filter field's clause, through the statement the image
 * builder records (`ImageQueryBuilder.test.ts` runs it against SQLite): one
 * sample per field from the shared spec, the fragment it adds to the WHERE,
 * and the values it binds, in order.
 */
import { IMAGE_FIELDS } from "@peek/shared-types/filters/index.js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "../../prisma/singleton.js";
import { imageQueryBuilder } from "../../services/ImageQueryBuilder.js";
import type { ParsedListRequest } from "../../types/parsedFilters.js";
import {
  alternatesOf,
  filterOf,
  firstMissingBound,
  samplesOf,
  whereOf,
} from "../helpers/fieldSamples.js";
import { parsedListRequest } from "../helpers/fixtures.js";
import { must } from "../helpers/must.js";
import { partialRow } from "../helpers/prismaMock.js";
import { untrusted } from "../helpers/untrusted.js";

vi.mock(
  "../../prisma/singleton.js",
  () => import("../helpers/prismaSingletonMock.js")
);

vi.mock("../../utils/logger.js", () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
    debug: vi.fn(),
    verbose: vi.fn(),
  },
}));

// Each ref expands to itself and one descendant, "99", on its own instance
vi.mock(
  "../../utils/hierarchyUtils.js",
  () => import("../helpers/hierarchyMock.js")
);

const mockPrisma = vi.mocked(prisma, true);

const ALLOWED = ["inst-a", "inst-b"];

/** What each image field's clause adds to the WHERE, as the shared spec's sample binds it */
const IMAGE_CLAUSES: Record<
  Exclude<keyof typeof IMAGE_FIELDS, "instance_id">,
  string
> = {
  ids: "(i.id = ? AND i.stashInstanceId = ?)",
  title: "LIKE ? ESCAPE",
  details: "i.details LIKE ?",
  code: "i.code LIKE ?",
  photographer: "i.photographer LIKE ?",
  path: "i.filePath LIKE ?",
  url: "json_valid(i.urls)",
  organized: "i.organized = ?",
  resolution: "MIN(i.width, i.height) BETWEEN 144 AND 239",
  orientation: "i.width > i.height",
  tags: "FROM ImageTag it WHERE it.imageId = i.id",
  studios: "(i.stashInstanceId = ? AND i.studioId IN (?, ?))",
  performers: "FROM ImagePerformer ip WHERE ip.imageId = i.id",
  galleries:
    "FROM ImageGallery ig WHERE ((ig.galleryId = ? AND ig.galleryInstanceId = ?))",
  rating100: "r.rating > ?",
  o_counter: "COALESCE(v.oCount, 0) > ?",
  tag_count: "(SELECT COUNT(*) FROM ImageTag itc",
  date: "END, 1, 10) > ?",
  created_at: "i.stashCreatedAt >= ?",
  updated_at: "i.stashUpdatedAt >= ?",
  favorite: "r.favorite = 1",
  performer_favorite: "FROM ImagePerformer ip WHERE ip.imageId = i.id",
  studio_favorite: "(i.stashInstanceId = ? AND i.studioId IN (?, ?))",
  tag_favorite: "FROM ImageTag it WHERE it.imageId = i.id",
  performer_tags: "FROM ImagePerformer ip CROSS JOIN PerformerTag pt",
  performer_count: "(SELECT COUNT(*) FROM ImagePerformer",
  performer_age: "p.deletedAt IS NULL AND p.birthdate IS NOT NULL",
};

describe("every image field clause", () => {
  /** The viewer's one favourite of each kind, on the instance the samples allow */
  function seedFavourites(): void {
    mockPrisma.tagRating.findMany.mockResolvedValue([
      partialRow({ tagId: "8", instanceId: "inst-a" }),
    ]);
    mockPrisma.studioRating.findMany.mockResolvedValue([
      partialRow({ studioId: "8", instanceId: "inst-a" }),
    ]);
    mockPrisma.performerRating.findMany.mockResolvedValue([
      partialRow({ performerId: "8", instanceId: "inst-a" }),
    ]);
    mockPrisma.userExcludedEntity.findMany.mockResolvedValue([]);
  }

  const BOUND = {
    performer_favorite: ["8", "inst-a"],
    studio_favorite: ["inst-a", "8"],
    tag_favorite: ["inst-a", "8"],
    resolution: [],
    orientation: [],
  };

  const SAMPLES = new Map(samplesOf(IMAGE_FIELDS, BOUND));

  /** The page statement for a filter alone, with nothing else answered */
  async function statementFor(
    filter: Record<string, unknown>,
    applyExclusions = true
  ): Promise<{ sql: string; params: unknown[] }> {
    mockPrisma.$queryRawUnsafe.mockReset();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    seedFavourites();
    await imageQueryBuilder.execute({
      userId: 1,
      allowedInstanceIds: ALLOWED,
      applyExclusions,
      request: parsedListRequest("image", {
        filter: untrusted<ParsedListRequest<"image">["filter"]>(filter),
      }),
    });
    const [sql, ...params] = must(mockPrisma.$queryRawUnsafe.mock.calls[0]);
    return { sql, params };
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("has a sample for every field the table carries", () => {
    expect([...SAMPLES.keys()].sort()).toEqual(
      Object.keys(IMAGE_CLAUSES).sort()
    );
  });

  it.each(Object.entries(IMAGE_CLAUSES))(
    "%s adds its clause to the WHERE and binds its sample in order",
    async (field, fragment) => {
      const sample = must(SAMPLES.get(field), `a sample for ${field}`);

      const { sql, params } = await statementFor(filterOf(sample));

      expect(whereOf(sql)).toContain(fragment);
      expect(firstMissingBound(params, sample.bound)).toBeNull();
    }
  );

  it.each(alternatesOf(IMAGE_FIELDS, BOUND))(
    "%s builds a clause of its own and binds its values in order",
    async (_label, sample) => {
      const baseline = whereOf((await statementFor({})).sql);

      const { sql, params } = await statementFor(filterOf(sample));

      expect(whereOf(sql)).not.toBe(baseline);
      expect(firstMissingBound(params, sample.bound)).toBeNull();
    }
  );

  it.each(Object.keys(IMAGE_CLAUSES))(
    "%s takes no exclusion join when the viewer's exclusions do not apply",
    async (field) => {
      const sample = must(SAMPLES.get(field), `a sample for ${field}`);

      const { sql } = await statementFor(filterOf(sample), false);

      expect(whereOf(sql)).not.toContain("UserExcludedEntity");
    }
  );
});

describe("performer_count and the viewer's performer exclusions", () => {
  const PCE = "LEFT JOIN UserExcludedEntity pce";

  /** The page and count statements of a filter, the lookup answering `excluded` */
  async function statementsFor(
    filter: Record<string, unknown>,
    excluded: boolean,
    applyExclusions = true
  ): Promise<string[]> {
    mockPrisma.$queryRawUnsafe.mockReset();
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    mockPrisma.userExcludedEntity.findFirst.mockResolvedValue(
      excluded ? partialRow({ id: 1 }) : null
    );
    await imageQueryBuilder.execute({
      userId: 1,
      allowedInstanceIds: ALLOWED,
      applyExclusions,
      request: parsedListRequest("image", {
        filter: untrusted<ParsedListRequest<"image">["filter"]>(filter),
      }),
    });
    return mockPrisma.$queryRawUnsafe.mock.calls
      .slice(0, 2)
      .map(([sql]) => sql);
  }

  const COUNT_ZERO = { performer_count: { modifier: "EQUALS", value: 0 } };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("with no performer exclusion row the count takes no anti-join, asked once per request", async () => {
    const statements = await statementsFor(COUNT_ZERO, false);

    expect(statements).toHaveLength(2);
    for (const sql of statements) {
      expect(sql).toContain("(SELECT COUNT(*) FROM ImagePerformer pc");
      expect(sql).not.toContain(PCE);
    }
    expect(mockPrisma.userExcludedEntity.findFirst).toHaveBeenCalledTimes(1);
    expect(mockPrisma.userExcludedEntity.findFirst).toHaveBeenCalledWith({
      where: { userId: 1, entityType: "performer" },
      select: { id: true },
    });
  });

  it("with one the count anti-joins them, the viewer bound before the value", async () => {
    const statements = await statementsFor(COUNT_ZERO, true);

    expect(statements).toHaveLength(2);
    for (const sql of statements) {
      expect(sql).toContain(
        `${PCE} ON pce.userId = ? AND pce.entityType = 'performer'`
      );
      expect(sql).toContain("AND pce.id IS NULL) = ?");
    }
    // The count statement's last two: the viewer, then the value
    const [, ...params] = must(mockPrisma.$queryRawUnsafe.mock.calls[1]);
    expect(params.slice(-2)).toEqual([1, 0]);
  });

  it("asks nothing when the viewer's exclusions do not apply, or no field needs it", async () => {
    await statementsFor(COUNT_ZERO, true, false);
    await statementsFor({ tag_count: { modifier: "EQUALS", value: 0 } }, true);

    expect(mockPrisma.userExcludedEntity.findFirst).not.toHaveBeenCalled();
  });
});
