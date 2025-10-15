# Peek Stash Browser - unRAID Deployment Guide

## Prerequisites

Before deploying to unRAID, ensure you have:
1. **Existing Stash server** running on unRAID (or accessible from unRAID)
2. **Stash API key** from Settings > Security > API Key
3. **Media files** accessible on unRAID (same location Stash uses)
4. **Docker Hub account** (if pushing custom builds)

## Step 1: Build Production Image

From your development machine:

```bash
cd peek-stash-browser

# Build the production image
docker build -f Dockerfile.production -t carrotwaxr/peek-stash-browser:latest .

# Test the image locally (optional)
docker run -d \
  -p 6969:80 \
  -e STASH_URL="http://your-stash-ip:9999/graphql" \
  -e STASH_API_KEY="your-api-key" \
  -e JWT_SECRET="test-secret" \
  -e DATABASE_URL="file:/app/data/peek-db.db" \
  -e CONFIG_DIR="/app/data" \
  -e STASH_INTERNAL_PATH="/data" \
  -e STASH_MEDIA_PATH="/app/media" \
  -v /path/to/media:/app/media:ro \
  -v ./test-data:/app/data \
  carrotwaxr/peek-stash-browser:latest

# If test succeeds, push to Docker Hub
docker login
docker push carrotwaxr/peek-stash-browser:latest
```

## Step 2: Install Template in unRAID

### Option A: Via Community Applications (Recommended when published)
1. Open unRAID web interface
2. Go to **Apps** tab
3. Search for "Peek Stash Browser"
4. Click **Install**
5. Configure settings (see Configuration below)

### Option B: Manual Template Installation

1. **Download the template**:
   ```bash
   cd /boot/config/plugins/dockerMan/templates-user/
   wget https://raw.githubusercontent.com/carrotwaxr/peek-stash-browser/main/unraid-template.xml
   ```

2. **Or upload via unRAID interface**:
   - Go to **Docker** tab
   - Click **Add Container**
   - At the bottom, click **Template repositories**
   - Add: `https://github.com/carrotwaxr/peek-stash-browser`
   - Click **Save**
   - Select "Peek-Stash-Browser" from template dropdown

## Step 3: Configuration

### Required Settings

**Port Configuration:**
- **Web UI Port**: `6969` (or any available port)
  - Access Peek at: `http://[UNRAID-IP]:6969`

**Volume Mappings:**
- **Media Directory**:
  - Container path: `/app/media`
  - Host path: `/mnt/user/videos` (MUST match Stash's media path)
  - Mode: Read-only

- **App Data Directory**:
  - Container path: `/app/data`
  - Host path: `/mnt/user/appdata/peek-stash-browser`
  - Mode: Read/write

**Environment Variables:**
- **STASH_URL**: `http://[UNRAID-IP]:9999/graphql`
  - Replace `[UNRAID-IP]` with your unRAID server IP or `localhost` if Stash runs on same server

- **STASH_API_KEY**: Your Stash API key
  - Get from Stash: Settings > Security > API Key

- **JWT_SECRET**: Generate a secure random string
  ```bash
  # Generate on command line:
  openssl rand -hex 32
  ```

### Advanced Settings (Usually defaults are fine)

- **DATABASE_URL**: `file:/app/data/peek-db.db` (default)
- **CONFIG_DIR**: `/app/data` (default)
- **STASH_INTERNAL_PATH**: `/data` (Stash's internal Docker path)
- **STASH_MEDIA_PATH**: `/app/media` (Peek's container path for media)
- **NODE_ENV**: `production` (default)
- **SECURE_COOKIES**: `false` (set to `true` only if using HTTPS reverse proxy)

## Step 4: Path Mapping Configuration

**Critical**: Peek needs to translate Stash's internal paths to its own paths.

### Example Configuration

If your Stash setup looks like this:
```
Stash Docker container:
  - Media volume: /mnt/user/videos:/data
  - Stash reports paths as: /data/scenes/video.mp4
```

Then Peek should be configured as:
```
Peek Docker container:
  - Media volume: /mnt/user/videos:/app/media (same host path as Stash)
  - STASH_INTERNAL_PATH: /data (what Stash calls it)
  - STASH_MEDIA_PATH: /app/media (what Peek calls it)
```

This allows Peek to translate:
- Stash path: `/data/scenes/video.mp4`
- To Peek path: `/app/media/scenes/video.mp4`

### Common Scenarios

**Scenario 1: Stash and Peek on same unRAID server**
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

**Scenario 2: Stash on different server, shared via NFS/SMB**
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

## Step 5: Start Container

1. Click **Apply** to start the container
2. Wait for container to initialize (30-60 seconds)
3. Check logs: Docker tab > Peek-Stash-Browser > Logs
4. Look for: "Server is running on http://localhost:8000"

## Step 6: First Access

1. Open browser: `http://[UNRAID-IP]:6969`
2. **Default login credentials**:
   - Username: `admin`
   - Password: `admin`
3. **IMPORTANT**: Change password immediately after first login!

## Troubleshooting

### Container won't start
- Check logs for errors
- Verify all required environment variables are set
- Ensure STASH_URL is accessible from container
- Verify media path exists and is readable

### Videos won't play
- Check path mapping configuration
- Verify `STASH_INTERNAL_PATH` matches Stash's Docker mount
- Ensure media directory is readable (permissions)
- Check backend logs for path translation errors

### Slow transcoding
- This is expected if accessing media over network
- For best performance, media should be local to unRAID
- Check I/O performance: `docker exec peek-stash-browser dd if=/app/media/somefile.mp4 of=/dev/null bs=1M count=100`

### Authentication issues
- Verify JWT_SECRET is set
- Clear browser cookies/cache
- Check if SECURE_COOKIES is correctly set for your setup

## Performance Optimization

### For best transcoding performance:
1. **Use local storage**: Media files on unRAID array/cache (not network shares)
2. **Enable hardware acceleration** (if CPU supports):
   - Add to Extra Parameters: `--device /dev/dri:/dev/dri`
   - (Future enhancement - not yet implemented)
3. **Allocate sufficient RAM**: 2-4GB recommended
4. **Use SSD cache** for appdata if possible

## Updating

### Update to latest version:
1. Docker tab > Peek-Stash-Browser
2. Click **Check for Updates**
3. If update available, click **Update**
4. Container will restart automatically

### Manual update:
```bash
docker pull carrotwaxr/peek-stash-browser:latest
docker stop peek-stash-browser
docker rm peek-stash-browser
# Recreate container from template with same settings
```

## Backup

### Important data to backup:
- **Database**: `/mnt/user/appdata/peek-stash-browser/peek-db.db`
- **Configuration**: unRAID template settings (export from Docker tab)

### Backup procedure:
1. Stop container
2. Copy `/mnt/user/appdata/peek-stash-browser/` to backup location
3. Restart container

## Security Recommendations

1. **Change default admin password** immediately
2. **Use strong JWT_SECRET**: Generate with `openssl rand -hex 32`
3. **Don't expose directly to internet**: Use VPN or reverse proxy
4. **If using reverse proxy**:
   - Set `SECURE_COOKIES=true`
   - Configure HTTPS properly
   - Use trusted certificates

## Support

- **Issues**: https://github.com/carrotwaxr/peek-stash-browser/issues
- **Documentation**: https://github.com/carrotwaxr/peek-stash-browser
- **Stash Discord**: Ask in #third-party-integrations channel

## Version Information

Template Version: 1.0.0
Last Updated: 2025-01-15
Compatible with: unRAID 6.10+
