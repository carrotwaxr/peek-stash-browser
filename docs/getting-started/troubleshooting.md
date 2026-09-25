# Troubleshooting

Quick solutions for common issues with Peek.

## Network Setup

For best performance, Peek and Stash should be on the same local network (ideally the same machine or Docker network). Peek proxies all video streams through Stash, so network latency directly affects playback performance.

**Recommended setup:**

- Peek and Stash on the same Docker host
- Or: Same LAN with gigabit connection
- Avoid: Peek and Stash on different networks/VPNs

## Container Won't Start

**Check logs first:**

```bash
docker logs peek-stash-browser
```

**Common causes:**

- `/app/data` not writable (Peek stores its generated session secret there)
- Port 6969 already in use
- Volume mount issues for `/app/data`

**Solution:** Recreate the container with correct configuration. See [Installation](../getting-started/installation.md).

**`[entrypoint] ERROR: /app/data is not writable by UID:GID`**

The data directory could not be given to Peek's user, usually because it cannot change owner (NFS with root squash, SMB/CIFS, a read-only mount). Set `PUID`/`PGID` to the owner that `ls -ln` shows for your data directory. On rootless Docker or Podman, set `PUID=0`. See [File ownership](installation.md#file-ownership-puidpgid).

**`[entrypoint] ERROR: this image manages its own user: remove --user ...`**

Remove `--user` from `docker run` (or `user:` from your Compose file) and set `PUID`/`PGID` instead.

## Can't Connect to Stash

**Symptoms:** Empty library, "Connection failed" errors, sync fails.

**Test connectivity from Peek container:**

```bash
docker exec peek-stash-browser curl -X POST http://your-stash-ip:9999/graphql \
  -H "Content-Type: application/json" \
  -H "ApiKey: your-api-key" \
  -d '{"query": "{ findTags(filter: { per_page: 1 }) { count } }"}'
```

**Checklist:**

- [ ] Stash URL is correct in Settings → Server Settings
- [ ] API key is valid (Stash → Settings → Security)
- [ ] Stash is reachable from Peek container (check Docker networking)
- [ ] No firewall blocking the connection

## Sync Problems

**Where to look:** Settings → Server Configuration → Sync status. Each Stash instance has a table with one row per type (tags, studios, performers, collections, galleries, scenes, clips, images): when it last had a full sync, the newest change Peek has from Stash, how many items the last run synced and how long it took, and the problem the last run had with that type, if any. A type that fails does not stop the others: the next sync retries it from where it left off, and its problem clears once it syncs cleanly.

- **A Stash error on one type**, such as `FindStudios: runtime error: invalid memory address or nil pointer dereference (at findStudios.studios.3.image_path) (HTTP 200)`: Stash failed to answer for that type. The part in brackets names the field that broke (a studio's `image_path` here).
- **`Stash request FindStudios timed out after 120 s`**: every request to Stash gives up after two minutes, so a Stash that hangs cannot hold the sync forever. Check that Stash is running and answers in its own web UI, then let the next sync try again.
- **A running sync takes too long**: the **Abort sync** button next to Sync status stops it at its next step, including a request to Stash that is still waiting. The types that finished keep their progress; the next sync picks up the rest.
- **`Cleanup refused: Stash no longer lists 812 of 1,200 scenes (more than half); ...`**: after each sync Peek removes what Stash no longer lists, but it holds back when more than half of a type would go (and more than 50 items), because an incomplete list from Stash would otherwise empty your library. If you did delete that many in Stash, press **Apply deletions** on that row and confirm: Peek asks Stash for the list again and removes only what Stash still does not list. It stops again if the list comes back incomplete. A Full Sync brings back anything Stash lists again later.
- **`Cleanup skipped: ...`**: Stash's list came back incomplete or empty, so Peek removed nothing. The next sync checks again.
- **A Stash on a blocked port**: Peek reaches Stash with `fetch`, which refuses the ports browsers block (6665-6669, 10080 and the others in the Fetch standard's "bad ports" list), so a Stash listening on one of them cannot be reached. Move Stash to another port, such as its default 9999.

## Starting Setup Over

If setup stops before it is finished (for example, you forgot the admin password before connecting Stash), start it over:

1. Stop the container.
2. In the data directory (`/app/data`), delete `peek-stash-browser.db`, and any `peek-stash-browser.db-wal` or `peek-stash-browser.db-shm` file next to it.
3. Start the container again.

The setup wizard starts from the beginning. The generated `.jwt-secret` file can stay.

## Videos Won't Play

Peek proxies streams through Stash. If videos don't play:

1. **Test in Stash directly** - Does the video play in Stash's web UI?
2. **Check Peek logs** - `docker logs peek-stash-browser`
3. **Check browser console** - Press F12, look for errors

If videos work in Stash but not Peek, check the Stash connection settings.

## Server Restarted on Its Own

On an unexpected error, the server logs `Uncaught exception, shutting down` followed by a stack trace, then exits. Docker starts it again when the container has a restart policy: add `--restart unless-stopped` to your `docker run` command (the unRAID template sets it in Extra Parameters). In Docker Compose, set `restart: unless-stopped` on the service.

Please [report the bug](https://github.com/carrotwaxr/peek-stash-browser/issues) and include that stack trace from the logs (see [Viewing Logs](#viewing-logs)).

## Viewing Logs

```bash
# All logs
docker logs peek-stash-browser

# Follow logs (live)
docker logs -f peek-stash-browser

# Last 100 lines
docker logs --tail 100 peek-stash-browser
```

## Getting Help

If your container starts, connects to Stash, and the web UI loads - most things should work. For other issues:

**Before reporting:**

1. Check container logs for errors
2. Check browser console (F12 → Console)
3. Note your Peek version (Settings → Server Settings)

**Report issues:**

- [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
- [Stash Discord](https://discord.gg/2TsNFKt) - #third-party-integrations channel

Include: Peek version, Stash version, relevant logs, and steps to reproduce.
