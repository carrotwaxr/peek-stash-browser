/**
 * A recompute's swap and the `pending` holds a sync batch writes meanwhile
 * (C18), against the real test SQLite database.
 *
 * The swap deletes the user's rows and inserts the recompute's. A hold the
 * recompute's read snapshot saw is replaced by what the recompute found; a
 * hold committed after the snapshot opened is for a change the recompute
 * did not see, so it stays until the next recompute. A batch stamps its
 * hold's time before its own statements run and commits later, so the
 * hold's time can fall before the snapshot's start while its row is not in
 * the snapshot: the swap tells them apart by the row's id.
 *
 * The holds are rows for a made-up instance of a throwaway user, written
 * with prisma as holdForRecompute's statement writes them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import prisma from "../../prisma/singleton.js";
import { exclusionComputationService } from "../../services/ExclusionComputationService.js";

// Skip if no database connection (matches other integration tests).
const describeWithDb = process.env.DATABASE_URL ? describe : describe.skip;

const INSTANCE = "holds-it";

describeWithDb("ExclusionComputationService holds (integration)", () => {
  let userId: number;

  /** A pending hold for scene `id`, stamped `computedAt` (epoch ms). */
  async function hold(id: string, computedAt: number): Promise<void> {
    await prisma.$executeRawUnsafe(
      `INSERT OR IGNORE INTO UserExcludedEntity (userId, entityType, entityId, instanceId, reason, computedAt)
       VALUES (?, 'scene', ?, ?, 'pending', ?)`,
      userId,
      id,
      INSTANCE,
      computedAt
    );
  }

  async function heldIds(): Promise<string[]> {
    const rows = await prisma.userExcludedEntity.findMany({
      where: { userId, instanceId: INSTANCE, reason: "pending" },
      select: { entityId: true },
      orderBy: { entityId: "asc" },
    });
    return rows.map((row) => row.entityId);
  }

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: { username: `holds-it-${Date.now()}`, password: "unused" },
    });
    userId = user.id;
  });

  afterAll(async () => {
    await prisma.user.delete({ where: { id: userId } });
  });

  it("keeps a hold committed after the snapshot opened, even stamped before it, and replaces the ones the snapshot saw", async () => {
    // Seen by the snapshot: the recompute settles it
    await hold("1", Date.now() - 60_000);

    // A sync batch that stamped its hold before the recompute started and
    // commits once the recompute's snapshot is open
    const service = exclusionComputationService;
    const loadHidden = service["loadHidden"];
    let committed = false;
    service["loadHidden"] = async (id, tx) => {
      const hidden = await loadHidden.call(service, id, tx);
      if (!committed) {
        committed = true;
        await hold("2", Date.now() - 60_000);
      }
      return hidden;
    };
    try {
      await service.recomputeForUser(userId);
    } finally {
      service["loadHidden"] = loadHidden;
    }

    expect(committed).toBe(true);
    expect(await heldIds()).toEqual(["2"]);

    // The next recompute sees it and settles it
    await service.recomputeForUser(userId);
    expect(await heldIds()).toEqual([]);
  }, 60_000);
});
