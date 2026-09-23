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
