# unRAID Deployment

This guide covers deploying Peek Stash Browser on unRAID systems.

## Prerequisites

Before deploying to unRAID, ensure you have:

- **Existing Stash server** running on unRAID (or accessible from unRAID)
- **Stash API key** from Settings → Security → API Key
- **Media files** accessible on unRAID (same location Stash uses)

## Installation Methods

### Via Community Applications (Recommended)

!!! success "Easiest Method"
    This is the recommended installation method for unRAID users.

1. Open unRAID web interface
2. Go to **Apps** tab
3. Search for "Peek Stash Browser"
4. Click **Install**
5. Configure settings (see Configuration below)
6. Click **Apply**

### Manual Docker Run

```bash
docker run -d \
  --name=peek-stash-browser \
  -p 6969:80 \
  -v /mnt/user/media:/app/media:ro \
  -v /mnt/user/appdata/peek-stash-browser/data:/app/data \
  -v /mnt/user/appdata/peek-stash-browser/tmp:/app/tmp \
  -e STASH_URL="http://[IP]:9999/graphql" \
  -e STASH_API_KEY="your-api-key" \
  carrotwaxr/peek-stash-browser:latest
```

Replace `[IP]` with your Stash server IP address.

## Configuration

### Port Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| **Web UI Port** | `6969` | Or any available port |
| **Access URL** | `http://[UNRAID-IP]:6969` | Replace with your unRAID IP |

### Volume Mappings

#### Media Directory

- **Container path**: `/app/media`
- **Host path**: `/mnt/user/videos` (MUST match Stash's media path)
- **Mode**: Read-only

#### App Data Directory

- **Container path**: `/app/data`
- **Host path**: `/mnt/user/appdata/peek-stash-browser`
- **Mode**: Read/write

#### Temporary Files Directory

- **Container path**: `/app/tmp`
- **Host path**: `/mnt/user/appdata/peek-stash-browser/tmp`
- **Mode**: Read/write

### Environment Variables

#### Required

| Variable | Example | Where to Get |
|----------|---------|--------------|
| `STASH_URL` | `http://192.168.1.100:9999/graphql` | Your Stash server URL |
| `STASH_API_KEY` | `eyJhbGc...` | Stash → Settings → Security → API Key |

#### Optional (Advanced)

| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | `file:/app/data/peek-db.db` | SQLite database location |
| `CONFIG_DIR` | `/app/data` | App configuration directory |
| `STASH_INTERNAL_PATH` | `/data` | Stash's internal Docker path |
| `STASH_MEDIA_PATH` | `/app/media` | Peek's container path for media |
| `NODE_ENV` | `production` | Environment mode |
| `SECURE_COOKIES` | `false` | Set to `true` if using HTTPS reverse proxy |
| `JWT_SECRET` | Auto-generated | Generate with `openssl rand -hex 32` |

## Path Mapping Configuration

!!! warning "Critical for Video Playback"
    Peek needs to translate Stash's internal paths to its own paths for video playback to work.

### How Path Mapping Works

If your Stash setup looks like this:

```yaml
Stash Docker container:
  - Media volume: /mnt/user/videos:/data
  - Stash reports paths as: /data/scenes/video.mp4
```

Then Peek should be configured as:

```yaml
Peek Docker container:
  - Media volume: /mnt/user/videos:/app/media  # Same host path as Stash
  - STASH_INTERNAL_PATH: /data                 # What Stash calls it
  - STASH_MEDIA_PATH: /app/media               # What Peek calls it
```

This allows Peek to translate:
- Stash path: `/data/scenes/video.mp4`
- To Peek path: `/app/media/scenes/video.mp4`

### Common Scenarios

=== "Stash and Peek on Same Server"

    ```
    Media location: /mnt/user/videos

    Stash config:
      Volume: /mnt/user/videos:/data

    Peek config:
      Media Directory: /mnt/user/videos
      Container Path: /app/media
      STASH_INTERNAL_PATH: /data
      STASH_MEDIA_PATH: /app/media
    ```

=== "Stash on Different Server (NFS/SMB)"

    ```
    Media location: /mnt/remotes/nas/videos (mounted NFS share)

    Stash config (on other server):
      Volume: /mnt/nas/videos:/data

    Peek config (on unRAID):
      Media Directory: /mnt/remotes/nas/videos
      Container Path: /app/media
      STASH_INTERNAL_PATH: /data
      STASH_MEDIA_PATH: /app/media
    ```

## First Access

1. Open browser: `http://[UNRAID-IP]:6969`
2. **Default login credentials**:
   - Username: `admin`
   - Password: `admin`
3. **⚠️ IMPORTANT**: Change password immediately after first login!

## Troubleshooting

### Container Won't Start

**Symptoms**: Container fails to start or immediately stops

**Solutions**:

- Check logs: Docker tab → Peek-Stash-Browser → Logs
- Verify all required environment variables are set
- Ensure STASH_URL is accessible from container
- Verify media path exists and is readable
- Check that port 6969 is not already in use

**Test connectivity**:
```bash
# From unRAID terminal
curl http://your-stash-ip:9999/graphql
```

### Videos Won't Play

**Symptoms**: Videos fail to load or playback errors

**Solutions**:

- Check path mapping configuration (see above)
- Verify `STASH_INTERNAL_PATH` matches Stash's Docker mount
- Ensure media directory is readable (permissions)
- Check backend logs for path translation errors

**Verify media access**:
```bash
docker exec peek-stash-browser ls -la /app/media
```

### Slow Transcoding

**Symptoms**: Video buffering takes a long time

**Causes & Solutions**:

- **Network storage**: Media over SMB/NFS is slower
  - **Solution**: Use local unRAID array/cache
- **CPU limitation**: Insufficient transcoding power
  - **Solution**: Allocate 2-4GB RAM, use SSD cache for appdata

**Test I/O performance**:
```bash
docker exec peek-stash-browser dd if=/app/media/somefile.mp4 of=/dev/null bs=1M count=100
```

Expected speed: 50+ MB/s for smooth transcoding

### Authentication Issues

**Symptoms**: Can't login or session expires immediately

**Solutions**:

- Verify `JWT_SECRET` is set (or allow auto-generation)
- Clear browser cookies/cache
- Check if `SECURE_COOKIES` matches your setup (false for HTTP, true for HTTPS)

### Port Conflicts

!!! success "Single Container = No More Port Conflicts"
    The single-container architecture uses only port 6969. No more PostgreSQL port 5432 or backend port 8000 conflicts!

If port 6969 is in use, simply choose a different port in the template.

## Performance Optimization

### Hardware Recommendations

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| **CPU** | 2 cores | 4+ cores for multiple streams |
| **RAM** | 2GB | 4GB+ |
| **Storage** | Any | SSD cache for appdata |
| **Network** | 100 Mbps | Gigabit for 4K content |

### Best Practices

1. **Use local storage**: Media files on unRAID array/cache (not network shares)
2. **Use SSD cache** for appdata if possible
3. **Allocate sufficient RAM**: 2-4GB recommended for transcoding
4. **Enable hardware acceleration** (future enhancement):
   ```
   Extra Parameters: --device /dev/dri:/dev/dri
   ```

## Updating

### Automatic Update via unRAID

1. Docker tab → Peek-Stash-Browser
2. Click **Check for Updates**
3. If update available, click **Update**
4. Container will restart automatically

### Manual Update

```bash
# Pull latest image
docker pull carrotwaxr/peek-stash-browser:latest

# Stop and remove old container
docker stop peek-stash-browser
docker rm peek-stash-browser

# Recreate from template with same settings
```

## Backup & Recovery

### What to Backup

- **Database**: `/mnt/user/appdata/peek-stash-browser/peek-db.db`
- **Configuration**: unRAID template settings (export from Docker tab)

### Backup Procedure

```bash
# 1. Stop container
docker stop peek-stash-browser

# 2. Copy appdata to backup location
cp -r /mnt/user/appdata/peek-stash-browser /mnt/user/backups/peek-backup-$(date +%Y%m%d)

# 3. Restart container
docker start peek-stash-browser
```

### Restore Procedure

```bash
# 1. Stop container
docker stop peek-stash-browser

# 2. Restore from backup
cp -r /mnt/user/backups/peek-backup-YYYYMMDD/* /mnt/user/appdata/peek-stash-browser/

# 3. Restart container
docker start peek-stash-browser
```

## Security Recommendations

!!! danger "Change Default Password"
    The default admin password is well-known. Change it immediately!

1. **Change default admin password** immediately
2. **Use strong JWT_SECRET**: Generate with `openssl rand -hex 32`
3. **Don't expose directly to internet**: Use VPN or reverse proxy
4. **If using reverse proxy**:
   - Set `SECURE_COOKIES=true`
   - Configure HTTPS properly
   - Use trusted certificates

## Support

- **Documentation**: [https://carrotwaxr.github.io/peek-stash-browser](https://carrotwaxr.github.io/peek-stash-browser)
- **Issues**: [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
- **Community**: [Stash Discord](https://discord.gg/2TsNFKt) - #third-party-integrations channel

## Version Information

- **Template Version**: 1.0.0
- **Last Updated**: 2025-01-15
- **Compatible with**: unRAID 6.10+
