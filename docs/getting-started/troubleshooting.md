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

- Missing `JWT_SECRET` environment variable
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

## Videos Won't Play

Peek proxies streams through Stash. If videos don't play:

1. **Test in Stash directly** - Does the video play in Stash's web UI?
2. **Check Peek logs** - `docker logs peek-stash-browser`
3. **Check browser console** - Press F12, look for errors

If videos work in Stash but not Peek, check the Stash connection settings.

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
