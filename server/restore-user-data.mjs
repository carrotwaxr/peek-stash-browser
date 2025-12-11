import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';

// Allow override via environment or detect Docker environment
const isDocker = existsSync('/app/data');
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

    console.log('Restoring user data...\n');

    // Restore users first (other tables depend on userId)
    if (backup.users?.length > 0) {
      console.log(`Restoring ${backup.users.length} users...`);
      for (const user of backup.users) {
        await prisma.user.create({ data: user });
      }
    }

    // Restore Stash instances
    if (backup.stashInstances?.length > 0) {
      console.log(`Restoring ${backup.stashInstances.length} stash instances...`);
      for (const instance of backup.stashInstances) {
        await prisma.stashInstance.create({ data: instance });
      }
    }

    // Restore sync settings
    if (backup.syncSettings?.length > 0) {
      console.log(`Restoring ${backup.syncSettings.length} sync settings...`);
      for (const setting of backup.syncSettings) {
        await prisma.syncSettings.create({ data: setting });
      }
    }

    // Restore playlists (before playlist items)
    if (backup.playlists?.length > 0) {
      console.log(`Restoring ${backup.playlists.length} playlists...`);
      for (const playlist of backup.playlists) {
        await prisma.playlist.create({ data: playlist });
      }
    }

    // Restore playlist items
    if (backup.playlistItems?.length > 0) {
      console.log(`Restoring ${backup.playlistItems.length} playlist items...`);
      for (const item of backup.playlistItems) {
        await prisma.playlistItem.create({ data: item });
      }
    }

    // Restore ratings (batch insert for performance)
    const ratingTables = [
      { name: 'sceneRatings', model: prisma.sceneRating },
      { name: 'performerRatings', model: prisma.performerRating },
      { name: 'studioRatings', model: prisma.studioRating },
      { name: 'tagRatings', model: prisma.tagRating },
      { name: 'galleryRatings', model: prisma.galleryRating },
      { name: 'groupRatings', model: prisma.groupRating },
      { name: 'imageRatings', model: prisma.imageRating },
    ];

    for (const { name, model } of ratingTables) {
      if (backup[name]?.length > 0) {
        console.log(`Restoring ${backup[name].length} ${name}...`);
        // Batch insert in chunks of 100
        const chunkSize = 100;
        for (let i = 0; i < backup[name].length; i += chunkSize) {
          const chunk = backup[name].slice(i, i + chunkSize);
          await model.createMany({ data: chunk });
        }
      }
    }

    // Restore watch history (batch insert)
    if (backup.watchHistory?.length > 0) {
      console.log(`Restoring ${backup.watchHistory.length} watch history entries...`);
      const chunkSize = 100;
      for (let i = 0; i < backup.watchHistory.length; i += chunkSize) {
        const chunk = backup.watchHistory.slice(i, i + chunkSize);
        // Convert date strings back to Date objects, handle missing dates
        const processed = chunk.map(entry => {
          const now = new Date();
          const watchedAtDate = entry.watchedAt ? new Date(entry.watchedAt) : now;
          const createdAtDate = entry.createdAt && !isNaN(new Date(entry.createdAt).getTime())
            ? new Date(entry.createdAt)
            : watchedAtDate;
          const updatedAtDate = entry.updatedAt && !isNaN(new Date(entry.updatedAt).getTime())
            ? new Date(entry.updatedAt)
            : entry.lastPlayedAt ? new Date(entry.lastPlayedAt) : watchedAtDate;

          return {
            ...entry,
            watchedAt: watchedAtDate,
            createdAt: createdAtDate,
            updatedAt: updatedAtDate,
            lastPlayedAt: entry.lastPlayedAt ? new Date(entry.lastPlayedAt) : null,
          };
        });
        await prisma.watchHistory.createMany({ data: processed });
      }
    }

    console.log('\n✅ Restore complete!');

    // Verify counts
    console.log('\nVerification:');
    console.log('  Users:', await prisma.user.count());
    console.log('  SceneRatings:', await prisma.sceneRating.count());
    console.log('  PerformerRatings:', await prisma.performerRating.count());
    console.log('  WatchHistory:', await prisma.watchHistory.count());
    console.log('  Playlists:', await prisma.playlist.count());

  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
