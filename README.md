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

### Docker Installation

```bash
docker run -d \
  --name peek-stash-browser \
  -p 6969:80 \
  -v /path/to/stash/media:/app/media:ro \
  -v /path/to/peek/data:/app/data \
  -e STASH_URL="http://your-stash-server:9999/graphql" \
  -e STASH_API_KEY="your_stash_api_key" \
  carrotwaxr/peek-stash-browser:latest
```

### unRAID Installation

1. Open Community Applications
2. Search for "Peek Stash Browser"
3. Click Install and configure the template
4. Access at `http://your-unraid-ip:6969`

### First Login

**Default Credentials:**
- Username: `admin`
- Password: `admin`

**⚠️ IMPORTANT:** Change your password immediately after first login via Settings > User Management

## Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `STASH_URL` | Your Stash server's GraphQL endpoint | `http://192.168.1.100:9999/graphql` |
| `STASH_API_KEY` | API key from Stash Settings > Security | `eyJhbGciOiJIUzI1Ni...` |

### Optional Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | Auto-generated | Secret for JWT tokens (auto-generated on first run) |
| `CONFIG_DIR` | `/app/data` | Directory for database and transcoding cache |
| `STASH_INTERNAL_PATH` | `/data` | Path prefix Stash uses internally |
| `STASH_MEDIA_PATH` | `/app/media` | Where Peek accesses Stash's media files |

### Path Mapping

Peek needs access to the same media files as Stash. If Stash sees files at `/data/videos/scene.mp4` in its container, you need to:

1. Mount that directory to Peek (e.g., `-v /host/stash/data:/app/media`)
2. Set `STASH_INTERNAL_PATH=/data`
3. Set `STASH_MEDIA_PATH=/app/media`

Peek will translate Stash's `/data/videos/scene.mp4` to `/app/media/videos/scene.mp4`

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
