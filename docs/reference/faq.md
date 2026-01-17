# Frequently Asked Questions

Common questions about Peek Stash Browser.

## General

### What is Peek?

Peek is a modern web application for browsing and streaming your Stash media library. It provides a mobile-friendly interface with multi-user support, playlists, recommendations, and watch history.

### How is Peek different from Stash?

Peek is a browser/player focused on video playback and discovery, while Stash is a comprehensive media organizer. Peek:

- Provides a mobile-friendly, browsing-focused interface
- Supports multiple users with separate preferences and restrictions
- Includes playlists, recommendations, and watch history
- Proxies video streams through Stash (no local media access needed)
- Complements Stash rather than replacing it

### Does Peek modify my Stash library?

Peek can optionally sync ratings, favorites, and O-counter back to Stash (configurable). It never modifies your files or core metadata.

### How does Peek sync with Stash?

Peek maintains a local cache of your Stash library for fast queries. Three sync mechanisms keep it updated:

- **Smart Sync** (automatic) - Runs on startup and periodically, only syncing what changed
- **Incremental Sync** - Manual option to sync recent changes since a specific time
- **Full Sync** - Complete refresh, runs automatically when upgrading Peek versions

**Key points:**

- Syncing happens in the background - you can browse while it runs
- Large libraries (100k+ scenes) may take several minutes for full sync
- Changes made in Stash appear in Peek after the next sync
- User data (watch history, playlists, ratings) is stored separately and never affected by sync

See [Sync Architecture](../development/sync-architecture.md) for technical details.

## Installation

### What platforms are supported?

- **unRAID**: Manual Docker template installation
- **Docker**: Any platform supporting Docker (AMD64 and ARM64)
- **Development**: Node.js 18+ on Windows/Mac/Linux

### Do I need a separate database server?

No. Peek uses embedded SQLite. No PostgreSQL, MySQL, or other database server needed.

### Can I run Peek and Stash on the same server?

Yes, and this is recommended for best performance. They run as separate containers and don't conflict.

## Video Playback

### How does video streaming work?

Peek proxies video streams directly through Stash. When you play a video in Peek, it fetches the stream from Stash's API and delivers it to your browser. This means:

- No local media access or path mapping needed
- Uses Stash's transcoding capabilities
- Quality options come from Stash

### Why are videos loading slowly?

Since Peek proxies streams from Stash, performance depends on:

- Network speed between Peek and Stash (same machine/LAN is best)
- Stash server's transcoding performance
- Your browser's network connection

If videos are slow in Peek, check if they're also slow in Stash directly.

## Configuration

### Where are my settings stored?

- **User data**: SQLite database in `/app/data/peek-stash-browser.db`
- **Server config**: Environment variables
- **Stash connection**: Stored in database (configured via Setup Wizard)

### How do I backup my data?

See [Upgrading - Backup Procedure](../getting-started/upgrading.md#backup-procedure) for detailed instructions.

### Can I customize the theme?

Yes! Peek includes built-in themes (Light, Dark, Deep Purple, The Hub) and a custom theme editor where you can create your own color schemes.

## Features

### How do playlists work?

Create custom playlists of your favorite scenes:

1. Click **Playlists** in the navigation
2. Click **Create Playlist**
3. Add scenes using the **+** icon on scene cards

See the [Playlists Guide](../user-guide/playlists.md) for details.

### Does Peek track watch history?

Yes! Peek automatically tracks your viewing progress and lets you resume playback. Features include:

- Automatic progress tracking
- Resume from any device
- "Continue Watching" section
- Progress bars on scene cards

See the [Watch History Guide](../user-guide/watch-history.md) for details.

### Can I use keyboard navigation?

Yes! Peek supports keyboard navigation including arrow keys, Enter to select, and video player shortcuts.

See the [Keyboard Navigation Guide](../user-guide/keyboard-navigation.md) for all shortcuts.

### What about TV Mode?

TV Mode is a work-in-progress feature for couch/remote browsing. You can enable it from the user menu, but:

- Grid navigation works on most pages (Scenes, Performers, etc.)
- Some pages don't have full TV navigation yet
- Best experience is with a wireless keyboard

TV Mode will be improved in future updates.

### Can I use Peek on mobile?

Yes. The web interface is responsive and works on mobile browsers.

### Can I use Peek without Stash?

No. Peek requires a Stash server for media library management and streaming.

## Security

### Is Peek secure?

Peek includes JWT authentication, bcrypt password hashing, and session management.

**Important**: Change the default admin password immediately after setup!

### Should I expose Peek to the internet?

Not recommended without additional protection. For remote access:

- Use a VPN
- Use a reverse proxy with authentication (see [Proxy Authentication](../getting-started/configuration.md#proxy-authentication))
- Don't expose directly to the internet

## Support

### Where can I get help?

- [Troubleshooting Guide](troubleshooting.md)
- [GitHub Issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
- [Stash Discord](https://discord.gg/2TsNFKt) - #third-party-integrations channel

### How do I report a bug?

1. Check the [Troubleshooting Guide](troubleshooting.md) first
2. Search [existing issues](https://github.com/carrotwaxr/peek-stash-browser/issues)
3. Create a new issue with: Peek version, Stash version, logs, and steps to reproduce
