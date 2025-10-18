# Configuration

Peek Stash Browser is configured through environment variables. This page documents all available configuration options.

## Required Settings

These environment variables **must** be set for Peek to function:

| Variable        | Description                 | Example                             |
| --------------- | --------------------------- | ----------------------------------- |
| `STASH_URL`     | Your Stash GraphQL endpoint | `http://192.168.1.100:9999/graphql` |
| `STASH_API_KEY` | API key from Stash settings | `eyJhbGciOiJIUzI1NiIsInR5cCI6...`   |

### Getting Your Stash API Key

1. Open Stash web interface
2. Navigate to **Settings** → **Security**
3. In the **API Key** section, click **Generate**
4. Copy the generated key
5. Use this key as `STASH_API_KEY`

## Optional Settings

These settings have sensible defaults but can be customized:

| Variable             | Description                | Default                                | Notes                        |
| -------------------- | -------------------------- | -------------------------------------- | ---------------------------- |
| `DATABASE_URL`       | SQLite database file       | `file:/app/data/peek-stash-browser.db` | Path inside container        |
| `CONFIG_DIR`         | App data directory         | `/app/data`                            | Database + HLS cache         |
| `TMP_DIR`            | Transcoding temp directory | `/app/tmp`                             | Needs fast I/O               |
| `NODE_ENV`           | Environment mode           | `production`                           | `development` or `production`|
| `JWT_SECRET`         | JWT signing key            | Auto-generated                         | Generate with `openssl rand -hex 32` |

## Path Mapping (Advanced)

Peek needs to translate Stash's internal container paths to its own paths:

| Variable             | Description                    | Default                        | When to Change               |
| -------------------- | ------------------------------ | ------------------------------ | ---------------------------- |
| `STASH_INTERNAL_PATH` | Path prefix Stash uses internally | `/data`                     | If Stash uses different mount path |
| `STASH_MEDIA_PATH`    | Where Peek accesses Stash's media | `/app/media`                | Usually keep default         |

### Path Mapping Example

If your Stash setup looks like this:

```yaml
# Stash Docker container
volumes:
  - /mnt/user/videos:/data
```

Stash will report paths as `/data/scenes/video.mp4`.

Your Peek configuration should be:

```yaml
# Peek Docker container
volumes:
  - /mnt/user/videos:/app/media:ro  # Same host path as Stash
environment:
  - STASH_INTERNAL_PATH=/data        # What Stash calls it
  - STASH_MEDIA_PATH=/app/media      # What Peek calls it
```

This allows Peek to translate:

- Stash path: `/data/scenes/video.mp4`
- To Peek path: `/app/media/scenes/video.mp4`

## Security Settings

| Variable         | Description                    | Default | When to Use                  |
| ---------------- | ------------------------------ | ------- | ---------------------------- |
| `SECURE_COOKIES` | Enable secure cookie flag      | `false` | Set to `true` when using HTTPS reverse proxy |
| `JWT_SECRET`     | Secret for JWT token signing   | Random  | Generate secure random string for production |

!!! warning "Security Best Practices"
    - Always change the default admin password
    - Use a strong `JWT_SECRET` in production
    - Set `SECURE_COOKIES=true` when using HTTPS
    - Don't expose Peek directly to the internet without a reverse proxy

### Generating Secure JWT Secret

```bash
# Linux/macOS/unRAID
openssl rand -hex 32

# Windows PowerShell
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

## Example Configurations

### Minimal Production Configuration

```bash
# Required
STASH_URL=http://192.168.1.100:9999/graphql
STASH_API_KEY=your_api_key_here

# All other settings use defaults
```

### Complete Production Configuration

```bash
# Stash Integration
STASH_URL=http://192.168.1.100:9999/graphql
STASH_API_KEY=your_api_key_here

# Database
DATABASE_URL=file:/app/data/peek-stash-browser.db
CONFIG_DIR=/app/data

# Storage
TMP_DIR=/app/tmp

# Security
JWT_SECRET=your_very_long_random_secret_key_here
SECURE_COOKIES=true

# Path Mapping
STASH_INTERNAL_PATH=/data
STASH_MEDIA_PATH=/app/media

# Environment
NODE_ENV=production
```

### Development Configuration

```bash
# Stash Integration
STASH_URL=http://localhost:9999/graphql
STASH_API_KEY=your_development_api_key

# Database (local SQLite file)
DATABASE_URL=file:./data/peek-db.db

# Development
NODE_ENV=development
JWT_SECRET=dev-secret-change-in-production

# Path Mapping (for development)
STASH_INTERNAL_PATH=/data
STASH_MEDIA_PATH=/app/media
```

## Docker Compose Example

```yaml
services:
  peek:
    image: carrotwaxr/peek-stash-browser:latest
    container_name: peek-stash-browser
    ports:
      - "6969:80"
    volumes:
      - /mnt/user/videos:/app/media:ro
      - /mnt/user/appdata/peek-stash-browser:/app/data
      - /mnt/user/appdata/peek-stash-browser/tmp:/app/tmp
    environment:
      # Required
      - STASH_URL=http://stash:9999/graphql
      - STASH_API_KEY=${STASH_API_KEY}

      # Optional
      - DATABASE_URL=file:/app/data/peek-db.db
      - JWT_SECRET=${JWT_SECRET}
      - NODE_ENV=production
      - STASH_INTERNAL_PATH=/data
      - STASH_MEDIA_PATH=/app/media
    restart: unless-stopped
```

## Troubleshooting Configuration Issues

### Cannot Connect to Stash

Check:

- `STASH_URL` is accessible from the Peek container
- `STASH_API_KEY` is correct and not expired
- Stash GraphQL API is enabled

Test connectivity:

```bash
docker exec peek-stash-browser curl http://your-stash-ip:9999/graphql
```

### Videos Won't Play

Check:

- Media volume is mounted correctly
- `STASH_INTERNAL_PATH` matches Stash's mount point
- `STASH_MEDIA_PATH` matches Peek's mount point
- File permissions allow reading

Verify path mapping:

```bash
docker exec peek-stash-browser ls -la /app/media
```

### Authentication Issues

Check:

- `JWT_SECRET` is set
- `SECURE_COOKIES` matches your HTTP/HTTPS setup
- Database is writable

## Next Steps

- [Quick Start Guide](quick-start.md)
- [Environment Variables Reference](../deployment/environment.md)
- [Troubleshooting](../reference/troubleshooting.md)
