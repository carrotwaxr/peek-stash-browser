# Upgrading Peek

Most upgrades are automatic - just pull the latest image and restart. This page covers backup procedures and version-specific notes.

## Standard Update Procedure

See [Installation - Update Procedure](installation.md#update-procedure) for step-by-step instructions on updating your container.

## Backup Procedure

### Automatic backup before migrations

When an upgrade has database migrations to apply, Peek copies the database before it changes anything. The copy goes to the config directory: `/app/data`, beside the database, unless you set `CONFIG_DIR` to somewhere else (an older unRAID template may have). It is named with the time (UTC) and the version that made it:

```
peek-stash-browser.db.backup-20260924-101112-pre-3.4.0
```

Peek keeps the 3 newest of these and deletes older ones. It never deletes a backup you made yourself. If Peek stops while it copies (the container restarts or crashes during the upgrade), the unfinished copy is never listed or counted among the 3: the next start deletes it and copies again. A new install, and an upgrade with no migrations, take no backup. This backup is the way back to the version you ran before: see [Downgrading](#downgrading).

Settings → Server Settings → Backup lists these backups as "Before upgrading to 3.4.0", beside the ones made there, with each file's path (see [Database Backup](../user-guide/user-management.md#database-backup)).

Before copying, Peek checks that the data directory has room for the copy and the migrations: about 2.2 times the space the database uses, plus 64 MB. If it has less, Peek stops and changes nothing (see [Migration failed](#migration-failed)).

### Manual backup

You can also back up the database yourself, for example before a major upgrade. Your Peek database is a single SQLite file.

=== "unRAID"

    1. Stop the Peek container. As it stops, Peek writes everything into `peek-stash-browser.db`.
    2. Navigate to your Peek appdata folder (typically `/mnt/user/appdata/peek-stash-browser/`)
    3. Copy `peek-stash-browser.db` to a safe location
    4. Start the container again

    To back up without stopping Peek, click **Create Backup** in Settings → Server Settings → Backup (see [Database Backup](../user-guide/user-management.md#database-backup)). Do not copy the files of a running Peek: the database and its `-wal` and `-shm` files change while you copy them, and the copies may not match.

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
    docker exec -u peek peek-stash-browser sqlite3 /app/data/peek-stash-browser.db ".backup '/app/data/backup.db'"
    docker cp peek-stash-browser:/app/data/backup.db ./peek-stash-browser.db.backup
    ```
    `-u peek` is the user Peek runs as: at start the image gives it your `PUID` and `PGID` (default `99:100`), so it can write to `/app/data` whatever you set. Only with `PUID=0`, where Peek runs as root, use `-u root` instead. Delete `backup.db` from the data directory afterwards.

## Restore from Backup

```bash
# Stop Peek
docker stop peek-stash-browser

# Delete the old database's WAL files first: they belong to it, not to the
# backup, and SQLite would replay a stale WAL onto the restored file.
# Then replace the database with the backup (adjust paths for your setup)
rm -f /path/to/data/peek-stash-browser.db-wal /path/to/data/peek-stash-browser.db-shm
cp ./peek-stash-browser.db.backup /path/to/data/peek-stash-browser.db

# Restart
docker start peek-stash-browser
```

## Downgrading

After an upgrade that applied migrations, the database is in the new version's format, and older versions cannot use it: 3.4.0-beta.1 and 3.3.8, for example, crash-loop on a database a later version migrated, logging `The column main.User.recoveryKey does not exist`. Restoring the backup Peek took before migrating is the only way back:

1. Stop Peek.
2. In the data directory, delete `peek-stash-browser.db-wal` and `peek-stash-browser.db-shm` if they exist.
3. Copy the pre-migration backup of the upgrade you are undoing (`peek-stash-browser.db.backup-<time>-pre-<new version>`) over `peek-stash-browser.db`.
4. Set the image back to the version you ran before, and start it.

```bash
docker stop peek-stash-browser
cd /path/to/data
rm -f peek-stash-browser.db-wal peek-stash-browser.db-shm
cp peek-stash-browser.db.backup-20260924-101112-pre-3.4.0 peek-stash-browser.db
# then start the previous image, e.g. carrotwaxr/peek-stash-browser:3.3.8
```

Everything written after the upgrade is lost: ratings, favorites, watch history, playlists, users and settings changed since then. The backup is the database as it was just before the upgrade. The library cache catches up with Stash at the next sync.

An upgrade that applied no migrations took no backup and needs none: the older version starts on the database as it is.

---

## Databases from before v2.0.0

Peek v2.0.0 and earlier created their database without a migration history. This version upgrades such a database only if it came from v2.0.0. A database from an older Peek stops the server at startup, before anything in it changes, and the log says:

```
This database was created by Peek before v2.0.0 (missing tables: ...). This version cannot upgrade it. Start carrotwaxr/peek-stash-browser:2.0.0 on the same data directory once, stop it, then start this version. See Upgrading → Databases from before v2.0.0.
```

To upgrade it, back it up (see [Backup Procedure](#backup-procedure)), then:

1. Start `carrotwaxr/peek-stash-browser:2.0.0` on the same data directory: change only the image tag. Wait until its log shows `Server is running`; its start brings the database up to v2.0.0.
2. Stop it, set the image back to the version you want, and start it. That start applies every later migration.

If the message names `carrotwaxr/peek-stash-browser:3.2.2` instead, your database was upgraded past v2.0.0 while missing some of its tables. Do the same with the 3.2.2 image: its schema repair creates them.

---

## Version Notes

### Version 3.4.0

**Migration:** Automatic. The 3.4.0 betas add 28 database migrations in all and four one-time data steps that run after the first start. Peek backs up the database before the first of them; nothing needs doing, but going back to an earlier version needs that backup (see [Downgrading](#downgrading)). Each beta's changes are listed below, in order, for an install that skipped some of them.

- Two columns kept only so that a downgrade to 3.3.6 could still run are removed: the scene stream list, empty since 3.3.7, and the plaintext recovery key. A recovery key that 3.3.6 created after such a downgrade keeps working. Downgrading from this version needs the pre-migration backup Peek takes before upgrading: see [Downgrading](#downgrading).
- The upgrade rebuilds the library tables once, so that the database matches Peek's schema exactly: about 3 seconds per 25,000 scenes plus their images, before the server starts listening. It needs about twice the database's size free on the data volume, for the backup and the rebuild.
- Scenes gain stored sort keys for title, performer count and tag count, so sorting the scene list by them no longer reads every scene. The upgrade fills them once: about 2 seconds for 26,000 scenes, 4 seconds for 200,000.
- Saved filter presets and custom carousels are tidied once, when the first start after the upgrade has finished its startup sync: filters the app no longer has are removed, a sort the list no longer offers becomes its default, a preset's items per page is held to 250, and picks saved before multi-instance support are tied to their server when only one server has them (a pick that more than one server has keeps matching on each). The log lists each preset and carousel changed, by key name, and a summary line starting `[Migration 009]`. A preset or carousel you save again while it runs is left as you saved it.
- **3.4.0-beta.4:** three migrations: the ten per-user tables (ratings, history and the like) now require the Stash server of each row (about 0.4 s), tags store the number their cards showed, and a new table holds each user's excluded links. After the first start two one-time steps run: one rebuilds the card counts from the synced library, one recomputes every user's exclusions. A card's count is now Peek's own count of what the page behind it lists, less what the viewer cannot see, so counts may differ from before, and an admin sees Peek's numbers where Stash's used to show. Peek no longer lets you disable or delete the last enabled Stash server (an install already in that state opens normally), and disabling one asks first. Deleting a server removes its entries from every restriction list; a Show-only list left empty keeps hiding its type until an admin edits it. A call that reads history or writes a play, rating, favorite, hide or playlist change must name the item's Stash server (`id:instanceId`), or it is refused with a 400. Peek's own pages always do. A user's Hidden Items page now shows thumbnails, because the image proxy serves a user the images of items they hid themselves (restricted items stay refused, and so do streams and captions).
- **3.4.0-beta.5:** three migrations, about 10 seconds in all on a library of 26,000 scenes (a stored title sort key for images 7.5 s, an indexed table of the tags scenes inherit 1.3 s, a clip index 1 s), before the server starts listening. Lists follow the address bar: Back and Forward step through pages, filters and sorts, and clearing the filters writes `filters=none`, so a filtering default does not come straight back.
- **3.4.0-beta.6:** five small migrations (the one that repairs double-encoded history lists took under 5 ms on a 26,000-scene library; it fixes the Last O At sort). Chromecast and AirPlay are removed, and so are the Preferred Quality and Playback Mode settings, which were saved and never read: pick a quality for a video from the player's source menu. Playlists lose their old public flag; sharing is with groups, and a share ends when its owner loses Can Share and returns if Can Share returns. Download zips now run from a queue that survives a restart, skip and count scenes Stash cannot supply, and check size and disk space first. With Sync to Stash on, image O counts now reach Stash too.
- **3.4.0-beta.7:** no migrations. The VR plugin is removed (it was never switched on; VR returns later as its own feature). The saved player volume resets once. One password rule applies at the server and in every form: at least 8 characters with a letter and a number, and at most 72 bytes, checked when a password is set or changed (new accounts, resets and the setup wizard); an existing password keeps working. A user whose stored theme was not one of Peek's themes now gets the default theme.
- **3.4.0-beta.8:** a one-time migration rewrites the created and updated times Peek stores for every cached item as numbers (epoch milliseconds), which the date filters and the sync's change check now read: a second or two on a large library, before the server starts listening. The first sync after the upgrade fetches studios, collections, performers and galleries from Stash once more, to store aliases, every performer link, and a gallery's Organized flag and zip path. Until that sync finishes, studios and collections have no aliases and galleries no Organized flag or zip path, so the filters on them treat every item as empty (Aliases "has any" lists no studio); they fill in when it ends. Plan for that one longer sync on a large library; nothing else needs doing.
- **3.4.0-beta.8:** links and saved filters now hold height, weight and penis length in metric (centimetres and kilograms) whatever your units setting; the screen still shows feet, inches and pounds when you choose imperial. A link or preset that an imperial user saved with those three filters before this version means its numbers as metric now. Saved Views, links and carousels keep their filters, but several filters now match differently, so a saved list may show other items: ranges no longer count an unrated or empty value as 0, Performer Age and Resolution follow Stash, dates include both ends in your local day, Favorite Tags and Favorite Studios include inherited tags, sub-tags and sub-studios, and search needs every word. The History page's In Progress tab lists more scenes than before (a scene needs only a resume point before its last 10%), and a custom carousel's new Resolution rule starts at **Equals**.
- **3.4.0-beta.9:** saved filter presets are now Views, and custom carousels are stored in a new form: a tree of rows and groups, where beta.8 stored a flat list of rules. A one-time step converts them when the first start after the upgrade has finished its startup sync (milliseconds per user); a request made before it finishes is still answered correctly, because Peek reads both forms. Your presets, defaults and carousels carry over unchanged, except that a default pointing at a preset that no longer exists is removed. A carousel that selects scenes by id stays in the old form. Pins are stored in one new column (schema migration `20261003000100_user_filter_pins`), and the data step is migration 012; on a library with one user and four presets it took milliseconds. Every list starts with seeded pins (Favorites on every list but Clips, plus Unwatched on Scenes) until a user changes them. The old `GET /api/library/scenes/recommended` stays for one release beside the new `POST` routes. Beta.8 cannot read the new form, so going back to beta.8 means restoring the backup Peek takes before this upgrade's database migration (see [Downgrading](#downgrading)).

### Versions 3.2.0 to 3.3.6

**Migration:** Automatic. No action: no release in this range asks anything of an administrator. There is no 3.2.3.

- **3.3.0** adds user groups, recovery keys and password reset, login rate limiting and account lockout, downloads, playlist sharing, clips, support for several Stash servers, and the setup wizard.
- **3.2.2** adds scene merge detection and the database backup page for admins. Its schema repair is also the way to upgrade a database that is missing tables (see [Databases from before v2.0.0](#databases-from-before-v200)).
- **3.2.0, 3.2.1 and 3.3.1 to 3.3.6** are features and fixes only (wall, table, timeline and folder views, user stats, multi-server fixes, exclusion fixes, type and test work).

### Version 3.3.7

**Migration:** Automatic. Peek no longer runs as root.

- On first start, Peek gives `/app/data` to `PUID:PGID`, default `99:100` (unRAID's `nobody:users`), then runs the server as that user. If you manage a bind-mounted data directory from the host, set `PUID`/`PGID` to your own IDs (`id -u`, `id -g`). See [File ownership](installation.md#file-ownership-puidpgid).
- If the data directory cannot change owner and `PUID:PGID` cannot write to it, the container stops and says why (`/app/data is not writable by UID:GID`):
    - **NFS with root squash**: set `PUID`/`PGID` to the owner that `ls -ln` shows for the directory.
    - **SMB/CIFS**: ownership comes from the mount options. Set `PUID`/`PGID` to the `uid=` and `gid=` of the mount.
    - **Rootless Docker or Podman**: set `PUID=0`. Peek then runs as the container's root, which is your own user on the host, and logs a warning.
- `docker run --user` (or `user:` in Compose) is refused. Remove it and set `PUID`/`PGID`. It never worked before.
- **unRAID:** edit the container and remove the `DATABASE_URL` and `CONFIG_DIR` variables. Both were misleading: the database was always `/app/data/peek-stash-browser.db`, and a leftover `DATABASE_URL` logs a warning until you remove it. Keep `CONFIG_DIR` only if you pointed it outside `/app/data` on purpose: backups, download zips and `.jwt-secret` live there, and Peek gives that directory to `PUID:PGID` as well.

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
    If upgrading from any v3.0.0-beta.x, run a **Full Sync** (Settings → Server Settings → Server Configuration → Server Statistics → **Full Sync**) to ensure all fields are populated.

### Version 2.0.0

**Migration:** Automatic. No user action required.

- Removed local FFmpeg transcoding - videos now stream directly through Stash
- Removed path mapping configuration
- STASH_URL and STASH_API_KEY environment variables auto-migrate to database

### Version 1.x to 2.x

**Migration:** Upgrade through v2.0.0: start v2.0.0 once on your data, then the version you want. See [Databases from before v2.0.0](#databases-from-before-v200).

---

## Troubleshooting Upgrades

### Library empty after upgrade

Peek syncs at startup: a full sync when no sync has ever completed, or when the daily full pass is due, and otherwise an incremental one that fetches only what changed. If the library is still empty after several minutes:
1. Check logs: `docker logs peek-stash-browser`
2. Force a full sync: Settings → Server Settings → Server Configuration → Server Statistics → **Full Sync** (it asks first). A full sync that runs to the end also resets the daily full pass.

### Migration failed

Check logs for the specific error:
```bash
docker logs peek-stash-browser | grep -i migration
```

Common causes:

- **Not enough disk space**: before it backs up and migrates the database, Peek checks for room, and stops without changing anything when there is too little:

    ```
    Fatal error: Not enough disk space to upgrade the database: the upgrade needs 790.3 MB free in /app/data, which has 512.0 MB (a backup of the database, then room for the migrations to run). Free at least 278.3 MB there, for example by deleting old *.backup-* files, then start Peek again. Nothing was changed.
    ```

    Free at least the amount it names on the volume holding the data directory, then start Peek again. Old backups in the data directory (`*.backup-*`, including older pre-migration backups) are usually the easiest to move off the server or delete. The upgrade needs about 2.2 times the space the database uses, plus 64 MB.
- **Disk full, or Peek stopped, during a migration**: Peek's migrations since 3.4.0 run in one transaction, so one that fails or is interrupted changes nothing. At the next start Peek logs `Migration <name> was interrupted and rolled back; retrying` and runs it again. If the retry fails too, Peek stops and says why:

    ```
    Fatal error: Migration 20260925000100_drop_scene_fts failed again when Peek retried it. The database said: database or disk is full (SQLite error 13). It runs in one transaction, so it changed nothing, and Peek retries it at every start: fix the cause (a full disk is the usual one) and start Peek again. ...
    ```

    Fix the cause, for example by freeing disk space, and start Peek again. To go back to the version you ran before instead, restore the pre-migration backup the message names (see [Downgrading](#downgrading)).
- **Permission denied**: Check volume mount permissions

#### A migration Peek does not retry by itself

Two messages ask you to act before Peek can start. Both name the migration, the database's error and the newest pre-migration backup, and end with the command to run. Run it with Peek stopped, with the host directory you mount at `/app/data` in place of `<data dir>`, and with your `PUID:PGID` in place of `99:100` if you set them. `docker exec` cannot do it: the container stops at startup, and `exec` runs as root.

- **`Migration <name> did not finish at an earlier start`**: a migration from before 3.4.0, which does not run in one transaction, stopped partway, so some of its changes may be in the database. Either:
    1. Restore the pre-migration backup the message names (see [Restore from Backup](#restore-from-backup)): the database as it was before the upgrade. Then start the version you ran before, or this version again once the cause is fixed.
    2. Or fix the cause, undo what the migration applied, and mark the migration rolled back, so that the next start runs it again:

        ```bash
        docker stop peek-stash-browser
        docker run --rm --user 99:100 -v /path/to/data:/app/data --entrypoint node \
          carrotwaxr/peek-stash-browser:<version> \
          /app/node_modules/prisma/build/index.js migrate resolve --rolled-back <name> \
          --schema /app/prisma/schema.prisma
        docker start peek-stash-browser
        ```

- **`Migration <name> failed when Peek retried it`** and **`The migration itself creates or drops ...`**: the retry stumbled on something the migration makes or removes itself, so the migration most likely finished at the earlier start, which stopped in the instant before recording it. Mark it applied instead: the same command with `--applied <name>` in place of `--rolled-back <name>`. If you are not sure, restore the pre-migration backup.

### Sync is slow

The first sync after a major upgrade fetches all data from Stash. Subsequent syncs are incremental and much faster.

## Reporting Issues

Found an upgrade bug? Report it:

- [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
- [Peek on the Stash community forum](https://discourse.stashapp.cc/t/peek-stash-browser/4018), for questions

Include: Peek version, Stash version, library size, and relevant logs.
