# Peek Stash Browser

A modern web application for browsing and streaming your [Stash](https://github.com/stashapp/stash) adult content library with adaptive video streaming, playlists, and watch history tracking.

## What is Peek?

Peek is a web-based browser for your Stash library, offering:

- **Video Streaming** - Proxied through Stash with quality selection (Direct, 1080p, 720p, 480p, 360p)
- **Watch History** - Automatic progress tracking and resume playback
- **Playlists** - Create and manage custom playlists
- **Subtitle Support** - VTT captions just like Stash
- **Modern UI** - Responsive interface with theme support
- **Full Keyboard Navigation** - TV remote and keyboard control support
- **Proxy Authentication** - Integrate with SSO/auth proxies (Authelia, Authentik, oauth2-proxy, etc.)

Think of it as a sleek, modern interface for browsing your "documentary" collection.

## Quick Start

### Prerequisites

Before installing Peek:

1. **Stash Server** running with GraphQL API enabled
2. **Stash API Key** generated in Stash Settings → Security
3. **Docker** installed on your system
4. **Network access** from Docker to your Stash server

> **Note**: As of v2.0, Peek streams video directly through Stash - no media volume mounts required!

### Docker Installation (Linux/macOS)

```bash
# Pull the latest image from Docker Hub
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

### Docker Installation (Windows)

```powershell
# Pull the latest image from Docker Hub
docker pull carrotwaxr/peek-stash-browser:latest

# Generate JWT secret
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

### unRAID Installation

#### Option 1: Community Applications (Recommended)

1. Open Community Applications
2. Search for "Peek Stash Browser"
3. Click Install and configure the template
4. Access at `http://your-unraid-ip:6969`

#### Option 2: Manual Template Installation

If Peek isn't available in Community Applications yet:

**Step 1: Download the template**

```
https://raw.githubusercontent.com/carrotwaxr/peek-stash-browser/master/unraid-template.xml
```

**Step 2: Install the template**

Copy `unraid-template.xml` to:
```
/boot/config/plugins/dockerMan/templates-user/
```

**Step 3: Configure the container**

1. Go to Docker tab → Add Container
2. Select "peek-stash-browser" from User Templates dropdown
3. Configure required settings:
   - **JWT Secret**: Generate with `openssl rand -hex 32` in unRAID terminal
   - **App Data Directory**: Path for Peek data (e.g., `/mnt/user/appdata/peek-stash-browser`)
4. Click Apply
5. Access at `http://your-unraid-ip:6969`

### First Access - Setup Wizard

After installation, open `http://localhost:6969` (or your server's IP) in a browser. You'll be guided through a 4-step setup wizard:

1. **Welcome** - Introduction to Peek
2. **Create Admin** - Set your admin username and password
3. **Connect to Stash** - Enter your Stash URL and API key
4. **Complete** - Setup finished!

The wizard stores your Stash connection details securely in the database.

## Configuration

### Environment Variables

| Variable            | Required | Default        | Description                                            |
| ------------------- | -------- | -------------- | ------------------------------------------------------ |
| `JWT_SECRET`        | Yes      | Auto-generated | Secret for JWT tokens (recommended to set manually)    |
| `CONFIG_DIR`        | No       | `/app/data`    | Directory for database and library data                |
| `PROXY_AUTH_HEADER` | No       | (disabled)     | Enable proxy authentication (e.g., `X-Forwarded-User`) |

> **Note**: Stash connection details (URL and API key) are configured via the Setup Wizard and stored in the database. No environment variables needed!

> **Proxy Authentication**: For SSO/auth proxy integration (Authelia, Authentik, etc.), see the [Proxy Authentication](https://carrotwaxr.github.io/peek-stash-browser/getting-started/configuration/#proxy-authentication) documentation. **Important**: Peek must not be publicly accessible when using proxy auth.

## Updating Peek

### Check for Updates

Peek includes a built-in update checker:

1. Navigate to **Settings → Server Settings**
2. Scroll to the **Version Information** section
3. Click **Check for Updates**

The system will check GitHub for new releases and notify you if an update is available.

### Update to Latest Version

To update your Docker container to the latest version:

**Step 1: Stop and remove the current container**
```bash
docker stop peek-stash-browser
docker rm peek-stash-browser
```

**Step 2: Pull the latest image**
```bash
docker pull carrotwaxr/peek-stash-browser:latest
```

**Step 3: Start the new container**

Use the same `docker run` command you used for initial installation. Your data persists in the `peek-data` volume.

**Linux/macOS example:**
```bash
docker run -d \
  --name peek-stash-browser \
  -p 6969:80 \
  -v peek-data:/app/data \
  -e JWT_SECRET="${JWT_SECRET}" \
  carrotwaxr/peek-stash-browser:latest
```

**Windows example:**
```powershell
docker run -d `
  --name peek-stash-browser `
  -p 6969:80 `
  -v peek-data:/app/data `
  -e JWT_SECRET=$jwt `
  carrotwaxr/peek-stash-browser:latest
```

**unRAID users:** Simply click **Force Update** in the Docker tab to pull the latest image and restart.

**Note:** Your database, user settings, and playlists are stored in the `peek-data` volume and will persist across updates.

### Use Specific Version

If you prefer to pin to a specific version instead of `:latest`:

```bash
# Pull specific version
docker pull carrotwaxr/peek-stash-browser:1.0.0

# Use in docker run command
docker run ... carrotwaxr/peek-stash-browser:1.0.0
```

Available versions are listed on [GitHub Releases](https://github.com/carrotwaxr/peek-stash-browser/releases).

## Documentation

Full documentation: **[https://carrotwaxr.github.io/peek-stash-browser](https://carrotwaxr.github.io/peek-stash-browser)**

- [Installation Guide](https://carrotwaxr.github.io/peek-stash-browser/getting-started/installation/)
- [Configuration](https://carrotwaxr.github.io/peek-stash-browser/getting-started/configuration/)
- [Regression Testing Guide](https://carrotwaxr.github.io/peek-stash-browser/development/regression-testing/)
- [Troubleshooting](https://carrotwaxr.github.io/peek-stash-browser/reference/troubleshooting/)

## Requirements

- Stash server with GraphQL API enabled
- Docker (or unRAID)
- Network access between Peek and Stash

## Support

- **Documentation**: [https://carrotwaxr.github.io/peek-stash-browser](https://carrotwaxr.github.io/peek-stash-browser)
- **Bug Reports**: [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
- **Feature Requests**: [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
- **Community**: [Stash Discord](https://discord.gg/2TsNFKt) #third-party-integrations

## License

MIT License - See [LICENSE](LICENSE) file for details

## Acknowledgments

Built with [Stash](https://github.com/stashapp/stash), React, Express, FFmpeg, and other amazing open source projects.
