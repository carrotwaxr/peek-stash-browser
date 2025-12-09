import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:C:/Users/charl/.peek-data/peek-stash-browser.db'
    }
  }
});

async function main() {
  try {
    const sceneRatings = await prisma.sceneRating.count();
    const performerRatings = await prisma.performerRating.count();
    const watchHistory = await prisma.watchHistory.count();
    const playlists = await prisma.playlist.count();
    const users = await prisma.user.count();

    console.log('User Data in Database:');
    console.log('  SceneRating:', sceneRatings);
    console.log('  PerformerRating:', performerRatings);
    console.log('  WatchHistory:', watchHistory);
    console.log('  Playlist:', playlists);
    console.log('  User:', users);
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

main();
