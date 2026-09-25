/**
 * The collection hierarchy (item 58): `GroupRelation` holds one row per edge
 * of Stash's group hierarchy, from a containing group to one of its
 * sub-groups, both keyed on (id, instance) like every junction.
 *
 * Its two composite foreign keys point at `StashGroup`: a relation to a group
 * the instance does not hold is rejected, even when another instance holds a
 * group with that id, and deleting a group (as an instance purge does, by raw
 * SQL) removes its relations on both sides.
 *
 * Made-up instances that real sync never touches; every row is deleted
 * before the file ends.
 */
import { afterAll, afterEach, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const A = "gr-a";
const B = "gr-b";

async function createGroup(id: string, instanceId: string): Promise<void> {
  await prisma.stashGroup.create({
    data: { id, stashInstanceId: instanceId, name: `Group ${id}` },
  });
}

async function removeRows(): Promise<void> {
  // The relations go with their groups (ON DELETE CASCADE)
  await prisma.stashGroup.deleteMany({
    where: { stashInstanceId: { in: [A, B] } },
  });
}

describeWithDb("GroupRelation", () => {
  afterEach(removeRows);
  afterAll(removeRows);

  it("rejects a relation whose sub group the instance does not hold", async () => {
    await createGroup("1", A);
    // Group 2 exists, but on the other instance
    await createGroup("2", B);

    await expect(
      prisma.groupRelation.create({
        data: {
          containingId: "1",
          containingInstanceId: A,
          subId: "2",
          subInstanceId: A,
          orderIndex: 0,
        },
      })
    ).rejects.toThrow(/Foreign key constraint/);
    expect(
      await prisma.groupRelation.count({ where: { containingInstanceId: A } })
    ).toBe(0);
  });

  it("rejects a relation whose containing group is missing", async () => {
    await createGroup("2", A);

    await expect(
      prisma.groupRelation.create({
        data: {
          containingId: "1",
          containingInstanceId: A,
          subId: "2",
          subInstanceId: A,
          orderIndex: 0,
        },
      })
    ).rejects.toThrow(/Foreign key constraint/);
    expect(
      await prisma.groupRelation.count({ where: { subInstanceId: A } })
    ).toBe(0);
  });

  it("deleting a group removes its relations on both sides", async () => {
    // P contains G, G contains C
    await createGroup("1", A);
    await createGroup("2", A);
    await createGroup("3", A);
    await prisma.groupRelation.createMany({
      data: [
        {
          containingId: "1",
          containingInstanceId: A,
          subId: "2",
          subInstanceId: A,
          orderIndex: 0,
          description: "Box set",
        },
        {
          containingId: "2",
          containingInstanceId: A,
          subId: "3",
          subInstanceId: A,
          orderIndex: 0,
          description: "Part 2",
        },
      ],
    });
    expect(
      await prisma.groupRelation.count({ where: { containingInstanceId: A } })
    ).toBe(2);

    await prisma.$executeRawUnsafe(
      `DELETE FROM "StashGroup" WHERE "id" = ? AND "stashInstanceId" = ?`,
      "2",
      A
    );

    expect(
      await prisma.groupRelation.count({ where: { containingInstanceId: A } })
    ).toBe(0);
    expect(
      await prisma.stashGroup.count({ where: { stashInstanceId: A } })
    ).toBe(2);
  });
});
