# Configuration

Peek Stash Browser is configured through environment variables and the setup wizard. This page documents all available configuration options.

## Stash Connection (Setup Wizard)

As of v2.0, Stash connection details are configured via the **Setup Wizard** and stored in the database:

- **Stash URL**: Your Stash GraphQL endpoint (e.g., `http://192.168.1.100:9999/graphql`)
- **Stash API Key**: API key from Stash Settings → Security

The wizard runs automatically on first access. No environment variables needed for Stash connection!

> **Upgrading from v1.x?** Your existing `STASH_URL` and `STASH_API_KEY` environment variables will auto-migrate to the database on first start. You can remove them from your container configuration after successful migration.

## Required Environment Variables

| Variable     | Description     | Example                             |
| ------------ | --------------- | ----------------------------------- |
| `JWT_SECRET` | JWT signing key | Generate with `openssl rand -base64 32` |

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

## Video Streaming (v2.0+)

As of v2.0, **Peek streams video directly through Stash** - no local media access required!

- Videos are proxied through the Stash API
- No media volume mounts needed
- No path mapping configuration required
- Simpler container setup

This is a significant simplification from v1.x which required mounting media directories and configuring path mappings.

## Security Settings

| Variable         | Description                    | Default | When to Use                  |
| ---------------- | ------------------------------ | ------- | ---------------------------- |
| `SECURE_COOKIES` | Enable secure cookie flag      | `false` | Set to `true` when using HTTPS reverse proxy |

!!! warning "Security Best Practices"
    - Set a strong `JWT_SECRET` during installation (required)
    - Set `SECURE_COOKIES=true` when using HTTPS
    - Don't expose Peek directly to the internet without a reverse proxy
    - Admin credentials are created during setup wizard (no default passwords)
    - Stash API key is stored securely in the database (not in environment variables)

## Example Configurations

### Minimal Production Configuration (v2.0+)

```bash
# Required
JWT_SECRET=your_very_long_random_secret_key_here

# Stash connection configured via Setup Wizard (stored in database)
# All other settings use defaults
```

### Complete Production Configuration

```bash
# Authentication (Required)
JWT_SECRET=your_very_long_random_secret_key_here

# Database (Optional - defaults shown)
DATABASE_URL=file:/app/data/peek-stash-browser.db
CONFIG_DIR=/app/data

# Security (Optional)
SECURE_COOKIES=true

# Environment (Optional)
NODE_ENV=production

# Stash connection configured via Setup Wizard (stored in database)
```

### Development Configuration

```bash
# Authentication
JWT_SECRET=dev-secret-change-in-production

# Database (local SQLite file)
DATABASE_URL=file:./data/peek-db.db

# Development
NODE_ENV=development

# Stash connection configured via Setup Wizard
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
      - peek-data:/app/data
    environment:
      - JWT_SECRET=${JWT_SECRET}
      # Optional
      - NODE_ENV=production
      - SECURE_COOKIES=false
    restart: unless-stopped

volumes:
  peek-data:
```

!!! tip "Stash Connection"
    Stash URL and API key are configured via the Setup Wizard on first access and stored in the database.

## Troubleshooting Configuration Issues

### Cannot Connect to Stash

Check:

- Stash URL is accessible from the Peek container
- Stash API key is correct and not expired
- Stash GraphQL API is enabled

Test connectivity:

```bash
docker exec peek-stash-browser curl http://your-stash-ip:9999/graphql
```

You can update Stash connection details in Settings → Stash Configuration.

### Videos Won't Play

Check:

- Stash connection is configured correctly (Settings → Stash Configuration)
- Stash server is running and accessible
- The scene exists in Stash and has a valid video file

### Authentication Issues

Check:

- `JWT_SECRET` is set
- `SECURE_COOKIES` matches your HTTP/HTTPS setup
- Database is writable

## Next Steps

- [Quick Start Guide](quick-start.md)
- [Troubleshooting](../reference/troubleshooting.md)
