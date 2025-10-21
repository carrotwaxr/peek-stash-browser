# Peek Stash Browser

**⚠️ BETA SOFTWARE** - Currently in beta testing. Expect bugs and incomplete features.

A modern web application for browsing and streaming your [Stash](https://github.com/stashapp/stash) adult content library with adaptive video streaming, playlists, and watch history tracking.

## What is Peek?

Peek is a web-based browser for your Stash library, offering:

- **Adaptive Video Streaming** - Real-time HLS transcoding with quality selection
- **Watch History** - Automatic progress tracking and resume playback
- **Playlists** - Create and manage custom playlists
- **Modern UI** - Responsive interface with theme support
- **Full Keyboard Navigation** - TV remote and keyboard control support

Think of it as a sleek, modern interface for browsing your "documentary" collection.

## Quick Start

### Prerequisites

Before installing Peek:

1. **Stash Server** running with GraphQL API enabled
2. **Stash API Key** generated in Stash Settings → Security
3. **Docker** installed on your system
4. **Network access** from Docker to your Stash server

### Docker Installation (Linux/macOS)

```bash
# Pull the latest image from Docker Hub
docker pull carrotwaxr/peek-stash-browser:latest

# Generate JWT secret
export JWT_SECRET=$(openssl rand -base64 32)

# Single library example
docker run -d \
  --name peek-stash-browser \
  -p 6969:80 \
  -v /path/to/stash/media:/app/media:ro \
  -v peek-data:/app/data \
  -e STASH_URL="http://your-stash-server:9999/graphql" \
  -e STASH_API_KEY="your_stash_api_key" \
  -e JWT_SECRET="${JWT_SECRET}" \
  carrotwaxr/peek-stash-browser:latest

# Multiple libraries example (if Stash has separate video/image libraries)
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

**Note**: Mount each Stash library directory separately. The setup wizard will help you map them correctly.

### Docker Installation (Windows)

Windows users with password-protected network shares need to use Docker volumes:

```powershell
# Pull the latest image from Docker Hub
docker pull carrotwaxr/peek-stash-browser:latest

# Generate JWT secret
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 32
$rng.GetBytes($bytes)
$jwt = [Convert]::ToBase64String($bytes)

# Create Docker volume for network share (one-time setup)
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

# Run Peek (single library)
docker run -d `
  --name peek-stash-browser `
  -p 6969:80 `
  -v peek-media:/app/media `
  -v peek-data:/app/data `
  -e STASH_URL=http://192.168.1.100:9999/graphql `
  -e STASH_API_KEY=your_api_key `
  -e JWT_SECRET=$jwt `
  carrotwaxr/peek-stash-browser:latest

# Run Peek (multiple libraries)
docker run -d `
  --name peek-stash-browser `
  -p 6969:80 `
  -v peek-videos:/app/media `
  -v peek-images:/app/images `
  -v peek-data:/app/data `
  -e STASH_URL=http://192.168.1.100:9999/graphql `
  -e STASH_API_KEY=your_api_key `
  -e JWT_SECRET=$jwt `
  carrotwaxr/peek-stash-browser:latest
```

**Note**: Create one Docker volume for each Stash library. The setup wizard will help you map them correctly.

### unRAID Installation

#### Option 1: Community Applications (Recommended)

1. Open Community Applications
2. Search for "Peek Stash Browser"
3. Click Install and configure the template
4. Access at `http://your-unraid-ip:6969`

#### Option 2: Manual Template Installation

If Peek isn't available in Community Applications yet, or if you want to install the latest template manually:

**Step 1: Download the template file**

Get the template from GitHub:

```
https://raw.githubusercontent.com/carrotwaxr/peek-stash-browser/master/unraid-template.xml
```

**Step 2: Install the template**

**Method A - If your USB/boot share is exported (easier):**

1. Copy `unraid-template.xml` to your network share at:
   ```
   \\your.server.ip.address\flash\config\plugins\dockerMan\templates-user
   ```
2. The template will be available immediately in Docker tab → Add Container → User Templates

**Method B - If USB/boot share is NOT exported:**

1. Copy `unraid-template.xml` to any accessible share (e.g., `\\your.server.ip.address\downloads`)
2. SSH into your unRAID server
3. Move the template file:
   ```bash
   cp /mnt/user/downloads/unraid-template.xml /boot/config/plugins/dockerMan/templates-user/
   ```
4. The template will be available immediately in Docker tab → Add Container → User Templates

**Note**: You do NOT need to restart Docker or unRAID - the template is picked up automatically.

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

### First Access - Setup Wizard

After installation, open `http://localhost:6969` (or your server's IP) in a browser. You'll be guided through a 5-step setup wizard:

1. **Welcome** - Introduction to Peek
2. **Discover Libraries** - Auto-discover your Stash library paths via GraphQL
3. **Configure Paths** - Map Stash paths to Peek container paths
4. **Create Admin** - Set your admin username and password
5. **Complete** - Setup finished!

The wizard automatically discovers your Stash libraries and helps you configure path mappings correctly.

## Configuration

### Required Environment Variables

| Variable        | Description                            | Example                             |
| --------------- | -------------------------------------- | ----------------------------------- |
| `STASH_URL`     | Your Stash server's GraphQL endpoint   | `http://192.168.1.100:9999/graphql` |
| `STASH_API_KEY` | API key from Stash Settings > Security | `eyJhbGciOiJIUzI1Ni...`             |

### Optional Environment Variables

| Variable     | Default        | Description                                         |
| ------------ | -------------- | --------------------------------------------------- |
| `JWT_SECRET` | Auto-generated | Secret for JWT tokens (recommended to set manually) |
| `CONFIG_DIR` | `/app/data`    | Directory for database and transcoding cache        |

### Path Mapping (Configured via Setup Wizard)

Peek needs access to the same media files that Stash manages. The **Setup Wizard** handles this automatically:

1. **Auto-Discovery**: Peek queries your Stash server via GraphQL to discover all library paths
2. **Path Mapping**: You map each Stash library path to where Peek can access it in the container
3. **Database Storage**: Mappings are stored in the database (no environment variables needed)

**Example Scenarios:**

- **Stash reports:** `/data/videos/scene.mp4`
- **You mounted:** `-v /mnt/media:/app/media`
- **Mapping:** Stash Path `/data` → Peek Path `/app/media`
- **Result:** Peek accesses `/app/media/videos/scene.mp4`

**Multiple Libraries:**
If Stash has multiple libraries (e.g., `/data` for videos, `/images` for images), the wizard will detect both and let you map each one separately.

**Advanced:** Path mappings can also be managed later via Settings → Path Mappings

## Beta Testing

This is **beta software**. Please help improve Peek by:

1. **Testing core functionality** - See [Beta Testing Guide](https://carrotwaxr.github.io/peek-stash-browser/beta-testing/) for test scenarios
2. **Reporting bugs** - [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues) with detailed reproduction steps
3. **Requesting features** - Open an issue tagged as "enhancement"
4. **Providing feedback** - What works well? What's confusing?

## Documentation

Full documentation: **[https://carrotwaxr.github.io/peek-stash-browser](https://carrotwaxr.github.io/peek-stash-browser)**

- [Installation Guide](https://carrotwaxr.github.io/peek-stash-browser/getting-started/installation/)
- [Configuration](https://carrotwaxr.github.io/peek-stash-browser/getting-started/configuration/)
- [Beta Testing Guide](https://carrotwaxr.github.io/peek-stash-browser/beta-testing/)
- [Troubleshooting](https://carrotwaxr.github.io/peek-stash-browser/reference/troubleshooting/)

## Requirements

- Stash server with GraphQL API enabled
- Docker (or unRAID)
- Network access between Peek and Stash
- Shared media storage accessible to both containers

## Support

- **Documentation**: [https://carrotwaxr.github.io/peek-stash-browser](https://carrotwaxr.github.io/peek-stash-browser)
- **Bug Reports**: [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
- **Feature Requests**: [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
- **Community**: [Stash Discord](https://discord.gg/2TsNFKt) #third-party-integrations

## License

MIT License - See [LICENSE](LICENSE) file for details

## Acknowledgments

Built with [Stash](https://github.com/stashapp/stash), React, Express, FFmpeg, and other amazing open source projects.
