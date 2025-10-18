-- AlterTable
ALTER TABLE "Playlist" ADD COLUMN "shuffle" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Playlist" ADD COLUMN "repeat" TEXT NOT NULL DEFAULT 'none';
