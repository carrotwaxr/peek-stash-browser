# Upgrading Peek

Most upgrades are automatic - just pull the latest image and restart. This page covers backup procedures and version-specific notes.

## Standard Update Procedure

See [Installation - Update Procedure](installation.md#update-procedure) for step-by-step instructions on updating your container.

## Backup Procedure

Before major upgrades, back up your database. Your Peek database is a single SQLite file.

=== "unRAID"

    1. Navigate to your Peek appdata folder (typically `/mnt/user/appdata/peek-stash-browser/`)
    2. Copy `peek-stash-browser.db` to a safe location
    3. Also copy `peek-stash-browser.db-wal` and `peek-stash-browser.db-shm` if they exist

=== "Docker (Named Volume)"

    ```bash
    # Stop Peek for a clean backup
    docker stop peek-stash-browser

    # Copy from named volume
    docker run --rm -v peek-data:/data -v $(pwd):/backup alpine \
      cp /data/peek-stash-browser.db /backup/peek-stash-browser.db.backup

    # Restart
    docker start peek-stash-browser
    ```

=== "Docker (Bind Mount)"

    ```bash
    # Stop Peek for a clean backup
    docker stop peek-stash-browser

    # Copy the database file
    cp /path/to/your/data/peek-stash-browser.db ./peek-stash-browser.db.backup

    # Restart
    docker start peek-stash-browser
    ```

!!! tip "Hot Backup (While Running)"
    If you can't stop the container:
    ```bash
    docker exec peek-stash-browser sqlite3 /app/data/peek-stash-browser.db ".backup '/app/data/backup.db'"
    docker cp peek-stash-browser:/app/data/backup.db ./peek-stash-browser.db.backup
    ```

## Restore from Backup

```bash
# Stop Peek
docker stop peek-stash-browser

# Replace database with backup
# (adjust paths for your setup)
cp ./peek-stash-browser.db.backup /path/to/data/peek-stash-browser.db

# Restart
docker start peek-stash-browser
```

---

## Version Notes

### Version 3.1.0

**Migration:** Automatic. No user action required.

- New `UserExcludedEntity` table for pre-computed exclusions
- New indexes on image junction tables
- A full sync is triggered automatically to populate inherited tags on scenes

### Version 3.0.0

**Migration:** Automatic. No user action required.

Major architectural change: Stash entity data is now stored in SQLite instead of memory.

- **Scalability**: Support for 100k+ scenes
- **Performance**: Sub-100ms query times
- **Persistence**: Library data survives restarts

The initial sync after upgrading may take several minutes depending on library size.

!!! note "Upgrading from 3.0.0 Beta"
    If upgrading from any v3.0.0-beta.x, run a **Full Sync** (Settings → Server Settings → Sync from Stash) to ensure all fields are populated.

### Version 2.0.0

**Migration:** Automatic. No user action required.

- Removed local FFmpeg transcoding - videos now stream directly through Stash
- Removed path mapping configuration
- STASH_URL and STASH_API_KEY environment variables auto-migrate to database

### Version 1.x to 2.x

**Migration:** Automatic. Schema updates are applied automatically on first start.

---

## Troubleshooting Upgrades

### Library empty after upgrade

The sync should start automatically. If empty after several minutes:
1. Check logs: `docker logs peek-stash-browser`
2. Manually trigger sync: Settings → Server Settings → Sync from Stash

### Migration failed

Check logs for the specific error:
```bash
docker logs peek-stash-browser | grep -i migration
```

Common causes:
- **Disk full**: Free up space and restart
- **Permission denied**: Check volume mount permissions

### Sync is slow

The first sync after a major upgrade fetches all data from Stash. Subsequent syncs are incremental and much faster.

## Reporting Issues

Found an upgrade bug? Report it:

- [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
- [Stash Discourse](https://discourse.stashapp.cc/t/peek-stash-browser/4018)

Include: Peek version, Stash version, library size, and relevant logs.
