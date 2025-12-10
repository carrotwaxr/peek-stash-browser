import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';

// Allow override via environment or detect Docker environment
// On Windows, /app/data check fails, so use platform detection
const isDocker = process.platform === 'linux' && existsSync('/app/data');
const dbPath = isDocker
  ? 'file:/app/data/peek-stash-browser.db'
  : 'file:C:/Users/charl/.peek-data/peek-stash-browser.db';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: dbPath
    }
  }
});

async function main() {
  try {
    const backupPath = isDocker
      ? '/app/data/user-data-backup.json'
      : 'C:/Users/charl/.peek-data/user-data-backup.json';
    console.log('Reading backup from:', backupPath);
    const backup = JSON.parse(readFileSync(backupPath, 'utf-8'));

    // Get existing watch history entries to skip
    const existingEntries = await prisma.watchHistory.findMany({
      select: { userId: true, sceneId: true }
    });
    const existingKeys = new Set(existingEntries.map(e => `${e.userId}:${e.sceneId}`));
    console.log(`Found ${existingKeys.size} existing watch history entries`);

    // Restore watch history (batch insert)
    if (backup.watchHistory?.length > 0) {
      // Filter out already restored entries
      const toRestore = backup.watchHistory.filter(
        entry => !existingKeys.has(`${entry.userId}:${entry.sceneId}`)
      );
      console.log(`Restoring ${toRestore.length} watch history entries (${backup.watchHistory.length - toRestore.length} already exist)...`);

      const chunkSize = 100;
      for (let i = 0; i < toRestore.length; i += chunkSize) {
        const chunk = toRestore.slice(i, i + chunkSize);
        // Convert date strings back to Date objects, handle missing dates
        const processed = chunk.map(entry => {
          const now = new Date();
          const watchedAtDate = entry.watchedAt ? new Date(entry.watchedAt) : now;

          // Exclude createdAt/updatedAt (managed by Prisma) and id (auto-increment)
          // eslint-disable-next-line no-unused-vars
          const { id, createdAt, updatedAt, ...restEntry } = entry;

          return {
            ...restEntry,
            watchedAt: watchedAtDate,
            lastPlayedAt: entry.lastPlayedAt ? new Date(entry.lastPlayedAt) : null,
          };
        });
        await prisma.watchHistory.createMany({ data: processed });
        if ((i + chunkSize) % 500 === 0 || i + chunkSize >= toRestore.length) {
          console.log(`  Progress: ${Math.min(i + chunkSize, toRestore.length)}/${toRestore.length}`);
        }
      }
    }

    console.log('\n✅ Restore complete!');

    // Verify counts
    console.log('\nVerification:');
    console.log('  WatchHistory:', await prisma.watchHistory.count());

  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
