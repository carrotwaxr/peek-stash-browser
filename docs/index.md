# Welcome to Peek Stash Browser

**⚠️ BETA SOFTWARE** - Currently in beta testing. [Help us test!](beta-testing.md)

A modern web application for browsing and streaming your [Stash](https://github.com/stashapp/stash) adult content library with adaptive video streaming, playlists, and watch history tracking.

<div class="grid cards" markdown>

-   :material-test-tube:{ .lg .middle } **Beta Testing**

    ---

    Help shape Peek by testing and providing feedback

    [:octicons-arrow-right-24: Testing Guide](beta-testing.md)

-   :material-download:{ .lg .middle } **Quick Start**

    ---

    Get up and running in minutes with Docker or unRAID

    [:octicons-arrow-right-24: Installation](getting-started/installation.md)

-   :material-cog:{ .lg .middle } **Configuration**

    ---

    Set up Peek to connect with your Stash server

    [:octicons-arrow-right-24: Setup Guide](getting-started/configuration.md)

-   :material-help-circle:{ .lg .middle } **Troubleshooting**

    ---

    Common issues and solutions

    [:octicons-arrow-right-24: Get Help](reference/troubleshooting.md)

</div>

## What is Peek?

Peek is a web-based browser for your Stash library, offering a sleek modern interface for browsing your "documentary" collection.

### Key Features

- **Adaptive Video Streaming** - Real-time HLS transcoding with multiple quality options (720p/480p/360p)
- **Watch History Tracking** - Automatic progress tracking and resume playback
- **Playlist Management** - Create, organize, and play custom playlists
- **Modern Interface** - Responsive React UI with theme support
- **Full Keyboard Navigation** - Complete TV remote and keyboard control support
- **Mobile Ready** - Optimized for all devices

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

**Default Credentials:**

- **Username:** `admin`
- **Password:** `admin`

!!! warning "Change Default Password"
    **Immediately change your password** after first login via Settings > User Management

## Beta Testing

This is beta software. We need your help to make it great!

**How to help:**

1. **Install and test** - Follow the [Installation Guide](getting-started/installation.md)
2. **Test core features** - See [Beta Testing Guide](beta-testing.md) for test scenarios
3. **Report bugs** - [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
4. **Request features** - Open an issue with the "enhancement" label
5. **Provide feedback** - What works? What's confusing?

## Requirements

- Stash server with GraphQL API enabled
- Docker (or unRAID)
- Network access between Peek and Stash
- Shared media storage accessible to both containers

## Architecture

Peek uses a **single-container architecture**:

- **Frontend**: React 19 app served by nginx
- **Backend**: Node.js/Express API server (proxied through nginx)
- **Database**: SQLite (embedded, no separate container)
- **Transcoding**: FFmpeg for real-time video conversion

## Community & Support

- **Bug Reports**: [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
- **Feature Requests**: [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
- **Stash Community**: [Discord](https://discord.gg/2TsNFKt) - #third-party-integrations channel

## License

This project is licensed under the MIT License.

## Acknowledgments

Built with [Stash](https://github.com/stashapp/stash), React, Express, FFmpeg, and other amazing open source projects.
