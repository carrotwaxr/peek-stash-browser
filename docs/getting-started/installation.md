# Installation

Peek Stash Browser can be deployed in several ways depending on your needs and environment.

## Requirements

- Stash server with GraphQL API enabled and an API key configured (Settings → Security)
- Docker (or Docker on unRAID)
- Network access between Peek and Stash

## Installation Methods

### Option 1: unRAID

#### Template Installation

**Step 1: Download the template file**

Get the template from GitHub:

```
https://raw.githubusercontent.com/carrotwaxr/peek-stash-browser/main/unraid-template.xml
```

**Step 2: Install the template**

=== "USB/Boot Share Exported (Easier)"

    1. Copy `unraid-template.xml` to your network share at:
       ```
       \\your.server.ip.address\flash\config\plugins\dockerMan\templates-user
       ```
    2. The template will be available immediately in Docker tab → Add Container → User Templates

=== "USB/Boot Share NOT Exported"

    1. Copy `unraid-template.xml` to any accessible share (e.g., `\\your.server.ip.address\downloads`)
    2. SSH into your unRAID server
    3. Move the template file:
       ```bash
       cp /mnt/user/downloads/unraid-template.xml /boot/config/plugins/dockerMan/templates-user/
       ```
    4. The template will be available immediately in Docker tab → Add Container → User Templates

!!! info "No Restart Required"
    You do NOT need to restart Docker or unRAID - the template is picked up automatically.

**Step 3: Configure the container**

1. Go to Docker tab → Add Container
2. Select "Peek" from User Templates dropdown
3. Configure required settings:
   - **JWT Secret**: Generate with `openssl rand -hex 32` in unRAID terminal
   - **App Data Directory**: Path for Peek data (e.g., `/mnt/user/appdata/peek-stash-browser`)
4. Click Apply
5. Access at `http://your-unraid-ip:6969`
6. Complete the Setup Wizard to connect to your Stash server

!!! note "Stash URL and API Key"
    Leave the "Stash GraphQL URL" and "Stash API Key" fields blank for new installs - you'll configure these in the Setup Wizard. These fields are only shown for users migrating from v1.x.

### Option 2: Docker (Single Container)

!!! success "Recommended for Production"
    Single container includes everything - frontend, backend, and database. Multi-architecture images are available for both AMD64 and ARM64 (Raspberry Pi, Apple Silicon, etc.).

```bash
# Pull the latest image
docker pull carrotwaxr/peek-stash-browser:latest

# Generate JWT secret
export JWT_SECRET=$(openssl rand -base64 32)

# Run Peek
docker run -d \
  --name peek-stash-browser \
  -p 6969:80 \
  -v peek-data:/app/data \
  -e JWT_SECRET="${JWT_SECRET}" \
  carrotwaxr/peek-stash-browser:latest
```

**Volume Mounts**:

- `peek-data` - Database and app data (Docker named volume)

**Required Environment Variables**:

- `JWT_SECRET` - Secret for JWT authentication (recommended to set manually)

> **Note**: Stash URL and API key are configured via the Setup Wizard on first access - no environment variables needed!

See [Configuration Guide](configuration.md) for all environment variables.

#### Windows Examples

```powershell
# Pull the latest image from Docker Hub
docker pull carrotwaxr/peek-stash-browser:latest

# Generate JWT secret (one-time)
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$jwt = [Convert]::ToBase64String($bytes)

# Run Peek
docker run -d `
    --name peek-stash-browser `
    -p 6969:80 `
    -v peek-data:/app/data `
    -e JWT_SECRET=$jwt `
    carrotwaxr/peek-stash-browser:latest
```

**Managing the container:**

```powershell
# View logs
docker logs peek-stash-browser

# Stop container
docker stop peek-stash-browser

# Start container
docker start peek-stash-browser

# Restart container
docker restart peek-stash-browser

# Update to new version
docker stop peek-stash-browser
docker rm peek-stash-browser
docker pull carrotwaxr/peek-stash-browser:latest
# Then re-run the docker run command above
```

!!! success "Data persists across updates!"
    Your database and configuration are saved in the `peek-data` volume and won't be lost when updating.

#### Linux/macOS Examples

```bash
# Pull the latest image from Docker Hub
docker pull carrotwaxr/peek-stash-browser:latest

# Generate a secure random JWT secret
export JWT_SECRET=$(openssl rand -base64 32)

# Run Peek
docker run -d \
    --name peek-stash-browser \
    -p 6969:80 \
    -v peek-data:/app/data \
    -e JWT_SECRET="${JWT_SECRET}" \
    carrotwaxr/peek-stash-browser:latest
```

**Managing the container:**

```bash
# View logs
docker logs peek-stash-browser

# Follow logs in real-time
docker logs -f peek-stash-browser

# Stop container
docker stop peek-stash-browser

# Start container
docker start peek-stash-browser

# Restart container
docker restart peek-stash-browser

# Update to new version
docker stop peek-stash-browser
docker rm peek-stash-browser
docker pull carrotwaxr/peek-stash-browser:latest
# Then re-run the docker run command above
```

!!! success "Data persists across updates!"
    Your database and configuration are saved in the `peek-data` volume and won't be lost when updating.

## First Access & Setup Wizard

After installation, access Peek in your browser for the first-time setup:

1. Navigate to `http://localhost:6969` (or your server IP)
2. **Complete the 4-step setup wizard**:
   - **Welcome**: Introduction to Peek
   - **Create Admin**: Set your admin username and password
   - **Connect to Stash**: Enter your Stash URL and API key
   - **Complete**: Setup finished!
3. **Login** with your newly created admin credentials

## Updating Peek

### Check for Updates

Peek includes a built-in update checker:

1. Navigate to **Settings → Server Settings**
2. Scroll to the **Version Information** section
3. Click **Check for Updates**

The system will query GitHub for new releases and notify you if an update is available.

### Update Procedure

To update your Docker container to the latest version:

=== "unRAID"
    **Easiest method**: Click **Force Update** in the Docker tab to pull the latest image and restart.

=== "Linux/macOS"
    ```bash
    # Stop and remove current container
    docker stop peek-stash-browser
    docker rm peek-stash-browser

    # Pull latest image
    docker pull carrotwaxr/peek-stash-browser:latest

    # Restart with same docker run command you used for installation
    docker run -d \
      --name peek-stash-browser \
      -p 6969:80 \
      -v peek-data:/app/data \
      -e JWT_SECRET="${JWT_SECRET}" \
      carrotwaxr/peek-stash-browser:latest
    ```

=== "Windows"
    ```powershell
    # Stop and remove current container
    docker stop peek-stash-browser
    docker rm peek-stash-browser

    # Pull latest image
    docker pull carrotwaxr/peek-stash-browser:latest

    # Restart with same docker run command you used for installation
    docker run -d `
      --name peek-stash-browser `
      -p 6969:80 `
      -v peek-data:/app/data `
      -e JWT_SECRET=$jwt `
      carrotwaxr/peek-stash-browser:latest
    ```

!!! success "Your data persists across updates"
    Database, user settings, Stash configuration, and playlists are stored in the `peek-data` volume and will not be lost. For backup procedures and version-specific notes, see [Upgrading Peek](upgrading.md).

### Version Pinning

To use a specific version instead of `:latest`:

```bash
# Pull and use specific version
docker pull carrotwaxr/peek-stash-browser:1.0.0
docker run ... carrotwaxr/peek-stash-browser:1.0.0
```

Available versions: [GitHub Releases](https://github.com/carrotwaxr/peek-stash-browser/releases)

## Port Configuration

Peek uses a single port for production deployments:

| Port   | Service      | Description                         |
| ------ | ------------ | ----------------------------------- |
| `6969` | Complete App | nginx serves frontend + proxies API |

!!! tip "Development Ports"
    For development setup with hot reloading, see [Local Development Setup](../development/local-setup.md).

!!! warning "Port Conflict with Whisparr"
    Peek's default port (6969) is the same as Whisparr's default port. If you're running Whisparr, change Peek's port mapping:

    ```bash
    -p 6970:80   # Use 6970 instead of 6969
    ```

## Hardware Recommendations

Peek is lightweight - it proxies streams through Stash rather than transcoding locally.

| Component   | Minimum   | Recommended                                 |
| ----------- | --------- | ------------------------------------------- |
| **CPU**     | 1 core    | 2+ cores                                    |
| **RAM**     | 512MB     | 1GB+ (for large libraries)                  |
| **Storage** | 100MB     | SSD for database (faster queries)           |
| **Network** | 100 Mbps  | Gigabit (for 4K content)                    |

## Next Steps

- [Configure environment variables](configuration.md)
- [Quick Start Guide](quick-start.md)
- [Troubleshooting](troubleshooting.md)
