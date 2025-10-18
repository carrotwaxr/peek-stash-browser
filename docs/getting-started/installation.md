# Installation

Peek Stash Browser can be deployed in several ways depending on your needs and environment.

## Prerequisites

Before installing Peek, ensure you have:

- **Stash Server** running with GraphQL API enabled
- **Docker** installed (Docker Compose only needed for development)
- **Network access** from container to Stash server
- **Storage space** for SQLite database and transcoding temp files

### Stash Configuration

1. **Enable API** in Stash settings
2. **Generate API key** in Settings → Security
3. **Note GraphQL endpoint** (usually `http://stash-ip:9999/graphql`)
4. **Ensure network access** from your Docker host to Stash

## Installation Methods

### Option 1: unRAID (Community Applications)

!!! tip "Easiest Installation Method"
    This is the recommended method for unRAID users - everything is pre-configured!

1. **Install from Community Applications**:
   - Search for "Peek Stash Browser" in unRAID's Community Applications
   - Click install and configure your settings
   - Access at `http://your-unraid-ip:6969`

For detailed unRAID setup instructions, see the [unRAID Deployment Guide](../deployment/unraid.md).

### Option 2: Docker (Single Container)

!!! success "Recommended for Production"
    Single container includes everything - frontend, backend, and database

```bash
docker run -d \
  --name peek-stash-browser \
  -p 6969:80 \
  -v /path/to/your/media:/app/media:ro \
  -v /path/to/peek-stash-browser/data:/app/data \
  -v /path/to/peek-stash-browser/tmp:/app/tmp \
  -e STASH_URL="http://your-stash-server:9999/graphql" \
  -e STASH_API_KEY="your_stash_api_key" \
  carrotwaxr/peek-stash-browser:latest
```

**Volume Mounts**:

- `/path/to/your/media` - Your media files (read-only)
- `/path/to/peek-stash-browser/data` - Database and app data
- `/path/to/peek-stash-browser/tmp` - Transcoding temporary files

**Required Environment Variables**:

- `STASH_URL` - Your Stash GraphQL endpoint
- `STASH_API_KEY` - API key from Stash settings

See [Configuration Guide](configuration.md) for all environment variables.

### Option 3: Docker Compose (Development)

!!! info "For Development Only"
    This method is for development with hot reloading enabled

1. **Clone and setup**:

   ```bash
   git clone https://github.com/carrotwaxr/peek-stash-browser.git
   cd peek-stash-browser
   cp .env.example .env
   ```

2. **Configure environment** (edit `.env`):

   ```bash
   STASH_URL=http://your-stash-server:9999/graphql
   STASH_API_KEY=your_stash_api_key
   DATABASE_URL=file:./data/peek-stash-browser.db
   TMP_DIR=/path/to/temp/directory
   ```

3. **Start services**:

   ```bash
   docker-compose up -d
   ```

4. **Access the app**: Open `http://localhost:6969`

For development setup details, see the [Development Setup Guide](../development/setup.md).

## First Access

After installation, access Peek in your browser:

1. Navigate to `http://localhost:6969` (or your server IP)
2. **Default login credentials**:
   - Username: `admin`
   - Password: `admin`
3. **⚠️ Important**: Change password immediately after first login!

## Port Configuration

| Environment     | Port   | Service      | Description                              |
| --------------- | ------ | ------------ | ---------------------------------------- |
| **Production**  | `6969` | Complete App | nginx serves frontend + proxies API      |
| **Development** | `6969` | Frontend UI  | Vite dev server with hot reloading       |
| **Development** | `8000` | Backend API  | Express server (internal Docker network) |

!!! success "Production uses only one port!"
    Production deployment exposes only port `6969` - nginx handles everything internally

## Hardware Recommendations

| Component | Minimum | Recommended |
|-----------|---------|-------------|
| **CPU** | 2 cores | 4+ cores (for multiple transcoding streams) |
| **RAM** | 2GB | 4GB+ |
| **Storage** | SSD for database | SSD for database, network storage for media |
| **Network** | 100 Mbps | Gigabit (for 4K content) |

## Next Steps

- [Configure environment variables](configuration.md)
- [Quick Start Guide](quick-start.md)
- [Video Playback Guide](../user-guide/video-playback.md)
- [Troubleshooting](../reference/troubleshooting.md)
