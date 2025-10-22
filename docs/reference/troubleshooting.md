# Troubleshooting

Common issues and solutions for Peek Stash Browser.

## Installation & Setup

### Container Won't Start

**Check logs first**:
```bash
docker logs peek-stash-browser
```

**Common causes**:
- Missing required environment variables (`STASH_URL`, `STASH_API_KEY`)
- Invalid `STASH_URL` (not accessible from container)
- Port conflicts (6969 already in use)
- Missing volume mappings

**Solution**:
```bash
# Stop container
docker stop peek-stash-browser

# Remove container
docker rm peek-stash-browser

# Recreate with correct configuration
# (use your template or docker-compose)
```

### Can't Connect to Stash

**Test connectivity from container**:
```bash
docker exec peek-stash-browser curl http://your-stash-ip:9999/graphql
```

**Solutions**:
- Verify `STASH_URL` is correct and accessible
- Check Stash API key is valid (Settings → Security → API Key)
- Ensure Stash GraphQL endpoint is enabled
- Check firewall rules between containers

## Video Playback

### Videos Won't Play

1. **Check FFmpeg**: `docker exec peek-stash-browser ffmpeg -version`
2. **Check file permissions**: `docker exec peek-stash-browser ls -la /app/media`
3. **Verify path mapping**: Check `STASH_INTERNAL_PATH` and `STASH_MEDIA_PATH`
4. **Check backend logs**: `docker logs peek-stash-browser`

### Slow Transcoding

**Check I/O performance**:
```bash
docker exec peek-stash-browser dd if=/app/media/test.mp4 of=/dev/null bs=1M count=100
```

Expected: 50+ MB/s for good performance

**Solutions**:
- Move media to local storage (not network share)
- Use SSD for media and temp files
- Reduce quality preset
- Allocate more CPU to container

## Authentication

### Can't Login

- Verify username/password
- Check if cookies are enabled in browser
- Clear browser cache and cookies
- Try incognito/private browsing mode

### Session Expires Immediately

- Check `JWT_SECRET` is set
- Verify `SECURE_COOKIES` matches your setup (false for HTTP)
- Clear browser cookies
- Check system clock is correct

## Network & Performance

### Slow Page Loading

- Check server CPU/memory usage
- Clear browser cache
- Verify network speed
- Check for console errors (F12 → Console)

### Images Not Loading

- Check Stash is accessible
- Verify `STASH_URL` is correct
- Check browser console for CORS errors
- Try clearing cache

## Database

### Database Locked Error

```bash
# Stop container
docker stop peek-stash-browser

# Remove lock file
docker run --rm -v peek-data:/app/data busybox rm /app/data/peek-db.db-wal

# Restart container
docker start peek-stash-browser
```

### Reset Database

!!! danger "This Deletes All Data"
    This will delete all users, preferences, and playlists.

```bash
docker stop peek-stash-browser
docker run --rm -v peek-data:/app/data busybox rm /app/data/peek-db.db
docker start peek-stash-browser
```

## Logs & Debugging

### Viewing Logs

```bash
# All logs
docker logs peek-stash-browser

# Follow logs (live)
docker logs -f peek-stash-browser

# Last 100 lines
docker logs --tail 100 peek-stash-browser
```

### Enable Debug Logging

Add to environment variables:
```bash
LOG_LEVEL=debug
```

### Browser Console

Check browser console for frontend errors:

1. Press **F12** to open DevTools
2. Click **Console** tab
3. Look for red errors
4. Copy error messages when reporting issues

## Common Error Messages

### "FFmpeg not found"

**Solution**: Rebuild container or verify FFmpeg is installed in image

### "Path translation failed"

**Solution**: Check `STASH_INTERNAL_PATH` and `STASH_MEDIA_PATH` environment variables

### "Session not found"

**Solution**: Session expired (30 min timeout). Refresh page and try again.

### "Unauthorized"

**Solution**: Token expired. Logout and login again.

## Getting Help

### Before Asking for Help

1. Check this troubleshooting guide
2. Search existing GitHub Issues
3. Check browser console for errors
4. Gather logs and error messages

### Creating a Bug Report

Include:

- **Peek version**: Check Settings → About
- **Platform**: unRAID / Docker / Development
- **Browser**: Chrome 120 / Firefox 121 / etc.
- **Stash version**: Your Stash server version
- **Error logs**: Backend and browser console
- **Steps to reproduce**: Detailed steps
- **Screenshots**: If applicable

### Where to Get Help

- **GitHub Issues**: https://github.com/carrotwaxr/peek-stash-browser/issues
- **Stash Discord**: #third-party-integrations channel
- **Documentation**: https://carrotwaxr.github.io/peek-stash-browser

## Next Steps

- [FAQ](faq.md) - Frequently asked questions
