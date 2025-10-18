# Build and Deploy Checklist

This checklist covers the complete process for building and deploying Peek Stash Browser to production.

## Pre-Deployment Checklist

Before building for production, verify:

- [ ] All tests passing locally
- [ ] Docker Compose working in development mode
- [ ] Environment variables documented in `.env.example`
- [ ] Database migrations tested
- [ ] Production Dockerfile tested locally
- [ ] unRAID template updated with all environment variables
- [ ] Documentation updated (README, deployment guides)

## Build Production Image

### 1. Navigate to Project Directory

```bash
cd peek-stash-browser
```

### 2. Build Production Image

```bash
docker build -f Dockerfile.production -t carrotwaxr/peek-stash-browser:latest .
```

### 3. Tag with Version (Optional)

For versioned releases:

```bash
docker tag carrotwaxr/peek-stash-browser:latest carrotwaxr/peek-stash-browser:v1.0.0
```

### 4. Test Production Image Locally

```bash
docker run -d \
  --name peek-test \
  -p 6969:80 \
  -e STASH_URL="http://10.0.0.4:9999/graphql" \
  -e STASH_API_KEY="your-api-key" \
  -e JWT_SECRET="test-secret-string" \
  -e DATABASE_URL="file:/app/data/peek-db.db" \
  -e CONFIG_DIR="/app/data" \
  -e STASH_INTERNAL_PATH="/data" \
  -e STASH_MEDIA_PATH="/app/media" \
  -v /path/to/media:/app/media:ro \
  -v ./test-data:/app/data \
  carrotwaxr/peek-stash-browser:latest
```

### 5. Verify Container Started

```bash
docker logs peek-test
```

Look for: "Server is running on http://localhost:8000"

### 6. Test in Browser

1. Open: `http://localhost:6969`
2. Login with `admin` / `admin`
3. Test core functionality:
   - Browse scenes
   - Play video (direct and transcoded)
   - Search and filter
   - Create playlist

### 7. Cleanup Test Container

```bash
docker stop peek-test
docker rm peek-test
```

## Push to Docker Hub

### 1. Login to Docker Hub

```bash
docker login
```

Enter credentials:
- Username: `carrotwaxr`
- Password: Your Docker Hub access token

### 2. Push Latest Tag

```bash
docker push carrotwaxr/peek-stash-browser:latest
```

### 3. Push Version Tag (If Tagged)

```bash
docker push carrotwaxr/peek-stash-browser:v1.0.0
```

### 4. Verify on Docker Hub

Visit: [https://hub.docker.com/r/carrotwaxr/peek-stash-browser](https://hub.docker.com/r/carrotwaxr/peek-stash-browser)

## Deploy to unRAID

### First-Time Setup

1. **Ensure unRAID template is in GitHub repo**:

```bash
git add unraid-template.xml
git commit -m "Update unRAID template with latest environment variables"
git push origin main
```

2. **On unRAID server, download template**:

=== "Via SSH/Terminal"

    ```bash
    cd /boot/config/plugins/dockerMan/templates-user/
    wget https://raw.githubusercontent.com/carrotwaxr/peek-stash-browser/main/unraid-template.xml -O my-peek-stash-browser.xml
    ```

=== "Via Web Interface"

    1. Go to Docker → Add Container
    2. Click **Template repositories** at bottom
    3. Add: `https://github.com/carrotwaxr/peek-stash-browser`
    4. Click **Save**
    5. Select "Peek-Stash-Browser" from template dropdown

### Configuration Steps

**In unRAID Docker Tab:**

1. **Add Container** → Select "Peek-Stash-Browser" template

2. **Configure Required Settings**:
   - Name: `Peek-Stash-Browser`
   - Repository: `carrotwaxr/peek-stash-browser:latest`
   - Web UI Port: `6969`

3. **Configure Volume Paths**:
   - Media Directory: `/mnt/user/videos` → `/app/media` (read-only)
   - App Data: `/mnt/user/appdata/peek-stash-browser` → `/app/data` (read/write)

4. **Configure Environment Variables**:
   ```
   STASH_URL=http://10.0.0.4:9999/graphql
   STASH_API_KEY=[your-stash-api-key]
   JWT_SECRET=[generate with: openssl rand -hex 32]
   DATABASE_URL=file:/app/data/peek-db.db
   CONFIG_DIR=/app/data
   STASH_INTERNAL_PATH=/data
   STASH_MEDIA_PATH=/app/media
   NODE_ENV=production
   SECURE_COOKIES=false
   ```

5. **Click Apply** to start container

6. **Verify Deployment**:
   - Check logs for "Server is running on http://localhost:8000"
   - Access: `http://[unraid-ip]:6969`
   - Login with `admin` / `admin`
   - Change password immediately!

### Update Existing Installation

=== "Via unRAID UI"

    1. Docker tab → Peek-Stash-Browser container
    2. Click **Check for Updates**
    3. If update available, click **Update**

=== "Manual Update"

    ```bash
    docker pull carrotwaxr/peek-stash-browser:latest
    docker stop Peek-Stash-Browser
    docker rm Peek-Stash-Browser
    # Recreate from template
    ```

## Verification Tests

After deployment, verify all functionality:

- [ ] Container starts without errors
- [ ] Web interface accessible
- [ ] Login works (admin/admin)
- [ ] Stash connection successful (scenes load)
- [ ] Video playback works (direct play)
- [ ] Video playback works (transcoded)
- [ ] Seeking works in transcoded videos
- [ ] Search and filtering work
- [ ] User creation/management works
- [ ] Playlist creation and playback
- [ ] Shuffle and repeat modes

## Troubleshooting Common Issues

### Container Won't Start

**Check logs**:
```bash
docker logs Peek-Stash-Browser
```

**Common issues**:
- Missing required environment variables
- Invalid STASH_URL (not accessible)
- Missing or incorrect volume mappings

### Can't Connect to Stash

**Test from container**:
```bash
docker exec Peek-Stash-Browser curl http://10.0.0.4:9999/graphql
```

**Verify**:
- Stash API key is correct
- Stash GraphQL endpoint is enabled

### Videos Won't Play

**Check path translation**:
```bash
docker exec Peek-Stash-Browser ls -la /app/media
```

**Verify**:
- `STASH_INTERNAL_PATH` matches Stash's mount
- `STASH_MEDIA_PATH` matches Peek's mount
- Permissions are readable

### Slow Transcoding

**Check I/O speed from container**:
```bash
docker exec Peek-Stash-Browser dd if=/app/media/somefile.mp4 of=/dev/null bs=1M count=100
```

**If slow (<50 MB/s)**:
- Media might be on network share
- Best performance: local unRAID array/cache

## Rollback Procedure

If deployment fails:

```bash
# 1. Stop new container
docker stop Peek-Stash-Browser
docker rm Peek-Stash-Browser

# 2. Pull previous version (if tagged)
docker pull carrotwaxr/peek-stash-browser:v0.9.0

# 3. Update template to use previous version
# In unRAID: Edit container, change Repository to include version tag

# 4. Restore database backup (if needed)
cp /mnt/user/backups/peek-db.db.backup /mnt/user/appdata/peek-stash-browser/peek-db.db

# 5. Recreate container from template
```

## Post-Deployment Tasks

After successful deployment:

- [ ] Update documentation with deployment date
- [ ] Create GitHub release with version tag
- [ ] Update Docker Hub description
- [ ] Post announcement in relevant communities
- [ ] Monitor error logs for first 24 hours
- [ ] Create backup of working configuration

## Environment-Specific Notes

### Development vs Production

**Development (docker-compose)**:

- Uses hot-reload for frontend and backend
- Mounts source code as volumes
- May use SMB/CIFS for remote media
- Multiple containers (frontend, backend)

**Production (unRAID)**:

- Single compiled container
- Nginx serves frontend, proxies backend
- Local media access (fast I/O)
- All code bundled in image

### Performance Expectations

**Development (WiFi + SMB)**:

- Transcoding speed: 0.12x (slow)
- Initial buffer: 5-6 minutes for 40 seconds
- Good for testing, not for real use

**Production (unRAID local)**:

- Transcoding speed: 0.8x - 2.0x (real-time or faster)
- Initial buffer: 30-60 seconds for 40 seconds
- Smooth playback, excellent user experience

## Additional Resources

- [Docker Deployment Guide](docker.md)
- [unRAID Deployment Guide](unraid.md)
- [Environment Variables Reference](environment.md)
- [Troubleshooting](../reference/troubleshooting.md)
