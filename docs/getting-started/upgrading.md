# Upgrading Peek

This guide covers upgrading Peek to new versions, including database migration procedures and backup strategies.

## Version 2.2.0 (Beta) - SQLite Entity Cache

**Release Type:** Beta - recommended for testing only

Version 2.2.0 introduces a major architectural change: Stash entity data is now stored in SQLite tables instead of being held in memory. This provides:

- **Scalability**: Support for 100k+ scenes without memory exhaustion
- **Performance**: Sub-100ms query times with proper indexing
- **Persistence**: Library data survives container restarts

### What's Changed

| Before (v2.1.x) | After (v2.2.0) |
|-----------------|----------------|
| In-memory cache | SQLite tables |
| ~3.6 hour sync for 22k scenes | ~3 minute sync |
| Memory-limited (~50k scenes max) | Disk-limited (tested to 100k+) |
| Data lost on restart | Data persists |

### Database Changes Summary

The migration adds **new tables only** - it does NOT modify your existing user data tables:

**New Tables (23 total):**
- 7 entity tables: `StashScene`, `StashPerformer`, `StashStudio`, `StashTag`, `StashGroup`, `StashGallery`, `StashImage`
- 14 junction tables for relationships (e.g., `ScenePerformer`, `SceneTag`, `PerformerTag`)
- 2 sync management tables: `SyncState`, `SyncSettings`

**Preserved Data:**
- User accounts and passwords
- Watch history and resume positions
- Playlists and playlist items
- Scene/performer/studio/tag ratings and favorites
- Filter presets and carousel preferences
- Content restrictions and hidden entities
- Custom themes

### Pre-Upgrade Checklist

1. **Back up your database** (see [Backup Procedure](#backup-procedure) below)
2. Note your current Peek version: Settings > Server Statistics
3. Ensure Docker has sufficient disk space (~500MB for 100k scenes)

### Backup Procedure

Your Peek database is a single SQLite file. Back it up before upgrading:

#### Option 1: Docker Compose (Recommended)

```bash
# Stop Peek to ensure clean backup
docker-compose stop peek-server

# Find your data directory (check your docker-compose.yml volumes)
# Default is ./data or a named volume

# Copy the database file
cp ./data/peek.db ./data/peek.db.backup-$(date +%Y%m%d)

# Or if using a named volume:
docker run --rm -v peek_data:/data -v $(pwd):/backup alpine \
  cp /data/peek.db /backup/peek.db.backup-$(date +%Y%m%d)

# Restart Peek
docker-compose start peek-server
```

#### Option 2: unRAID Users

1. Navigate to your Peek appdata folder (typically `/mnt/user/appdata/peek/`)
2. Copy `peek.db` to a safe location outside the container
3. Also copy `peek.db-wal` and `peek.db-shm` if they exist (WAL mode files)

#### Option 3: While Running (Less Safe)

SQLite supports hot backups, but stopping the container is safer:

```bash
# If you can't stop the container
docker exec peek-server sqlite3 /app/data/peek.db ".backup '/app/data/peek-backup.db'"
docker cp peek-server:/app/data/peek-backup.db ./peek.db.backup
```

### Upgrade Steps

#### Step 1: Pull the New Image

```bash
# For docker-compose users
docker-compose pull

# For manual docker users
docker pull carrotwaxr/peek:2.2.0-beta
```

#### Step 2: Restart the Container

```bash
# Docker Compose
docker-compose down
docker-compose up -d

# Manual Docker
docker stop peek-server
docker rm peek-server
docker run -d --name peek-server ... carrotwaxr/peek:2.2.0-beta
```

#### Step 3: Wait for Migration

On first startup, Prisma will automatically apply the migration:
- Check logs: `docker-compose logs -f peek-server`
- Look for: `Applied migration: 20251211000000_stash_entities`
- Migration typically completes in under 5 seconds

#### Step 4: Trigger Initial Sync

The library will be empty until you sync with Stash:

1. Open Peek in your browser
2. Navigate to **Settings > Sync**
3. Click **Full Sync**
4. Wait for sync to complete (check progress in the header)

Sync times depend on your library size:
| Library Size | Expected Time |
|--------------|---------------|
| 1,000 scenes | ~15 seconds |
| 10,000 scenes | ~1-2 minutes |
| 50,000 scenes | ~5-8 minutes |
| 100,000 scenes | ~15-20 minutes |

### Rollback Procedure

If something goes wrong, you can restore your backup:

```bash
# Stop Peek
docker-compose stop peek-server

# Restore the backup
cp ./data/peek.db.backup-YYYYMMDD ./data/peek.db

# Restart with old image
docker-compose up -d
```

Note: If you need to downgrade the Docker image version, you may need to delete the migration record:

```bash
# Only if downgrading AND experiencing migration errors
docker exec peek-server sqlite3 /app/data/peek.db \
  "DELETE FROM _prisma_migrations WHERE migration_name = '20251211000000_stash_entities'"
```

### Troubleshooting

#### "Library is empty after upgrade"

This is expected! The new SQLite tables start empty. Go to Settings > Sync and click "Full Sync".

#### "Migration failed"

Check the logs for the specific error:
```bash
docker-compose logs peek-server | grep -i migration
```

Common issues:
- **Disk full**: Free up space and restart
- **Permission denied**: Check volume mount permissions
- **Database locked**: Stop other processes accessing the DB

#### "Sync is very slow"

The initial sync after upgrade fetches all data from Stash. Subsequent syncs are incremental and much faster (typically <30 seconds).

#### "Can't connect to Stash"

Verify your Stash configuration in Settings. The upgrade doesn't change your Stash connection settings.

### What's NOT Included in 2.2.0 Beta

This beta focuses on the core architecture change. These features are planned for stable release:

- [ ] Automatic incremental sync on Stash scan complete
- [ ] Full-text search across all entity types
- [ ] Multi-Stash instance support

### Reporting Issues

Found a bug? Please report it:
- GitHub: [github.com/carrotwaxr/peek-stash-browser/issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
- Discourse: [discourse.stashapp.cc](https://discourse.stashapp.cc/t/peek-stash-browser/4018)

Include:
1. Your Peek version (Settings > Server Statistics)
2. Your Stash version
3. Library size (scene count)
4. Relevant log output
5. Steps to reproduce
