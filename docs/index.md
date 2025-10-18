# Welcome to Peek Stash Browser

A modern, responsive web application for browsing and managing your [Stash](https://github.com/stashapp/stash) media library with advanced filtering, authentication, and adaptive video streaming.

<div class="grid cards" markdown>

-   :material-rocket-launch:{ .lg .middle } **Quick Start**

    ---

    Get up and running in minutes with Docker or unRAID

    [:octicons-arrow-right-24: Installation Guide](getting-started/installation.md)

-   :material-video:{ .lg .middle } **Video Streaming**

    ---

    Real-time HLS transcoding with multiple quality options

    [:octicons-arrow-right-24: Video Playback](user-guide/video-playback.md)

-   :material-playlist-play:{ .lg .middle } **Playlists**

    ---

    Create, manage, and play playlists with shuffle and repeat modes

    [:octicons-arrow-right-24: Playlist Guide](user-guide/playlists.md)

-   :material-code-braces:{ .lg .middle } **Developer Docs**

    ---

    Comprehensive development documentation and API reference

    [:octicons-arrow-right-24: Development Setup](development/setup.md)

</div>

## Features

### Core Functionality

- **Secure Authentication** - JWT-based authentication with role management (admin/user)
- **Modern Interface** - Beautiful, responsive React UI with theme support
- **Advanced Search & Filtering** - Comprehensive filtering across performers, scenes, studios, and tags
- **Intelligent Sorting** - Multiple sorting options for all content types
- **Mobile Ready** - Fully responsive design optimized for all devices

### Video Streaming

- **Adaptive Transcoding** - Real-time HLS transcoding with multiple quality options (720p/480p/360p)
- **Smart Playback** - Direct play when possible, seamless fallback to transcoding
- **Quality Controls** - Automatic and manual quality selection
- **Session Management** - Intelligent cleanup of transcoding resources

### Content Management

- **Detailed Views** - Enhanced detail pages for performers, studios, and tags
- **Rich Metadata** - Display ratings, statistics, and comprehensive information
- **CRUD Operations** - Full create, read, update, delete capabilities
- **Theme Integration** - Consistent theming across all components

### Playlist Features

- **Create & Organize** - Build custom playlists of your favorite scenes
- **Shuffle Mode** - Randomize playback order with Fisher-Yates algorithm
- **Repeat Modes** - None, Repeat All, or Repeat One
- **Drag & Drop** - Intuitive reordering with HTML5 drag-and-drop
- **Status Cards** - See playlist context when viewing scenes

## Architecture

Peek uses a modern **single-container architecture** for production deployments:

- **Frontend**: React 19 app served by nginx on port 80
- **Backend**: Node.js/Express API server on port 8000 (proxied through nginx)
- **Database**: SQLite for user data and preferences (lightweight, no separate container needed)
- **Transcoding**: FFmpeg for real-time video conversion

**Development** uses Docker Compose with hot reloading for both frontend and backend.

## Technology Stack

**Frontend**:

- React 19 with Babel React Compiler
- Tailwind CSS for styling
- Video.js 8 for media playback
- React Router for navigation
- Custom theming system

**Backend**:

- Node.js + Express
- TypeScript (strict mode, ES2020)
- Prisma ORM + SQLite
- JWT authentication
- FFmpeg integration
- stashapp-api GraphQL client

## Quick Links

<div class="grid cards" markdown>

-   :material-download:{ .lg .middle } **Install Now**

    ---

    Choose your deployment method

    [:octicons-arrow-right-24: Installation Options](getting-started/installation.md)

-   :material-book-open-variant:{ .lg .middle } **User Guide**

    ---

    Learn how to use Peek effectively

    [:octicons-arrow-right-24: User Documentation](user-guide/video-playback.md)

-   :material-hammer-wrench:{ .lg .middle } **Development**

    ---

    Contribute to Peek development

    [:octicons-arrow-right-24: Developer Guide](development/setup.md)

-   :material-help-circle:{ .lg .middle } **Get Help**

    ---

    Troubleshooting and support

    [:octicons-arrow-right-24: Troubleshooting](reference/troubleshooting.md)

</div>

## Community & Support

- **GitHub Repository**: [carrotwaxr/peek-stash-browser](https://github.com/carrotwaxr/peek-stash-browser)
- **Issues & Support**: [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
- **Docker Images**: [Docker Hub](https://hub.docker.com/r/carrotwaxr/peek-stash-browser)
- **Stash Community**: [Discord](https://discord.gg/2TsNFKt) - Ask in #third-party-integrations channel

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/carrotwaxr/peek-stash-browser/blob/master/LICENSE) file for details.

## Acknowledgments

- **[Stash](https://github.com/stashapp/stash)** - The amazing media organizer this builds upon
- **[React](https://reactjs.org/)** - Frontend framework
- **[Express](https://expressjs.com/)** - Backend framework
- **[Prisma](https://prisma.io/)** - Database ORM
- **[Video.js](https://videojs.com/)** - Video player
- **[FFmpeg](https://ffmpeg.org/)** - Video transcoding
