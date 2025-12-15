# Welcome to Peek Stash Browser

<p align="center">
  <img src="assets/peek-logo.png" alt="Peek Logo" width="200"/>
</p>

A modern web application for browsing and streaming your [Stash](https://github.com/stashapp/stash) media library with adaptive video streaming, playlists, and watch history tracking.

<div class="grid cards" markdown>

- :material-download:{ .lg .middle } **Quick Start**

  ***

  Get up and running in minutes with Docker or unRAID

  [:octicons-arrow-right-24: Installation](getting-started/installation.md)

- :material-cog:{ .lg .middle } **Configuration**

  ***

  Set up Peek to connect with your Stash server

  [:octicons-arrow-right-24: Setup Guide](getting-started/configuration.md)

- :material-help-circle:{ .lg .middle } **Troubleshooting**

  ***

  Common issues and solutions

  [:octicons-arrow-right-24: Get Help](reference/troubleshooting.md)

</div>

## What is Peek?

Peek is a web-based browser for your Stash library, offering a sleek modern interface optimized for video streaming and playback.

### Key Features

- **Video Streaming** - Proxied through Stash with quality selection (Direct, 1080p, 720p, 480p, 360p)
- **Watch History Tracking** - Automatic progress tracking and resume playback ([Learn more](user-guide/watch-history.md))
- **Playlist Management** - Create, organize, and play custom playlists ([Learn more](user-guide/playlists.md))
- **Modern Interface** - Responsive React UI with theme support
- **Full Keyboard Navigation** - Complete TV remote and keyboard control support ([Learn more](user-guide/keyboard-navigation.md))
- **Mobile Ready** - Optimized for all devices
- **Scalable Library** - SQLite-based storage supports 100k+ scenes

## Quick Start

### Installation

=== "Docker"

    ```bash
    docker run -d \
      --name peek-stash-browser \
      -p 6969:80 \
      -v /path/to/stash/media:/app/media:ro \
      -v /path/to/peek/data:/app/data \
      -e STASH_URL="http://your-stash:9999/graphql" \
      -e STASH_API_KEY="your_api_key" \
      carrotwaxr/peek-stash-browser:latest
    ```

=== "unRAID"

    1. Open Community Applications
    2. Search for "Peek Stash Browser"
    3. Click Install and configure
    4. Access at `http://your-unraid-ip:6969`

### First Login

On first access, you'll be guided through a setup wizard:

1. **Welcome** - Introduction to Peek
2. **Create Admin** - Set your admin username and password
3. **Connect to Stash** - Enter your Stash URL and API key
4. **Complete** - Setup finished!

## Requirements

- Stash server with GraphQL API enabled
- Docker (or unRAID)
- Network access between Peek and Stash

## Architecture

Peek uses a **single-container architecture**:

- **Frontend**: React 19 app served by nginx
- **Backend**: Node.js/Express API server (proxied through nginx)
- **Database**: SQLite (embedded, no separate container)
- **Streaming**: Proxied through Stash (no local transcoding)

## Community & Support

- **Bug Reports**: [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
- **Feature Requests**: [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
- **Stash Community**: [Discord](https://discord.gg/2TsNFKt) - #third-party-integrations channel

## License

This project is licensed under the MIT License.

## Acknowledgments

Built with [Stash](https://github.com/stashapp/stash), React, Express, FFmpeg, and other amazing open source projects.
