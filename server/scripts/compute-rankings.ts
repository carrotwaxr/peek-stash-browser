// scripts/compute-rankings.ts
// Manual script to compute rankings for a user
// Usage: npx tsx scripts/compute-rankings.ts [userId]

import prisma from "../prisma/singleton.js";
import rankingComputeService from "../services/RankingComputeService.js";

async function main() {
  const userId = parseInt(process.argv[2]) || 11; // Default to Phoenix (11)

  console.log(`Computing rankings for userId: ${userId}...`);

  const startTime = Date.now();
  await rankingComputeService.recomputeAllRankings(userId);
  const duration = Date.now() - startTime;

  // Verify results
  const counts = await prisma.$queryRaw<Array<{ entityType: string; count: bigint }>>`
    SELECT entityType, COUNT(*) as count
    FROM UserEntityRanking
    WHERE userId = ${userId}
    GROUP BY entityType
  `;

  console.log(`\nRankings computed in ${duration}ms:`);
  for (const row of counts) {
    console.log(`  ${row.entityType}: ${row.count} entities`);
  }

  // Show top 5 performers
  const performers = await prisma.userEntityRanking.findMany({
    where: { userId, entityType: "performer" },
    orderBy: { percentileRank: "desc" },
    take: 5,
  });

  if (performers.length > 0) {
    console.log("\nTop 5 Performers:");
    for (const p of performers) {
      // Use findFirst since composite primary key [id, stashInstanceId] requires both fields for findUnique
      const perf = await prisma.stashPerformer.findFirst({
        where: { id: p.entityId },
        select: { name: true },
      });
      console.log(`  - ${perf?.name}: ${p.percentileRank}th percentile (plays: ${p.playCount}, Os: ${p.oCount})`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
