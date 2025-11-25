# Installation

Peek Stash Browser can be deployed in several ways depending on your needs and environment.

## Prerequisites

Before installing Peek, ensure you have:

- **Stash Server** running with GraphQL API enabled
- **Docker** installed (Docker Compose only needed for development)
- **Network access** from container to Stash server

### Stash Configuration

1. **Enable API** in Stash settings
2. **Generate API key** in Settings → Security
3. **Note GraphQL endpoint** (usually `http://stash-ip:9999/graphql`)
4. **Ensure network access** from your Docker host to Stash

> **Note**: As of v2.0, Peek streams video directly through Stash - no media volume mounts required!

## Installation Methods

### Option 1: unRAID

#### Community Applications (Recommended)

!!! tip "Easiest Installation Method"
This is the recommended method for unRAID users - everything is pre-configured!

1. **Install from Community Applications**:
   - Search for "Peek Stash Browser" in unRAID's Community Applications
   - Click install and configure your settings
   - Access at `http://your-unraid-ip:6969`

#### Manual Template Installation

If Peek isn't available in Community Applications yet, or if you want to install the latest template manually:

**Step 1: Download the template file**

Get the template from GitHub:

```
https://raw.githubusercontent.com/carrotwaxr/peek-stash-browser/master/unraid-template.xml
```

**Step 2: Install the template**

=== "USB/Boot Share Exported (Easier)" 1. Copy `unraid-template.xml` to your network share at:
`       \\your.server.ip.address\flash\config\plugins\dockerMan\templates-user
      ` 2. The template will be available immediately in Docker tab → Add Container → User Templates

=== "USB/Boot Share NOT Exported" 1. Copy `unraid-template.xml` to any accessible share (e.g., `\\your.server.ip.address\downloads`) 2. SSH into your unRAID server 3. Move the template file:
`bash
       cp /mnt/user/downloads/unraid-template.xml /boot/config/plugins/dockerMan/templates-user/
       ` 4. The template will be available immediately in Docker tab → Add Container → User Templates

!!! info "No Restart Required"
You do NOT need to restart Docker or unRAID - the template is picked up automatically.

**Step 3: Configure the container**

1. Go to Docker tab → Add Container
2. Select "peek-stash-browser" from User Templates dropdown
3. Configure required settings:
   - **JWT Secret**: Generate with `openssl rand -hex 32` in unRAID terminal
   - **App Data Directory**: Path for Peek data (e.g., `/mnt/user/appdata/peek-stash-browser`)
4. Click Apply
5. Access at `http://your-unraid-ip:6969`
6. Complete the Setup Wizard to connect to your Stash server

### Option 2: Docker (Single Container)

!!! success "Recommended for Production"
Single container includes everything - frontend, backend, and database

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
   JWT_SECRET=your-dev-secret-here
   DATABASE_URL=file:./data/peek-stash-browser.db
   ```

3. **Start services**:

   ```bash
   docker-compose up -d
   ```

4. **Access the app**: Open `http://localhost:6969`

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
    Database, user settings, Stash configuration, and playlists are stored in the `peek-data` volume and will not be lost.

### Version Pinning

To use a specific version instead of `:latest`:

```bash
# Pull and use specific version
docker pull carrotwaxr/peek-stash-browser:1.0.0
docker run ... carrotwaxr/peek-stash-browser:1.0.0
```

Available versions: [GitHub Releases](https://github.com/carrotwaxr/peek-stash-browser/releases)

## Port Configuration

| Environment     | Port   | Service      | Description                              |
| --------------- | ------ | ------------ | ---------------------------------------- |
| **Production**  | `6969` | Complete App | nginx serves frontend + proxies API      |
| **Development** | `6969` | Frontend UI  | Vite dev server with hot reloading       |
| **Development** | `8000` | Backend API  | Express server (internal Docker network) |

!!! success "Production uses only one port!"
Production deployment exposes only port `6969` - nginx handles everything internally

## Hardware Recommendations

| Component   | Minimum          | Recommended                                 |
| ----------- | ---------------- | ------------------------------------------- |
| **CPU**     | 2 cores          | 4+ cores (for multiple transcoding streams) |
| **RAM**     | 2GB              | 4GB+                                        |
| **Storage** | SSD for database | SSD for database, network storage for media |
| **Network** | 100 Mbps         | Gigabit (for 4K content)                    |

## Next Steps

- [Configure environment variables](configuration.md)
- [Quick Start Guide](quick-start.md)
- [Troubleshooting](../reference/troubleshooting.md)
