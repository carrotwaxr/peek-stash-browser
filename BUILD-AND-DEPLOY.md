# Build and Deploy Checklist

## Pre-Deployment Checklist

- [ ] All tests passing locally
- [ ] Docker Compose working in development mode
- [ ] Environment variables documented in `.env.example`
- [ ] Database migrations tested
- [ ] Production Dockerfile tested locally
- [ ] unRAID template updated with all environment variables
- [ ] Documentation updated (README, UNRAID-DEPLOYMENT.md)

## Build Production Image

```bash
# 1. Navigate to project directory
cd peek-stash-browser

# 2. Build production image
docker build -f Dockerfile.production -t carrotwaxr/peek-stash-browser:latest .

# 3. Tag with version (optional, for versioned releases)
docker tag carrotwaxr/peek-stash-browser:latest carrotwaxr/peek-stash-browser:v1.0.0

# 4. Test production image locally
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

# 5. Verify container started
docker logs peek-test

# 6. Test in browser: http://localhost:6969
# Login with admin/admin

# 7. Stop and remove test container
docker stop peek-test
docker rm peek-test
```

## Push to Docker Hub

```bash
# 1. Login to Docker Hub
docker login
# Enter username: carrotwaxr
# Enter password: [your-docker-hub-token]

# 2. Push latest tag
docker push carrotwaxr/peek-stash-browser:latest

# 3. Push version tag (if tagged)
docker push carrotwaxr/peek-stash-browser:v1.0.0

# 4. Verify on Docker Hub
# Visit: https://hub.docker.com/r/carrotwaxr/peek-stash-browser
```

## Deploy to unRAID

### First-Time Setup

```bash
# 1. Ensure unRAID template is in GitHub repo
git add unraid-template.xml
git commit -m "Update unRAID template with latest environment variables"
git push origin main

# 2. On unRAID server, download template
# SSH into unRAID or use terminal
cd /boot/config/plugins/dockerMan/templates-user/
wget https://raw.githubusercontent.com/carrotwaxr/peek-stash-browser/main/unraid-template.xml -O my-peek-stash-browser.xml

# Or use unRAID web interface:
# Docker > Add Container > Template repositories
# Add: https://github.com/carrotwaxr/peek-stash-browser
```

### Configuration Steps

**In unRAID Docker Tab:**

1. **Add Container** > Select "Peek-Stash-Browser" template

2. **Configure Required Settings:**
   - Name: `Peek-Stash-Browser`
   - Repository: `carrotwaxr/peek-stash-browser:latest`
   - Web UI Port: `6969`

3. **Configure Volume Paths:**
   - Media Directory: `/mnt/user/videos` → `/app/media` (read-only)
   - App Data: `/mnt/user/appdata/peek-stash-browser` → `/app/data` (read/write)

4. **Configure Environment Variables:**
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

6. **Verify Deployment:**
   - Check logs for "Server is running on http://localhost:8000"
   - Access: `http://[unraid-ip]:6969`
   - Login with `admin` / `admin`
   - Change password immediately!

### Update Existing Installation

```bash
# 1. In unRAID Docker tab
# Click on Peek-Stash-Browser container
# Click "Check for Updates"
# If update available, click "Update"

# Or manually:
docker pull carrotwaxr/peek-stash-browser:latest
docker stop Peek-Stash-Browser
docker rm Peek-Stash-Browser
# Recreate from template
```

## Verification Tests

After deployment, verify:

- [ ] Container starts without errors
- [ ] Web interface accessible
- [ ] Login works (admin/admin)
- [ ] Stash connection successful (scenes load)
- [ ] Video playback works (direct play)
- [ ] Video playback works (transcoded)
- [ ] Seeking works in transcoded videos
- [ ] Search and filtering work
- [ ] User creation/management works

## Troubleshooting Common Issues

### Container won't start
```bash
# Check logs
docker logs Peek-Stash-Browser

# Common issues:
# - Missing required environment variables
# - Invalid STASH_URL (not accessible)
# - Missing or incorrect volume mappings
```

### Can't connect to Stash
```bash
# Test from container
docker exec Peek-Stash-Browser curl http://10.0.0.4:9999/graphql

# Verify Stash API key is correct
# Verify Stash GraphQL endpoint is enabled
```

### Videos won't play
```bash
# Check path translation
docker exec Peek-Stash-Browser ls -la /app/media

# Verify STASH_INTERNAL_PATH matches Stash's mount
# Verify STASH_MEDIA_PATH matches Peek's mount
# Check permissions (should be readable)
```

### Slow transcoding
```bash
# Check I/O speed from container
docker exec Peek-Stash-Browser dd if=/app/media/somefile.mp4 of=/dev/null bs=1M count=100

# If slow (<50 MB/s), media might be on network share
# Best performance: local unRAID array/cache
```

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

## Post-Deployment

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
