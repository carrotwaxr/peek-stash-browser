/**
 * Data migration 013 on real SQLite: the dates earlier syncs stored as Stash
 * answered them for none ("0001-01-01", a collection with no date) become
 * NULL, a chunk at a time, and every real date stays.
 *
 * Rows are seeded under a made-up instance, `migration-013-it`, which real
 * sync never touches, and deleted afterwards. The integration server never
 * runs data migrations, so the body is called directly; it also clears any
 * such date of the replay's own rows, which hold none.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { clearYearOneDates } from "../../services/DataMigrationService.js";

const INSTANCE = "migration-013-it";

describe("data migration 013: year-1 dates", () => {
  const where = { stashInstanceId: INSTANCE };

  beforeAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "StashGroup" (id, stashInstanceId, name, date) VALUES
       ('1', ?, 'Year one', '0001-01-01'),
       ('2', ?, 'Year one too', '0001-01-01'),
       ('3', ?, 'Dated', '2020-05-01'),
       ('4', ?, 'Undated', NULL)`,
      INSTANCE,
      INSTANCE,
      INSTANCE,
      INSTANCE
    );
    await prisma.$executeRawUnsafe(
      `INSERT INTO "StashPerformer" (id, stashInstanceId, name, birthdate, deathDate) VALUES
       ('1', ?, 'Year one', '0001-01-01', '0001-01-01'),
       ('2', ?, 'Dated', '1990-02-03', NULL)`,
      INSTANCE,
      INSTANCE
    );
  });

  afterAll(async () => {
    await prisma.stashGroup.deleteMany({ where });
    await prisma.stashPerformer.deleteMany({ where });
  });

  it("clears every year-1 date, a chunk a write unit, and leaves the rest", async () => {
    // A chunk of one, so the collections take more than one unit
    const cleared = await clearYearOneDates(1);

    expect(cleared["StashGroup.date"]).toBeGreaterThanOrEqual(2);
    const groups = await prisma.stashGroup.findMany({
      where,
      select: { id: true, date: true },
      orderBy: { id: "asc" },
    });
    expect(groups).toEqual([
      { id: "1", date: null },
      { id: "2", date: null },
      { id: "3", date: "2020-05-01" },
      { id: "4", date: null },
    ]);
    const performers = await prisma.stashPerformer.findMany({
      where,
      select: { id: true, birthdate: true, deathDate: true },
      orderBy: { id: "asc" },
    });
    expect(performers).toEqual([
      { id: "1", birthdate: null, deathDate: null },
      { id: "2", birthdate: "1990-02-03", deathDate: null },
    ]);
  });
});
