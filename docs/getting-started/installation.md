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

## Understanding Path Mapping

Peek needs to access the same media files that Stash manages. How you configure this depends on your setup:

### Scenario 1: Peek and Stash on Same Machine

**Example**: Both running in Docker on the same host

```bash
# Simple - just mount the same directory both containers use (read-only recommended)
-v /mnt/media:/app/media:ro
```

### Scenario 2: Peek on Windows, Stash on Network Server

**Example**: Stash on unRAID/NAS, Peek on Windows desktop

If your network shares are password-protected, use Docker volumes:

```powershell
# One-time: Create Docker volume for password-protected SMB share
docker volume create peek-media `
  --driver local `
  --opt type=cifs `
  --opt device=//192.168.1.100/media `
  --opt o=username=youruser,password=yourpass

# Then use the volume in docker run (read-only recommended)
-v peek-media:/app/media:ro
```

See [Windows Installation Examples](#windows-examples) below for complete examples.

### Scenario 3: Multiple Stash Libraries

**Example**: Stash has separate folders for videos and images

The setup wizard will auto-discover all your Stash libraries and help you map each one:

- `/data` (videos) → `/app/media`
- `/images` (images) → `/app/images`

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
   - **Stash GraphQL URL**: `http://your-unraid-ip:9999/graphql`
   - **Stash API Key**: Get from Stash Settings → Security
   - **JWT Secret**: Generate with `openssl rand -hex 32` in unRAID terminal
   - **Media Directory**: Path to your Stash media (e.g., `/mnt/user/videos`)
   - **App Data Directory**: Path for Peek data (e.g., `/mnt/user/appdata/peek-stash-browser`)
4. Click Apply
5. Access at `http://your-unraid-ip:6969`

### Option 2: Docker (Single Container)

!!! success "Recommended for Production"
Single container includes everything - frontend, backend, and database

```bash
# Pull the latest image
docker pull carrotwaxr/peek-stash-browser:latest

# Generate JWT secret
export JWT_SECRET=$(openssl rand -base64 32)

# Run with single library
docker run -d \
  --name peek-stash-browser \
  -p 6969:80 \
  -v /path/to/your/media:/app/media:ro \
  -v peek-data:/app/data \
  -e STASH_URL="http://your-stash-server:9999/graphql" \
  -e STASH_API_KEY="your_stash_api_key" \
  -e JWT_SECRET="${JWT_SECRET}" \
  carrotwaxr/peek-stash-browser:latest

# Run with multiple libraries (if Stash has separate video/image libraries)
docker run -d \
  --name peek-stash-browser \
  -p 6969:80 \
  -v /path/to/stash/videos:/app/media:ro \
  -v /path/to/stash/images:/app/images:ro \
  -v /path/to/stash/other:/app/other:ro \
  -v peek-data:/app/data \
  -e STASH_URL="http://your-stash-server:9999/graphql" \
  -e STASH_API_KEY="your_stash_api_key" \
  -e JWT_SECRET="${JWT_SECRET}" \
  carrotwaxr/peek-stash-browser:latest
```

**Volume Mounts**:

- `/path/to/your/media` - Your media files (read-only recommended with `:ro`)
- `peek-data` - Database and app data (Docker named volume)

!!! tip "Multiple Libraries"
If Stash has multiple library paths, mount each one separately. The setup wizard will auto-discover them and help you configure the mappings.

**Required Environment Variables**:

- `STASH_URL` - Your Stash GraphQL endpoint
- `STASH_API_KEY` - API key from Stash settings
- `JWT_SECRET` - Secret for JWT authentication (recommended to set manually)

See [Configuration Guide](configuration.md) for all environment variables.

#### Windows Examples

Windows users with network shares (SMB/CIFS) need special configuration for password-protected shares.

!!! warning "Windows Network Shares"
Docker Desktop on Windows cannot directly mount password-protected network shares using drive letters (Z:, X:, etc.).
Use Docker volumes with CIFS credentials instead.

**Step 1: Find your UNC path**

If you have a mapped drive, find its UNC path:

```powershell
# In PowerShell
net use Z:
# Look for "Remote name" in the output (e.g., \\192.168.1.100\media)
```

**Step 2: Create Docker volumes (one-time setup)**

```powershell
# Pull the latest image from Docker Hub
docker pull carrotwaxr/peek-stash-browser:latest

# Generate JWT secret (one-time)
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$jwt = [Convert]::ToBase64String($bytes)

# For single library:
docker volume create peek-media `
  --driver local `
  --opt type=cifs `
  --opt device=//192.168.1.100/stash `
  --opt o=username=youruser,password=yourpass

# For multiple libraries (create one volume per library):
docker volume create peek-videos `
  --driver local `
  --opt type=cifs `
  --opt device=//192.168.1.100/stash/videos `
  --opt o=username=youruser,password=yourpass

docker volume create peek-images `
  --driver local `
  --opt type=cifs `
  --opt device=//192.168.1.100/stash/images `
  --opt o=username=youruser,password=yourpass

# Create volume for Peek data (persists database)
docker volume create peek-data
```

!!! tip "Volumes persist across reboots!"
These volumes are created once and survive container restarts, system reboots, and Docker Desktop restarts.

**Step 3: Run Peek container**

```powershell
# Single library
docker run -d `
    --name peek-stash-browser `
    -p 6969:80 `
    -v peek-media:/app/media:ro `
    -v peek-data:/app/data `
    -e STASH_URL=http://192.168.1.100:9999/graphql `
    -e STASH_API_KEY=your_api_key_here `
    -e JWT_SECRET=$jwt `
    carrotwaxr/peek-stash-browser:latest

# Multiple libraries
docker run -d `
    --name peek-stash-browser `
    -p 6969:80 `
    -v peek-videos:/app/media:ro `
    -v peek-images:/app/images:ro `
    -v peek-data:/app/data `
    -e STASH_URL=http://192.168.1.100:9999/graphql `
    -e STASH_API_KEY=your_api_key_here `
    -e JWT_SECRET=$jwt `
    carrotwaxr/peek-stash-browser:latest
```

!!! tip "Multiple Libraries"
    Create one Docker volume for each Stash library path. Media volumes are mounted read-only (`:ro`) to prevent accidental modifications. The setup wizard will auto-discover all libraries and help you map them.

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

!!! success "Volumes are preserved!"
Your database and configuration are saved in the `peek-data` volume and won't be lost when updating.

#### Linux/macOS Examples

Linux and macOS users can mount directories directly without the complexity of network share authentication.

**Step 1: Pull image and generate JWT secret**

```bash
# Pull the latest image from Docker Hub
docker pull carrotwaxr/peek-stash-browser:latest

# Generate a secure random JWT secret
export JWT_SECRET=$(openssl rand -base64 32)
```

**Step 2: Run Peek container**

```bash
# Single Stash library
docker run -d \
    --name peek-stash-browser \
    -p 6969:80 \
    -v /path/to/stash/media:/app/media:ro \
    -v peek-data:/app/data \
    -e STASH_URL=http://192.168.1.100:9999/graphql \
    -e STASH_API_KEY=your_api_key_here \
    -e JWT_SECRET="${JWT_SECRET}" \
    carrotwaxr/peek-stash-browser:latest

# Multiple Stash libraries (videos + images + other)
docker run -d \
    --name peek-stash-browser \
    -p 6969:80 \
    -v /path/to/stash/videos:/app/media:ro \
    -v /path/to/stash/images:/app/images:ro \
    -v /path/to/stash/other:/app/other:ro \
    -v peek-data:/app/data \
    -e STASH_URL=http://192.168.1.100:9999/graphql \
    -e STASH_API_KEY=your_api_key_here \
    -e JWT_SECRET="${JWT_SECRET}" \
    carrotwaxr/peek-stash-browser:latest
```

!!! tip "Read-only mounts recommended"
Use `:ro` flag on media mounts to prevent accidental modifications to your Stash library

!!! tip "Multiple Libraries"
Mount each Stash library path separately. The setup wizard will auto-discover all libraries and help you map them.

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

## First Access & Setup Wizard

After installation, access Peek in your browser for the first-time setup:

1. Navigate to `http://localhost:6969` (or your server IP)
2. **Complete the 5-step setup wizard**:
   - **Welcome**: Introduction to Peek
   - **Discover Libraries**: Auto-discover Stash library paths
   - **Configure Paths**: Map Stash paths to Peek container paths
   - **Create Admin**: Set your admin password
   - **Complete**: Setup finished!
3. **Login** with your newly created admin credentials

!!! tip "Path Mapping Made Easy"
The wizard auto-discovers your Stash library paths and helps you map them correctly!

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
      -v /path/to/stash/media:/app/media:ro \
      -v peek-data:/app/data \
      -e STASH_URL=http://192.168.1.100:9999/graphql \
      -e STASH_API_KEY=your_api_key_here \
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
      -v peek-media:/app/media:ro `
      -v peek-data:/app/data `
      -e STASH_URL=http://192.168.1.100:9999/graphql `
      -e STASH_API_KEY=your_api_key_here `
      -e JWT_SECRET=$jwt `
      carrotwaxr/peek-stash-browser:latest
    ```

!!! success "Your data persists across updates"
    Database, user settings, path mappings, and playlists are stored in the `peek-data` volume and will not be lost.

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
