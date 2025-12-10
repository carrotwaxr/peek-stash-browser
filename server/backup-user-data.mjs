import { PrismaClient } from '@prisma/client';
import { writeFileSync } from 'fs';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: 'file:C:/Users/charl/.peek-data/peek-stash-browser.db'
    }
  }
});

async function main() {
  try {
    console.log('Backing up user data...');
    console.log('Prisma client tables:', Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$')));

    // Backup all user-related tables one by one
    const backup = {};

    console.log('Backing up users...');
    backup.users = await prisma.user.findMany();

    console.log('Backing up sceneRatings...');
    backup.sceneRatings = await prisma.sceneRating.findMany();

    console.log('Backing up performerRatings...');
    backup.performerRatings = await prisma.performerRating.findMany();

    console.log('Backing up studioRatings...');
    backup.studioRatings = await prisma.studioRating.findMany();

    console.log('Backing up tagRatings...');
    backup.tagRatings = await prisma.tagRating.findMany();

    console.log('Backing up galleryRatings...');
    backup.galleryRatings = await prisma.galleryRating.findMany();

    console.log('Backing up groupRatings...');
    backup.groupRatings = await prisma.groupRating.findMany();

    console.log('Backing up imageRatings...');
    backup.imageRatings = await prisma.imageRating.findMany();

    console.log('Backing up watchHistory...');
    backup.watchHistory = await prisma.watchHistory.findMany();

    console.log('Backing up playlists...');
    backup.playlists = await prisma.playlist.findMany();

    console.log('Backing up playlistItems...');
    backup.playlistItems = await prisma.playlistItem.findMany();

    console.log('Backing up stashInstances...');
    backup.stashInstances = await prisma.stashInstance.findMany();

    console.log('Backing up syncSettings...');
    try {
      backup.syncSettings = await prisma.syncSettings.findMany();
    } catch (e) {
      console.log('  syncSettings table may not exist:', e.message);
      backup.syncSettings = [];
    }

    const backupPath = 'C:/Users/charl/.peek-data/user-data-backup.json';
    writeFileSync(backupPath, JSON.stringify(backup, null, 2));

    console.log('Backup saved to:', backupPath);
    console.log('Counts:');
    console.log('  Users:', backup.users.length);
    console.log('  SceneRatings:', backup.sceneRatings.length);
    console.log('  PerformerRatings:', backup.performerRatings.length);
    console.log('  StudioRatings:', backup.studioRatings.length);
    console.log('  TagRatings:', backup.tagRatings.length);
    console.log('  GalleryRatings:', backup.galleryRatings.length);
    console.log('  GroupRatings:', backup.groupRatings.length);
    console.log('  ImageRatings:', backup.imageRatings.length);
    console.log('  WatchHistory:', backup.watchHistory.length);
    console.log('  Playlists:', backup.playlists.length);
    console.log('  PlaylistItems:', backup.playlistItems.length);
    console.log('  StashInstances:', backup.stashInstances.length);

  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
