# Configuration

Peek Stash Browser is configured through environment variables and the setup wizard. This page documents all available configuration options.

## Required Environment Variables

These environment variables **must** be set for Peek to function:

| Variable        | Description                 | Example                             |
| --------------- | --------------------------- | ----------------------------------- |
| `STASH_URL`     | Your Stash GraphQL endpoint | `http://192.168.1.100:9999/graphql` |
| `STASH_API_KEY` | API key from Stash settings | `eyJhbGciOiJIUzI1NiIsInR5cCI6...`   |
| `JWT_SECRET`    | JWT signing key             | Generate with `openssl rand -base64 32` |

### Getting Your Stash API Key

1. Open Stash web interface
2. Navigate to **Settings** → **Security**
3. In the **API Key** section, click **Generate**
4. Copy the generated key
5. Use this key as `STASH_API_KEY`

### Generating JWT Secret

**Linux/macOS/unRAID:**
```bash
openssl rand -base64 32
```

**Windows PowerShell:**
```powershell
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
[Convert]::ToBase64String($bytes)
```

## Optional Environment Variables

These settings have sensible defaults but can be customized:

| Variable             | Description                | Default                                | Notes                        |
| -------------------- | -------------------------- | -------------------------------------- | ---------------------------- |
| `DATABASE_URL`       | SQLite database file       | `file:/app/data/peek-stash-browser.db` | Path inside container        |
| `CONFIG_DIR`         | App data directory         | `/app/data`                            | Database + HLS cache         |
| `TMP_DIR`            | Transcoding temp directory | `/app/tmp`                             | Needs fast I/O               |
| `NODE_ENV`           | Environment mode           | `production`                           | `development` or `production`|

## Path Mapping

Peek needs to access the same media files that Stash manages. There are two ways to configure path mappings:

### Setup Wizard (Recommended)

The **5-step setup wizard** is the recommended way to configure path mappings for new installations:

1. **Auto-Discovery**: Peek queries your Stash server via GraphQL to discover all library paths
2. **Path Mapping**: You map each Stash library path to where Peek can access it in the container
3. **Database Storage**: Mappings are stored in the database (no environment variables needed)
4. **Path Validation**: Test each path to ensure Peek can access the files
5. **Multi-Library Support**: Configure multiple library paths (videos, images, etc.)

**Access the wizard:**
- First-time installations show the wizard automatically at `http://your-server:6969`
- Existing installations can manage mappings in Settings → Path Mappings

### Upgrading from Environment Variables

If you have an existing installation using `STASH_INTERNAL_PATH` and `STASH_MEDIA_PATH` environment variables:

1. **Access Peek** in your browser
2. **Complete the setup wizard** - it will guide you through path mapping
3. **Remove old environment variables** from your container configuration:
   - `STASH_INTERNAL_PATH`
   - `STASH_MEDIA_PATH`
4. **Restart container**

The setup wizard replaces these environment variables with database-stored mappings that support multiple libraries.

### Path Mapping Example

**Setup:**
```yaml
# Stash Docker container
volumes:
  - /mnt/user/videos:/data

# Peek Docker container
volumes:
  - /mnt/user/videos:/app/media:ro
```

**In Setup Wizard:**
- Stash reports library path: `/data`
- You configure Peek path: `/app/media`
- Peek translates `/data/scenes/video.mp4` → `/app/media/scenes/video.mp4`

**Multiple Libraries Example:**
```yaml
# Stash has two libraries: /data and /images
# Peek Docker container
volumes:
  - /mnt/user/stash/videos:/app/media:ro
  - /mnt/user/stash/images:/app/images:ro
```

**In Setup Wizard:**
- Library 1: `/data` → `/app/media`
- Library 2: `/images` → `/app/images`

## Security Settings

| Variable         | Description                    | Default | When to Use                  |
| ---------------- | ------------------------------ | ------- | ---------------------------- |
| `SECURE_COOKIES` | Enable secure cookie flag      | `false` | Set to `true` when using HTTPS reverse proxy |

!!! warning "Security Best Practices"
    - Set a strong `JWT_SECRET` during installation (required)
    - Set `SECURE_COOKIES=true` when using HTTPS
    - Don't expose Peek directly to the internet without a reverse proxy
    - Admin credentials are created during setup wizard (no default passwords)

## Example Configurations

### Minimal Production Configuration

```bash
# Required
STASH_URL=http://192.168.1.100:9999/graphql
STASH_API_KEY=your_api_key_here
JWT_SECRET=your_very_long_random_secret_key_here

# Path mappings configured via setup wizard (stored in database)
# All other settings use defaults
```

### Complete Production Configuration

```bash
# Stash Integration (Required)
STASH_URL=http://192.168.1.100:9999/graphql
STASH_API_KEY=your_api_key_here
JWT_SECRET=your_very_long_random_secret_key_here

# Database (Optional - defaults shown)
DATABASE_URL=file:/app/data/peek-stash-browser.db
CONFIG_DIR=/app/data

# Storage (Optional)
TMP_DIR=/app/tmp

# Security (Optional)
SECURE_COOKIES=true

# Environment (Optional)
NODE_ENV=production

# Path mappings configured via setup wizard (stored in database)
```

### Development Configuration

```bash
# Stash Integration
STASH_URL=http://localhost:9999/graphql
STASH_API_KEY=your_development_api_key
JWT_SECRET=dev-secret-change-in-production

# Database (local SQLite file)
DATABASE_URL=file:./data/peek-db.db

# Development
NODE_ENV=development

# Path mappings configured via setup wizard
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
      - peek-data:/app/data
    environment:
      # Required
      - STASH_URL=http://stash:9999/graphql
      - STASH_API_KEY=${STASH_API_KEY}
      - JWT_SECRET=${JWT_SECRET}

      # Optional
      - NODE_ENV=production
      - SECURE_COOKIES=false
    restart: unless-stopped

volumes:
  peek-data:
```

!!! tip "Path Mappings"
    Path mappings are configured via the setup wizard and stored in the database (in the `peek-data` volume). No environment variables needed!

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

- Media volume is mounted correctly to container
- Path mappings are configured correctly in Settings → Path Mappings
- File permissions allow reading (use `:ro` for read-only mounts)

Verify path mapping:

```bash
# Check if media is accessible in container
docker exec peek-stash-browser ls -la /app/media

# Check path mappings in database
docker exec peek-stash-browser cat /app/data/peek-stash-browser.db
```

Use the "Test Path" button in Settings → Path Mappings to verify each path.

### Authentication Issues

Check:

- `JWT_SECRET` is set
- `SECURE_COOKIES` matches your HTTP/HTTPS setup
- Database is writable

## Next Steps

- [Quick Start Guide](quick-start.md)
- [Troubleshooting](../reference/troubleshooting.md)
