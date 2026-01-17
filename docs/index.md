A modern mobile-friendly web application for browsing and streaming your [Stash](https://github.com/stashapp/stash) media library with support for multiple users, playlists, recommendations, and custom per-user theme and browsing preferences.

**Get started quickly:**

- [**Installation**](getting-started/installation.md) - Get up and running with Docker or unRAID
- [**Configuration**](getting-started/configuration.md) - Connect Peek to your Stash server
- [**Troubleshooting**](getting-started/troubleshooting.md) - Common issues and solutions

### Key Features

- **Multiple Users** - Create multiple users with different roles, filter what content and capabilities each user has, and securely allow external access if desired
- **Video Streaming** - Uses Stash's video streams directly, eliminating the need to duplicate Stash's excellent transcoding support
- **Watch History Tracking** - Automatic progress tracking and resume playback ([Learn more](user-guide/watch-history.md))
- **Playlist Management** - Create, organize, and play custom playlists ([Learn more](user-guide/playlists.md))
- **Modern Interface** - Responsive React UI with theme support and user customizability
- **Mobile Ready** - Optimized for all devices
- **Scalable Library** - Should scale easily with any library size - looking at you, data hoarders

## Requirements

- Stash server with GraphQL API enabled and an API key configured (Settings → Security)
- Docker (or Docker on unRAID)
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
- **Stash Community**: [Discord](https://discord.com/channels/559159668438728723/1188915766288990238) - #community-projects channel

## License

This project is licensed under the MIT License.

## Acknowledgments

Built with [Stash](https://github.com/stashapp/stash), React, Express, FFmpeg, and other amazing open source projects.
