# Peek Stash Browser

A modern, responsive web application for browsing and managing your [Stash](https://github.com/stashapp/stash) media library with advanced filtering, authentication, and adaptive video streaming.

[![Documentation](https://img.shields.io/badge/docs-mkdocs-blue)](https://carrotwaxr.github.io/peek-stash-browser)
[![Docker](https://img.shields.io/badge/docker-hub-blue)](https://hub.docker.com/r/carrotwaxr/peek-stash-browser)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)

## Features

- **Adaptive Video Streaming** - Real-time HLS transcoding with multiple quality options
- **Playlist Management** - Create, organize, and play playlists with shuffle/repeat modes
- **Advanced Filtering** - Comprehensive search and filtering across all content types
- **Secure Authentication** - JWT-based auth with role management
- **Modern Interface** - Beautiful, responsive React UI with theme support
- **Mobile Ready** - Fully optimized for all devices

## Quick Start

### Docker (Recommended)

```bash
docker run -d \
  --name peek-stash-browser \
  -p 6969:80 \
  -v /path/to/media:/app/media:ro \
  -v /path/to/peek/data:/app/data \
  -e STASH_URL="http://your-stash:9999/graphql" \
  -e STASH_API_KEY="your_api_key" \
  carrotwaxr/peek-stash-browser:latest
```

### unRAID

1. Search "Peek Stash Browser" in Community Applications
2. Click Install and configure
3. Access at `http://your-unraid-ip:6969`

## Documentation

**Full documentation is available at: [https://carrotwaxr.github.io/peek-stash-browser](https://carrotwaxr.github.io/peek-stash-browser)**

### Quick Links

- **[Installation Guide](https://carrotwaxr.github.io/peek-stash-browser/getting-started/installation/)** - Docker, unRAID, and development setup
- **[Configuration](https://carrotwaxr.github.io/peek-stash-browser/getting-started/configuration/)** - Environment variables and settings
- **[User Guide](https://carrotwaxr.github.io/peek-stash-browser/user-guide/video-playback/)** - Using Peek effectively
- **[Development](https://carrotwaxr.github.io/peek-stash-browser/development/setup/)** - Contributing to Peek
- **[API Reference](https://carrotwaxr.github.io/peek-stash-browser/development/api-reference/)** - REST API documentation
- **[Troubleshooting](https://carrotwaxr.github.io/peek-stash-browser/reference/troubleshooting/)** - Common issues and solutions

## Requirements

- **Stash Server** with GraphQL API enabled
- **Docker** installed
- **Network access** to Stash server
- **Media storage** accessible to both Stash and Peek

## First Login

Default credentials: `admin` / `admin`

**⚠️ Change the password immediately after first login!**

## Architecture

- **Frontend**: React 19 + Tailwind CSS + Video.js
- **Backend**: Node.js/Express + TypeScript
- **Database**: SQLite (embedded)
- **Transcoding**: FFmpeg with HLS output
- **Deployment**: Single Docker container with nginx

## Technology Stack

**Frontend**: React 19, Tailwind CSS, Video.js, React Router
**Backend**: Node.js, Express, TypeScript, Prisma, FFmpeg
**Infrastructure**: Docker, nginx, SQLite

## Contributing

We welcome contributions! See the [Development Guide](https://carrotwaxr.github.io/peek-stash-browser/development/setup/) for setup instructions and [DEVELOPERS.md](DEVELOPERS.md) for comprehensive technical documentation.

## Support

- **Documentation**: [https://carrotwaxr.github.io/peek-stash-browser](https://carrotwaxr.github.io/peek-stash-browser)
- **Issues**: [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
- **Community**: [Stash Discord](https://discord.gg/2TsNFKt) - #third-party-integrations

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **[Stash](https://github.com/stashapp/stash)** - The amazing media organizer
- **[React](https://reactjs.org/)** - Frontend framework
- **[Express](https://expressjs.com/)** - Backend framework
- **[Prisma](https://prisma.io/)** - Database ORM
- **[Video.js](https://videojs.com/)** - Video player
- **[FFmpeg](https://ffmpeg.org/)** - Video transcoding
